import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { isLanguage, translate, type Language, type StringKey, type Translate, type Vars } from '@/i18n';
import { logError } from '@/lib/errors';
import { readPref, writePref } from '@/lib/storage';
import { textScales, type TextSize } from '@/theme';

type SettingsContextValue = {
  language: Language;
  setLanguage: (lang: Language) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  /** Multiplier applied to every font size (Settings › Text size). */
  scale: number;
  t: Translate;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function isTextSize(v: unknown): v is TextSize {
  return v === 'standard' || v === 'large' || v === 'largest';
}

/**
 * Device-level display preferences. They are also mirrored to the member's
 * account (accounts.language / accounts.large_text) from the Settings screen.
 */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [textSize, setTextSizeState] = useState<TextSize>('standard');

  useEffect(() => {
    let active = true;
    Promise.all([readPref<string>('language', 'en'), readPref<string>('textSize', 'standard')]).then(([lang, size]) => {
      if (!active) return;
      if (isLanguage(lang)) setLanguageState(lang);
      if (isTextSize(size)) setTextSizeState(size);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    writePref('language', lang).catch((err) => logError('saving language on this device', err));
  };
  const setTextSize = (size: TextSize) => {
    setTextSizeState(size);
    writePref('textSize', size).catch((err) => logError('saving text size on this device', err));
  };
  const t: Translate = (key: StringKey, vars?: Vars) => translate(language, key, vars);

  return (
    <SettingsContext.Provider value={{ language, setLanguage, textSize, setTextSize, scale: textScales[textSize], t }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}

/** Shorthand for the translate function. */
export function useT(): Translate {
  return useSettings().t;
}
