import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { FullScreen } from '@/components/full-screen';
import { Icon } from '@/components/icon';
import { Button, Card, Row, Txt } from '@/components/ui';
import { readBiometricOptIn } from '@/lib/biometrics';
import { firstName, joinNames } from '@/lib/format';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

const CHANNEL_KEYS = { sms: 'prefs.sms', whatsapp: 'prefs.whatsapp', email: 'prefs.email' } as const;

/** Onboarding step 6: done. "Go to home" ends onboarding. */
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
  const channels = (params.channels ?? '').split(',').filter((c): c is keyof typeof CHANNEL_KEYS => c in CHANNEL_KEYS);
  const paperLine = params.paper === 'digital' ? t('done.paperDigital') : params.paper === 'mail' ? t('done.paperMail') : t('done.paperNone');
  const lines = [
    bio ? t('done.signedInBio') : t('done.signedIn'),
    t('done.family', { n: member?.members.length ?? 1 }),
    channels.length ? t('done.contactBy', { channels: joinNames(channels.map((c) => t(CHANNEL_KEYS[c]))) }) : t('done.contactNone'),
    paperLine,
  ];

  return (
    <FullScreen>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.greenTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="checkmark" size={40} color={colors.green} />
      </View>
      <Txt variant="display" color="navy" accessibilityRole="header">
        {t('done.title', { name: member ? firstName(member.person) : '' })}
      </Txt>
      <Txt variant="body" color="ink2">
        {skipped ? t('done.skippedLine') : t('done.thanksLine')}
      </Txt>
      <Card>
        {lines.map((l) => (
          <Row key={l} gap={space.sm} align="flex-start" style={{ paddingVertical: 4 }}>
            <Icon name="checkmark-circle" size={20} color={colors.green} />
            <Txt variant="small" style={{ flex: 1 }}>
              {l}
            </Txt>
          </Row>
        ))}
      </Card>
      <Button label={t('done.goHome')} onPress={() => setOnboarding(false)} />
    </FullScreen>
  );
}
