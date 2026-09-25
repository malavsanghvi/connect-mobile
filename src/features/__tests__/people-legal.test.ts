import { describe, expect, it } from '@jest/globals';

import { answersPayload, continueBlocker, fromRows, pendingSteps } from '../legal-step';
import { rememberedName, splitRemembered } from '../remembrance';

const row = (id: string, mode: string, extra: Partial<Parameters<typeof fromRows>[0][number]> = {}) => ({
  document_id: id,
  kind: mode === 'consent' ? 'photo_release' : 'privacy',
  title: `Doc ${id}`,
  version: 'v2',
  body_md: 'Text',
  mode,
  answered: false,
  granted: null,
  answered_version: null,
  ...extra,
});

describe('legal step', () => {
  it('reads the rows and keeps only what is asked', () => {
    const docs = fromRows([row('a', 'accept', { answered_version: 'v1' }), row('b', 'consent'), row('c', 'none'), row('d', 'accept', { answered: true, answered_version: 'v2' })]);
    expect(docs.map((d) => d.documentId)).toEqual(['a', 'b', 'd']);
    expect(docs[0].answeredVersion).toBe('v1');
    expect(docs[2].answeredVersion).toBeNull();
    expect(pendingSteps(docs).map((d) => d.documentId)).toEqual(['a', 'b']);
  });
  it('cannot continue until every document is accepted and every consent answered', () => {
    const docs = pendingSteps(fromRows([row('a', 'accept'), row('b', 'consent')]));
    expect(continueBlocker(docs, {})).toEqual({ key: 'legal.mustAccept', title: 'Doc a' });
    expect(continueBlocker(docs, { a: false })).toEqual({ key: 'legal.mustAccept', title: 'Doc a' });
    expect(continueBlocker(docs, { a: true })).toEqual({ key: 'legal.mustAnswer', title: 'Doc b' });
    expect(continueBlocker(docs, { a: true, b: false })).toBeNull();
    expect(answersPayload(docs, { a: true, b: false })).toEqual([
      { document_id: 'a', granted: true },
      { document_id: 'b', granted: false },
    ]);
  });
});

describe('remembrance', () => {
  const p = (first: string, dead: boolean, on: string | null = null) => ({ person: { first_name: first, last_name: 'Doshi', preferred_name: null, is_deceased: dead, deceased_on: on } });
  it('keeps the deceased out of family lists and names them in the In memory line', () => {
    const { living, remembered } = splitRemembered([p('Hemant', false), p('Maniben', true, '2025-08-21'), p('Kusum', false)]);
    expect(living.map((m) => m.person.first_name)).toEqual(['Hemant', 'Kusum']);
    expect(remembered.map((m) => rememberedName(m.person))).toEqual(['Maniben Doshi (2025)']);
    expect(rememberedName(p('Old', true).person)).toBe('Old Doshi');
  });
});
