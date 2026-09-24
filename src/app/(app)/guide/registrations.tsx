import { useRouter, type Href } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Txt, VStack } from '@/components/ui';
import { registrationStatus, type RegistrationStatus } from '@/features/guide';
import { GuideScreen } from '@/features/guide-ui';
import type { Translate } from '@/i18n';
import { loadRegistrations } from '@/lib/api/guide';
import { formatDay, todayAt } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

type Reg = { key: string; name: string; sub: string; status: RegistrationStatus; href: Href };

function badge(t: Translate, s: RegistrationStatus): { label: string; fg: string; bg: string } {
  if (s.kind === 'open') return { label: t('guide.regOpen'), fg: colors.green, bg: colors.greenTint };
  if (s.kind === 'opens') return { label: t('guide.regOpens', { date: formatDay(s.on) }), fg: colors.brown, bg: colors.brownTint };
  return { label: t('guide.regClosed'), fg: colors.muted, bg: colors.frame };
}

/**
 * Registrations (Welcome.dc.html secRegister): what is open to sign up for,
 * from real data — the next Pathshala term's window, events taking RSVPs, and
 * membership applications — each with an Open / Opens / Closed badge.
 */
export default function RegistrationsScreen() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const today = todayAt(center?.time_zone);
  const state = useLoad(() => (center ? loadRegistrations(center.id, today) : Promise.resolve(null)), [center?.id, today], 'load what is open for registration');

  return (
    <GuideScreen title={t('guide.regTitle')}>
      <Loaded state={state}>
        {(facts) => {
          if (!facts) return null;
          const now = new Date();
          const regs: Reg[] = [];
          if (facts.pathshala) {
            regs.push({
              key: 'pathshala',
              name: t('guide.regPathshala'),
              sub: [facts.pathshala.name, facts.pathshala.membership_required ? t('guide.regMembershipRequired') : null].filter(Boolean).join(' · '),
              status: registrationStatus(facts.pathshala.registration_opens_at, facts.pathshala.registration_closes_at, now),
              href: { pathname: '/jain-way', params: { tab: 'learn' } },
            });
          }
          regs.push({
            key: 'events',
            name: t('guide.regEvents'),
            sub: facts.openEvents.length ? facts.openEvents.slice(0, 3).map((e) => e.name).join(', ') : t('guide.regEventsNone'),
            status: facts.openEvents.length ? { kind: 'open' } : { kind: 'closed' },
            href: '/events',
          });
          if (facts.membershipOpen) {
            regs.push({ key: 'membership', name: t('guide.regMembership'), sub: t('guide.regMembershipSub'), status: { kind: 'open' }, href: '/guide/membership' });
          }
          if (regs.length === 0) return <Banner tone="info" message={t('guide.regNone')} />;
          return (
            <VStack gap={10}>
              {regs.map((r) => {
                const b = badge(t, r.status);
                return (
                  <Pressable
                    key={r.key}
                    onPress={() => router.push(r.href)}
                    accessibilityRole="link"
                    accessibilityLabel={`${r.name}. ${r.sub}. ${b.label}`}
                    style={({ pressed }) => ({ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.85 : 1 })}>
                    <View style={{ flex: 1 }}>
                      <Txt variant="bodyStrong">{r.name}</Txt>
                      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                        {r.sub}
                      </Txt>
                    </View>
                    <View style={{ backgroundColor: b.bg, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Txt variant="caption" style={{ color: b.fg, fontFamily: fonts.bodyBold }}>
                        {b.label}
                      </Txt>
                    </View>
                  </Pressable>
                );
              })}
            </VStack>
          );
        }}
      </Loaded>
    </GuideScreen>
  );
}
