import * as Speech from 'expo-speech';

import { logError } from '@/lib/errors';

import { speechPlan, type SpeakAttempt } from './speech-plan';

let voiceLanguages: Promise<string[]> | null = null;

/** The phone's text-to-speech languages, asked once. An empty list means "unknown". */
function languages(): Promise<string[]> {
  voiceLanguages ??= Speech.getAvailableVoicesAsync()
    .then((voices) => voices.map((v) => v.language).filter((l): l is string => typeof l === 'string' && !!l))
    .catch((err: unknown) => {
      logError('listing text-to-speech voices (trying Hindi, then English)', err);
      return [];
    });
  return voiceLanguages;
}

/**
 * Read a verse aloud with the phone's text-to-speech (expo-speech): Hindi when
 * the phone has a Hindi voice, else the transliteration in Indian English.
 * `onEnd(false)` when nothing could be spoken, so the screen can say so.
 */
export async function speakVerse(verse: { text: string; translit: string | null }, lang: string, onEnd: (ok: boolean) => void): Promise<void> {
  const plan = speechPlan(verse, lang, await languages());
  const attempt = (i: number) => {
    const a: SpeakAttempt | undefined = plan[i];
    if (!a) {
      onEnd(false);
      return;
    }
    try {
      Speech.speak(a.text, {
        language: a.language,
        rate: 0.8,
        onDone: () => onEnd(true),
        onStopped: () => onEnd(true),
        onError: (err) => {
          logError(`speaking a verse in ${a.language ?? 'the default voice'}`, err);
          attempt(i + 1);
        },
      });
    } catch (err) {
      logError(`speaking a verse in ${a.language ?? 'the default voice'}`, err);
      attempt(i + 1);
    }
  };
  attempt(0);
}

export function stopSpeaking(): void {
  Speech.stop().catch((err: unknown) => logError('stopping text-to-speech', err));
}
