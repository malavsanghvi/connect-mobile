import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LoadingState } from '@/components/states';
import { Button, Card, Txt } from '@/components/ui';
import { GyanHeaderChips } from '@/features/gyan-header';
import { useHomework } from '@/features/homework/use-homework';
import { HomeworkView } from '@/features/homework/view';
import { communityName } from '@/lib/learning';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';

/**
 * One homework (connect-crm 0587): `/gyan/homework/<assignment id>?person=<person id>`. Without `person` it is the
 * signed-in person's own; a household adult opens a child's with the child's id (from the Family tab, Home's "Needs
 * your OK" strip, a push). Route-gated like the other Gyan Path screens (module gyan_path, the Learn area).
 */
export default function HomeworkScreen() {
  const t = useT();
  const { assignmentId, person } = useLocalSearchParams<{ assignmentId: string; person?: string }>();
  const { center, member, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const load = useHomework();
  const personId = typeof person === 'string' && person ? person : (member?.person.id ?? '');
  if (!member) {
    return (
      <Screen title={t('hw.title')} tabBar={false}>
        <Card tone="panel">
          <Txt variant="small">{t('hw.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      </Screen>
    );
  }
  return (
    <Screen title={t('hw.title')} tabBar={false} headerRight={personId === member.person.id ? <GyanHeaderChips /> : undefined} onRefresh={async () => invalidate()}>
      <Loaded state={load.state}>
        {(answer) => {
          // No answer yet: the load before the access check answered gave nothing; the real one follows (Loaded says so when it failed).
          if (!answer) return load.state.error ? null : <LoadingState />;
          if (answer.kind === 'missing') return <EmptyState icon="school-outline" title={t('hw.notOffered', { center: communityName(center) })} body={t('hw.notOfferedBody')} />;
          const item = answer.homework.items.find((i) => i.assignment.id === assignmentId && i.personId === personId);
          if (!item) return <EmptyState icon="school-outline" title={t('hw.notFound')} body={t('hw.notFoundBody')} />;
          return <HomeworkView key={`${item.assignment.id}:${item.personId}`} item={item} people={answer.homework.people} />;
        }}
      </Loaded>
    </Screen>
  );
}
