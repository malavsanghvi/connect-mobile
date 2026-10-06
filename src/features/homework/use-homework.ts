import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';

import { loadHomework, type HomeworkAnswer } from '@/lib/api/homework';
import type { Homework } from '@/lib/homework';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';

/** What a screen knows about homework: the load, and the answer once it is in (null while loading, failed, or not offered). */
export type HomeworkLoad = { state: LoadState<HomeworkAnswer | null>; homework: Homework | null; /** The portal has homework (the entry points may show). */ offered: boolean };

/**
 * When a screen asks for its homework again:
 * - `writes` (the default): after every write anywhere in the app, like the rest of the app. The homework screens, and
 *   Home (which is frozen as a whole while another screen is on top of it).
 * - `in-front`: like Home, only while the screen is in front; writes made while it is covered are caught up once when it
 *   is back (the Family tab, the goal map: a write on a screen above them is one reload when the member returns, not
 *   one per write behind their back).
 * - `on-return`: once when the screen opens and again when it comes back to the front, never because of a write made
 *   while it is in front (the lesson: every step it saves is a write, and none of them changes the homework; the
 *   homework screen a card opens is the only thing that does, and it is on top of the lesson while that happens).
 */
export type HomeworkRefresh = 'writes' | 'in-front' | 'on-return';

/**
 * The homework of the signed-in person and their household (one call to `app.my_gyan_homework`), reloaded after
 * writes as `refresh` says. Nothing is asked for a visitor, with Gyan Path switched off, or while the person may not
 * use Learn; a portal without homework yet answers `missing`, and then no entry point shows.
 */
export function useHomework(enabled = true, refresh: HomeworkRefresh = 'writes'): HomeworkLoad {
  const { center, member } = useApp();
  const gyanOn = useModule('gyan_path');
  const learn = useFeature('learn');
  const focused = useIsFocused();
  const on = enabled && !!center && !!member && gyanOn && learn.allowed;
  const frozen = refresh === 'writes' ? undefined : refresh === 'in-front' ? !focused : true;
  const state = useLoad(() => (on && center ? loadHomework(center.id) : Promise.resolve(null)), [on, center?.id, member?.person.id], 'load your homework', { frozen });
  const reloadRef = useRef(state.reload);
  useEffect(() => {
    reloadRef.current = state.reload;
  });
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (refresh === 'on-return' && focused && !wasFocused.current) void reloadRef.current();
    wasFocused.current = focused;
  }, [focused, refresh]);
  const answer = state.data ?? null;
  return { state, homework: answer?.kind === 'answered' ? answer.homework : null, offered: answer?.kind === 'answered' };
}
