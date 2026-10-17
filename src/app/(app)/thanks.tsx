import { useRouter } from 'expo-router';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Txt, VStack } from '@/components/ui';
import { ThanksForm } from '@/features/thanks/thanks-form';
import { loadThanksPrefs } from '@/lib/api/care-prefs';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Family › How would you like to be thanked? An adult of the household tells the organization how their household would like to be thanked, recognised and
 * reached. It is the member's own choice and nothing else: they never see what the organization keeps. The database says whether the question is asked at
 * all (the organization turns it on; adults only).
 */
export default function ThanksScreen() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const { invalidate } = useDataVersion();
  const { toast } = useFeedback();
  const state = useLoad(() => (center ? loadThanksPrefs(center.id) : Promise.resolve(null)), [center?.id], 'load how you would like to be thanked');
  if (!member || !center) return null;
  return (
    <Screen title={t('thanks.title')}>
      {!member.isAdult ? (
        <Banner tone="info" message={t('thanks.adultsOnly')} />
      ) : (
        <Loaded state={state}>
          {(data) =>
            data === null || !data.available ? (
              <EmptyState title={t('thanks.notAsked', { center: center.short_name || center.name })} />
            ) : (
              <VStack gap={space.lg}>
                <Txt variant="small" color="muted">
                  {t('thanks.intro', { center: center.short_name || center.name })}
                </Txt>
                <ThanksForm
                  centerId={center.id}
                  initial={data}
                  onSaved={() => {
                    invalidate();
                    toast(t('thanks.saved'));
                    router.back();
                  }}
                />
              </VStack>
            )
          }
        </Loaded>
      )}
    </Screen>
  );
}
