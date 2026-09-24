import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Band, Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, Radio, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { getSurvey, missingRequired, parseQuestions, submitSurvey, type Answers, type Question } from '@/lib/api/surveys';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

/** Survey / event feedback form (surveys.questions → survey_responses). */
export default function SurveyScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useLoad(() => getSurvey(id), [id], 'load this survey');
  return (
    <Screen title={t('survey.title')}>
      <Loaded state={state}>{(s) => <SurveyForm survey={s} />}</Loaded>
    </Screen>
  );
}

function Stars({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const t = useT();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', gap: space.xs }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ selected: value === n }} accessibilityLabel={t('survey.stars', { n })} style={{ width: touch.min, height: touch.min, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={n <= value ? 'star' : 'star-outline'} size={32} color={n <= value ? colors.gold : colors.starEmpty} />
        </Pressable>
      ))}
    </View>
  );
}

function Nps({ value, onChange, label }: { value: number | undefined; onChange: (v: number) => void; label: string }) {
  const t = useT();
  return (
    <VStack gap={space.xs}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {Array.from({ length: 11 }, (_, n) => (
          <Pressable
            key={n}
            onPress={() => onChange(n)}
            accessibilityRole="radio"
            accessibilityState={{ selected: value === n }}
            accessibilityLabel={String(n)}
            style={{ width: touch.min, height: touch.min, borderRadius: radii.sm, borderWidth: 1.5, borderColor: value === n ? colors.purple : colors.borderInput, backgroundColor: value === n ? colors.purple : colors.card, alignItems: 'center', justifyContent: 'center' }}>
            <Txt variant="smallStrong" color={value === n ? 'white' : 'ink2'}>
              {String(n)}
            </Txt>
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Txt variant="caption" color="muted">
          {t('survey.notLikely')}
        </Txt>
        <Txt variant="caption" color="muted">
          {t('survey.veryLikely')}
        </Txt>
      </View>
    </VStack>
  );
}

function QuestionField({ q, value, onChange }: { q: Question; value: Answers[string] | undefined; onChange: (v: Answers[string]) => void }) {
  const t = useT();
  const label = q.required ? q.label : `${q.label} (${t('common.optional')})`;
  return (
    <Card>
      <Txt variant="bodyStrong">{label}</Txt>
      {q.type === 'rating' ? <Stars value={typeof value === 'number' ? value : 0} onChange={onChange} label={q.label} /> : null}
      {q.type === 'nps' ? <Nps value={typeof value === 'number' ? value : undefined} onChange={onChange} label={q.label} /> : null}
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
      {q.type === 'text' ? <TextField label={t('survey.yourAnswer')} value={typeof value === 'string' ? value : ''} onChangeText={onChange} multiline /> : null}
    </Card>
  );
}

function SurveyForm({ survey }: { survey: Tables<'surveys'> }) {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const questions = parseQuestions(survey.questions);
  const [answers, setAnswers] = useState<Answers>({});
  const [anon, setAnon] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const missing = missingRequired(questions, answers);
  const anonymous = survey.anonymous || anon;

  if (done) {
    return (
      <Card tone="green">
        <Txt variant="headline" color="greenDark">
          {t('survey.thanks')}
        </Txt>
        <Txt variant="small" color="greenDark">
          {anonymous ? t('survey.thanksAnon') : t('survey.thanksNamed')}
        </Txt>
        <Button label={t('common.done')} tone="green" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
      </Card>
    );
  }

  const submit = async () => {
    if (!member || !center) return;
    if (missing) return setError(t('survey.required', { question: missing.label }));
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

  return (
    <VStack gap={space.lg}>
      <Band color={colors.purple} eyebrow={t('survey.eyebrow')} title={survey.title} subtitle={survey.description ?? undefined} />
      {questions.length === 0 ? <Banner tone="info" message={t('survey.noQuestions')} /> : null}
      {questions.map((q) => (
        <QuestionField key={q.id} q={q} value={answers[q.id]} onChange={(v) => setAnswers({ ...answers, [q.id]: v })} />
      ))}
      {survey.anonymous ? (
        <Txt variant="meta" color="muted">
          {t('survey.alwaysAnon')}
        </Txt>
      ) : (
        <Toggle label={t('survey.submitAnon')} sub={anon ? t('survey.anonNote') : t('survey.namedNote')} value={anon} onChange={setAnon} />
      )}
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('survey.submit')} tone="purple" onPress={submit} busy={busy} disabled={!!missing || questions.length === 0 || !member} />
    </VStack>
  );
}
