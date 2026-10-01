import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { mediaUrl } from '@/lib/api/media';
import { claimAudioFocus, registerAudioOwner } from '@/lib/audio-focus';
import { AppError, logError, report } from '@/lib/errors';
import { nextPlayable, previousAction, previousPlayable, startIndex, type QueueItem } from '@/lib/player-queue';

import { useT } from './settings';

export type PlayerValue = {
  queue: QueueItem[];
  index: number;
  /** The track loaded now (playing, paused or loading), or null when the player is closed. */
  current: QueueItem | null;
  playing: boolean;
  /** Fetching the file or waiting for it to load. */
  loading: boolean;
  position: number;
  duration: number;
  /** The queue played to the end; the last track is rewound and paused. */
  ended: boolean;
  /** Plain-English failure for the current track; `retry` loads it again. */
  error: string | null;
  hasNext: boolean;
  hasPrevious: boolean;
  /**
   * Play `items` in order from `startId` (videos and items without audio are
   * kept but skipped). False when nothing in the list can be played here.
   */
  playQueue: (items: QueueItem[], startId?: string | null) => boolean;
  toggle: () => void;
  /** Pause (e.g. before a video opens in the browser). */
  pause: () => void;
  next: () => void;
  previous: () => void;
  retry: () => void;
  close: () => void;
};

const PlayerContext = createContext<PlayerValue | null>(null);

/**
 * The app-wide audio queue for 3L (stavans, podcasts, audio lessons, My
 * playlist), shown in the mini player above the tab bar
 * (src/components/mini-player.tsx). Built on expo-audio like the screen
 * players (src/features/audio.tsx): one player, one track at a time, the
 * next playable one starts when a track ends. Uploaded files are signed for
 * an hour just before they play (retry signs again). Background audio stays
 * off (app.json), so the sound pauses when the app leaves the screen.
 */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(-1);
  const [resolving, setResolving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  // The latest start request (a quicker "next" wins over a slower signed URL).
  const request = useRef(0);
  // One per play-through; the end of a play-through is handled once.
  const track = useRef(0);
  const finished = useRef(0);
  const focusId = useRef<number | null>(null);
  const modeSet = useRef(false);
  const onFinish = useRef<() => void>(() => {});

  const current = queue[index] ?? null;

  useEffect(() => {
    const owner = registerAudioOwner(() => player.pause());
    focusId.current = owner.id;
    return owner.unregister;
  }, [player]);

  useEffect(() => {
    if (status.error) logError(`playing ${current?.title ?? 'audio'}`, status.error);
  }, [status.error, current?.title]);

  const claimFocus = () => {
    if (focusId.current !== null) claimAudioFocus(focusId.current, (err) => logError('pausing the other player', err));
  };

  const start = async (items: QueueItem[], at: number) => {
    const item = items[at];
    if (!item) return;
    request.current += 1;
    const mine = request.current;
    setFailure(null);
    setEnded(false);
    setResolving(true);
    try {
      player.pause();
      const ref = item.path ? { path: item.path } : item.url ? { url: item.url } : null;
      if (!ref) throw new AppError(t('player.noAudio', { title: item.title }), `queue item ${item.id} (${item.kind}) has no audio`);
      const url = await mediaUrl(ref, `play ${item.title}`);
      if (mine !== request.current) return;
      if (!modeSet.current) {
        modeSet.current = true;
        setAudioModeAsync({ playsInSilentMode: true }).catch((err: unknown) => logError('setting the audio mode (continuing)', err));
      }
      claimFocus();
      track.current += 1;
      player.replace({ uri: url });
      player.play();
    } catch (err) {
      if (mine === request.current) setFailure(report(err, `play ${item.title}`).userMessage);
    } finally {
      if (mine === request.current) setResolving(false);
    }
  };

  // Read by the status listener, which outlives renders.
  useEffect(() => {
    onFinish.current = () => {
      const n = nextPlayable(queue, index);
      if (n >= 0) {
        setIndex(n);
        void start(queue, n);
        return;
      }
      setEnded(true);
      player.seekTo(0).catch((err: unknown) => logError('rewinding the last track', err));
    };
  });

  useEffect(() => {
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      if (!s.didJustFinish || finished.current === track.current) return;
      finished.current = track.current;
      onFinish.current();
    });
    return () => sub.remove();
  }, [player]);

  const playQueue = (items: QueueItem[], startId?: string | null): boolean => {
    const at = startIndex(items, startId);
    if (at < 0) return false;
    setQueue(items);
    setIndex(at);
    void start(items, at);
    return true;
  };

  const go = (at: number) => {
    if (at < 0) return;
    setIndex(at);
    void start(queue, at);
  };

  const toggle = () => {
    if (!current || resolving) return;
    if (failure || status.error) {
      void start(queue, index);
      return;
    }
    if (status.playing) {
      player.pause();
      return;
    }
    claimFocus();
    if (ended) {
      // A new play-through of the last track: its end counts again.
      setEnded(false);
      track.current += 1;
    }
    player.play();
  };

  const previous = () => {
    if (!current) return;
    if (failure || status.error) {
      go(previousPlayable(queue, index));
      return;
    }
    const action = previousAction(queue, index, status.currentTime);
    if (action.kind === 'go') {
      go(action.index);
      return;
    }
    player.seekTo(0).catch((err: unknown) => logError('restarting the track', err));
  };

  const close = () => {
    request.current += 1;
    player.pause();
    setQueue([]);
    setIndex(-1);
    setFailure(null);
    setEnded(false);
    setResolving(false);
  };

  const playbackError = current && status.error && !resolving ? t('player.failed', { title: current.title }) : null;
  const value: PlayerValue = {
    queue,
    index,
    current,
    playing: !!current && !resolving && status.playing,
    loading: !!current && (resolving || (!failure && !ended && !status.error && !status.isLoaded)),
    position: current && !resolving ? status.currentTime : 0,
    duration: current && !resolving ? status.duration : 0,
    ended,
    error: failure ?? playbackError,
    hasNext: nextPlayable(queue, index) >= 0,
    hasPrevious: previousPlayable(queue, index) >= 0,
    playQueue,
    toggle,
    pause: () => {
      if (current) player.pause();
    },
    next: () => go(nextPlayable(queue, index)),
    previous,
    retry: () => void start(queue, index),
    close,
  };

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

/** The app-wide player, or null outside the signed-in app (the mini player then shows nothing). */
export function usePlayerOptional(): PlayerValue | null {
  return useContext(PlayerContext);
}

export function usePlayer(): PlayerValue {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error('usePlayer must be used inside PlayerProvider');
  return ctx;
}
