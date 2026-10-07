import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Markdownish } from '@/components/markdown';
import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, LinkText, Txt, VStack } from '@/components/ui';
import { askPrefill } from '@/features/guide';
import { openExternal } from '@/features/guide-ui';
import type { StringKey } from '@/i18n/en';
import { askNiva, getNivaConversations, listMyNivaQuestions, type NivaConversation } from '@/lib/api/niva';
import { report } from '@/lib/errors';
import {
  communityName,
  isNivaRowItem,
  mergeNivaRows,
  NIVA_POLL_MS,
  nivaIsRepeat,
  nivaPhase,
  nivaShortQuestion,
  nivaShouldPoll,
  nivaSpoken,
  normaliseQuestion,
  parseSources,
  type NivaLocal,
  type NivaPhase,
  type NivaRowItem,
  type NivaSource,
} from '@/lib/learning';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';
import { useSettings } from '@/providers/settings';
import { colors, fonts, layout, radii, space } from '@/theme';

const SUGGESTED: StringKey[] = ['niva.fabQ1', 'niva.fabQ2', 'niva.fabQ3', 'niva.q4', 'niva.q5'];

type Local = NivaLocal<NivaConversation>;
type RowItem = NivaRowItem<NivaConversation>;
type History = { rows: NivaConversation[]; loadedAt: number };

/** An answer check that gets no reply in time counts as failed (shown as a connection problem), so the wait always ends. */
const CHECK_TIMEOUT_MS = 15000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TypeError('Network request failed: no reply in time')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * "Source: …" under an answer. A source imported from a web page links to it (in the in-app browser);
 * the others are plain titles. If the page cannot be opened, the reason shows right here (in a live
 * region, and announced on iOS), and tapping the link again retries.
 */
function Sources({ sources }: { sources: NivaSource[] }) {
  const { t } = useSettings();
  const [error, setError] = useState<string | null>(null);
  const open = (url: string) => {
    setError(null);
    void openExternal(url, t('niva.openSource'), (msg) => {
      setError(msg);
      // iOS has no live regions, so VoiceOver hears the reason only when it is announced.
      if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(msg);
    });
  };
  return (
    <View style={{ maxWidth: 300, paddingHorizontal: 6 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
        <Txt variant="meta" color="muted">
          {t(sources.length > 1 ? 'niva.sourcesLabel' : 'niva.sourceLabel')}
        </Txt>
        {sources.map(({ title, url }, i) => (
          <Fragment key={`${title}\n${url ?? ''}`}>
            {url ? (
              <LinkText label={title} underline onPress={() => open(url)} />
            ) : (
              <Txt variant="meta" color="muted" style={{ paddingVertical: 4 }}>
                {title}
              </Txt>
            )}
            {i < sources.length - 1 ? (
              <Txt variant="meta" color="muted" importantForAccessibility="no" accessibilityElementsHidden>
                ·
              </Txt>
            ) : null}
          </Fragment>
        ))}
      </View>
      {error ? (
        <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
          {error}
        </Txt>
      ) : null}
    </View>
  );
}

function Bubble({ mine = false, sources, children }: { mine?: boolean; sources?: NivaSource[]; children: ReactNode }) {
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        style={{
          maxWidth: 300,
          backgroundColor: mine ? colors.navy : colors.card,
          borderWidth: 1,
          borderColor: mine ? colors.navy : colors.border,
          borderRadius: radii.xl,
          paddingVertical: 10,
          paddingHorizontal: 14,
        }}>
        {children}
      </View>
      {sources?.length ? <Sources sources={sources} /> : null}
    </View>
  );
}

function BubbleText({ text, mine = false }: { text: string; mine?: boolean }) {
  const { scale } = useSettings();
  return (
    <Text style={{ fontFamily: fonts.body, fontSize: 14 * scale, lineHeight: 21 * scale, color: mine ? colors.white : colors.ink }} selectable>
      {text}
    </Text>
  );
}

/**
 * Niva chat (prototype Main L726–747). A question is saved with app.niva_ask,
 * which queues it for connect-crm's worker; the worker answers only from the
 * community's published Niva sources and stores the answer on the row. While
 * that happens the reply says "Looking that up for you…" and the screen
 * checks every few seconds (only while it is open and the app is in front).
 * The answer appears as soon as it is stored, with its sources (a source
 * imported from a web page links to it: parseSources). When there is
 * no answer — the worker says why once answer_status is in the database, else
 * after NIVA_WAIT_MS — the owner's message says Niva cannot answer and "Send
 * to the team" opens Ask a question with the question filled in. If the app
 * could not check, it says so with Check again instead. Pull down, or come
 * back to the screen or the app (on the web, the browser tab), to pick up an
 * answer that arrived later. The reply to each question asked here sits in
 * a polite live region (TalkBack, and screen readers on the web); iOS has no
 * live regions, so each change there is announced instead.
 */
export default function NivaScreen() {
  const { t, scale } = useSettings();
  const router = useRouter();
  const { center, member, setGuest } = useApp();
  const teamOn = useModule('comms');
  const { q } = useLocalSearchParams<{ q?: string }>();
  const community = communityName(center);
  const history = useLoad<History>(
    async () => ({ rows: center && member ? await listMyNivaQuestions(center.id, member.userId) : [], loadedAt: Date.now() }),
    [center?.id, member?.userId],
    'load your Niva questions',
  );
  const [local, setLocal] = useState<Local[]>([]);
  const [fresh, setFresh] = useState<Record<string, NivaConversation>>({});
  const [lastFailedCheck, setCheckFailed] = useState<{ ids: string[]; message: string; at: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [focused, setFocused] = useState(true);
  const focusedRef = useRef(true);
  const [appActive, setAppActive] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [refreshing, setRefreshing] = useState(false);
  const [rechecking, setRechecking] = useState(false);
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const sentParam = useRef<string | null>(null);
  const lastAsk = useRef<{ question: string; at: number } | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const spoken = useRef<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);
  const scrolledFor = useRef<string | null>(null);

  const items = mergeNivaRows(history.data?.rows ?? [], local, { fresh, seenAt: history.data?.loadedAt ?? null });
  // A history load that worked after the failed check has read every recent question afresh, so "couldn't check" no longer applies.
  const checkFailed = lastFailedCheck && lastFailedCheck.at > (history.data?.loadedAt ?? -Infinity) ? lastFailedCheck : null;
  const phaseOf = (i: RowItem): NivaPhase => nivaPhase(i.row, { now, startedAt: i.startedAt, seenAt: i.seenAt, lastCheckFailed: !!checkFailed?.ids.includes(i.row.id) });
  const saving = local.some((l) => 'status' in l && l.status === 'saving');

  const save = async (clean: string, key: string) => {
    if (!center || !member) return;
    try {
      const row = await askNiva(center.id, member.userId, clean);
      const startedAt = Date.now();
      setLocal((prev) => prev.map((l) => (l.key === key ? { key, question: clean, row, startedAt } : l)));
      setNow(startedAt);
    } catch (err) {
      // A question that was not saved never counts as "just asked", so typing it again sends it.
      if (lastAsk.current?.question.toLowerCase() === clean.toLowerCase()) lastAsk.current = null;
      const msg = report(err, 'save your question for Niva').userMessage;
      setLocal((prev) => prev.map((l) => (l.key === key ? { key, question: clean, status: 'failed', error: msg } : l)));
    }
  };

  /** Starts saving the question; false (with the reason under the box) when it is not sent. */
  const ask = (question: string, retryKey?: string): boolean => {
    const clean = normaliseQuestion(question);
    if (!clean) {
      setInputError(t('niva.empty'));
      return false;
    }
    setInputError(null);
    if (!center || !member) return false;
    if (!retryKey) {
      // A double tap (or the same question again within a few seconds) is saved, answered and counted
      // against the community's monthly Niva questions only once, and the member is told why.
      const at = Date.now();
      if (nivaIsRepeat(lastAsk.current, clean, at)) {
        setInputError(t('niva.repeat'));
        return false;
      }
      lastAsk.current = { question: clean, at };
    }
    const key = retryKey ?? `${Date.now()}-${Math.random()}`;
    setLocal((prev) => (retryKey ? prev.map((l) => (l.key === key ? { key, question: clean, status: 'saving' } : l)) : [...prev, { key, question: clean, status: 'saving' }]));
    void save(clean, key);
    return true;
  };

  /** One request for every question still being looked up (or whose last check failed); a check already running is shared. */
  const check = (): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    const idList = items
      .filter(isNivaRowItem)
      .filter((i) => {
        const p = phaseOf(i);
        return p === 'looking' || p === 'check_failed';
      })
      .map((i) => i.row.id);
    if (idList.length === 0) return Promise.resolve();
    const run = (async () => {
      try {
        const rows = await withTimeout(getNivaConversations(idList), CHECK_TIMEOUT_MS);
        setFresh((prev) => {
          const next = { ...prev };
          for (const r of rows) next[r.id] = r;
          return next;
        });
        setCheckFailed(null);
      } catch (err) {
        // Logged here; shown only once the wait is over (check_failed), never as "unable to answer".
        setCheckFailed({ ids: idList, message: report(err, "check for Niva's answer").userMessage, at: Date.now() });
      } finally {
        inFlight.current = null;
        setNow(Date.now());
      }
    })();
    inFlight.current = run;
    return run;
  };

  /** Check again: the button says "Checking…" until the check is back, whether it worked or not. */
  const checkAgain = async () => {
    setRechecking(true);
    try {
      await check();
    } finally {
      setRechecking(false);
    }
  };

  const checkRef = useRef(check);
  const reloadRef = useRef(history.reload);
  useEffect(() => {
    checkRef.current = check;
    reloadRef.current = history.reload;
  });

  // Check only while this screen is open and the app is in front.
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      focusedRef.current = true;
      // Coming back (from Ask a question, another tab…) picks up answers that arrived meanwhile.
      if (focusedBefore.current) void reloadRef.current();
      focusedBefore.current = true;
      return () => {
        setFocused(false);
        focusedRef.current = false;
      };
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      // Back in the app (on the web, the browser tab, which has no pull to refresh) with the chat open:
      // reload, so an answer that arrived after the wait replaces "unable to answer".
      if (state === 'active' && focusedRef.current) void reloadRef.current();
    });
    return () => sub.remove();
  }, []);
  const polling = focused && appActive && nivaShouldPoll(items, now);
  useEffect(() => {
    if (!polling) return;
    const timer = setInterval(() => void checkRef.current(), NIVA_POLL_MS);
    return () => clearInterval(timer);
  }, [polling]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([history.reload(), checkRef.current()]);
    } finally {
      setRefreshing(false);
    }
  };

  // A question carried by the link (/niva?q=…) is asked once (trimmed, capped, never an array: askPrefill).
  const prefill = askPrefill(q);
  useEffect(() => {
    if (!prefill || !member || !center || sentParam.current === prefill) return;
    sentParam.current = prefill;
    ask(prefill);
    router.setParams({ q: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, member?.userId, center?.id]);

  const submit = () => {
    if (saving) return;
    // The box is cleared only once the question is on its way; otherwise it keeps the text and says why.
    if (ask(text)) setText('');
  };

  const sendToTeam = (question: string) => router.push({ pathname: '/guide/ask', params: { q: question, topic: 'office' } });

  const title = community ? t('niva.title', { center: community }) : t('niva.titleNoCenter');
  const asked = new Set(items.map((i) => i.question.toLowerCase()));
  const chips = SUGGESTED.map((k) => t(k)).filter((s) => !asked.has(s.toLowerCase()));
  // Scroll to the newest message when the history loads, a question is added or a reply changes.
  const scrollMark = items.map((i) => `${i.key}:${isNivaRowItem(i) ? phaseOf(i) : i.status}`).join('|');

  // iOS has no live regions: announce each change to the reply of a question asked here (never past questions on load).
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const before = spoken.current;
    const after: Record<string, string> = {};
    let say: string | null = null;
    for (const item of items) {
      if (isNivaRowItem(item) && item.startedAt == null) continue;
      const state = isNivaRowItem(item) ? phaseOf(item) : item.status;
      after[item.key] = state;
      if (before[item.key] === undefined || before[item.key] === state) continue;
      if (isNivaRowItem(item)) {
        if (state === 'answered') say = t('niva.answeredA11y', { answer: nivaSpoken(item.row.answer ?? '') });
        else if (state === 'looking') say = t('niva.looking');
        else if (state === 'check_failed') say = t('niva.checkFailed');
        else say = t('niva.unable');
      } else {
        say = item.status === 'saving' ? t('niva.saving') : t('niva.notSaved', { reason: item.error ?? '' });
      }
    }
    spoken.current = after;
    if (say) AccessibilityInfo.announceForAccessibility(say);
  });

  const reply = (item: RowItem) => {
    const phase = phaseOf(item);
    if (phase === 'answered') {
      return (
        <Bubble sources={parseSources(item.row.sources)}>
          <Markdownish source={item.row.answer ?? ''} selectable />
        </Bubble>
      );
    }
    if (phase === 'looking') {
      return (
        <Bubble>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <ActivityIndicator size="small" color={colors.brown} />
            <BubbleText text={t('niva.looking')} />
          </View>
        </Bubble>
      );
    }
    if (phase === 'check_failed') {
      return (
        <Banner
          tone="warning"
          title={t('niva.checkFailed')}
          message={checkFailed?.message ?? ''}
          action={{ label: rechecking ? t('niva.checking') : t('niva.checkAgain'), onPress: () => void checkAgain() }}
        />
      );
    }
    return (
      <VStack gap={space.sm}>
        <Bubble>
          <BubbleText text={t('niva.unable')} />
        </Bubble>
        {teamOn ? (
          <Button
            label={t('niva.sendToTeam')}
            accessibilityLabel={t('niva.sendToTeamLabel', { question: nivaShortQuestion(item.question) })}
            accessibilityHint={t('niva.sendToTeamHint')}
            tone="secondary"
            size="sm"
            fill={false}
            onPress={() => sendToTeam(item.question)}
          />
        ) : (
          <Txt variant="caption" color="muted">
            {t('niva.unableNoTeam', { center: community })}
          </Txt>
        )}
      </VStack>
    );
  };

  const input = member ? (
    <>
      <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            if (inputError) setInputError(null);
          }}
          placeholder={t('niva.placeholder')}
          placeholderTextColor={colors.faint}
          accessibilityLabel={t('niva.inputLabel')}
          returnKeyType="send"
          onSubmitEditing={submit}
          style={{ flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: inputError ? colors.danger : colors.borderInput, backgroundColor: colors.card, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 14 * scale, color: colors.ink }}
        />
        <Pressable
          onPress={submit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={t('niva.send')}
          accessibilityState={{ disabled: saving, busy: saving }}
          style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: saving ? colors.navyDisabled : colors.navy, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          {saving ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
            </Svg>
          )}
        </Pressable>
      </View>
      {inputError ? (
        <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
          {inputError}
        </Txt>
      ) : null}
    </>
  ) : undefined;

  return (
    <Screen title={title} scroll={false} contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined }} footer={input}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', paddingHorizontal: space.gutter, paddingTop: space.xxs, paddingBottom: space.xl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} tintColor={colors.navy} />}
        onContentSizeChange={() => {
          if (scrolledFor.current === scrollMark) return;
          // Jump straight to the end when the conversation first appears; glide for each new message after that.
          const animated = !!scrolledFor.current;
          scrolledFor.current = scrollMark;
          scrollRef.current?.scrollToEnd({ animated });
        }}>
        <VStack gap={space.md}>
          <Bubble>
            <BubbleText text={t('niva.greeting', { center: community })} />
          </Bubble>
          {!member ? (
            <Card tone="panel">
              <Txt variant="small">{t('niva.signIn')}</Txt>
              <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
            </Card>
          ) : null}
          {/* Loading, or the load error with Retry; the conversation itself is drawn below. */}
          <Loaded state={history}>{() => null}</Loaded>
          {items.map((item) => (
            <VStack key={item.key} gap={space.md}>
              <Bubble mine>
                <BubbleText text={item.question} mine />
              </Bubble>
              {/* One live region from "Saving…" to the answer, so TalkBack reads each change to a question asked here. */}
              <View accessibilityLiveRegion={!isNivaRowItem(item) || item.startedAt != null ? 'polite' : undefined}>
                {isNivaRowItem(item) ? (
                  reply(item)
                ) : item.status === 'saving' ? (
                  <Txt variant="caption" color="muted">
                    {t('niva.saving')}
                  </Txt>
                ) : (
                  <Banner tone="error" message={t('niva.notSaved', { reason: item.error ?? '' })} action={{ label: t('niva.retry'), onPress: () => ask(item.question, item.key) }} />
                )}
              </View>
            </VStack>
          ))}

          {member && chips.length ? (
            <>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body, paddingTop: 4 }}>
                {t('niva.tryAsking')}
              </Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {chips.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => ask(c)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ disabled: saving }}
                    style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.brownBorder, backgroundColor: colors.brownTint, borderRadius: radii.xl, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', opacity: saving ? 0.5 : pressed ? 0.8 : 1 })}>
                    <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13 * scale, color: colors.brownDark }}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Txt variant="fine" color="muted" center>
            {t('niva.footer', { center: community })}
          </Txt>
        </VStack>
      </ScrollView>
    </Screen>
  );
}
