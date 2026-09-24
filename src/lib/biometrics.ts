import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

import { logError } from './errors';
import { readPref, writePref } from './storage';

export type BiometricSupport = { available: boolean; label: string; reason: string | null };

/** What the device offers, with a plain-English reason when it can't be used. */
export async function biometricSupport(): Promise<BiometricSupport> {
  if (Platform.OS === 'web') return { available: false, label: 'Face ID', reason: 'Biometric sign-in is only available in the mobile app.' };
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? Platform.OS === 'ios'
        ? 'Face ID'
        : 'face unlock'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? Platform.OS === 'ios'
          ? 'Touch ID'
          : 'fingerprint'
        : 'device unlock';
    if (!hasHardware) return { available: false, label, reason: 'This device has no Face ID or fingerprint sensor.' };
    if (!enrolled) return { available: false, label, reason: `Set up ${label} in your phone's settings first.` };
    return { available: true, label, reason: null };
  } catch (err) {
    logError('checking biometric support (treating as unavailable)', err);
    return { available: false, label: 'Face ID', reason: "We couldn't check this device's biometric support." };
  }
}

export async function authenticate(label: string): Promise<{ ok: boolean; message: string | null }> {
  try {
    const res = await LocalAuthentication.authenticateAsync({ promptMessage: `Unlock Community Connect with ${label}`, cancelLabel: 'Cancel' });
    if (res.success) return { ok: true, message: null };
    if (res.error === 'user_cancel' || res.error === 'system_cancel' || res.error === 'app_cancel') return { ok: false, message: 'Unlock was cancelled. Try again when you are ready.' };
    if (res.error === 'lockout') return { ok: false, message: `${label} is locked after too many attempts. Unlock your phone with its passcode, then try again.` };
    return { ok: false, message: `${label} didn't recognise you. Please try again.` };
  } catch (err) {
    logError('biometric unlock', err);
    return { ok: false, message: `We couldn't start ${label}. Please try again.` };
  }
}

export const readBiometricOptIn = () => readPref<boolean>('biometricOptIn', false);
export const writeBiometricOptIn = (on: boolean) => writePref('biometricOptIn', on);
