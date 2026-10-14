import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Card, Txt, VStack } from '@/components/ui';
import { loadClassAnnouncements } from '@/lib/api/gyan';
import { audienceLabel } from '@/lib/class-announcements';
import { formatDateTime } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

/**
 * Class announcements: what a Pathshala principal or a class teacher published in the portal for the families of a
 * class, or for the whole term, newest first. Which ones a household sees is the database's rule (RLS: published
 * announcements of the classes and terms the household has an enrollment in). Plain text with its line breaks kept; the
 * time is the community's own. No author is shown: the app shows no staff names.
 */
export default function PathshalaAnnouncementsScreen() {
  const t = useT();
  const { center, member } = useApp();
  const centerId = center?.id ?? null;
  const personId = member?.person.id ?? null;
  const state = useLoad(() => (centerId && personId ? loadClassAnnouncements(centerId) : Promise.resolve(null)), [centerId, personId], 'load class announcements');

  if (!centerId || !personId) {
    return (
      <Screen title={t('announce.title')} tabBar={false}>
        <EmptyState icon="megaphone-outline" title={t('announce.needMember')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('announce.title')} tabBar={false} onRefresh={() => state.reload()}>
      <Loaded state={state}>
        {(items) => {
          if (!items) return null;
          if (items.length === 0) return <EmptyState icon="megaphone-outline" title={t('announce.none')} body={t('announce.noneBody')} />;
          return (
            <VStack gap={space.md}>
              {items.map((a) => (
                <Card key={a.id}>
                  <Txt variant="smallStrong" color="brownDark" style={{ fontFamily: fonts.bodySemi }}>
                    {audienceLabel(a.audience, t)}
                  </Txt>
                  <Txt variant="cardTitle" accessibilityRole="header">
                    {a.title}
                  </Txt>
                  {a.body ? <Txt variant="body">{a.body}</Txt> : null}
                  <Txt variant="meta" color="muted">
                    {t('announce.posted', { when: formatDateTime(a.publishedAt, center?.time_zone) })}
                  </Txt>
                </Card>
              ))}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
