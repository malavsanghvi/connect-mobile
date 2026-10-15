/**
 * The words of a house of worship that is not a Jain Center (the "Faith community" experience, wording pack `faith`, and any faith
 * the platform adds without words of its own): the neutral words (./neutral.ts) with the few places where a house of worship
 * says "service" and "worship" where a club or a chamber says something plainer. No word here belongs to one tradition.
 */
import type { StringKey } from '../en';

export const FAITH_EN: Partial<Record<StringKey, string>> = {
  'home.aartiAt': 'Service at {time}',
  'home.watchDarshanAarti': 'Watch the live stream · Service at {time}',
  'library.darshanCaption': '{title} · Service at {time}',
  'library.darshanOfflineSub': 'Next service at {time}',
  'darshan.aarti': 'Service at {time}',
  'guide.aartiToday': 'Service today',
  'guide.tile.timingsSub': '{Place} hours, services, address',
  'jw.cat.darshan_puja': 'Worship & devotion',
};
