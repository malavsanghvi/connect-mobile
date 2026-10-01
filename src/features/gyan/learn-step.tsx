import { Pressable, View } from 'react-native';

import { Banner, Txt, VStack } from '@/components/ui';
import { clock, type InAppAudio } from '@/features/audio';
import { PlayGlyph } from '@/features/gyan-ui';
import { pickTranslation } from '@/i18n';
import type { ContentItem } from '@/lib/api/jainway';
import { useSettings, useT } from '@/providers/settings';
import { colors, radii } from '@/theme';

import { activityExtras } from './activity';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle } from './lesson-frame';
import { stepActivity, type StepProps } from './step-types';

/** The original learn screen (read without cards, listen, video): meaning, recitation audio and the sutra lines. */
export function LearnStep({ ctx }: StepProps) {
  const t = useT();
  const { language } = useSettings();
  const item = ctx.item;
  const tr = item ? pickTranslation({ title: item.title, body_md: item.body_md ?? '' }, item.translations, language) : null;
  return (
    <LessonFrame frame={ctx.frame} answered footer={<StepFooter label={t('learn.continue')} busy={ctx.frame.saving} onPress={() => ctx.finish({ kind: 'step', stars: 3 })} />}>
      {ctx.audio.error ? <Banner tone="error" message={ctx.audio.error} /> : null}
      <VStack gap={12}>
        <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
        <Txt variant="body" color="ink2" style={{ lineHeight: 23 }} selectable>
          {tr?.body_md || t('learn.contentFromPathshala')}
        </Txt>
        <ListenButton id={ctx.step.id} url={item?.media_url ?? null} audio={ctx.audio} />
        <SutraLines item={item} />
        <ExtrasBox extras={activityExtras(stepActivity(ctx.step))} />
      </VStack>
    </LessonFrame>
  );
}

export function ListenButton({ id, url, audio }: { id: string; url: string | null; audio: InAppAudio }) {
  const t = useT();
  const mine = audio.current === id;
  const playing = mine && audio.playing;
  const label = !url ? t('learn.noAudio') : mine && audio.loading ? t('learn.loadingAudio') : playing ? t('learn.playing', { time: clock(audio.position) }) : t('learn.listenRecitation');
  return (
    <Pressable
      disabled={!url}
      onPress={() => {
        if (url) audio.toggle(id, url);
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !url, selected: playing }}
      accessibilityLabel={label}
      style={({ pressed }) => ({ backgroundColor: url ? colors.navy : colors.navyDisabled, borderRadius: radii.xl, minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, opacity: pressed ? 0.9 : 1 })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
        <PlayGlyph size={18} paused={playing} />
      </View>
      <Txt variant="bodyStrong" color="white" style={{ flexShrink: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

function SutraLines({ item }: { item: ContentItem | null }) {
  const t = useT();
  const m = item?.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
  const lines = Array.isArray(m.lines) ? m.lines.filter((x): x is string => typeof x === 'string') : typeof m.sutra === 'string' ? m.sutra.split('\n') : [];
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.dashed2, borderRadius: radii.row, paddingVertical: 14, paddingHorizontal: 16, gap: 6 }}>
      <Txt variant="eyebrow" color="muted">
        {t('learn.sutraLines')}
      </Txt>
      {lines.length ? (
        lines.map((l, i) => (
          <Txt key={i} variant="small" selectable>
            {l}
          </Txt>
        ))
      ) : (
        <Txt variant="small" color="faint" style={{ fontStyle: 'italic' }}>
          {t('learn.sutraPending')}
        </Txt>
      )}
    </View>
  );
}
