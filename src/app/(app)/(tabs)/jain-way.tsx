import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button, Card, Segmented, Txt } from '@/components/ui';
import { LearnPane, LibraryPane, SaathiPane, TodayPane } from '@/features/jain-way';
import { loadSaathiFeed } from '@/lib/api/jainway';
import { saathiNeedsAttention } from '@/lib/learning';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';

type Pane = 'today' | 'learn' | 'saathi' | 'library';
const PANES: Pane[] = ['today', 'learn', 'saathi', 'library'];

/**
 * My Jain Way (prototype Main L566–720): Today · Learn · Saathi · Library in a
 * sticky 4-column bar, with a red dot on Saathi while a family milestone is
 * waiting for anumodana or someone needs support. Open to children too.
 */
export default function JainWayScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { member, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const pane: Pane = PANES.includes(params.tab as Pane) ? (params.tab as Pane) : member ? 'today' : 'library';
  const householdId = member?.household?.id ?? null;
  // Only drives the dot; the Saathi pane shows its own errors for the same load.
  const feed = useLoad(() => (householdId ? loadSaathiFeed(householdId) : Promise.resolve([])), [householdId], 'load your family circle');
  const dot = !!feed.data && saathiNeedsAttention(feed.data, !!member?.isAdult);

  const tabs = member ? (
    <Segmented
      label={t('jw.title')}
      value={pane}
      onChange={(v) => router.setParams({ tab: v })}
      options={[
        { value: 'today', label: t('jw.today') },
        { value: 'learn', label: t('jw.learn') },
        { value: 'saathi', label: t('jw.saathi'), badge: dot },
        { value: 'library', label: t('jw.library') },
      ]}
    />
  ) : undefined;

  return (
    <Screen title={t('jw.title')} root onRefresh={async () => invalidate()} sticky={tabs}>
      {member ? null : (
        <Card tone="panel">
          <Txt variant="small">{t('jw.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      )}
      {member && pane === 'today' ? <TodayPane /> : null}
      {member && pane === 'learn' ? <LearnPane /> : null}
      {member && pane === 'saathi' ? <SaathiPane /> : null}
      {pane === 'library' ? <LibraryPane /> : null}
    </Screen>
  );
}
