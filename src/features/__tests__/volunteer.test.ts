import { describe, expect, it } from '@jest/globals';

import { translate, type Translate } from '../../i18n';
import type { CheckInAttendee } from '../../lib/api/volunteer';
import { attendeeNote, confirmLabel, defaultSelection, doneAtStation } from '../volunteer';

const t: Translate = (key, vars) => translate('en', key, vars);

const person = (over: Partial<CheckInAttendee>): CheckInAttendee => ({
  id: 'a',
  name: 'Priya Shah',
  checked_in: false,
  senior: false,
  child_under_12: false,
  assistance: false,
  lunch: null,
  served: false,
  gifted: false,
  assistanceNote: null,
  ...over,
});

describe('volunteer confirm step', () => {
  it('labels the confirm button per station and count', () => {
    expect(confirmLabel(t, 'entry', 3)).toBe('Check in 3 people');
    expect(confirmLabel(t, 'food', 1)).toBe('Serve food to 1 person');
    expect(confirmLabel(t, 'gifts', 2)).toBe('Give gifts to 2 people');
    expect(confirmLabel(t, 'entry', 0)).toBe('Select who is here');
  });

  it('pre-ticks only people not yet done at this station', () => {
    const list = [person({ id: 'a' }), person({ id: 'b', checked_in: true }), person({ id: 'c', served: true })];
    expect(defaultSelection(list, 'entry')).toEqual(['a', 'c']);
    expect(defaultSelection(list, 'food')).toEqual(['a', 'b']);
    expect(defaultSelection(list, 'gifts')).toEqual(['a', 'b', 'c']);
    expect(doneAtStation(list[1], 'entry')).toBe(true);
  });

  it('writes the note under each name', () => {
    expect(attendeeNote(t, person({ senior: true }), 'entry', null)).toBe("RSVP'd · senior seating requested");
    expect(attendeeNote(t, person({ assistance: true, assistanceNote: 'Wheelchair' }), 'entry', 'Lunch 12:15 PM')).toBe("RSVP'd · Wheelchair · Lunch 12:15 PM");
    expect(attendeeNote(t, person({ checked_in: true }), 'entry', null)).toBe('Already checked in ✓');
  });
});
