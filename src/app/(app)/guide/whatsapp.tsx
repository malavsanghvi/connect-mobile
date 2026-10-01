import { useRouter } from 'expo-router';

import { EmptyState, Loaded } from '@/components/states';
import { Banner } from '@/components/ui';
import { GuideFootnote, GuideIntro, GuideScreen, SignInFirst, useCommunity } from '@/features/guide-ui';
import { useWhatsAppGroups, WhatsAppGroupList, WhatsAppPhoneLine } from '@/features/whatsapp-groups';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

/**
 * WhatsApp groups (Welcome.dc.html secWhatsapp): request to join →
 * whatsapp_join_requests (an admin adds the number). Zone groups collapse
 * into one "Your zone group" row; without a zone it sends the member to
 * Your zone first. The same list is also an onboarding step.
 */
export default function WhatsAppScreen() {
  const t = useT();
  const community = useCommunity();
  const router = useRouter();
  const { member } = useApp();
  const { state, busy, error, request, phone, zoneId } = useWhatsAppGroups();

  return (
    <GuideScreen title={t('guide.waTitle')}>
      <GuideIntro>{t('guide.waIntro', { center: community })}</GuideIntro>
      {!member ? (
        <SignInFirst />
      ) : (
        <>
          <WhatsAppPhoneLine phone={phone} onChange={() => router.push({ pathname: '/person/[id]', params: { id: member.person.id } })} />
          {error ? <Banner tone="error" message={error} /> : null}
          <Loaded state={state}>
            {(groups) =>
              groups.length === 0 ? (
                <EmptyState icon="logo-whatsapp" title={t('guide.waNone')} />
              ) : (
                <WhatsAppGroupList groups={groups} zoneId={zoneId} phone={phone} busy={busy} onRequest={request} onFindZone={() => router.push('/guide/zones')} />
              )
            }
          </Loaded>
          <GuideFootnote>{t('guide.waRules', { center: community })}</GuideFootnote>
        </>
      )}
    </GuideScreen>
  );
}
