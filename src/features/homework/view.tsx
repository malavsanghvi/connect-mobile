import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Banner, Button, Card, Pill, Row, Txt, VStack } from '@/components/ui';
import { useInAppAudio } from '@/features/audio';
import { PointsBurst } from '@/features/gyan/confetti';
import { haptic } from '@/features/gyan/motion';
import { logError } from '@/lib/errors';
import { todayAt } from '@/lib/format';
import { canDecide, canEdit, CELEBRATED_PREF, comebackNote, dueLine, firstNameOf, homeworkState, isOverdue, parseCelebrated, recordCelebrated, shouldCelebrate, STATE_LABEL, STATE_TONE, viewerFor, type HomeworkItem, type HomeworkPerson, type Submission, type Viewer } from '@/lib/homework';
import { communityName } from '@/lib/learning';
import { readPref, writePref } from '@/lib/storage';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { AnswerEditor, AnswerReadOnly } from './answer';
import { ParentDecision } from './decide';

/**
 * "+N points" with confetti, the first time this device sees an accepted answer (the same burst a lesson's points
 * get). Remembered per submission on the device, so it never plays twice for one acceptance. For the learner only:
 * a parent looking at the child's accepted homework neither sees it nor uses it up.
 */
function useAcceptedCelebration(sub: Submission | null, viewer: Viewer): number | null {
  const t = useT();
  const { center } = useApp();
  const { toast } = useFeedback();
  const [burst, setBurst] = useState<number | null>(null);
  const id = viewer === 'learner' && sub?.status === 'accepted' ? sub.id : null;
  const points = sub?.pointsAwarded ?? 0;
  useEffect(() => {
    if (!id) return;
    let alive = true;
    readPref<unknown>(CELEBRATED_PREF, []).then((raw) => {
      const seen = parseCelebrated(raw);
      if (!alive || !shouldCelebrate(seen, { id, status: 'accepted' } as Submission, viewer)) return;
      setBurst(Date.now());
      haptic('complete');
      toast(points > 0 ? t('hw.acceptedToast', { n: points, center: communityName(center) }) : t('hw.acceptedToastNoPoints'));
      writePref(CELEBRATED_PREF, recordCelebrated(seen, id)).catch((err: unknown) => logError('remembering the homework celebration on this device (it may play again)', err));
    });
    return () => {
      alive = false;
    };
    // Once per accepted submission; the words and the community do not change it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return burst;
}

/**
 * One homework for one person, as the reader may see it: the assignment, then the answer in its state. The learner
 * (or a household adult doing it for a child) edits a draft, hands it in, and edits again when it is sent back; a
 * waiting answer is read-only, with the parent's two buttons when this reader may decide; with the teacher and
 * accepted are read-only with the result.
 */
export function HomeworkView({ item, people }: { item: HomeworkItem; people: HomeworkPerson[] }) {
  const t = useT();
  const { center, member } = useApp();
  const audio = useInAppAudio(t('hw.part.playFailed'));
  // What this screen wrote last, kept until the reload after it brings the same answer back (the props are the server's truth).
  const [written, setWritten] = useState<{ sub: Submission; over: Submission | null } | null>(null);
  const [editingAgain, setEditingAgain] = useState(false);
  const sub = written && written.over === item.submission ? written.sub : item.submission;
  // Who may do what comes from the answer's own people list (every household the reader is in); the family roster is for names.
  const viewer = member ? viewerFor(item.personId, { personId: member.person.id, isAdult: member.isAdult }, people) : 'none';
  const burst = useAcceptedCelebration(sub, viewer);
  if (!center || !member) return null;
  const family = member.members.find((m) => m.person.id === item.personId)?.person;
  const learnerName = family ? family.preferred_name || family.first_name : firstNameOf(people.find((p) => p.personId === item.personId)?.name ?? '');
  const today = todayAt(center.time_zone);
  const state = homeworkState(sub);
  const { assignment: a } = item;
  const due = dueLine(a.dueOn, today);
  const overdue = isOverdue({ assignment: a, submission: sub }, today);
  const onSaved = (next: Submission) => setWritten({ sub: next, over: item.submission });
  const editing = canEdit(state, viewer) && (state !== 'needs_work' || editingAgain);
  const comeback = comebackNote(sub);
  const answerTitle = viewer === 'parent' ? t('hw.answerOf', { name: learnerName }) : t('hw.yourAnswer');
  const teacherNoteTitle = viewer === 'learner' ? t('hw.teacherNote') : t('hw.teacherNoteOther');
  const parentNoteTitle = viewer === 'learner' ? t('hw.parentNote') : t('hw.parentNoteOther');

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, paddingVertical: space.cardY, paddingHorizontal: space.cardX, gap: space.sm }}>
        <Txt variant="title" accessibilityRole="header">
          {a.title}
        </Txt>
        <Txt variant="meta" color="muted">
          {[due ? t(due.key, due.vars) : null, a.points > 0 ? t('hw.points', { n: a.points }) : null, viewer === 'parent' ? t('hw.forName', { name: learnerName }) : null, sub && sub.attempt > 1 ? t('hw.attempt', { n: sub.attempt }) : null].filter(Boolean).join(' · ')}
        </Txt>
        <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
          <Pill label={t(STATE_LABEL[state])} tone={STATE_TONE[state]} />
          {overdue ? <Pill label={t('hw.overdue')} tone="red" /> : sub?.late ? <Pill label={t('hw.late')} tone="amber" /> : null}
          {a.requiredForLevel ? <Pill label={t('hw.requiredForLevel')} tone="navy" /> : null}
        </Row>
      </View>

      <VStack gap={space.sm}>
        <Txt variant="eyebrow" color="muted" accessibilityRole="header">
          {t('hw.instructions')}
        </Txt>
        {a.instructionsMd ? (
          <Markdownish source={a.instructionsMd} selectable />
        ) : (
          <Txt variant="small" color="muted">
            {t('hw.noInstructions')}
          </Txt>
        )}
      </VStack>

      {viewer === 'none' ? (
        <Banner tone="info" message={t('hw.noAccess')} />
      ) : editing ? (
        <>
          {comeback ? <Banner tone="warning" title={comeback.from === 'teacher' ? teacherNoteTitle : parentNoteTitle} message={comeback.note} /> : null}
          {/* No key on purpose: the editor keeps its parts and text while the first save turns "not started" into a draft. */}
          <AnswerEditor item={item} viewer={viewer} sub={sub} centerId={center.id} learnerName={learnerName} audio={audio} onSaved={onSaved} />
        </>
      ) : state === 'needs_work' ? (
        <>
          <Banner tone="warning" title={t('hw.status.needsWork')} message={viewer === 'learner' ? t('hw.sentBackBody') : t('hw.sentBackBodyOther')} />
          {sub?.reviewNote ? (
            <Card tone="amber" style={{ gap: 2 }}>
              <Txt variant="caption" color="brownDark" style={{ fontFamily: fonts.bodySemi }}>
                {teacherNoteTitle}
              </Txt>
              <Txt variant="body" color="brownDark" selectable>
                {sub.reviewNote}
              </Txt>
            </Card>
          ) : null}
          <AnswerReadOnly sub={sub} audio={audio} title={answerTitle} />
          <Button label={t('hw.editAgain')} onPress={() => setEditingAgain(true)} />
        </>
      ) : state === 'awaiting_parent' ? (
        <>
          {sub && canDecide({ canParentDecide: item.canParentDecide, submission: sub }, viewer) ? <ParentDecision submissionId={sub.id} childName={learnerName} onDecided={onSaved} /> : <Banner tone="info" title={t('hw.status.awaitingParent')} message={viewer === 'learner' ? t('hw.waitingParent') : t('hw.waitingParentOther')} />}
          <AnswerReadOnly sub={sub} audio={audio} title={answerTitle} />
        </>
      ) : state === 'submitted' ? (
        <>
          <Banner tone="info" title={t('hw.status.submitted')} message={viewer === 'learner' ? t('hw.withTeacherBody') : t('hw.withTeacherBodyOther')} />
          <AnswerReadOnly sub={sub} audio={audio} title={answerTitle} />
        </>
      ) : (
        <>
          <Banner tone="success" title={sub && sub.pointsAwarded > 0 ? t('hw.acceptedPoints', { n: sub.pointsAwarded, center: communityName(center) }) : t('hw.acceptedTitle')} message={sub?.reviewNote ? `${teacherNoteTitle}: ${sub.reviewNote}` : t('hw.status.accepted')} />
          <AnswerReadOnly sub={sub} audio={audio} title={answerTitle} />
        </>
      )}
      {audio.error ? <Banner tone="error" message={audio.error} /> : null}
      {burst !== null ? <PointsBurst key={burst} seed={burst % 100000} label={sub && sub.pointsAwarded > 0 ? t('gyan.plusPoints', { n: sub.pointsAwarded }) : null} confetti /> : null}
    </View>
  );
}
