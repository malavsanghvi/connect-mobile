import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Txt, VStack } from '@/components/ui';
import type { StringKey } from '@/i18n/en';
import { askNiva, listMyNivaQuestions, type NivaConversation } from '@/lib/api/niva';
import { report } from '@/lib/errors';
import { communityName, formatSources, normaliseQuestion } from '@/lib/learning';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const SUGGESTED: StringKey[] = ['niva.fabQ1', 'niva.fabQ2', 'niva.fabQ3', 'niva.q4', 'niva.q5'];

type Local = { key: string; question: string; status: 'saving' | 'saved' | 'failed'; error?: string };

function Bubble({ text, mine, source }: { text: string; mine: boolean; source?: string | null }) {
  const { scale } = useSettings();
  const t = useSettings().t;
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
        <Text style={{ fontFamily: fonts.body, fontSize: 14 * scale, lineHeight: 21 * scale, color: mine ? colors.white : colors.ink }} selectable>
          {text}
        </Text>
      </View>
      {source ? (
        <Text style={{ fontFamily: fonts.body, fontSize: 11 * scale, color: colors.muted, paddingVertical: 4, paddingHorizontal: 6 }}>{t('niva.source', { source })}</Text>
      ) : null}
    </View>
  );
}

/**
 * Niva chat (prototype Main L726–747). Answers need an approved-content
 * retrieval + model service that does not exist yet, so every question is
 * saved to app.niva_conversations as unanswered (staff see it in the portal)
 * and Niva says honestly that answers are coming. Staff-written answers with
 * sources show here when present.
 */
export default function NivaScreen() {
  const { t, scale } = useSettings();
  const router = useRouter();
  const { center, member, setGuest } = useApp();
  const { q } = useLocalSearchParams<{ q?: string }>();
  const community = communityName(center);
  const history = useLoad(() => (center && member ? listMyNivaQuestions(center.id, member.userId) : Promise.resolve([] as NivaConversation[])), [center?.id, member?.userId], 'load your Niva questions');
  const [local, setLocal] = useState<Local[]>([]);
  const [text, setText] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const sentParam = useRef<string | null>(null);

  const ask = async (question: string, retryKey?: string) => {
    const clean = normaliseQuestion(question);
    if (!clean) {
      setInputError(t('niva.empty'));
      return;
    }
    setInputError(null);
    if (!center || !member) return;
    const key = retryKey ?? `${Date.now()}-${Math.random()}`;
    setLocal((prev) => (retryKey ? prev.map((l) => (l.key === key ? { ...l, status: 'saving', error: undefined } : l)) : [...prev, { key, question: clean, status: 'saving' }]));
    try {
      await askNiva(center.id, member.userId, clean);
      setLocal((prev) => prev.map((l) => (l.key === key ? { ...l, status: 'saved' } : l)));
    } catch (err) {
      const msg = report(err, 'save your question for Niva').userMessage;
      setLocal((prev) => prev.map((l) => (l.key === key ? { ...l, status: 'failed', error: msg } : l)));
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

  const title = community ? t('niva.title', { center: community }) : t('niva.titleNoCenter');
  const past = history.data ?? [];
  const asked = new Set([...past.map((p) => p.question.toLowerCase()), ...local.map((l) => l.question.toLowerCase())]);
  const chips = SUGGESTED.map((k) => t(k)).filter((s) => !asked.has(s.toLowerCase()));

  return (
    <Screen title={title} niva={false}>
      <VStack gap={space.md}>
        <Bubble text={t('niva.greeting', { center: community })} mine={false} />
        {!member ? (
          <Card tone="panel">
            <Txt variant="small">{t('niva.signIn')}</Txt>
            <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
          </Card>
        ) : null}
        <Loaded state={history}>
          {(rows) => (
            <VStack gap={space.md}>
              {rows.map((r) => (
                <VStack key={r.id} gap={space.md}>
                  <Bubble text={r.question} mine />
                  {r.answer ? <Bubble text={r.answer} mine={false} source={formatSources(r.sources)} /> : <Bubble text={t('niva.pending', { center: community })} mine={false} />}
                </VStack>
              ))}
            </VStack>
          )}
        </Loaded>
        {local.map((l) => (
          <VStack key={l.key} gap={space.md}>
            <Bubble text={l.question} mine />
            {l.status === 'saving' ? (
              <Txt variant="caption" color="muted">
                {t('niva.saving')}
              </Txt>
            ) : l.status === 'saved' ? (
              <Bubble text={t('niva.pending', { center: community })} mine={false} />
            ) : (
              <Banner tone="error" message={t('niva.notSaved', { reason: l.error ?? '' })} action={{ label: t('niva.retry'), onPress: () => void ask(l.question, l.key) }} />
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
                  accessibilityRole="button"
                  style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.brownBorder, backgroundColor: colors.brownTint, borderRadius: radii.xl, minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
                  <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13 * scale, color: colors.brownDark }}>{c}</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : null}

        {member ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingTop: 4 }}>
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
              onSubmitEditing={() => {
                const v = text;
                setText('');
                void ask(v);
              }}
              style={{ flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: inputError ? colors.danger : colors.borderInput, backgroundColor: colors.card, paddingHorizontal: 16, fontFamily: fonts.body, fontSize: 14 * scale, color: colors.ink }}
            />
            <Pressable
              onPress={() => {
                const v = text;
                setText('');
                void ask(v);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('niva.send')}
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" />
              </Svg>
            </Pressable>
          </View>
        ) : null}
        {inputError ? (
          <Txt variant="meta" color="danger" accessibilityLiveRegion="polite">
            {inputError}
          </Txt>
        ) : null}
        <Txt variant="fine" color="muted" center>
          {t('niva.footer', { center: community })}
        </Txt>
      </VStack>
    </Screen>
  );
}
