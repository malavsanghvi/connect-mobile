import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FullScreen } from '@/components/full-screen';
import { Button, Card, Txt } from '@/components/ui';
import { type StringKey } from '@/i18n';
import { isContactChannel } from '@/lib/api/family';
import { readBiometricOptIn } from '@/lib/biometrics';
import { firstName, joinNames } from '@/lib/format';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, space } from '@/theme';

/** Onboarding step 6 (Onboarding.dc.html s6): centred ✓, summary card, "Go to home" ends onboarding. */
export default function DoneScreen() {
  const t = useT();
  const { member, setOnboarding } = useApp();
  const params = useLocalSearchParams<{ skipped?: string; channels?: string; paper?: string }>();
  const [bio, setBio] = useState(false);

  useEffect(() => {
    let alive = true;
    readBiometricOptIn().then((v) => alive && setBio(v));
    return () => {
      alive = false;
    };
  }, []);

  const skipped = params.skipped === '1';
  const channels = (params.channels ?? '').split(',').filter(isContactChannel);
  const paperLine = params.paper === 'digital' ? t('done.paperDigital') : params.paper === 'mail' ? t('done.paperMail') : t('done.paperNone');
  const lines = [
    bio ? t('done.signedInBio') : t('done.signedIn'),
    t('done.family', { n: member?.members.length ?? 1 }),
    channels.length ? t('done.contactBy', { channels: joinNames(channels.map((c) => t(`profile.channel.${c}` as StringKey))) }) : t('done.contactNone'),
    paperLine,
  ];

  return (
    <FullScreen align="top">
      <View style={{ alignItems: 'center', gap: space.lg, paddingTop: 80 }}>
        <View style={{ width: 88, height: 88, borderRadius: 44, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
          <Txt variant="hero" color="green" style={{ fontFamily: fonts.bodyBold, fontSize: 44, lineHeight: 52 }}>
            ✓
          </Txt>
        </View>
        <Txt variant="display" center style={{ fontSize: 28, lineHeight: 34 }} accessibilityRole="header">
          {t('done.title', { name: member ? firstName(member.person) : '' })}
        </Txt>
        <Txt variant="body" color="ink2" center>
          {skipped ? t('done.skippedLine') : t('done.thanksLine')}
        </Txt>
        <Card style={{ alignSelf: 'stretch', gap: 6 }}>
          {lines.map((l) => (
            <Txt key={l} variant="small">
              {`✓ ${l}`}
            </Txt>
          ))}
        </Card>
        <Button label={t('done.goHome')} onPress={() => setOnboarding(false)} style={{ alignSelf: 'stretch' }} />
      </View>
    </FullScreen>
  );
}
