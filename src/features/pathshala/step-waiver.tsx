import { View } from 'react-native';

import { Markdownish } from '@/components/markdown';
import { Loaded } from '@/components/states';
import { Banner, Card, Checkbox, Txt, VStack } from '@/components/ui';
import { splitSections } from '@/features/guide';
import { loadWaiver } from '@/lib/api/pathshala';
import type { RegWaiver } from '@/lib/pathshala-registration';
import { useLoad } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { StepHeader } from './shared';

/** Someone the registering adult agrees for: each child, and themself when they are joining (plan P14). */
export type AgreeRow = { key: string; label: string };

/**
 * Step 4, the community's published Pathshala waiver (plan P14): its text, then "I agree" for each child and for the
 * registering adult. Another adult learner (a spouse) agrees in their own app, and their seat waits until they do.
 */
export function WaiverStep({
  waiver,
  rows,
  others,
  agreed,
  eyebrow,
  onAgree,
}: {
  waiver: RegWaiver;
  rows: AgreeRow[];
  /** First names of the other adult learners, who agree in their own app. */
  others: string[];
  agreed: Record<string, boolean>;
  eyebrow: string;
  onAgree: (key: string, on: boolean) => void;
}) {
  const t = useT();
  const doc = useLoad(() => loadWaiver(waiver.documentId), [waiver.documentId], 'load the Pathshala waiver');
  return (
    <VStack gap={space.md}>
      <StepHeader eyebrow={eyebrow} title={waiver.title ?? t('reg.waiver.title')} />
      <Txt variant="small" color="ink2">
        {t('reg.waiver.intro')}
      </Txt>
      <Loaded state={doc}>
        {(d) =>
          d ? (
            <View style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: space.md, gap: space.sm, backgroundColor: colors.card }}>
              {d.version ? (
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                  {t('reg.waiver.version', { version: d.version })}
                </Txt>
              ) : null}
              {splitSections(d.body_md).map((sec, i) => (
                <View key={i} style={{ gap: 4 }}>
                  {sec.heading ? (
                    <Txt variant="bodyStrong" accessibilityRole="header">
                      {sec.heading}
                    </Txt>
                  ) : null}
                  {sec.body ? <Markdownish source={sec.body} /> : null}
                </View>
              ))}
            </View>
          ) : (
            <Banner tone="error" message={t('reg.waiver.missing')} action={{ label: t('common.retry'), onPress: () => void doc.reload() }} />
          )
        }
      </Loaded>
      <Card>
        {rows.map((r) => (
          <Checkbox key={r.key} label={r.label} checked={!!agreed[r.key]} onChange={(on) => onAgree(r.key, on)} disabled={!doc.data} />
        ))}
        {others.map((name) => (
          <Txt key={name} variant="meta" color="muted">
            {t('reg.waiver.otherAdult', { name })}
          </Txt>
        ))}
      </Card>
    </VStack>
  );
}
