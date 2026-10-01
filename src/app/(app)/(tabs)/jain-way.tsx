import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button, Card, Segmented, Txt } from '@/components/ui';
import { SaathiPane, TodayPane } from '@/features/jain-way';
import { ThreeLPane } from '@/features/three-l/pane';
import { loadSaathiFeed } from '@/lib/api/jainway';
import { saathiNeedsAttention } from '@/lib/learning';
import { jainWayPanes, pickPane, resolveJainWayLink, type JainWayPane } from '@/lib/modules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useModules } from '@/providers/modules';
import { useT } from '@/providers/settings';

/**
 * My Jain Way (prototype Main L566–720): Today · 3L · Saathi in a sticky bar,
 * with a red dot on Saathi while a family milestone is waiting for anumodana
 * or someone needs support. Open to children too. 3L (Look, Listen, Learn)
 * replaced the Learn and Library segments; `?tab=learn` and `?tab=library`
 * still open its Learn and Look sections. Segments of switched-off modules
 * are left out (Today/Saathi: jain_way; 3L: content, gyan_path or pathshala).
 */
export default function JainWayScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; section?: string }>();
  const link = resolveJainWayLink(params.tab, params.section);
  const { member, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const { map } = useModules();
  const visible = jainWayPanes(map, !!member);
  const pane: JainWayPane | null = pickPane(link.tab, visible, member ? 'today' : 'three_l');
  const householdId = member?.household?.id ?? null;
  const saathiOn = visible.includes('saathi');
  // Only drives the dot; the Saathi pane shows its own errors for the same load.
  const feed = useLoad(() => (householdId && saathiOn ? loadSaathiFeed(householdId) : Promise.resolve([])), [householdId, saathiOn], 'load your family circle');
  const dot = !!feed.data && saathiNeedsAttention(feed.data, !!member?.isAdult);

  const labels: Record<JainWayPane, string> = { today: t('jw.today'), three_l: t('jw.threeL'), saathi: t('jw.saathi') };
  const spoken: Partial<Record<JainWayPane, string>> = { three_l: t('threeL.heading') };
  const tabs =
    member && visible.length > 1 && pane ? (
      <Segmented
        label={t('jw.title')}
        value={pane}
        onChange={(v) => router.setParams({ tab: v, section: link.section })}
        options={visible.map((v) => ({ value: v, label: labels[v], accessibilityLabel: spoken[v], badge: v === 'saathi' ? dot : undefined }))}
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
      {pane === 'three_l' ? <ThreeLPane section={link.section} onSection={(s) => router.setParams({ tab: 'three_l', section: s })} /> : null}
      {member && pane === 'saathi' ? <SaathiPane /> : null}
    </Screen>
  );
}
