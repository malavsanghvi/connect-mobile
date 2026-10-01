import { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Txt } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import { announce } from './a11y';
import type { MatchQuestion } from './activity';
import { ExplainBox, LessonFrame, StepFooter, StepTitle } from './lesson-frame';
import { haptic, useReduceMotion, useShake } from './motion';
import type { QuestionProps } from './quiz-choice';
import { isPair, shuffled } from './quiz-logic';

/**
 * Match: tap a word on the left, then its partner on the right (either order
 * works). Wrong pairs shake and come apart. A screen reader hears which column
 * a word is in, that a partner comes next, and what a pick or a pair did.
 */
export function MatchView({ ctx, q, seed }: QuestionProps<MatchQuestion>) {
  const t = useT();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const lefts = q.pairs.map((p) => p[0]);
  const [rights] = useState(() => shuffled(q.pairs.map((p) => p[1]), seed, true));
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]); // left words already paired
  const [slips, setSlips] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const done = matched.length === q.pairs.length;
  const matchedRights = q.pairs.filter((p) => matched.includes(p[0])).map((p) => p[1]);

  const tryPair = (l: string, r: string) => {
    if (isPair(q.pairs, l, r)) {
      const next = [...matched, l];
      setMatched(next);
      setNote(null);
      haptic(next.length === q.pairs.length ? 'right' : 'tap');
      // The last pair: the footer's "All matched" note says it too (a live region only on the web).
      if (next.length === q.pairs.length) announce(slips ? t('gyan.matchDoneSlips') : t('gyan.matchDone'));
      else announce(t('gyan.matchedLabel', { left: l, right: r }));
    } else {
      haptic('wrong');
      shake.shake();
      setSlips(slips + 1);
      setNote(t('gyan.matchWrong'));
      announce(t('gyan.matchWrong')); // the footer note is a live region only on the web
    }
    setLeft(null);
    setRight(null);
  };
  const pickLeft = (l: string) => {
    if (right) tryPair(l, right);
    else {
      const picked = left === l ? null : l;
      setLeft(picked);
      if (picked) announce(t('gyan.matchPickedLeft', { word: picked }));
    }
  };
  const pickRight = (r: string) => {
    if (left) tryPair(left, r);
    else {
      const picked = right === r ? null : r;
      setRight(picked);
      if (picked) announce(t('gyan.matchPickedRight', { word: picked }));
    }
  };

  const cell = (label: string, side: 'left' | 'right') => {
    const isMatched = side === 'left' ? matched.includes(label) : matchedRights.includes(label);
    const selected = side === 'left' ? left === label : right === label;
    const partner = side === 'left' ? q.pairs.find((p) => p[0] === label)?.[1] : q.pairs.find((p) => p[1] === label)?.[0];
    // A word picked on the other side: this one would pair with it.
    const other = side === 'left' ? right : left;
    const hint = isMatched || done || selected ? undefined : other ? t('gyan.matchPairHint', { word: other }) : side === 'left' ? t('gyan.matchLeftHint') : t('gyan.matchRightHint');
    return (
      <Pressable
        key={`${side}:${label}`}
        disabled={isMatched || done}
        onPress={() => (side === 'left' ? pickLeft(label) : pickRight(label))}
        accessibilityRole="button"
        accessibilityState={{ selected, disabled: isMatched || done }}
        accessibilityLabel={
          isMatched && partner
            ? t('gyan.matchedLabel', side === 'left' ? { left: label, right: partner } : { left: partner, right: label })
            : t(side === 'left' ? 'gyan.matchLeftA11y' : 'gyan.matchRightA11y', { word: label })
        }
        accessibilityHint={hint}
        style={{
          minHeight: 56,
          justifyContent: 'center',
          borderRadius: radii.row,
          borderWidth: 2,
          borderColor: isMatched ? colors.green : selected ? colors.navy : colors.borderInput,
          backgroundColor: isMatched ? colors.greenTint : selected ? colors.navyTint : colors.card,
          paddingVertical: 8,
          paddingHorizontal: 12,
        }}>
        <Txt variant="smallStrong" color={isMatched ? 'greenDark' : 'ink'}>
          {label}
        </Txt>
      </Pressable>
    );
  };

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={done}
      footer={
        <StepFooter
          feedback={done ? { text: slips ? t('gyan.matchDoneSlips') : t('gyan.matchDone'), ok: true, announced: true } : note ? { text: note, ok: false, announced: true } : null}
          label={t('learn.continue')}
          disabled={!done}
          busy={ctx.frame.saving}
          onPress={() => ctx.finish({ kind: 'question', firstTry: slips === 0 })}
        />
      }>
      <StepTitle>{q.prompt || t('gyan.matchTitle')}</StepTitle>
      {!done ? (
        <Txt variant="small" color="muted">
          {t('gyan.matchHint')}
        </Txt>
      ) : null}
      <Animated.View style={[{ flexDirection: 'row', gap: space.sm }, shake.style]}>
        <View style={{ flex: 1, gap: space.sm }}>{lefts.map((l) => cell(l, 'left'))}</View>
        <View style={{ flex: 1, gap: space.sm }}>{rights.map((r) => cell(r, 'right'))}</View>
      </Animated.View>
      {done ? <ExplainBox text={q.explain} /> : null}
    </LessonFrame>
  );
}
