import { useLocalSearchParams, useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { Button, Card, Segmented, Txt } from '@/components/ui';
import { LearnPane, LibraryPane, SaathiPane, TodayPane } from '@/features/jain-way';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';

type Pane = 'today' | 'learn' | 'saathi' | 'library';
const PANES: Pane[] = ['today', 'learn', 'saathi', 'library'];

/** My Jain Way (prototype §2.17): Today · Learn · Saathi · Library. Open to children too. */
export default function JainWayScreen() {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { member, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const pane: Pane = PANES.includes(params.tab as Pane) ? (params.tab as Pane) : member ? 'today' : 'library';

  return (
    <Screen title={t('jw.title')} root onRefresh={async () => invalidate()}>
      {member ? (
        <Segmented
          label={t('jw.title')}
          value={pane}
          onChange={(v) => router.setParams({ tab: v })}
          options={[
            { value: 'today', label: t('jw.today') },
            { value: 'learn', label: t('jw.learn') },
            { value: 'saathi', label: t('jw.saathi') },
            { value: 'library', label: t('jw.library') },
          ]}
        />
      ) : (
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
