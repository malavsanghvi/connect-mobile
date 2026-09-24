import { useLocalSearchParams } from 'expo-router';

import { Markdownish } from '@/components/markdown';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Card, Txt } from '@/components/ui';
import { splitSections } from '@/features/guide';
import { getLegalDocument } from '@/lib/api/settings';
import { formatLongDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { fonts } from '@/theme';

/** Privacy policy / terms of use as published by the center (legal_documents), one card per section (Main.dc.html isLegal). */
export default function LegalScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === 'terms' ? 'terms' : 'privacy';
  const { center } = useApp();
  const state = useLoad(() => (center ? getLegalDocument(center.id, kind) : Promise.resolve(null)), [center?.id, kind], 'load this document');
  const title = kind === 'terms' ? t('settings.terms') : t('settings.privacyPolicy');
  return (
    <Screen title={title} niva={false}>
      <Loaded state={state}>
        {(doc) =>
          doc ? (
            <>
              <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                {t('legal.version', { version: doc.version, date: formatLongDate((doc.published_at ?? '').slice(0, 10)) })}
              </Txt>
              {splitSections(doc.body_md).map((sec, i) => (
                <Card key={i} style={{ borderRadius: 16, gap: 6 }}>
                  {sec.heading ? (
                    <Txt variant="bodyStrong" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="header">
                      {sec.heading}
                    </Txt>
                  ) : null}
                  {sec.body ? <Markdownish source={sec.body} /> : null}
                </Card>
              ))}
            </>
          ) : (
            <EmptyState icon="document-text-outline" title={t('legal.notPublished', { title })} />
          )
        }
      </Loaded>
    </Screen>
  );
}
