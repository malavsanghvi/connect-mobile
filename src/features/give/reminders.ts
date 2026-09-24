import { useEffect, useState } from 'react';

import type { Boli } from '@/lib/api/bolis';
import { logError, report } from '@/lib/errors';
import { cancelLocalReminder, scheduleLocalReminder } from '@/lib/push';
import { readPref, writePref } from '@/lib/storage';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';

type Reminders = Record<string, string>;

/**
 * "Remind me before it is called" for in-person bolis: a local notification
 * 15 minutes before opens_at, remembered on this phone (Bolis list and the
 * in-person boli screen share it).
 */
export function useBoliReminders() {
  const t = useT();
  const { toast } = useFeedback();
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    readPref<Reminders>('boliReminders', {})
      .then((r) => alive && setReminders(r))
      .catch((err: unknown) => {
        logError('reading boli reminders on this device', err);
        if (alive) setReminders({});
      });
    return () => {
      alive = false;
    };
  }, []);

  const isSet = (boliId: string) => !!reminders?.[boliId];

  const toggle = async (boli: Pick<Boli, 'id' | 'name' | 'opens_at'>) => {
    setError(null);
    try {
      const next = { ...(reminders ?? {}) };
      const existing = next[boli.id];
      if (existing) {
        await cancelLocalReminder(existing);
        delete next[boli.id];
      } else {
        const at = boli.opens_at ? new Date(new Date(boli.opens_at).getTime() - 15 * 60000) : null;
        const id = at ? await scheduleLocalReminder(t('bolis.reminderTitle'), t('bolis.reminderBody', { name: boli.name }), at) : null;
        if (!id) {
          setError(at ? t('bolis.reminderUnavailable') : t('bolis.reminderNoTime'));
          return;
        }
        next[boli.id] = id;
        toast(t('bolis.reminderSet'));
      }
      setReminders(next);
      await writePref('boliReminders', next).catch((err: unknown) => logError('saving boli reminders on this device', err));
    } catch (err) {
      setError(report(err, 'set a reminder').userMessage);
    }
  };

  return { isSet, toggle, error, ready: reminders !== null };
}
