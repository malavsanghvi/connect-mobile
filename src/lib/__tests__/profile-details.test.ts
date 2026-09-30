import { describe, expect, it } from '@jest/globals';

import { translate } from '../../i18n';
import { en } from '../../i18n/en';
import {
  dietaryChoiceList,
  dietaryLabel,
  dietaryStringKey,
  draftFromDetails,
  EMPTY_DETAILS,
  humanizeKey,
  isEmptyDetails,
  MAX_DIETARY_OTHER,
  toggleDietary,
  validateDetails,
  type DetailsDraft,
  type DietaryOption,
} from '../profile-details';

const TODAY = '2026-09-30';
const ADULT = { isAdult: true, today: TODAY, dob: '1980-01-01' };
const draft = (over: Partial<DetailsDraft> = {}): DetailsDraft => ({ ...EMPTY_DETAILS, ...over });

const OPTIONS: DietaryOption[] = [
  { key: 'vegetarian', label: 'Vegetarian', active: true },
  { key: 'jain', label: 'Jain (no root vegetables)', active: true },
  { key: 'other', label: 'Other', active: true },
  { key: 'halal', label: 'Halal', active: false },
];

describe('validateDetails: anniversary', () => {
  it('accepts a real past date and stores it as an ISO date', () => {
    const r = validateDetails(draft({ anniversary: '02/14/2008' }), ADULT);
    expect(r.errors).toEqual({});
    expect(r.value.anniversary).toBe('2008-02-14');
  });
  it('leaves a blank anniversary blank', () => {
    expect(validateDetails(draft(), ADULT).value.anniversary).toBeNull();
  });
  it('explains a date that is not a date', () => {
    expect(validateDetails(draft({ anniversary: '2008' }), ADULT).errors.anniversary?.key).toBe('details.dateInvalid');
    expect(validateDetails(draft({ anniversary: '02/31/2008' }), ADULT).errors.anniversary?.key).toBe('details.dateInvalid');
  });
  it('refuses a date in the future', () => {
    expect(validateDetails(draft({ anniversary: '10/01/2026' }), ADULT).errors.anniversary?.key).toBe('details.dateFuture');
    expect(validateDetails(draft({ anniversary: '09/30/2026' }), ADULT).errors).toEqual({});
  });
  it('refuses a date on or before the birth date', () => {
    expect(validateDetails(draft({ anniversary: '01/01/1980' }), ADULT).errors.anniversary?.key).toBe('details.dateBeforeBirth');
    expect(validateDetails(draft({ anniversary: '06/15/1979' }), ADULT).errors.anniversary?.key).toBe('details.dateBeforeBirth');
  });
  it('does not check against a birth date that is not known', () => {
    expect(validateDetails(draft({ anniversary: '06/15/1979' }), { ...ADULT, dob: null }).errors).toEqual({});
  });
  it('never carries an anniversary for a child, whatever the draft holds', () => {
    const r = validateDetails(draft({ anniversary: '02/14/2008' }), { ...ADULT, isAdult: false });
    expect(r.errors).toEqual({});
    expect(r.value.anniversary).toBeNull();
  });
});

describe('validateDetails: dietary needs', () => {
  it('keeps each choice once, in the order ticked', () => {
    expect(validateDetails(draft({ dietary: ['jain', 'vegetarian', 'jain'] }), ADULT).value.dietary).toEqual(['jain', 'vegetarian']);
  });
  it('keeps the member\'s own words only while "Other" is ticked', () => {
    expect(validateDetails(draft({ dietary: ['other'], dietaryOther: '  no   mushrooms ' }), ADULT).value.dietary_other).toBe('no mushrooms');
    expect(validateDetails(draft({ dietary: ['vegetarian'], dietaryOther: 'no mushrooms' }), ADULT).value.dietary_other).toBeNull();
  });
  it('allows "Other" with no words', () => {
    const r = validateDetails(draft({ dietary: ['other'] }), ADULT);
    expect(r.errors).toEqual({});
    expect(r.value.dietary_other).toBeNull();
  });
  it('limits the note to what the database accepts', () => {
    const r = validateDetails(draft({ dietary: ['other'], dietaryOther: 'x'.repeat(MAX_DIETARY_OTHER + 1) }), ADULT);
    expect(r.errors.dietaryOther).toEqual({ key: 'details.tooLong', vars: { max: MAX_DIETARY_OTHER } });
  });
});

describe('validateDetails: emergency contact', () => {
  it('saves a complete contact with the number in international form', () => {
    const r = validateDetails(draft({ ecName: ' Kiran  Shah ', ecRelationship: 'Sister', ecPhone: '(713) 555-0142' }), ADULT);
    expect(r.errors).toEqual({});
    expect(r.value).toMatchObject({ emergency_contact_name: 'Kiran Shah', emergency_contact_relationship: 'Sister', emergency_contact_phone: '+17135550142' });
  });
  it('relationship is optional', () => {
    const r = validateDetails(draft({ ecName: 'Kiran', ecPhone: '+447700900123' }), ADULT);
    expect(r.errors).toEqual({});
    expect(r.value.emergency_contact_relationship).toBeNull();
    expect(r.value.emergency_contact_phone).toBe('+447700900123');
  });
  it('asks for the number when there is a name', () => {
    const r = validateDetails(draft({ ecName: 'Kiran' }), ADULT);
    expect(r.errors.ecPhone?.key).toBe('details.needPhone');
    expect(r.errors.ecName).toBeUndefined();
  });
  it('asks for the name when there is a number or only a relationship', () => {
    expect(validateDetails(draft({ ecPhone: '7135550142' }), ADULT).errors.ecName?.key).toBe('details.needName');
    const r = validateDetails(draft({ ecRelationship: 'Sister' }), ADULT);
    expect(r.errors.ecName?.key).toBe('details.needName');
    expect(r.errors.ecPhone?.key).toBe('details.needPhone');
  });
  it('explains a number that is not a number', () => {
    expect(validateDetails(draft({ ecName: 'Kiran', ecPhone: '555' }), ADULT).errors.ecPhone?.key).toBe('details.phoneInvalid');
  });
  it('never returns half a contact', () => {
    const r = validateDetails(draft({ ecName: 'Kiran', ecRelationship: 'Sister' }), ADULT);
    expect(r.value.emergency_contact_name).toBeNull();
    expect(r.value.emergency_contact_phone).toBeNull();
    expect(r.value.emergency_contact_relationship).toBeNull();
  });
  it('clears everything when all three are blank', () => {
    const r = validateDetails(draft(), ADULT);
    expect(r.errors).toEqual({});
    expect(isEmptyDetails(r.value)).toBe(true);
  });
});

describe('draftFromDetails', () => {
  it('is empty with no row', () => {
    expect(draftFromDetails(null)).toEqual(EMPTY_DETAILS);
  });
  it('shows dates and numbers the way members type them, and round-trips', () => {
    const d = draftFromDetails({
      anniversary: '2008-02-14',
      dietary: ['jain', 'other'],
      dietary_other: 'no mushrooms',
      emergency_contact_name: 'Kiran Shah',
      emergency_contact_relationship: 'Sister',
      emergency_contact_phone: '+17135550142',
    });
    expect(d).toEqual({ anniversary: '02/14/2008', dietary: ['jain', 'other'], dietaryOther: 'no mushrooms', ecName: 'Kiran Shah', ecRelationship: 'Sister', ecPhone: '(713) 555-0142' });
    const back = validateDetails(d, ADULT);
    expect(back.errors).toEqual({});
    expect(back.value).toEqual({
      anniversary: '2008-02-14',
      dietary: ['jain', 'other'],
      dietary_other: 'no mushrooms',
      emergency_contact_name: 'Kiran Shah',
      emergency_contact_relationship: 'Sister',
      emergency_contact_phone: '+17135550142',
    });
  });
});

describe('dietary choices', () => {
  it('offers the active choices in the community order', () => {
    expect(dietaryChoiceList(OPTIONS, []).map((o) => o.key)).toEqual(['vegetarian', 'jain', 'other']);
  });
  it('keeps a choice the member made that was later switched off, so it can be un-ticked', () => {
    expect(dietaryChoiceList(OPTIONS, ['halal', 'jain']).map((o) => o.key)).toEqual(['vegetarian', 'jain', 'other', 'halal']);
  });
  it('names a choice the list no longer holds instead of dropping it', () => {
    expect(dietaryChoiceList(OPTIONS, ['dairy_free']).at(-1)).toEqual({ key: 'dairy_free', label: 'Dairy free', active: false });
  });
  it('toggles a choice on and off', () => {
    expect(toggleDietary(['jain'], 'vegan')).toEqual(['jain', 'vegan']);
    expect(toggleDietary(['jain', 'vegan'], 'jain')).toEqual(['vegan']);
  });
  it('humanizes keys', () => {
    expect(humanizeKey('nut_allergy')).toBe('Nut allergy');
  });
});

describe('dietary labels', () => {
  const t = (k: Parameters<typeof translate>[1]) => `[gu] ${translate('en', k)}`;
  it('has a translation key for every default choice the database seeds', () => {
    for (const key of ['vegetarian', 'vegan', 'jain', 'gluten_free', 'nut_allergy', 'diabetic', 'other']) expect(dietaryStringKey(key)).not.toBeNull();
    expect(dietaryStringKey('dairy_free')).toBeNull();
  });
  it('seeded labels in the database match the English strings', () => {
    // 0546 seeds these exact labels; if either side changes, an un-renamed default would stop being translated.
    const seeded: Record<string, string> = {
      vegetarian: 'Vegetarian',
      vegan: 'Vegan',
      jain: 'Jain (no root vegetables)',
      gluten_free: 'Gluten-free',
      nut_allergy: 'Nut allergy',
      diabetic: 'Diabetic',
      other: 'Other',
    };
    for (const [key, label] of Object.entries(seeded)) expect(en[dietaryStringKey(key)!]).toBe(label);
  });
  it('translates a default the community never renamed', () => {
    expect(dietaryLabel({ key: 'vegan', label: 'Vegan', active: true }, t)).toBe('[gu] Vegan');
  });
  it('shows the community\'s own wording when it renamed a default, or added its own', () => {
    expect(dietaryLabel({ key: 'vegan', label: 'Vegan (no honey)', active: true }, t)).toBe('Vegan (no honey)');
    expect(dietaryLabel({ key: 'halal', label: 'Halal', active: true }, t)).toBe('Halal');
  });
});

describe('isEmptyDetails', () => {
  it('is false when any one thing is given', () => {
    expect(isEmptyDetails(validateDetails(draft({ dietary: ['jain'] }), ADULT).value)).toBe(false);
    expect(isEmptyDetails(validateDetails(draft({ anniversary: '02/14/2008' }), ADULT).value)).toBe(false);
  });
});
