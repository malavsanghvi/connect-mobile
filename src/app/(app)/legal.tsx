import { useLocalSearchParams } from 'expo-router';

import { Markdownish } from '@/components/markdown';
import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Txt } from '@/components/ui';
import { getLegalDocument } from '@/lib/api/settings';
import { formatLongDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/** Privacy policy / terms of use as published by the center (legal_documents). */
export default function LegalScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ kind?: string }>();
  const kind = params.kind === 'terms' ? 'terms' : 'privacy';
  const { center } = useApp();
  const state = useLoad(() => (center ? getLegalDocument(center.id, kind) : Promise.resolve(null)), [center?.id, kind], 'load this document');
  const title = kind === 'terms' ? t('settings.terms') : t('settings.privacyPolicy');
  return (
    <Screen title={title}>
      <Loaded state={state}>
        {(doc) =>
          doc ? (
            <>
              <Txt variant="title" color="navy" accessibilityRole="header">
                {doc.title}
              </Txt>
              <Txt variant="meta" color="muted">
                {t('legal.version', { version: doc.version, date: formatLongDate((doc.published_at ?? '').slice(0, 10)) })}
              </Txt>
              <Markdownish source={doc.body_md} />
            </>
          ) : (
            <EmptyState icon="document-text-outline" title={t('legal.notPublished', { title })} />
          )
        }
      </Loaded>
    </Screen>
  );
}
