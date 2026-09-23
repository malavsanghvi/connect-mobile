import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { logError } from './errors';

/**
 * Auth session storage for supabase-js.
 *
 * Native: expo-secure-store (Keychain / Keystore). Some iOS releases reject
 * values above ~2 KB and Supabase sessions are larger, so values are split
 * into chunks under `<key>.<i>` with the count under `<key>.n`.
 * Web: AsyncStorage (localStorage). Guarded for non-browser rendering.
 */

const CHUNK_SIZE = 1800;

function safeKey(key: string): string {
  // SecureStore keys may only contain alphanumerics, ".", "-" and "_".
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function secureGet(key: string): Promise<string | null> {
  const k = safeKey(key);
  try {
    const countRaw = await SecureStore.getItemAsync(`${k}.n`);
    if (countRaw == null) return await SecureStore.getItemAsync(k);
    const count = Number.parseInt(countRaw, 10);
    let value = '';
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`);
      if (part == null) {
        logError('session storage', new Error(`missing chunk ${i} of ${count} for ${k}; treating session as signed out`));
        return null;
      }
      value += part;
    }
    return value;
  } catch (err) {
    logError('session storage read', err);
    throw err;
  }
}

async function secureRemove(key: string): Promise<void> {
  const k = safeKey(key);
  try {
    const countRaw = await SecureStore.getItemAsync(`${k}.n`);
    const count = countRaw == null ? 0 : Number.parseInt(countRaw, 10);
    for (let i = 0; i < count; i += 1) await SecureStore.deleteItemAsync(`${k}.${i}`);
    await SecureStore.deleteItemAsync(`${k}.n`);
    await SecureStore.deleteItemAsync(k);
  } catch (err) {
    logError('session storage remove', err);
    throw err;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  const k = safeKey(key);
  try {
    await secureRemove(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${k}.n`, String(count));
  } catch (err) {
    logError('session storage write', err);
    throw err;
  }
}

const hasWindow = () => typeof window !== 'undefined';

export const sessionStorageAdapter =
  Platform.OS === 'web'
    ? {
        getItem: (key: string) => (hasWindow() ? AsyncStorage.getItem(key) : Promise.resolve(null)),
        setItem: (key: string, value: string) => (hasWindow() ? AsyncStorage.setItem(key, value) : Promise.resolve()),
        removeItem: (key: string) => (hasWindow() ? AsyncStorage.removeItem(key) : Promise.resolve()),
      }
    : { getItem: secureGet, setItem: secureSet, removeItem: secureRemove };

/**
 * Small per-device preferences (text size, Face ID opt-in, reminders set on
 * this device). Failures are logged and the documented default is returned.
 */
export async function readPref<T>(key: string, fallback: T): Promise<T> {
  if (Platform.OS === 'web' && !hasWindow()) return fallback;
  try {
    const raw = await AsyncStorage.getItem(`connect.${key}`);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch (err) {
    logError(`reading device preference "${key}" — using default ${JSON.stringify(fallback)}`, err);
    return fallback;
  }
}

export async function writePref<T>(key: string, value: T): Promise<void> {
  if (Platform.OS === 'web' && !hasWindow()) return;
  await AsyncStorage.setItem(`connect.${key}`, JSON.stringify(value));
}
