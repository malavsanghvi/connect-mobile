import { featureMessage, type FeatureKey } from '@/lib/access';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

import { ErrorState, LoadingState } from './states';
import { Button, Card, Txt } from './ui';

/**
 * Says why an area can't be used here and what to do about it, in place of the area:
 * a visitor is asked to sign in ("Sign in to use Ask Niva", with a Sign in button), a member below the
 * organization's minimum level is told which level it takes ("Ask Niva is available to Member and above.
 * Ask the office about membership."), and an area whose module is switched off says so. While the answer is
 * loading it shows that, and when it could not be had it shows why, with Try again. It renders nothing
 * when the area is available, so a caller can put it where the area would be.
 *
 * A whole screen is gated by the route (`FeatureRouteGate` in module-off.tsx); this notice is for the
 * parts of a screen (a section of 3L, a card).
 */
export function FeatureNotice({ feature }: { feature: FeatureKey }) {
  const t = useT();
  const { center, setGuest } = useApp();
  const access = useFeature(feature);
  if (access.allowed) return null;
  if (access.loading) return <LoadingState label={t('access.loading')} />;
  if (access.error) return <ErrorState error={access.error} onRetry={() => void access.reload()} />;
  const message = featureMessage(t, feature, access.reason, access.minLevelLabel, center?.short_name || center?.name || '');
  return (
    <Card tone="panel">
      <Txt variant="bodyStrong">{message.title}</Txt>
      {message.body ? (
        <Txt variant="small" color="ink2">
          {message.body}
        </Txt>
      ) : null}
      {message.signIn ? <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" /> : null}
    </Card>
  );
}
