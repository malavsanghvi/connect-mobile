import { describe, expect, it } from '@jest/globals';

import { allowedEdits, expectedWords, findApprox, levenshtein, matchAll, matchVerse, soundKey, spellDigits, transliterate } from '../voice-match';

const NAVKAR = [
  { text: 'णमो अरिहंताणं', translit: 'Namo Arihantanam' },
  { text: 'णमो सिद्धाणं', translit: 'Namo Siddhanam' },
  { text: 'णमो आयरियाणं', translit: 'Namo Ayariyanam' },
  { text: 'णमो उवज्झायाणं', translit: 'Namo Uvajjhayanam' },
  { text: 'णमो लोए सव्वसाहूणं', translit: 'Namo Loe Savva Sahunam' },
];

describe('transliterate', () => {
  it('turns Devanagari into plain Roman letters with the inherent a', () => {
    expect(transliterate('नमो')).toBe('namo');
    expect(transliterate('सिद्धाणं')).toBe('siddhaanam');
    expect(transliterate('उवज्झायाणं')).toBe('uvajjhaayaanam');
  });
  it('reads Gujarati the same way', () => {
    expect(transliterate('નમો')).toBe('namo');
  });
  it('drops dandas and leaves Roman text alone', () => {
    expect(transliterate('मंगलं ॥')).toBe('mamgalam  ');
    expect(transliterate('Namo')).toBe('Namo');
  });
});

describe('soundKey', () => {
  it('makes script and Roman spellings agree', () => {
    expect(soundKey('अरिहंताणं')).toBe(soundKey('Arihantanam'));
    expect(soundKey('सिद्धाणं')).toBe(soundKey('Siddhanam'));
    expect(soundKey('आयरियाणं')).toBe(soundKey('Ayariyanam'));
    expect(soundKey('उवज्झायाणं')).toBe(soundKey('Uvajjhayanam'));
    expect(soundKey('साहूणं')).toBe(soundKey('Sahunam'));
    expect(soundKey('पंच')).toBe(soundKey('Pancha'));
    expect(soundKey('मंगलाणं')).toBe(soundKey('Mangalanam'));
    expect(soundKey('सव्वेसिं')).toBe(soundKey('Savvesim'));
    expect(soundKey('पढमं')).toBe(soundKey('Padhamam'));
  });
  it('ignores diacritics, long vowels, doubled letters and w/v', () => {
    expect(soundKey('Namō Arihaṃtāṇaṃ')).toBe(soundKey('namoarihantanam'));
    expect(soundKey('Sawwa')).toBe(soundKey('Savva'));
    expect(soundKey('Siddhaanam')).toBe(soundKey('Sidhanam'));
  });
  it('keeps the m of namo (a nasal before a vowel is not an anusvara)', () => {
    expect(soundKey('namo')).toBe('namo');
  });
  it('accepts both नमो and णमो, and namoh', () => {
    expect(soundKey('णमो')).toBe(soundKey('नमो'));
    expect(soundKey('Namoh')).toBe(soundKey('Namo'));
    expect(soundKey('Arihantaanam')).toBe(soundKey('Arihantanam'));
    expect(soundKey('नमुक्कारो')).toBe(soundKey('Namukkaro'));
    expect(soundKey('हवइ')).toBe(soundKey('Havai'));
    expect(soundKey('सव्वपावप्पणासणो')).toBe(soundKey('SavvaPavappanasano'));
  });
});

describe('levenshtein and findApprox', () => {
  it('counts edits', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
  it('finds a word inside a longer stream', () => {
    expect(findApprox('sidanan', 'namosidanan', 0, 99)).toEqual({ distance: 0, end: 11 });
    expect(findApprox('sidanan', 'namosidana', 0, 99).distance).toBe(1);
  });
  it('allows more edits for longer words', () => {
    expect(allowedEdits(2)).toBe(0);
    expect(allowedEdits(3)).toBe(0);
    expect(allowedEdits(4)).toBe(1);
    expect(allowedEdits(7)).toBe(2);
    expect(allowedEdits(11)).toBe(3);
  });
});

describe('matchVerse', () => {
  it('passes when the recogniser writes the verse in Devanagari', () => {
    const r = matchVerse(NAVKAR[0], ['नमो अरिहंताणं'], 0.7);
    expect(r.pass).toBe(true);
    expect(r.words).toEqual([
      { word: 'Namo', ok: true },
      { word: 'Arihantanam', ok: true },
    ]);
    expect(r.score).toBe(100);
  });
  it('passes in Roman letters, run together, or slightly misheard', () => {
    expect(matchVerse(NAVKAR[1], ['namo siddhanam'], 0.7).pass).toBe(true);
    expect(matchVerse(NAVKAR[0], ['नमोअरिहंताणं'], 0.7).pass).toBe(true);
    expect(matchVerse(NAVKAR[0], ['नमो अरिहंतानम'], 0.7).pass).toBe(true);
    expect(matchVerse(NAVKAR[3], ['namo uvajayanam'], 0.7).pass).toBe(true);
  });
  it('flags the words to practise', () => {
    const r = matchVerse(NAVKAR[4], ['नमो लोए साहूणं'], 0.7);
    expect(r.words.map((w) => w.ok)).toEqual([true, true, false, true]);
    expect(r.ratio).toBe(0.75);
    expect(r.pass).toBe(true);
    const strict = matchVerse(NAVKAR[4], ['नमो लोए साहूणं'], 0.9);
    expect(strict.pass).toBe(false);
  });
  it('fails on unrelated speech and on silence', () => {
    expect(matchVerse(NAVKAR[2], ['hello how are you'], 0.7).pass).toBe(false);
    const silent = matchVerse(NAVKAR[2], [], 0.7);
    expect(silent.pass).toBe(false);
    expect(silent.words.every((w) => !w.ok)).toBe(true);
  });
  it('uses the best recogniser alternative', () => {
    expect(matchVerse(NAVKAR[1], ['nemo city done', 'नमो सिद्धाणं'], 0.7).score).toBe(100);
  });
  it('handles a script line with a different word count from the transliteration', () => {
    // सव्वसाहूणं is one word in the script, "Savva Sahunam" two in Roman.
    expect(expectedWords(NAVKAR[4]).map((w) => w.word)).toEqual(['Namo', 'Loe', 'Savva', 'Sahunam']);
    expect(matchVerse(NAVKAR[4], ['णमो लोए सव्वसाहूणं'], 0.7).score).toBe(100);
  });
  it('shows the script words when there is no transliteration', () => {
    const r = matchVerse({ text: 'णमो सिद्धाणं', translit: null }, ['namo siddhanam'], 0.7);
    expect(r.words.map((w) => w.word)).toEqual(['णमो', 'सिद्धाणं']);
    expect(r.pass).toBe(true);
  });
});

describe('matchAll', () => {
  it('checks every verse in one recitation and reports each verse', () => {
    const heard = 'नमो अरिहंताणं नमो सिद्धाणं नमो आयरियाणं नमो लोए सव्व साहूणं';
    const r = matchAll(NAVKAR, [heard], 0.7);
    expect(r.verses).toHaveLength(5);
    expect(r.verses[0].pass).toBe(true);
    expect(r.verses[1].pass).toBe(true);
    expect(r.verses[2].pass).toBe(true);
    // The fourth verse (Uvajjhayanam) was skipped: its word is flagged; the
    // "namo" that was said is counted once, for the fourth verse.
    expect(r.verses[3].words.map((w) => w.ok)).toEqual([true, false]);
    expect(r.verses[4].words.map((w) => w.ok)).toEqual([false, true, true, true]);
    expect(r.verses[4].pass).toBe(true);
    expect(r.overall.found).toBe(10);
    expect(r.overall.total).toBe(12);
    expect(r.overall.pass).toBe(true);
  });
});

const NAVKAR9 = [
  ...NAVKAR,
  { text: 'एसो पंच नमुक्कारो', translit: 'Eso Panch Namukkaro' },
  { text: 'सव्वपावप्पणासणो', translit: 'Savva Pavappanasano' },
  { text: 'मंगलाणं च सव्वेसिं', translit: 'Mangalanam cha Savvesim' },
  { text: 'पढमं हवइ मंगलं', translit: 'Padhamam Havai Mangalam' },
];

describe('common Hindi recogniser spellings (pass ratio 0.66, as in the content pack)', () => {
  const ok = (verse: number, heard: string) => matchVerse(NAVKAR9[verse], [heard], 0.66);
  it('accepts ऐसो and ऐसे for Eso, and a 5 for पंच', () => {
    expect(ok(5, 'ऐसो पंच नमुक्कारो').score).toBe(100);
    expect(ok(5, 'ऐसे पंच नमस्कारो').score).toBe(100);
    expect(ok(5, 'एसो 5 नमुक्कारो').score).toBe(100);
    expect(spellDigits('एसो 5 ५ ૫')).toBe('एसो  panch   panch   panch ');
  });
  it('accepts सब and सर्व for Savva (the single-line step)', () => {
    expect(ok(6, 'सब पाप प्रणाशनो').pass).toBe(true);
    expect(ok(6, 'सर्व पाप प्रणाशनो').pass).toBe(true);
    expect(ok(6, 'सब कुछ').pass).toBe(false);
  });
  it('accepts लोये and सब in the fifth line', () => {
    expect(ok(4, 'नमो लोये सब साहूणं').score).toBe(100);
    expect(soundKey('लोये')).toBe(soundKey('Loe'));
  });
  it('lets a three-word line miss one short word (a dropped च)', () => {
    const r = ok(7, 'मंगलाणं सव्वेसिं');
    expect(r.words.map((w) => w.ok)).toEqual([true, false, true]);
    expect(r.pass).toBe(true);
  });
  it('still needs a short word to be a whole word one letter away, not two letters inside another', () => {
    expect(ok(4, 'नमो लोए साहूणं').words.map((w) => w.ok)).toEqual([true, true, false, true]);
    expect(ok(0, 'hello how are you').pass).toBe(false);
  });
});

describe('precomposed nukta letters', () => {
  it('keeps the consonant (ढ़ written as one character)', () => {
    expect(transliterate('प\u095Dमं')).toBe('padhamam');
    expect(soundKey('प\u095Dमं')).toBe(soundKey('Padhamam'));
  });
});

describe('matchAll needs every line', () => {
  const lines1to7 = 'नमो अरिहंताणं नमो सिद्धाणं नमो आयरियाणं नमो उवज्झायाणं नमो लोए सव्वसाहूणं एसो पंच नमुक्कारो सव्वपावप्पणासणो';
  it('fails when the last two lines are left out, even with 17 of 23 words', () => {
    const r = matchAll(NAVKAR9, [lines1to7], 0.66);
    expect(r.overall.found).toBe(17);
    expect(r.overall.total).toBe(23);
    expect(r.verses.map((v) => v.pass)).toEqual([true, true, true, true, true, true, true, false, false]);
    expect(r.overall.pass).toBe(false);
  });
  it('passes the whole Navkar, also with common Hindi spellings', () => {
    expect(matchAll(NAVKAR9, [`${lines1to7} मंगलाणं च सव्वेसिं पढमं हवइ मंगलं`], 0.66).overall.score).toBe(100);
    const hindi = 'नमो अरिहंताणं नमो सिद्धाणं नमो आयरियाणं नमो उवज्झायाणं नमो लोये सब साहूणं ऐसो पंच नमुक्कारो सब पाप प्रणाशनो मंगलाणं च सव्वेसिं पढमं हवइ मंगलं';
    expect(matchAll(NAVKAR9, [hindi], 0.66).overall.score).toBe(100);
  });
  it('allows one slip in a line (the two-line step without च)', () => {
    const r = matchAll(NAVKAR9.slice(7), ['मंगलाणं सव्वेसिं पढमं हवइ मंगलं'], 0.66);
    expect(r.overall.found).toBe(5);
    expect(r.overall.pass).toBe(true);
  });
});
