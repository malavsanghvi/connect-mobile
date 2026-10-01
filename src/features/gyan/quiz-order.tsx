import { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Txt, VStack } from '@/components/ui';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

import type { OrderQuestion } from './activity';
import { ExplainBox, LessonFrame, StepFooter, StepTitle } from './lesson-frame';
import { haptic, useReduceMotion, useShake } from './motion';
import type { QuestionProps } from './quiz-choice';
import { orderMistakes, shuffled, triesAllowed } from './quiz-logic';

type Phase = 'answering' | 'retry' | 'right' | 'shown';

/** Order: tap the items into place (tap a placed one to take it back), then Check; one retry. */
export function OrderView({ ctx, q, seed }: QuestionProps<OrderQuestion>) {
  const t = useT();
  const reduce = useReduceMotion();
  const shake = useShake(reduce);
  const [pool] = useState(() => shuffled(q.items, seed, true));
  const [placed, setPlaced] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string[]>([]);
  const [misses, setMisses] = useState(0);
  const [phase, setPhase] = useState<Phase>('answering');
  const resolved = phase === 'right' || phase === 'shown';
  const shown = phase === 'shown' ? q.items : placed;
  const remaining = pool.filter((x) => !placed.includes(x));

  const place = (item: string) => {
    haptic('tap');
    setPlaced([...placed, item]);
  };
  const takeBack = (item: string) => {
    haptic('tap');
    setPlaced(placed.filter((x) => x !== item));
    setWrong(wrong.filter((x) => x !== item));
  };
  const check = () => {
    const bad = orderMistakes(q.items, placed);
    if (bad.length === 0) {
      haptic('right');
      setWrong([]);
      setPhase('right');
      return;
    }
    haptic('wrong');
    shake.shake();
    const used = misses + 1;
    setMisses(used);
    if (used < triesAllowed('order')) {
      setWrong(bad.map((i) => placed[i]));
      setPhase('retry');
    } else {
      setWrong([]);
      setPhase('shown');
    }
  };

  const feedback =
    phase === 'retry'
      ? { text: t('gyan.orderWrong'), ok: false }
      : phase === 'right'
        ? { text: misses ? t('gyan.rightSecondTry') : t('learn.allCorrect'), ok: true }
        : phase === 'shown'
          ? { text: t('gyan.orderShown'), ok: false }
          : null;

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={resolved}
      footer={
        resolved ? (
          <StepFooter feedback={feedback} label={t('learn.continue')} busy={ctx.frame.saving} onPress={() => ctx.finish({ kind: 'question', firstTry: phase === 'right' && misses === 0 })} />
        ) : (
          <StepFooter feedback={feedback} label={t('learn.check')} tone="check" disabled={placed.length < q.items.length} onPress={check} />
        )
      }>
      <StepTitle>{q.prompt || t('gyan.orderTitle')}</StepTitle>
      {!resolved ? (
        <Txt variant="small" color="muted">
          {t('gyan.orderHint')}
        </Txt>
      ) : null}
      <Animated.View style={shake.style}>
        <VStack gap={space.sm}>
          {q.items.map((_, i) => {
            const item = shown[i];
            const isWrong = !!item && wrong.includes(item);
            const good = resolved && !!item;
            const border = isWrong ? colors.danger : good ? colors.green : item ? colors.navy : colors.dashed2;
            return (
              <Pressable
                key={i}
                disabled={!item || resolved}
                onPress={() => item && takeBack(item)}
                accessibilityRole="button"
                accessibilityLabel={item ? (resolved ? `${i + 1}. ${item}` : t('gyan.orderPlaced', { n: i + 1, item })) : t('gyan.orderSlot', { n: i + 1 })}
                accessibilityState={{ disabled: !item || resolved }}
                style={{
                  minHeight: 52,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  borderRadius: radii.row,
                  borderWidth: 2,
                  borderStyle: item ? 'solid' : 'dashed',
                  borderColor: border,
                  backgroundColor: isWrong ? colors.dangerTint : good ? colors.greenTint : item ? colors.navyTint : colors.card,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                }}>
                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: item ? border : colors.frame, alignItems: 'center', justifyContent: 'center' }}>
                  <Txt variant="smallStrong" color={item ? 'white' : 'muted'}>
                    {String(i + 1)}
                  </Txt>
                </View>
                <Txt variant="bodyStrong" color={item ? 'ink' : 'faint'} style={{ flexShrink: 1 }}>
                  {item ?? t('gyan.orderSlot', { n: i + 1 })}
                </Txt>
              </Pressable>
            );
          })}
        </VStack>
      </Animated.View>
      {!resolved && remaining.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {remaining.map((item) => (
            <Pressable
              key={item}
              onPress={() => place(item)}
              accessibilityRole="button"
              style={({ pressed }) => ({ minHeight: 48, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.saffron, backgroundColor: pressed ? colors.brownTint : colors.card, paddingHorizontal: 16, paddingVertical: 8 })}>
              <Txt variant="smallStrong" color="brown">
                {item}
              </Txt>
            </Pressable>
          ))}
        </View>
      ) : null}
      {resolved ? <ExplainBox text={q.explain} /> : null}
    </LessonFrame>
  );
}
