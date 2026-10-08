import { describe, expect, it } from '@jest/globals';

import { translate, type StringKey, type Vars } from '../../i18n';
import { asClause, canPlanLabh, labhDedication, labhToPledge, listDisplayName } from '../special-days';

const base = { labhOn: true, isAdult: true, occasion: 'birthday' as const, labhPromptEnabled: true };
const t = (key: StringKey, vars?: Vars) => translate('en', key, vars);

describe('canPlanLabh', () => {
  it('is offered on a birthday, anniversary, birth tithi and other day however far off (no date input at all)', () => {
    for (const occasion of ['birthday', 'anniversary', 'birth_tithi', 'other', 'diksha'] as const) {
      expect(canPlanLabh({ ...base, occasion })).toBe(true);
    }
  });

  it('is not offered for a punyatithi', () => {
    expect(canPlanLabh({ ...base, occasion: 'punyatithi' })).toBe(false);
  });

  it('is not offered when the family switched the prompt off for that day', () => {
    expect(canPlanLabh({ ...base, labhPromptEnabled: false })).toBe(false);
  });

  it('is not offered to children or when the giving module is off', () => {
    expect(canPlanLabh({ ...base, isAdult: false })).toBe(false);
    expect(canPlanLabh({ ...base, labhOn: false })).toBe(false);
  });
});

describe('labh in the "add a special day" form', () => {
  const options = [
    { id: 'o1', name: 'Snatra puja', amount_cents: 5100 },
    { id: 'o2', name: 'Aangi', amount_cents: 25100 },
    { id: 'o3', name: 'Pathshala snacks', amount_cents: 10100 },
  ];

  it('pledges the picked options in their listed order, totalled in cents', () => {
    const { chosen, totalCents } = labhToPledge(options, ['o3', 'o1'], true);
    expect(chosen.map((o) => o.id)).toEqual(['o1', 'o3']);
    expect(totalCents).toBe(15200);
  });

  it('pledges nothing when the section is not offered for the day (e.g. switched to a punyatithi after picking)', () => {
    expect(labhToPledge(options, ['o1', 'o2'], false)).toEqual({ chosen: [], totalCents: 0 });
  });

  it('pledges nothing when nothing is picked, and ignores options that are no longer listed', () => {
    expect(labhToPledge(options, [], true)).toEqual({ chosen: [], totalCents: 0 });
    expect(labhToPledge(options, ['gone'], true).totalCents).toBe(0);
  });

  it('dedicates a birthday labh to the age being turned, and any other day to the day itself', () => {
    expect(labhDedication(t, { kind: 'birthday', heading: "Anya's birthday", fullName: 'Anya Shah', age: 10 })).toBe("In honor of Anya Shah's 10th birthday");
    expect(labhDedication(t, { kind: 'birthday', heading: "Anya's birthday", fullName: 'Anya Shah', age: null })).toBe("In honor of Anya's birthday");
    expect(labhDedication(t, { kind: 'anniversary', heading: "Priya's anniversary", fullName: 'Priya Shah', age: 20 })).toBe("In honor of Priya's anniversary");
  });

  it('names a day still in the form the way the list will', () => {
    const day = { label: null, person_id: null, kind: 'other', calendar_date: '2026-10-06', tithi: null };
    expect(listDisplayName(t, day, [])).toBe('Other');
    expect(listDisplayName(t, { ...day, label: ' Varshitap parna ' }, [])).toBe('Varshitap parna');
  });

  it('reads an error as the end of "The day was saved, but the labh could not be recorded — …"', () => {
    expect(asClause('One of the chosen labh options is no longer offered.')).toBe('one of the chosen labh options is no longer offered');
    expect(asClause("We couldn't save your labh. Check your internet connection and try again.")).toBe("we couldn't save your labh. Check your internet connection and try again");
    expect(asClause('I could not reach the server!')).toBe('I could not reach the server');
    expect(asClause('PIN expired.')).toBe('PIN expired');
    expect(t('days.labhFailed', { reason: asClause('Only an adult of the family can take a labh.') })).toBe(
      'The day was saved, but the labh could not be recorded — only an adult of the family can take a labh.',
    );
  });
});
