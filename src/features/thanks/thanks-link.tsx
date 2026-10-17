import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { Txt } from '@/components/ui';
import { loadThanksPrefs } from '@/lib/api/care-prefs';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { touch } from '@/theme';

/**
 * Family › "How would you like to be thanked?" appears only when the organization asks (the database says so: it is off until the organization turns
 * it on, and it is for adults). While that is not known, or when it could not be read (the problem is logged), the Family tab simply has no link; the
 * screen itself says what went wrong if it is reached.
 */
export function ThanksLink() {
  const t = useT();
  const router = useRouter();
  const { center } = useApp();
  const state = useLoad(() => (center ? loadThanksPrefs(center.id) : Promise.resolve(null)), [center?.id], 'check whether your organization asks how you would like to be thanked');
  if (!state.data || !state.data.available) return null;
  return (
    <Pressable onPress={() => router.push('/thanks')} accessibilityRole="link" style={{ paddingVertical: 4, alignItems: 'center', minHeight: touch.min, justifyContent: 'center' }}>
      <Txt variant="meta" color="navy">
        {t('family.thanks')}
      </Txt>
    </Pressable>
  );
}
