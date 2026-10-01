/**
 * Suggestions for a type-ahead field (`ComboField` in components/pickers.tsx): free text is always allowed, and the
 * list only helps. Pure, so it is unit-tested.
 */
export type ComboOption = {
  /** What picking the option puts in the field ("TX", "08817", "Edison"). */
  value: string;
  /** What the row shows ("Texas"). */
  label: string;
  /** A muted second part of the row ("TX", "Edison, NJ"). */
  detail?: string;
  /** Other words that find it ("Virgin Islands"). */
  keywords?: readonly string[];
};

function fold(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function words(s: string): string[] {
  return s.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

/**
 * The options that match what is typed, best first, at most `limit`: an exact value or label, then a value or label
 * that starts with it ("tex" → Texas, "088" → 08817), then any word of the label or keywords that starts with it
 * ("jer" → New Jersey). Ties keep the given order (callers order by relevance, e.g. zone ZIP codes first). Nothing
 * typed: the first `limit` options.
 */
export function filterCombo(options: readonly ComboOption[], query: string, limit = 6): ComboOption[] {
  const q = fold(query);
  if (!q) return options.slice(0, limit);
  const scored: { score: number; index: number; option: ComboOption }[] = [];
  options.forEach((option, index) => {
    const value = fold(option.value);
    const label = fold(option.label);
    let score = -1;
    if (value === q || label === q) score = 0;
    else if (value.startsWith(q) || label.startsWith(q)) score = 1;
    else if ([label, ...(option.keywords ?? []).map(fold)].some((text) => text.startsWith(q) || words(text).some((w) => w.startsWith(q)))) score = 2;
    if (score >= 0) scored.push({ score, index, option });
  });
  return scored
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((s) => s.option);
}

/** Whether the list is worth showing: something matches, and the field does not already hold the only match. */
export function comboListShown(matches: readonly ComboOption[], value: string): boolean {
  if (!matches.length) return false;
  return !(matches.length === 1 && fold(matches[0].value) === fold(value));
}
