import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { logError } from '@/lib/errors';

/** "0:42" from seconds. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export type InAppAudio = {
  /** Id of the item currently loaded (playing or paused), or null. */
  current: string | null;
  playing: boolean;
  loading: boolean;
  position: number;
  error: string | null;
  /** Play `url` under `id`; pressing the same id again pauses/resumes. */
  toggle: (id: string, url: string) => void;
  stop: () => void;
};

/**
 * One in-app audio player for a screen (recitations, audio lessons) via
 * expo-audio — no browser hand-off. Errors come back as `error` for the
 * screen to show in plain English; the detail is logged.
 */
export function useInAppAudio(failMessage: string): InAppAudio {
  const player = useAudioPlayer(null, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [current, setCurrent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modeSet = useRef(false);

  useEffect(() => {
    if (status.error) logError(`playing audio ${current ?? ''}`, status.error);
  }, [status.error, current]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.seekTo(0).catch((err: unknown) => logError('rewinding audio', err));
    }
  }, [status.didJustFinish, player]);

  const toggle = (id: string, url: string) => {
    setError(null);
    try {
      if (!modeSet.current) {
        modeSet.current = true;
        setAudioModeAsync({ playsInSilentMode: true }).catch((err: unknown) => logError('setting the audio mode (continuing)', err));
      }
      if (current === id) {
        if (status.playing) player.pause();
        else player.play();
        return;
      }
      player.replace({ uri: url });
      setCurrent(id);
      player.play();
    } catch (err) {
      logError(`playing audio ${url}`, err);
      setError(failMessage);
    }
  };

  const stop = () => {
    try {
      player.pause();
    } catch (err) {
      logError('pausing audio', err);
    }
  };

  return {
    current,
    playing: !!current && status.playing,
    loading: !!current && !status.isLoaded && !status.error,
    position: status.currentTime,
    error: error ?? (status.error ? failMessage : null),
    toggle,
    stop,
  };
}
