import type { Translate } from '@/i18n';
import type { CheckInAttendee, Station } from '@/lib/api/volunteer';

/** Already done at this station (checked in / served / given a gift). */
export function doneAtStation(a: CheckInAttendee, station: Station): boolean {
  return station === 'entry' ? a.checked_in : station === 'food' ? a.served : a.gifted;
}

/** Who starts ticked on the confirm step: everyone not yet done at this station. */
export function defaultSelection(attendees: CheckInAttendee[], station: Station): string[] {
  return attendees.filter((a) => !doneAtStation(a, station)).map((a) => a.id);
}

/** "Check in 3 people" / "Serve food to 1 person" / "Give gifts to 2 people"; "Select who is here" at 0. */
export function confirmLabel(t: Translate, station: Station, n: number): string {
  if (n <= 0) return t('volunteer.selectWho');
  const who = n === 1 ? t('volunteer.onePerson') : t('volunteer.nPeople', { n });
  const verb = station === 'entry' ? t('volunteer.verbEntry') : station === 'food' ? t('volunteer.verbFood') : t('volunteer.verbGifts');
  return `${verb} ${who}`;
}

/** The small line under each name on the confirm step. */
export function attendeeNote(t: Translate, a: CheckInAttendee, station: Station, lunchLabel: string | null): string {
  if (doneAtStation(a, station)) return station === 'entry' ? t('volunteer.noteCheckedIn') : station === 'food' ? t('volunteer.noteServed') : t('volunteer.noteGifted');
  const parts = [t('volunteer.noteRsvpd')];
  if (a.senior) parts.push(t('volunteer.noteSenior'));
  if (a.child_under_12) parts.push(t('volunteer.noteChild'));
  if (a.assistance) parts.push(a.assistanceNote?.trim() ? a.assistanceNote.trim() : t('volunteer.noteAssistance'));
  if (lunchLabel) parts.push(lunchLabel);
  return parts.join(' · ');
}
