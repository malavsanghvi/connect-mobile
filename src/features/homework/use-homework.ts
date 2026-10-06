import { loadHomework, type HomeworkAnswer } from '@/lib/api/homework';
import type { Homework } from '@/lib/homework';
import { useLoad, type LoadState } from '@/lib/use-load';
import { useFeature } from '@/providers/access';
import { useApp } from '@/providers/app';
import { useModule } from '@/providers/modules';

/** What a screen knows about homework: the load, and the answer once it is in (null while loading, failed, or not offered). */
export type HomeworkLoad = { state: LoadState<HomeworkAnswer | null>; homework: Homework | null; /** The portal has homework (the entry points may show). */ offered: boolean };

/**
 * The homework of the signed-in person and their household (one call to `app.my_gyan_homework`), reloaded after
 * every write like the rest of the app. Nothing is asked for a visitor, with Gyan Path switched off, or while the
 * person may not use Learn; a portal without homework yet answers `missing`, and then no entry point shows.
 */
export function useHomework(enabled = true): HomeworkLoad {
  const { center, member } = useApp();
  const gyanOn = useModule('gyan_path');
  const learn = useFeature('learn');
  const on = enabled && !!center && !!member && gyanOn && learn.allowed;
  const state = useLoad(() => (on && center ? loadHomework(center.id) : Promise.resolve(null)), [on, center?.id, member?.person.id], 'load your homework');
  const answer = state.data ?? null;
  return { state, homework: answer?.kind === 'answered' ? answer.homework : null, offered: answer?.kind === 'answered' };
}
