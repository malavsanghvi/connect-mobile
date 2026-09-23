import type { ReactNode } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { AppError } from '@/lib/errors';
import { useT } from '@/providers/settings';
import { colors, layout, space } from '@/theme';

import { Banner, Button, Txt, VStack } from './ui';

export function FullScreen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.gutter }}>
        <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.lg }}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function FullScreenLoading({ label }: { label?: string }) {
  const t = useT();
  return (
    <FullScreen>
      <VStack style={{ alignItems: 'center' }}>
        <ActivityIndicator size="large" color={colors.navy} />
        <Txt variant="small" color="muted" center>
          {label ?? t('common.loading')}
        </Txt>
      </VStack>
    </FullScreen>
  );
}

export function FullScreenError({ error, onRetry, secondary }: { error: AppError; onRetry: () => void; secondary?: { label: string; onPress: () => void } }) {
  const t = useT();
  return (
    <FullScreen>
      <Txt variant="title" color="navy" accessibilityRole="header">
        {t('common.errorTitle')}
      </Txt>
      <Banner tone="error" message={error.userMessage} />
      <Button label={t('common.retry')} onPress={onRetry} />
      {secondary ? <Button label={secondary.label} tone="secondary" onPress={secondary.onPress} /> : null}
    </FullScreen>
  );
}
