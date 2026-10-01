import * as Speech from 'expo-speech';

import { logError } from '@/lib/errors';

import { speechPlan, type SpeakAttempt } from './speech-plan';

let voiceLanguages: Promise<string[]> | null = null;

/** The phone's text-to-speech languages, asked once. An empty list means "unknown". */
function languages(): Promise<string[]> {
  if (voiceLanguages) return voiceLanguages;
  const listing: Promise<string[]> = Speech.getAvailableVoicesAsync()
    .then((voices: { language?: string | null }[]) => voices.map((v) => v.language).filter((l): l is string => typeof l === 'string' && !!l))
    .catch((err: unknown) => {
      logError('listing text-to-speech voices (trying Hindi, then English)', err);
      return [];
    });
  voiceLanguages = listing;
  return listing;
}

/**
 * Each speakVerse call takes a number; stopSpeaking() (and the next call)
 * moves it on. A call that is no longer current never starts speaking — the
 * first call waits for the phone to list its voices, and the microphone may
 * have been opened meanwhile; it must not hear the phone reading.
 */
let current = 0;

/**
 * Read a verse aloud with the phone's text-to-speech (expo-speech): Hindi when
 * the phone has a Hindi voice, else the transliteration in Indian English.
 * `onEnd(false)` when nothing could be spoken, so the screen can say so. A
 * call stopped before it began calls nothing.
 */
export async function speakVerse(verse: { text: string; translit: string | null }, lang: string, onEnd: (ok: boolean) => void): Promise<void> {
  current += 1;
  const mine = current;
  const voices = await languages();
  if (mine !== current) return;
  const plan = speechPlan(verse, lang, voices);
  const attempt = (i: number) => {
    if (mine !== current) return;
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
        onError: (err: unknown) => {
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

/** Stop reading, including a reading that is about to start. */
export function stopSpeaking(): void {
  current += 1;
  Speech.stop().catch((err: unknown) => logError('stopping text-to-speech', err));
}
