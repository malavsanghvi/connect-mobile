import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/states';
import { Chevron, Pill, Row, Txt, VStack } from '@/components/ui';
import { comebackNote, dueLine, homeworkState, isOverdue, STATE_LABEL, STATE_TONE, type HomeworkItem, type Viewer } from '@/lib/homework';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import type { HomeworkLoad } from './use-homework';

/** Opens the homework screen for one item (the person is always named, so a parent lands on the child's answer). */
export function openHomework(router: ReturnType<typeof useRouter>, item: HomeworkItem): void {
  router.push({ pathname: '/gyan/homework/[assignmentId]', params: { assignmentId: item.assignment.id, person: item.personId } });
}

/**
 * One assignment for one person: title, due, points, status chip, and the note that came with a send-back (the
 * teacher's, or a parent's on a draft). Tapping opens the homework screen. `levelLabel` ("Level 2: Namaskar") says
 * which level it belongs to where the cards of several levels are listed together (the goal map); `waitNote` says the
 * level's points are waiting for this homework (see levelPointsWait).
 */
export function HomeworkCard({ item, today, viewer, levelLabel, waitNote }: { item: HomeworkItem; today: string; viewer: Viewer; levelLabel?: string | null; waitNote?: string | null }) {
  const t = useT();
  const router = useRouter();
  const { assignment: a, submission: sub } = item;
  const state = homeworkState(sub);
  const due = dueLine(a.dueOn, today);
  const overdue = isOverdue(item, today);
  const meta = [levelLabel ?? null, due ? t(due.key, due.vars) : null, a.points > 0 ? t('hw.points', { n: a.points }) : null].filter((x): x is string => !!x).join(' · ');
  // The note that explains the chip: the teacher's when sent back, a parent's when they sent it back to the child (then it is a draft again).
  const note = comebackNote(sub);
  const noteTitle = note ? (note.from === 'teacher' ? (viewer === 'learner' ? t('hw.teacherNote') : t('hw.teacherNoteOther')) : viewer === 'learner' ? t('hw.parentNote') : t('hw.parentNoteOther')) : null;
  const status = t(STATE_LABEL[state]);
  const label = [a.title, meta, status, overdue ? t('hw.overdue') : sub?.late ? t('hw.late') : null, note ? `${noteTitle}: ${note.note}` : null, waitNote ?? null].filter(Boolean).join('. ');
  return (
    <Pressable
      onPress={() => openHomework(router, item)}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t('hw.openHint')}
      style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: state === 'awaiting_parent' && item.canParentDecide ? colors.saffron : colors.border, borderRadius: radii.xl, paddingVertical: space.cardY, paddingHorizontal: space.cardX, gap: space.sm, opacity: pressed ? 0.9 : 1 })}>
      <Row gap={space.sm} align="flex-start">
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong">{a.title}</Txt>
          {meta ? (
            <Txt variant="meta" color="muted">
              {meta}
            </Txt>
          ) : null}
        </View>
        <Chevron />
      </Row>
      <Row gap={space.xs} style={{ flexWrap: 'wrap' }}>
        <Pill label={status} tone={STATE_TONE[state]} />
        {overdue ? <Pill label={t('hw.overdue')} tone="red" /> : sub?.late ? <Pill label={t('hw.late')} tone="amber" /> : null}
        {a.requiredForLevel ? <Pill label={t('hw.requiredForLevel')} tone="navy" /> : null}
      </Row>
      {waitNote ? (
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {waitNote}
        </Txt>
      ) : null}
      {note ? (
        <View style={{ backgroundColor: colors.panel, borderRadius: radii.md, paddingVertical: space.sm, paddingHorizontal: space.md, gap: 2 }}>
          <Txt variant="caption" color="muted" style={{ fontFamily: fonts.bodySemi }}>
            {noteTitle}
          </Txt>
          <Txt variant="small" color="ink2">
            {note.note}
          </Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A titled list of homework cards (a level's, a goal's, a person's). Nothing at all when there is nothing to show
 * and nothing wrong; a failed load says so with Try again (the homework is never quietly missing).
 */
export function HomeworkSection({ load, items, title, today, viewer, levelLabelOf, waitNoteOf, onNavy }: { load: HomeworkLoad; items: HomeworkItem[]; title: string; today: string; viewer: Viewer; levelLabelOf?: (item: HomeworkItem) => string | null; waitNoteOf?: (item: HomeworkItem) => string | null; /** On the navy celebration screen the title is light. */ onNavy?: boolean }) {
  if (load.state.error && !load.state.data) return <ErrorState error={load.state.error} onRetry={() => void load.state.reload()} />;
  if (items.length === 0) return null;
  return (
    <VStack gap={space.sm}>
      <Txt variant="eyebrow" color={onNavy ? 'onNavy' : 'muted'} accessibilityRole="header">
        {title}
      </Txt>
      {load.state.error ? <ErrorState error={load.state.error} onRetry={() => void load.state.reload()} /> : null}
      {items.map((item) => (
        <HomeworkCard key={`${item.assignment.id}:${item.personId}`} item={item} today={today} viewer={viewer} levelLabel={levelLabelOf?.(item) ?? null} waitNote={waitNoteOf?.(item) ?? null} />
      ))}
    </VStack>
  );
}
