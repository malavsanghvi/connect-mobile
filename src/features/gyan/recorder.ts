import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { logError } from '@/lib/errors';

/** Why a recording could not start or stop: the microphone is not allowed, the phone failed, or the screen that asked was gone before it started (nothing to say then). */
export type RecorderFailure = 'denied' | 'failed' | 'cancelled';

export type RecorderStart = { ok: true } | { ok: false; reason: RecorderFailure };
export type RecorderStop = { ok: true; uri: string; seconds: number } | { ok: false; reason: 'failed' };

export type VoiceRecorder = {
  /** Recording right now. */
  listening: boolean;
  /** How long the current recording is, so far; once it has stopped, how long it was (0 before the first), so a clock never jumps back to 0:00 while the file is being finished. */
  seconds: number;
  /** Ask for the microphone and start. The caller says why when it did not start. */
  start: () => Promise<RecorderStart>;
  /** Stop and give the file; the caller uploads it (and says so when nothing was recorded). */
  stop: () => Promise<RecorderStop>;
};

type AudioRecorderOf = ReturnType<typeof useAudioRecorder>;

/**
 * Let go of a recorder nobody is waiting for (its screen was left): stop it, so the microphone is released (a browser
 * keeps showing it in use until then), and take the phone out of recording mode. `prepared`: it was opened but never
 * started, and stopping needs it started. Best effort: a failure is logged.
 */
async function letGo(recorder: AudioRecorderOf | null, prepared: boolean): Promise<void> {
  try {
    if (recorder && prepared) recorder.record();
    await recorder?.stop();
  } catch (err) {
    logError('stopping a voice recording whose screen was left', err);
  }
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch((err: unknown) => logError('leaving recording mode (continuing)', err));
}

/**
 * The one voice recorder of the app (expo-audio, the HIGH_QUALITY preset): the
 * recite step of a lesson and a homework voice note use it. Pure mechanics:
 * permission, audio mode, start, stop and the file; every failure is logged
 * here and reported to the caller, which shows the words for it. Leaving the
 * screen mid-recording stops it and gives the microphone back, and a start that
 * was waiting for the permission prompt when the screen went away records nothing.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const live = useRef({ mounted: true, recording: false });
  const recorderRef = useRef<AudioRecorderOf | null>(null);
  // Declared before the recorder hook, so on unmount this runs first: the recording is stopped before the hook lets go of the recorder.
  useEffect(() => {
    const state = live.current;
    state.mounted = true;
    return () => {
      state.mounted = false;
      if (!state.recording) return;
      state.recording = false;
      void letGo(recorderRef.current, false);
    };
  }, []);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  useEffect(() => {
    recorderRef.current = recorder;
  });
  const [listening, setListening] = useState(false);
  const [held, setHeld] = useState(0);

  const start = async (): Promise<RecorderStart> => {
    const state = live.current;
    try {
      const perm = await requestRecordingPermissionsAsync();
      // The screen was left while the permission prompt was open: whatever was answered, nothing was opened that needs closing.
      if (!state.mounted) return { ok: false, reason: 'cancelled' };
      if (!perm.granted) return { ok: false, reason: 'denied' };
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!state.mounted) {
        // Left while the microphone was being opened: it is open now, so close it again and record nothing.
        await letGo(recorder, true);
        return { ok: false, reason: 'cancelled' };
      }
      recorder.record();
      state.recording = true;
      setHeld(0);
      setListening(true);
      return { ok: true };
    } catch (err) {
      logError('starting a voice recording', err);
      setListening(false);
      return { ok: false, reason: 'failed' };
    }
  };

  /** The length so far, from the recorder itself when it can say (a timer holding an older render's `stop` still gets the real length), else from the polled state. */
  const currentMillis = (): number => {
    try {
      const ms = recorder.getStatus().durationMillis;
      return Number.isFinite(ms) ? ms : rec.durationMillis;
    } catch {
      return rec.durationMillis;
    }
  };

  const stop = async (): Promise<RecorderStop> => {
    const seconds = currentMillis() / 1000;
    live.current.recording = false;
    setHeld(seconds);
    setListening(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch((err: unknown) => logError('leaving recording mode (continuing)', err));
    } catch (err) {
      logError('stopping a voice recording', err);
      return { ok: false, reason: 'failed' };
    }
    const uri = recorder.uri;
    if (!uri) {
      logError('a voice recording has no file', new Error(`uri=${String(uri)}`));
      return { ok: false, reason: 'failed' };
    }
    return { ok: true, uri, seconds };
  };

  return { listening, seconds: listening ? rec.durationMillis / 1000 : held, start, stop };
}
