import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LoadingState } from '@/components/states';
import { Button, Card, Txt, VStack } from '@/components/ui';
import { GyanHeaderChips } from '@/features/gyan-header';
import { HomeworkCard } from '@/features/homework/cards';
import { useHomework } from '@/features/homework/use-homework';
import { todayAt } from '@/lib/format';
import { firstNameOf, itemsForPerson, viewerFor } from '@/lib/homework';
import { communityName } from '@/lib/learning';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Every homework of one person (`?person=`; the signed-in person without it), what needs attention first: the
 * Family tab's "Homework: …" line and a push without a payload land here. Route-gated like the other Gyan Path
 * screens.
 */
export default function HomeworkListScreen() {
  const t = useT();
  const { person } = useLocalSearchParams<{ person?: string }>();
  const { center, member, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const load = useHomework();
  const personId = typeof person === 'string' && person ? person : (member?.person.id ?? '');
  if (!member || !center) {
    return (
      <Screen title={t('hw.title')} tabBar={false} niva={false}>
        <Card tone="panel">
          <Txt variant="small">{t('hw.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      </Screen>
    );
  }
  const mine = personId === member.person.id;
  const family = member.members.find((m) => m.person.id === personId)?.person;
  const today = todayAt(center.time_zone);
  return (
    <Screen title={t('hw.title')} tabBar={false} niva={false} headerRight={mine ? <GyanHeaderChips /> : undefined} onRefresh={async () => invalidate()}>
      <Loaded state={load.state}>
        {(answer) => {
          // No answer yet: the load before the access check answered gave nothing; the real one follows (Loaded says so when it failed).
          if (!answer) return load.state.error ? null : <LoadingState />;
          if (answer.kind === 'missing') return <EmptyState icon="school-outline" title={t('hw.notOffered', { center: communityName(center) })} body={t('hw.notOfferedBody')} />;
          // Who may do what comes from the answer's people (every household the reader is in); an unknown or stale ?person= is not found, never "has no homework yet".
          const viewer = viewerFor(personId, { personId: member.person.id, isAdult: member.isAdult }, answer.homework.people);
          if (viewer === 'none') return <EmptyState icon="school-outline" title={t('hw.notFound')} body={t('hw.notFoundBody')} />;
          const name = family ? family.preferred_name || family.first_name : firstNameOf(answer.homework.people.find((p) => p.personId === personId)?.name ?? '');
          const items = itemsForPerson(answer.homework.items, personId);
          if (items.length === 0) return <EmptyState icon="school-outline" title={mine ? t('hw.none') : t('hw.noneFor', { name })} body={mine ? t('hw.noneBody') : undefined} />;
          return (
            <VStack gap={space.md}>
              {!mine ? (
                <Txt variant="eyebrow" color="muted" accessibilityRole="header">
                  {t('hw.titleFor', { name })}
                </Txt>
              ) : null}
              {items.map((item) => (
                <HomeworkCard key={`${item.assignment.id}:${item.personId}`} item={item} today={today} viewer={viewer} />
              ))}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
