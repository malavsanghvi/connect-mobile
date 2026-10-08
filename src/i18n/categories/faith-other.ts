/**
 * Faith-based organization of another tradition (key faith_other): a church, a gurdwara, a mosque, a Hindu temple… Built on
 * the neutral words (./neutral.ts), warmer about worship and learning. Words that belong to one tradition (a church's
 * "service", a mosque's "prayer") are left to the organization: the kind says "place of worship", "service times", "religious
 * school" and "learning path", which fit all of them. The religious school and the learning path are named by the database's
 * terms; their names reach every screen that says "Pathshala" or "Gyan Path" through the term swaps (src/lib/categories.ts
 * termSwaps), so they need no line here.
 */
import type { WordSet } from '..';

import { NEUTRAL_EN } from './neutral';

export const FAITH_OTHER_WORDS: WordSet = {
  en: {
    ...NEUTRAL_EN,
    'home.guestBody': 'Sign in to RSVP, give, see your family and stay connected with your community.',
    'home.ll.playlistLine': 'Play your favorite devotional music',
    'home.ll.playlistEmpty': 'Add devotional music you like',
    'media.kind.stavan': 'Devotional song',
    'media.kinds.stavan': 'Devotional songs',
    'media.empty.stavan': 'No devotional songs yet — your community has not added any.',
    'threeL.signIn': "Sign in to see your community's devotional music, videos, podcasts and recipes.",
    'threeL.nothingYet': 'Nothing to play yet — your community has not added any devotional music or podcasts.',
    'guide.aartiToday': 'Service today',
    'guide.tile.timingsSub': 'Hours, services and address',
    'guide.tile.registrationsSub': 'Religious school, events, membership',
    'guide.regPathshala': 'Religious school enrollment',
    'familyStep.childNote': 'School grade and religious school level can be added from the Learn tab.',
    'paid.feeBody': 'We received {amount} for the religious school fee. Thank you!',
    'access.area.learn': 'Learning path',
    'niva.fabQ1': 'What are the service times?',
    'niva.fabQ2': 'Where is the place of worship, and where can I park?',
    'niva.q4': 'How do I sign my child up for religious school?',
    'niva.greeting': 'Welcome! I am Niva, the {center} assistant. Ask me about services, events, membership or our programs.',
    'niva.footer': 'Niva answers from {center}-approved content and shows its sources. Questions about teaching or belief are referred to our leaders.',
  },
};
