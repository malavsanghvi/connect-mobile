import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { AppError } from '@/lib/errors';
import type { LoadState } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

import { Icon, type IconName } from './icon';
import { StrokeIcon } from './stroke-icon';
import { Banner, Button, Card, Txt, VStack } from './ui';

export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: 'center', gap: space.md }} accessibilityLiveRegion="polite">
      <ActivityIndicator color={colors.navy} size="large" />
      <Txt variant="small" color="muted">
        {label ?? t('common.loading')}
      </Txt>
    </View>
  );
}

export function ErrorState({ error, onRetry }: { error: AppError | string; onRetry?: () => void }) {
  const t = useT();
  const message = typeof error === 'string' ? error : error.userMessage;
  return (
    <Banner tone="error" title={t('common.errorTitle')} message={message} action={onRetry ? { label: t('common.retry'), onPress: onRetry } : undefined} />
  );
}

export function EmptyState({ icon = 'leaf-outline', title, body, action }: { icon?: IconName; title: string; body?: string; action?: { label: string; onPress: () => void } }) {
  return (
    <Card tone="dashed" style={{ alignItems: 'center', paddingVertical: space.xl }}>
      <Icon name={icon} size={28} color={colors.faint} />
      <Txt variant="bodyStrong" color="ink2" center>
        {title}
      </Txt>
      {body ? (
        <Txt variant="small" color="muted" center>
          {body}
        </Txt>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} tone="secondary" size="md" fill={false} /> : null}
    </Card>
  );
}

/** Children see this instead of money, RSVP, bolis and pledges (adults only). Prototype Main ~L983. */
export function LockedState({ onBack }: { onBack?: () => void }) {
  const t = useT();
  const router = useRouter();
  const back = onBack ?? (() => router.dismissTo('/'));
  return (
    <VStack gap={space.lg} style={{ alignItems: 'center', paddingTop: 60, paddingBottom: space.xl }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
        <StrokeIcon name="lock" size={34} color={colors.brown} />
      </View>
      <Txt variant="display" center accessibilityRole="header">
        {t('locked.title')}
      </Txt>
      <Txt variant="body" color="ink2" center>
        {t('locked.body')}
      </Txt>
      <Button label={t('locked.backHome')} tone="secondary" size="md" fill={false} style={{ alignSelf: 'center', paddingHorizontal: 28 }} onPress={back} />
    </VStack>
  );
}

/**
 * Render a useLoad() result: spinner first time, plain-English error with
 * retry, and the content (with a refresh-error banner if a reload failed).
 */
export function Loaded<T>({ state, children, loadingLabel }: { state: LoadState<T>; children: (data: T) => ReactNode; loadingLabel?: string }) {
  if (state.data === undefined) {
    if (state.error) return <ErrorState error={state.error} onRetry={() => void state.reload()} />;
    return <LoadingState label={loadingLabel} />;
  }
  return (
    <>
      {state.error ? <ErrorState error={state.error} onRetry={() => void state.reload()} /> : null}
      {children(state.data)}
    </>
  );
}
