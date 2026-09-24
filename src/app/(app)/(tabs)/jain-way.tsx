import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button, Card, Segmented, Txt } from '@/components/ui';
import { LearnPane, LibraryPane, SaathiPane, TodayPane } from '@/features/jain-way';
import { loadSaathiFeed } from '@/lib/api/jainway';
import { saathiNeedsAttention } from '@/lib/learning';
import { jainWayPanes, pickPane, type JainWayPane } from '@/lib/modules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';

/**
 * My Jain Way (prototype Main L566–720): Today · Learn · Saathi · Library in a
 * sticky 4-column bar, with a red dot on Saathi while a family milestone is
 * waiting for anumodana or someone needs support. Open to children too.
 * Segments of switched-off modules are left out (Today/Saathi: jain_way,
 * Learn: gyan_path or pathshala, Library: content).
 */
export default function JainWayScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { member, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const visible = jainWayPanes(map, !!member);
  const pane: JainWayPane | null = pickPane(params.tab, visible, member ? 'today' : 'library');
  const householdId = member?.household?.id ?? null;
  const saathiOn = visible.includes('saathi');
  // Only drives the dot; the Saathi pane shows its own errors for the same load.
  const feed = useLoad(() => (householdId && saathiOn ? loadSaathiFeed(householdId) : Promise.resolve([])), [householdId, saathiOn], 'load your family circle');
  const dot = !!feed.data && saathiNeedsAttention(feed.data, !!member?.isAdult);

  const labels: Record<JainWayPane, string> = { today: t('jw.today'), learn: t('jw.learn'), saathi: t('jw.saathi'), library: t('jw.library') };
  const tabs =
    member && visible.length > 1 && pane ? (
      <Segmented label={t('jw.title')} value={pane} onChange={(v) => router.setParams({ tab: v })} options={visible.map((v) => ({ value: v, label: labels[v], badge: v === 'saathi' ? dot : undefined }))} />
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
