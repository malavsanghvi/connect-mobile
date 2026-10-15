import { AppError } from './errors';

/**
 * Why a phone could not get a push token, in plain words. Expo and Android report these as technical strings
 * ("Default FirebaseApp is not initialized…"); the member sees one sentence that says what to do, the detail is logged.
 * Pure (no native module), so every case is unit-tested.
 */
export function explainPushTokenError(err: unknown): AppError {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const text = detail.toLowerCase();
  if (/firebase|fcm|google-services|sender id|senderid/.test(text)) {
    return new AppError(
      'This copy of the app was installed without notification support. Install the latest Weaver app to receive notifications.',
      detail,
      'push_not_built',
    );
  }
  if (/play services|service_not_available|google_play|gms/.test(text)) {
    return new AppError(
      'This phone needs Google Play services to receive notifications. Update Google Play services in the Play Store, then try again.',
      detail,
      'push_play_services',
    );
  }
  if (/network|timeout|timed out|offline|unable to resolve|econn|fetch failed|failed to fetch/.test(text)) {
    return new AppError("We couldn't reach the notification service. Check your connection and try again.", detail, 'push_network');
  }
  return new AppError('Something went wrong while trying to register this phone for notifications. Please try again.', detail, 'push_token');
}
