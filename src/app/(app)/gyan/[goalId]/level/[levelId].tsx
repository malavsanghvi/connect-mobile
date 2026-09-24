import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Band, Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Row, Txt, VStack } from '@/components/ui';
import { pickTranslation } from '@/i18n';
import { completeStep, isLevelDone, isStepDone, loadGyan, parseQuiz, requestSignoff, type GyanData, type GyanLevel, type GyanStep } from '@/lib/api/gyan';
import type { ContentItem } from '@/lib/api/jainway';
import { must, report } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

/** One Gyan Path level: its steps in order (learn / listen / quiz / recite …), progress saved per step. */
export default function GyanLevelScreen() {
  const { t } = useSettings();
  const { goalId, levelId } = useLocalSearchParams<{ goalId: string; levelId: string }>();
  const { center, member } = useApp();
  const state = useLoad(
    async () => {
      if (!center || !member) throw new Error('not signed in');
      const data = await loadGyan(center, [member.person.id]);
      const goal = data.goals.find((g) => g.id === goalId) ?? null;
      const level = goal?.levels.find((l) => l.id === levelId) ?? null;
      const ids = (level?.steps ?? []).map((s) => s.content_item_id).filter((x): x is string => !!x);
      const content = ids.length ? must(await supabase.from('content_items').select('*').in('id', ids), 'load lesson content') : [];
      return { data, goal, level, content };
    },
    [center?.id, member?.person.id, goalId, levelId],
    'load this level',
  );
  return (
    <Screen title={t('learn.levelTitle')}>
      <Loaded state={state}>
        {({ data, goal, level, content }) =>
          goal && level && member ? <LevelBody data={data} goalName={goal.name} isFinal={goal.levels[goal.levels.length - 1]?.id === level.id} level={level} content={content} index={goal.levels.findIndex((l) => l.id === level.id)} /> : <EmptyState title={t('learn.goalMissing')} />
        }
      </Loaded>
    </Screen>
  );
}

function LevelBody({ data, goalName, level, content, index, isFinal }: { data: GyanData; goalName: string; level: GyanLevel; content: ContentItem[]; index: number; isFinal: boolean }) {
  const { t } = useSettings();
  const router = useRouter();
  const { member, center } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!member || !center) return null;
  const me = member.person.id;
  const firstOpen = level.steps.findIndex((s) => !isStepDone(data.progress, me, s.id));
  const levelDone = isLevelDone(level, data.progress, me);
  const signoff = data.signoffs.find((s) => s.level_id === level.id && s.person_id === me);

  const finishStep = async (step: GyanStep, stars: number) => {
    setError(null);
    try {
      await completeStep(center.id, me, step.id, stars, data.progress);
      invalidate();
      toast(t('learn.stepDone', { stars }));
    } catch (err) {
      setError(report(err, 'save your progress').userMessage);
    }
  };

  const askSignoff = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestSignoff(center.id, me, level.id);
      invalidate();
      toast(t('learn.signoffRequested'));
    } catch (err) {
      setError(report(err, 'request a teacher sign-off').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.lg}>
      <Band color={colors.purple} eyebrow={`${goalName} · ${t('learn.level', { n: index + 1 })}`} title={level.name} subtitle={level.treasure ? t('learn.treasure', { reward: level.treasure }) : undefined} />
      {error ? <Banner tone="error" message={error} /> : null}
      {level.steps.length === 0 ? <EmptyState icon="hourglass-outline" title={t('learn.noSteps')} body={t('learn.noStepsBody')} /> : null}
      {level.steps.map((step, i) => {
        const done = isStepDone(data.progress, me, step.id);
        const active = i === firstOpen;
        const stars = data.progress.find((p) => p.person_id === me && p.step_id === step.id)?.stars ?? 0;
        return (
          <StepCard
            key={step.id}
            step={step}
            content={content.find((c) => c.id === step.content_item_id) ?? null}
            index={i}
            done={done}
            active={active}
            stars={stars}
            locked={!done && !active}
            onComplete={(s) => finishStep(step, s)}
          />
        );
      })}
      {levelDone ? (
        <Card tone="green">
          <Txt variant="eyebrow" color="greenDark">
            {t('learn.levelComplete', { n: index + 1 })}
          </Txt>
          <Txt variant="headline" color="greenDark">
            {level.name}
          </Txt>
          {level.points ? (
            <Txt variant="small" color="greenDark">
              {t('learn.pointsNote', { points: level.points })}
            </Txt>
          ) : null}
          {isFinal && level.requires_teacher_signoff ? (
            signoff ? (
              <Txt variant="smallStrong" color="greenDark">
                {signoff.status === 'approved' ? t('learn.signedOff') : signoff.status === 'needs_work' ? t('learn.needsWork') : t('learn.signoffRequested')}
              </Txt>
            ) : (
              <Button label={t('learn.requestSignoff')} tone="green" onPress={askSignoff} busy={busy} />
            )
          ) : (
            <Button label={t('learn.backToPath')} tone="green" onPress={() => router.back()} />
          )}
        </Card>
      ) : null}
    </VStack>
  );
}

const KIND_ICON: Record<string, 'book-outline' | 'headset-outline' | 'mic-outline' | 'help-circle-outline' | 'play-circle-outline' | 'leaf-outline'> = {
  read: 'book-outline',
  listen: 'headset-outline',
  recite: 'mic-outline',
  quiz: 'help-circle-outline',
  video: 'play-circle-outline',
  practice: 'leaf-outline',
};

function StepCard({ step, content, index, done, active, locked, stars, onComplete }: { step: GyanStep; content: ContentItem | null; index: number; done: boolean; active: boolean; locked: boolean; stars: number; onComplete: (stars: number) => Promise<void> }) {
  const { t, language } = useSettings();
  const [busy, setBusy] = useState(false);
  const [picks, setPicks] = useState<Record<number, number>>({});
  const [checked, setChecked] = useState(false);
  const quiz = step.kind === 'quiz' ? parseQuiz(step.quiz) : [];
  const tr = content ? pickTranslation({ title: content.title, body_md: content.body_md ?? '' }, content.translations, language) : null;

  const run = async (s: number) => {
    setBusy(true);
    await onComplete(s);
    setBusy(false);
  };
  const openMedia = async () => {
    if (!content?.media_url) return;
    try {
      await WebBrowser.openBrowserAsync(content.media_url);
    } catch (err) {
      report(err, 'open this recording');
    }
  };
  const wrong = quiz.filter((q, i) => picks[i] !== undefined && picks[i] !== q.answer).length;

  return (
    <Card style={active ? { borderColor: colors.saffron, borderWidth: 2 } : undefined}>
      <Row gap={space.md}>
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: done ? colors.green : active ? colors.purpleTint : colors.chip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={done ? 'checkmark' : (KIND_ICON[step.kind] ?? 'book-outline')} size={20} color={done ? colors.white : active ? colors.purple : colors.faint} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="caption" color="muted">
            {`${index + 1} · ${t(`learn.kind.${step.kind}` as 'learn.kind.read')}`}
          </Txt>
          <Txt variant="bodyStrong" color={locked ? 'muted' : 'ink'}>
            {step.title}
          </Txt>
          {done ? (
            <Txt variant="caption" color="gold">
              {'★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))}
            </Txt>
          ) : null}
        </View>
      </Row>
      {active ? (
        <VStack gap={space.md}>
          {tr?.body_md ? (
            <Txt variant="body" color="ink2" selectable>
              {tr.body_md}
            </Txt>
          ) : step.kind !== 'quiz' ? (
            <Txt variant="small" color="muted">
              {t('learn.contentFromPathshala')}
            </Txt>
          ) : null}
          {content?.media_url ? <Button label={step.kind === 'video' ? t('learn.watch') : t('learn.listenRecitation')} tone="secondary" size="md" icon="play-circle-outline" onPress={openMedia} /> : null}

          {step.kind === 'quiz' ? (
            quiz.length === 0 ? (
              <>
                <Txt variant="small" color="muted">
                  {t('learn.quizMissing')}
                </Txt>
                <Button label={t('learn.markDone')} tone="purple" size="md" busy={busy} onPress={() => run(1)} />
              </>
            ) : (
              <>
                {quiz.map((q, qi) => (
                  <VStack key={qi} gap={space.sm}>
                    <Txt variant="bodyStrong">{q.question}</Txt>
                    {q.options.map((o, oi) => {
                      const picked = picks[qi] === oi;
                      const showRight = checked && oi === q.answer;
                      const showWrong = checked && picked && oi !== q.answer;
                      return (
                        <Pressable
                          key={oi}
                          disabled={checked}
                          onPress={() => setPicks({ ...picks, [qi]: oi })}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: picked, disabled: checked }}
                          accessibilityLabel={`${o}${showRight ? `, ${t('learn.correctAnswer')}` : showWrong ? `, ${t('learn.wrongAnswer')}` : ''}`}
                          style={{
                            minHeight: touch.min + 4,
                            borderRadius: radii.card,
                            borderWidth: 1.5,
                            padding: space.md,
                            justifyContent: 'center',
                            borderColor: showRight ? colors.green : showWrong ? colors.danger : picked ? colors.purple : colors.borderInput,
                            backgroundColor: showRight ? colors.greenTint : showWrong ? colors.dangerTint : picked ? colors.purpleTint : colors.card,
                          }}>
                          <Txt variant="small">{o}</Txt>
                        </Pressable>
                      );
                    })}
                  </VStack>
                ))}
                {checked ? (
                  <>
                    <Banner tone={wrong === 0 ? 'success' : 'warning'} message={wrong === 0 ? t('learn.allCorrect') : t('learn.someWrong')} />
                    <Button label={t('common.continue')} tone="purple" busy={busy} onPress={() => run(Math.max(1, 3 - wrong))} />
                  </>
                ) : (
                  <Button label={t('learn.check')} tone="purple" disabled={Object.keys(picks).length < quiz.length} onPress={() => setChecked(true)} />
                )}
              </>
            )
          ) : step.kind === 'recite' ? (
            <>
              <Txt variant="small" color="ink2">
                {t('learn.reciteBody')}
              </Txt>
              <Button label={t('learn.recited')} tone="purple" busy={busy} onPress={() => run(3)} />
              <Button label={t('learn.skipRecitation')} tone="secondary" size="md" onPress={() => run(2)} />
            </>
          ) : (
            <Button label={t('learn.markDone')} tone="purple" busy={busy} onPress={() => run(3)} />
          )}
        </VStack>
      ) : null}
    </Card>
  );
}
