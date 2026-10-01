/**
 * Which text and language the phone's text-to-speech should read a verse in
 * (pure; tested in __tests__/speech-plan.test.ts). A verse with its own audio
 * never gets here.
 *
 * - The phone has a voice for the verse's language (Hindi): read the script.
 * - Otherwise read the transliteration with an Indian English voice, or any
 *   English voice, so the sounds still come out close.
 * - When the phone doesn't say which voices it has, try the script first and
 *   fall back to the transliteration if speaking fails.
 */
export type SpeakAttempt = { text: string; language: string | undefined };

function base(lang: string): string {
  return lang.toLowerCase().replace('_', '-');
}

export function speechPlan(verse: { text: string; translit: string | null }, lang: string, voiceLanguages: readonly string[]): SpeakAttempt[] {
  const langs = voiceLanguages.map(base);
  const prefix = base(lang).split('-')[0];
  const hasNative = langs.some((l) => l.split('-')[0] === prefix);
  const english: SpeakAttempt | null = verse.translit
    ? { text: verse.translit, language: langs.some((l) => l === 'en-in') ? 'en-IN' : langs.some((l) => l.startsWith('en')) ? undefined : 'en-IN' }
    : null;
  const native: SpeakAttempt = { text: verse.text, language: lang };
  if (langs.length === 0) return english ? [native, english] : [native];
  if (hasNative) return english ? [native, english] : [native];
  return english ? [english] : [native];
}
