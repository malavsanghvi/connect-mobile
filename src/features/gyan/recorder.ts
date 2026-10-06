import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useState } from 'react';

import { logError } from '@/lib/errors';

/** Why a recording could not start or stop: the microphone is not allowed, or the phone failed. */
export type RecorderFailure = 'denied' | 'failed';

export type RecorderStart = { ok: true } | { ok: false; reason: RecorderFailure };
export type RecorderStop = { ok: true; uri: string; seconds: number } | { ok: false; reason: 'failed' };

export type VoiceRecorder = {
  /** Recording right now. */
  listening: boolean;
  /** How long the current recording is, so far (0 when not recording). */
  seconds: number;
  /** Ask for the microphone and start. The caller says why when it did not start. */
  start: () => Promise<RecorderStart>;
  /** Stop and give the file; the caller uploads it (and says so when nothing was recorded). */
  stop: () => Promise<RecorderStop>;
};

/**
 * The one voice recorder of the app (expo-audio, the HIGH_QUALITY preset): the
 * recite step of a lesson and a homework voice note use it. Pure mechanics:
 * permission, audio mode, start, stop and the file; every failure is logged
 * here and reported to the caller, which shows the words for it.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [listening, setListening] = useState(false);

  const start = async (): Promise<RecorderStart> => {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) return { ok: false, reason: 'denied' };
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
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

  return { listening, seconds: listening ? rec.durationMillis / 1000 : 0, start, stop };
}
