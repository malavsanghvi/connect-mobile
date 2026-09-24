import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Chip, ChipGroup, Radio, Txt, VStack } from '@/components/ui';
import { EventIcon } from '@/features/event-icons';
import { dateRangeShort } from '@/features/event-rules';
import { getEvent, type EventRow } from '@/lib/api/events';
import { getSurvey, missingRequired, parseQuestions, submitSurvey, type Answers, type Question } from '@/lib/api/surveys';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useSettings, useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

/** Event feedback form (prototype L1262–1300): surveys.questions → survey_responses. */
export default function SurveyScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(
    async () => {
      const survey = await getSurvey(id);
      const event = survey.event_id ? await getEvent(survey.event_id) : null;
      return { survey, event };
    },
    [id],
    'load this survey',
  );
  return (
    <Screen title={t('survey.title')}>
      <Loaded state={state}>{(d) => <SurveyForm survey={d.survey} event={d.event} />}</Loaded>
    </Screen>
  );
}

function FormCard({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.xl, paddingVertical: 14, paddingHorizontal: space.lg, gap: space.sm }}>
      {title ? (
        <Txt variant="body" style={{ fontFamily: fonts.bodyBold }}>
          {title}
        </Txt>
      ) : null}
      {children}
    </View>
  );
}

function Stars({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const t = useT();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: space.xs }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ selected: value === n }} accessibilityLabel={t('survey.stars', { n })} style={{ minWidth: touch.min, minHeight: touch.min, alignItems: 'center', justifyContent: 'center' }}>
          <EventIcon name="star" size={30} color={n <= value ? colors.gold : colors.starEmpty} />
        </Pressable>
      ))}
    </View>
  );
}

/** Purple-outline option button used by the scale and NPS rows. */
function ScaleButton({ label, selected, onPress, height = 40, radius = radii.md, size = 13 }: { label: string; selected: boolean; onPress: () => void; height?: number; radius?: number; size?: number }) {
  const { scale } = useSettings();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      hitSlop={height < touch.min ? { top: (touch.min - height) / 2, bottom: (touch.min - height) / 2 } : undefined}
      style={({ pressed }) => ({ flex: 1, minHeight: height, borderRadius: radius, borderWidth: 1, borderColor: colors.purple, backgroundColor: selected ? colors.purple : colors.card, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
      <Txt variant="meta" color={selected ? 'white' : 'purple'} style={{ fontFamily: fonts.bodyBold, fontSize: size * Math.min(scale, 1.15), lineHeight: size * 1.35 * Math.min(scale, 1.15) }} numberOfLines={1} adjustsFontSizeToFit>
        {label}
      </Txt>
    </Pressable>
  );
}

function LikertRow({ q, value, onChange, showLabel }: { q: Question; value: Answers[string] | undefined; onChange: (v: string) => void; showLabel: boolean }) {
  return (
    <View style={{ gap: space.xs }} accessibilityRole="radiogroup" accessibilityLabel={q.label}>
      {showLabel ? (
        <Txt variant="meta" color="ink2">
          {q.label}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', gap: space.xs }}>
        {q.options.map((o) => (
          <ScaleButton key={o} label={o} selected={value === o} onPress={() => onChange(o)} />
        ))}
      </View>
    </View>
  );
}

function Nps({ value, onChange, label }: { value: number | undefined; onChange: (v: number) => void; label: string }) {
  const t = useT();
  return (
    <VStack gap={space.xs}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: 3 }}>
        {Array.from({ length: 11 }, (_, n) => (
          <ScaleButton key={n} label={String(n)} selected={value === n} onPress={() => onChange(n)} height={36} radius={radii.sm} size={12} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="fine" color="muted">
          {t('survey.notLikely')}
        </Txt>
        <Txt variant="fine" color="muted">
          {t('survey.veryLikely')}
        </Txt>
      </View>
    </VStack>
  );
}

function QuestionField({ q, value, onChange }: { q: Question; value: Answers[string] | undefined; onChange: (v: Answers[string]) => void }) {
  const t = useT();
  const label = q.required || q.type === 'rating' || q.type === 'nps' ? q.label : `${q.label} (${t('common.optional')})`;
  if (q.type === 'text') {
    return (
      <View style={{ gap: 6 }}>
        <Txt variant="meta" color="muted">
          {label}
        </Txt>
        <TextInput
          value={typeof value === 'string' ? value : ''}
          onChangeText={onChange}
          multiline
          numberOfLines={4}
          accessibilityLabel={q.label}
          placeholder={t('survey.textPlaceholder')}
          placeholderTextColor={colors.faint}
          style={{ minHeight: 100, textAlignVertical: 'top', borderRadius: radii.card, borderWidth: 1, borderColor: colors.borderInput, backgroundColor: colors.card, paddingVertical: 10, paddingHorizontal: space.md, fontFamily: fonts.body, fontSize: 14, color: colors.ink }}
        />
      </View>
    );
  }
  return (
    <FormCard title={label}>
      {q.type === 'rating' ? <Stars value={typeof value === 'number' ? value : 0} onChange={onChange} label={q.label} /> : null}
      {q.type === 'nps' ? <Nps value={typeof value === 'number' ? value : undefined} onChange={onChange} label={q.label} /> : null}
      {q.type === 'likert' ? <LikertRow q={q} value={value} onChange={onChange} showLabel={false} /> : null}
      {q.type === 'single' ? (
        <VStack gap={space.sm}>
          {q.options.map((o) => (
            <Radio key={o} label={o} selected={value === o} onPress={() => onChange(o)} />
          ))}
        </VStack>
      ) : null}
      {q.type === 'multi' ? (
        <ChipGroup>
          {q.options.map((o) => {
            const list = Array.isArray(value) ? value : [];
            return <Chip key={o} label={o} selected={list.includes(o)} tone="purple" onPress={() => onChange(list.includes(o) ? list.filter((x) => x !== o) : [...list, o])} />;
          })}
        </ChipGroup>
      ) : null}
    </FormCard>
  );
}

/** Consecutive likert questions become one "Rate each part" card, as in the prototype. */
type Block = { kind: 'one'; q: Question } | { kind: 'likert'; qs: Question[] };

function toBlocks(questions: Question[]): Block[] {
  const out: Block[] = [];
  for (const q of questions) {
    const last = out[out.length - 1];
    if (q.type === 'likert' && last?.kind === 'likert') last.qs.push(q);
    else if (q.type === 'likert') out.push({ kind: 'likert', qs: [q] });
    else out.push({ kind: 'one', q });
  }
  return out.map((b) => (b.kind === 'likert' && b.qs.length === 1 ? { kind: 'one', q: b.qs[0] } : b));
}

function AnonToggle({ on, onPress }: { on: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={t('survey.submitAnon')}
      accessibilityHint={on ? t('survey.anonNote') : t('survey.namedNote')}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 2, borderColor: on ? colors.green : colors.borderInput, backgroundColor: colors.card, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ flex: 1 }}>
        <Txt variant="small" style={{ fontFamily: fonts.bodyBold }}>
          {t('survey.submitAnon')}
        </Txt>
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {on ? t('survey.anonNote') : t('survey.namedNote')}
        </Txt>
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: on ? colors.green : colors.toggleOff, justifyContent: 'center', alignItems: on ? 'flex-end' : 'flex-start', paddingHorizontal: 3 }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.white }} />
      </View>
    </Pressable>
  );
}

function SurveyForm({ survey, event }: { survey: Tables<'surveys'>; event: EventRow | null }) {
  const t = useT();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const questions = parseQuestions(survey.questions);
  const [answers, setAnswers] = useState<Answers>({});
  const [anon, setAnon] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const tz = center?.time_zone ?? null;

  const anonymous = survey.anonymous || anon;
  const dates = event ? dateRangeShort(event.starts_at, event.ends_at, tz) : '';
  const hero = (
    <View style={{ borderRadius: radii.xxl, backgroundColor: colors.purple, paddingVertical: space.lg, paddingHorizontal: 18, gap: 2 }}>
      <Txt variant="eyebrow" color="onPurple">
        {dates ? t('survey.eyebrowEventDates', { dates }) : t('survey.eyebrowEvent')}
      </Txt>
      <Txt variant="title" color="white" style={{ fontFamily: fonts.display }} accessibilityRole="header">
        {event?.name ?? survey.title}
      </Txt>
      {survey.description ? (
        <Txt variant="meta" color="onPurple">
          {survey.description}
        </Txt>
      ) : null}
    </View>
  );

  if (done) {
    return (
      <VStack gap={14}>
        {hero}
        <View style={{ borderWidth: 1, borderColor: colors.greenBorder, backgroundColor: colors.greenTint, borderRadius: radii.xl, padding: 18, gap: 6, alignItems: 'center' }} accessibilityLiveRegion="polite">
          <Txt variant="hero" color="green" style={{ fontFamily: fonts.bodyBold, fontSize: 40, lineHeight: 46 }}>
            {'✓'}
          </Txt>
          <Txt variant="title" color="greenDark" center style={{ fontFamily: fonts.display }}>
            {t('survey.thanks')}
          </Txt>
          <Txt variant="meta" color="greenDark2" center>
            {anonymous ? t('survey.thanksAnon') : t('survey.thanksNamed')}
          </Txt>
        </View>
      </VStack>
    );
  }

  const missing = missingRequired(questions, answers);
  const firstRating = questions.find((q) => q.type === 'rating');
  const blocking = missing ?? (firstRating && answers[firstRating.id] === undefined ? firstRating : null);
  const nothing = Object.keys(answers).length === 0;
  const submitLabel = blocking ? (blocking.type === 'rating' ? t('survey.chooseRating') : t('survey.answerRequired', { question: blocking.label })) : anonymous ? t('survey.submitAnonCta') : t('survey.submit');

  const submit = async () => {
    if (!member || !center || blocking) return;
    setBusy(true);
    setError(null);
    try {
      await submitSurvey({ centerId: center.id, surveyId: survey.id, personId: anonymous ? null : member.person.id, answers });
      invalidate();
      toast(anonymous ? t('survey.sentAnon') : t('survey.sent'));
      setDone(true);
    } catch (err) {
      setError(report(err, 'send your answers').userMessage);
    } finally {
      setBusy(false);
    }
  };
  const set = (id: string, v: Answers[string]) => setAnswers({ ...answers, [id]: v });

  return (
    <VStack gap={14}>
      {hero}
      {questions.length === 0 ? <Banner tone="info" message={t('survey.noQuestions')} /> : null}
      {toBlocks(questions).map((b) =>
        b.kind === 'likert' ? (
          <FormCard key={b.qs[0].id} title={t('survey.rateEachPart')}>
            <VStack gap={10}>
              {b.qs.map((q) => (
                <LikertRow key={q.id} q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} showLabel />
              ))}
            </VStack>
          </FormCard>
        ) : (
          <QuestionField key={b.q.id} q={b.q} value={answers[b.q.id]} onChange={(v) => set(b.q.id, v)} />
        ),
      )}
      {survey.anonymous ? (
        <Txt variant="meta" color="muted">
          {t('survey.alwaysAnon')}
        </Txt>
      ) : (
        <AnonToggle on={anon} onPress={() => setAnon(!anon)} />
      )}
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={submitLabel} tone="purple" onPress={submit} busy={busy} disabled={!!blocking || nothing || questions.length === 0 || !member} />
    </VStack>
  );
}
