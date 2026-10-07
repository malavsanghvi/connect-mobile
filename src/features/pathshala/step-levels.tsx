import { View } from 'react-native';

import { Button, Card, LinkText, Radio, Row, TextField, Txt, VStack } from '@/components/ui';
import { formatCents } from '@/lib/format';
import {
  levelGroups,
  levelUnavailable,
  officeConfirms,
  SUGGESTION_KEY,
  suggestedLevel,
  unsureAllowed,
  type LearnerAge,
  type PaymentMode,
  type RegLevel,
  type RegSuggestion,
  type RegTrack,
  type Selection,
  type TrackChoice,
} from '@/lib/pathshala-registration';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { StepHeader } from './shared';

/** What the level step needs to know about one chosen learner. */
export type LevelLearner = LearnerAge & { name: string; suggested: RegSuggestion[]; free: RegTrack[]; isNewChild: boolean };

/**
 * Step 2, "Level for each learner" (plan §3.1): per learner and track, the database's suggestion preselected with its
 * reason, the levels for their age first and "Other levels" below (outside the band: the office confirms, P24), each
 * with its fee and Seats open / Waitlist / Full. "Not sure, let the office decide" in a pledge-mode term only (P25).
 * "Also take Gujarati" adds a track (P10).
 */
export function LevelsStep({
  selections,
  learnerOf,
  mode,
  eyebrow,
  onPick,
  onAddTrack,
  onRemoveTrack,
  onNote,
}: {
  selections: Selection[];
  learnerOf: (s: Selection) => LevelLearner;
  mode: PaymentMode;
  eyebrow: string;
  onPick: (key: string, trackId: string, levelId: string | null, unsure: boolean) => void;
  onAddTrack: (key: string, trackId: string) => void;
  onRemoveTrack: (key: string, trackId: string) => void;
  onNote: (key: string, note: string) => void;
}) {
  const t = useT();
  return (
    <VStack gap={space.md}>
      <StepHeader eyebrow={eyebrow} title={t('reg.levels.title')} />
      {selections.map((s) => {
        const learner = learnerOf(s);
        const more = learner.isNewChild ? [] : learner.free.filter((tr) => !s.tracks.some((c) => c.trackId === tr.id));
        return (
          <Card key={s.key}>
            <Txt variant="cardTitle" accessibilityRole="header">
              {learner.age !== null ? `${learner.name} · ${t('reg.who.age', { n: learner.age })}` : learner.name}
            </Txt>
            {s.tracks.map((choice) => {
              const track = learner.free.find((tr) => tr.id === choice.trackId);
              return track ? (
                <TrackLevels
                  key={choice.trackId}
                  track={track}
                  choice={choice}
                  learner={learner}
                  mode={mode}
                  removable={s.tracks.length > 1}
                  onPick={(levelId, unsure) => onPick(s.key, track.id, levelId, unsure)}
                  onRemove={() => onRemoveTrack(s.key, track.id)}
                />
              ) : null;
            })}
            {more.length > 0 ? (
              <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
                {more.map((tr) => (
                  <Button key={tr.id} label={t('reg.levels.alsoTake', { track: tr.name })} tone="secondary" size="sm" icon="add" fill={false} onPress={() => onAddTrack(s.key, tr.id)} />
                ))}
              </Row>
            ) : null}
            <TextField label={t('reg.levels.note', { name: learner.name })} hint={t('common.optional')} value={s.note} onChangeText={(v) => onNote(s.key, v)} multiline maxLength={500} />
          </Card>
        );
      })}
    </VStack>
  );
}

function TrackLevels({
  track,
  choice,
  learner,
  mode,
  removable,
  onPick,
  onRemove,
}: {
  track: RegTrack;
  choice: TrackChoice;
  learner: LevelLearner;
  mode: PaymentMode;
  removable: boolean;
  onPick: (levelId: string | null, unsure: boolean) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const groups = levelGroups(track, learner);
  const suggestion = suggestedLevel(learner, track);
  const suggestedName = suggestion ? track.levels.find((l) => l.id === suggestion.levelId)?.name : null;

  const row = (level: RegLevel) => {
    const why = levelUnavailable(level);
    const fee = level.feeCents === 0 ? t('reg.levels.free') : level.feeCents !== null ? formatCents(level.feeCents) : null;
    const seats = level.seats === 'open' ? t('reg.levels.seatsOpen') : level.seats === 'waitlist' ? t('reg.levels.waitlist') : null;
    if (why) {
      return (
        <View key={level.id} accessible accessibilityLabel={`${level.name}. ${why === 'full' ? t('reg.levels.full') : t('reg.levels.noFee')}`} style={{ padding: space.md, borderRadius: radii.card, borderWidth: 1.5, borderColor: colors.borderInput, backgroundColor: colors.panel, gap: 2 }}>
          <Txt variant="bodyStrong" color="muted">
            {level.name}
          </Txt>
          <Txt variant="meta" color="muted">
            {why === 'full' ? t('reg.levels.full') : t('reg.levels.noFee')}
          </Txt>
        </View>
      );
    }
    const sub = [fee, seats, officeConfirms(level, learner) ? t('reg.levels.officeConfirms') : null].filter(Boolean).join(' · ');
    return <Radio key={level.id} label={level.name} sub={sub} selected={!choice.unsure && choice.levelId === level.id} onPress={() => onPick(level.id, false)} />;
  };

  return (
    <VStack gap={space.sm}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Txt variant="smallStrong" style={{ flex: 1 }}>
          {track.name}
        </Txt>
        {removable ? <LinkText label={t('reg.levels.removeTrack', { track: track.name })} onPress={onRemove} /> : null}
      </Row>
      {suggestion && suggestedName ? (
        <Txt variant="meta" color="greenDark">
          {[t('reg.levels.suggested', { level: suggestedName }), suggestion.reason ? t(SUGGESTION_KEY[suggestion.reason]) : null].filter(Boolean).join(' · ')}
        </Txt>
      ) : null}
      {groups.fit.length > 0 ? (
        <VStack gap={space.xs}>
          <Txt variant="meta" color="muted">
            {learner.age !== null ? t('reg.levels.for', { name: learner.name, n: learner.age }) : t('reg.levels.all')}
          </Txt>
          {groups.fit.map(row)}
        </VStack>
      ) : null}
      {groups.other.length > 0 ? (
        <VStack gap={space.xs}>
          <Txt variant="meta" color="muted">
            {t('reg.levels.other')}
          </Txt>
          {groups.other.map(row)}
        </VStack>
      ) : null}
      {unsureAllowed(mode) ? (
        <Radio label={t('reg.levels.unsure')} sub={t('reg.levels.unsureSub')} selected={choice.unsure} onPress={() => onPick(null, true)} />
      ) : (
        <Txt variant="meta" color="muted">
          {t('reg.levels.unsurePayNow')}
        </Txt>
      )}
    </VStack>
  );
}
