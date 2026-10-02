import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Markdownish } from '@/components/markdown';
import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Txt, VStack } from '@/components/ui';
import type { StringKey } from '@/i18n/en';
import { askNiva, getNivaConversations, listMyNivaQuestions, type NivaConversation } from '@/lib/api/niva';
import { report } from '@/lib/errors';
import {
  communityName,
  formatSources,
  isNivaRowItem,
  mergeNivaRows,
  NIVA_POLL_MS,
  nivaIsRepeat,
  nivaPhase,
  nivaShouldPoll,
  normaliseQuestion,
  type NivaLocal,
  type NivaPhase,
  type NivaRowItem,
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

function Bubble({ mine = false, source, live, children }: { mine?: boolean; source?: string | null; live?: boolean; children: ReactNode }) {
  const { scale, t } = useSettings();
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <View
        accessibilityLiveRegion={live ? 'polite' : undefined}
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
      {source ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 11 * scale, color: colors.muted, paddingVertical: 4, paddingHorizontal: 6 }}>{t('niva.source', { source })}</Text>
      ) : null}
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
 * The answer appears as soon as it is stored, with its sources. When there is
 * no answer — the worker says why once answer_status is in the database, else
 * after NIVA_WAIT_MS — the owner's message says Niva cannot answer and "Send
 * to the team" opens Ask a question with the question filled in. If the app
 * could not check, it says so with Check again instead. Pull down, or come
 * back to the screen, to pick up an answer that arrived later.
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
  const [checkFailed, setCheckFailed] = useState<{ ids: string[]; message: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [focused, setFocused] = useState(true);
  const [appActive, setAppActive] = useState(() => AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const sentParam = useRef<string | null>(null);
  const lastAsk = useRef<{ question: string; at: number } | null>(null);
  const checking = useRef(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrolledFor = useRef<string | null>(null);

  const items = mergeNivaRows(history.data?.rows ?? [], local, { fresh, seenAt: history.data?.loadedAt ?? null });
  const phaseOf = (i: RowItem): NivaPhase => nivaPhase(i.row, { now, startedAt: i.startedAt, seenAt: i.seenAt, lastCheckFailed: !!checkFailed?.ids.includes(i.row.id) });
  const saving = local.some((l) => 'status' in l && l.status === 'saving');

  const ask = async (question: string, retryKey?: string) => {
    const clean = normaliseQuestion(question);
    if (!clean) {
      setInputError(t('niva.empty'));
      return;
    }
    setInputError(null);
    if (!center || !member) return;
    if (!retryKey) {
      // A double tap (or the same question again within a few seconds) is ignored, so it is saved,
      // answered and counted against the community's monthly Niva questions only once.
      const at = Date.now();
      if (nivaIsRepeat(lastAsk.current, clean, at)) return;
      lastAsk.current = { question: clean, at };
    }
    const key = retryKey ?? `${Date.now()}-${Math.random()}`;
    setLocal((prev) => (retryKey ? prev.map((l) => (l.key === key ? { key, question: clean, status: 'saving' } : l)) : [...prev, { key, question: clean, status: 'saving' }]));
    try {
      const row = await askNiva(center.id, member.userId, clean);
      const startedAt = Date.now();
      setLocal((prev) => prev.map((l) => (l.key === key ? { key, question: clean, row, startedAt } : l)));
      setNow(startedAt);
    } catch (err) {
      const msg = report(err, 'save your question for Niva').userMessage;
      setLocal((prev) => prev.map((l) => (l.key === key ? { key, question: clean, status: 'failed', error: msg } : l)));
    }
  };

  /** One request for every question still being looked up (or whose last check failed). */
  const check = async () => {
    if (checking.current) return;
    const idList = items
      .filter(isNivaRowItem)
      .filter((i) => {
        const p = phaseOf(i);
        return p === 'looking' || p === 'check_failed';
      })
      .map((i) => i.row.id);
    if (idList.length === 0) return;
    checking.current = true;
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
      setCheckFailed({ ids: idList, message: report(err, "check for Niva's answer").userMessage });
    } finally {
      checking.current = false;
      setNow(Date.now());
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
      // Coming back (from Ask a question, another tab…) picks up answers that arrived meanwhile.
      if (focusedBefore.current) void reloadRef.current();
      focusedBefore.current = true;
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
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

  // A question tapped in the Niva button's menu arrives as ?q=…; ask it once.
  useEffect(() => {
    if (!q || !member || !center || sentParam.current === q) return;
    sentParam.current = q;
    void ask(q);
    router.setParams({ q: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, member?.userId, center?.id]);

  const submit = () => {
    if (saving) return;
    const v = text;
    setText('');
    void ask(v);
  };

  const sendToTeam = (question: string) => router.push({ pathname: '/guide/ask', params: { q: question, topic: 'office' } });

  const title = community ? t('niva.title', { center: community }) : t('niva.titleNoCenter');
  const asked = new Set(items.map((i) => i.question.toLowerCase()));
  const chips = SUGGESTED.map((k) => t(k)).filter((s) => !asked.has(s.toLowerCase()));
  // Scroll to the newest message when the history loads, a question is added or a reply changes.
  const scrollMark = items.map((i) => `${i.key}:${isNivaRowItem(i) ? phaseOf(i) : i.status}`).join('|');

  const reply = (item: RowItem) => {
    const phase = phaseOf(item);
    if (phase === 'answered') {
      return (
        <Bubble source={formatSources(item.row.sources)}>
          <Markdownish source={item.row.answer ?? ''} />
        </Bubble>
      );
    }
    if (phase === 'looking') {
      return (
        <Bubble live>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <ActivityIndicator size="small" color={colors.brown} />
            <BubbleText text={t('niva.looking')} />
          </View>
        </Bubble>
      );
    }
    if (phase === 'check_failed') {
      return <Banner tone="warning" title={t('niva.checkFailed')} message={checkFailed?.message ?? ''} action={{ label: t('niva.checkAgain'), onPress: () => void check() }} />;
    }
    return (
      <VStack gap={space.sm}>
        <Bubble live>
          <BubbleText text={t('niva.unable')} />
        </Bubble>
        {teamOn ? (
          <Button
            label={t('niva.sendToTeam')}
            accessibilityLabel={t('niva.sendToTeamLabel', { question: item.question })}
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
    <Screen title={title} niva={false} scroll={false} contentStyle={{ flex: 1, paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0, gap: 0, maxWidth: undefined }} footer={input}>
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
              {isNivaRowItem(item) ? (
                reply(item)
              ) : item.status === 'saving' ? (
                <Txt variant="caption" color="muted">
                  {t('niva.saving')}
                </Txt>
              ) : (
                <Banner tone="error" message={t('niva.notSaved', { reason: item.error ?? '' })} action={{ label: t('niva.retry'), onPress: () => void ask(item.question, item.key) }} />
              )}
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
                    onPress={() => void ask(c)}
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
