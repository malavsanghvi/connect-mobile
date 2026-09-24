import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { check } from './errors';
import { supabase } from './supabase';

export type PushStatus =
  | { state: 'registered'; token: string }
  | { state: 'unsupported'; reason: string }
  | { state: 'denied'; reason: string };

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

/**
 * Ask for permission, get an Expo push token and store it in app.push_devices
 * (RLS: a login manages only its own devices). Never throws for expected
 * "can't do push here" cases — those come back as a status with a reason.
 */
export async function registerPushDevice(userId: string, centerId: string, opts: { prompt: boolean }): Promise<PushStatus> {
  if (Platform.OS === 'web') return { state: 'unsupported', reason: 'Push notifications are only available in the mobile app.' };
  if (!Device.isDevice) return { state: 'unsupported', reason: 'Push notifications need a real phone; simulators cannot receive them.' };
  if (Constants.appOwnership === 'expo' && Platform.OS === 'android') {
    return { state: 'unsupported', reason: 'Push notifications need the Community Connect app build; Expo Go on Android cannot receive them.' };
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return { state: 'unsupported', reason: 'This build is not linked to an EAS project yet, so it cannot receive push notifications.' };

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Community Connect', importance: Notifications.AndroidImportance.DEFAULT });
  }
  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted' && opts.prompt) status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return { state: 'denied', reason: "Notifications are turned off for Community Connect in your phone's settings." };

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  check(
    await supabase
      .from('push_devices')
      .upsert({ user_id: userId, center_id: centerId, platform: Platform.OS === 'ios' ? 'ios' : 'android', token, last_seen_at: new Date().toISOString() }, { onConflict: 'token' }),
    'register this phone for notifications',
  );
  return { state: 'registered', token };
}

/** Master switch off: forget this device's token so nothing is sent to it. */
export async function unregisterPushDevice(token: string): Promise<void> {
  check(await supabase.from('push_devices').delete().eq('token', token), 'turn off notifications on this phone');
}

/** Local reminder (e.g. in-person boli, pachchakhan). Returns false when not possible here. */
export async function scheduleLocalReminder(title: string, body: string, at: Date): Promise<string | null> {
  if (Platform.OS === 'web' || at.getTime() <= Date.now()) return null;
  const perm = await Notifications.getPermissionsAsync();
  let status = perm.status;
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return null;
  return Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
  });
}

export async function cancelLocalReminder(id: string): Promise<void> {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(id);
}
