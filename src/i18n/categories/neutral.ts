/**
 * The neutral words: what every kind of organization that is not a Jain Center says where the English dictionary
 * (../en.ts, Jain Center's own wording) speaks of Jain things. A club, a chamber of commerce, a church or a gurdwara reads no
 * Jain word, on any screen, in any language (src/lib/__tests__/neutral-words.test.ts audits every string).
 *
 * Written as DATA, keyed by dictionary key. A word that is a category's TERM is written as a token and said with the
 * category's own terms (src/lib/wording.ts): `{School}` and `{school}` (a Religious school, a Sunday school…), `{Learning}`,
 * `{Place}` and `{place}` (the place of worship), `{Practice}` (the practice tab's name), `{Greeting}`. Words of the four terms
 * that the dictionary has and this file does not write (Pathshala in a longer sentence) are retargeted the same way, so a
 * category's terms reach every sentence, not only the labels `termWords` fills.
 *
 * Only keys whose words differ from the dictionary's are here; every other key is the dictionary's. Placeholders are those of
 * the key they replace (a token is not a placeholder: it is said before the screen fills its own).
 */
import type { Phrase } from '@/lib/wording';

import type { StringKey } from '../en';

export const NEUTRAL_EN: Partial<Record<StringKey, string>> = {
  // Navigation and drawer
  'tab.jainWay': '{Practice}',
  'drawer.calendarSub': 'Events, classes and school dates',
  'drawer.pathshala': '{School}',
  'drawer.storeSub': 'Made to order and ready for pickup',
  'drawer.signInSub': 'RSVP, give, and see your family',
  'locked.body': 'RSVPs, donations and pledges are managed by adult family members. You can still see events and learn.',

  // Profile and family
  'details.dietary.jain': 'No root vegetables',
  'profile.childNote': 'Messages about {name} go to parents. Members under 18 can view events and learn; RSVPs and pledges are managed by adult family members.',
  'planDays.subtitle': 'Add birthdays, anniversaries and other days. We remind you ahead of each one.',
  'planDays.later': 'You can add or change these anytime from Family › Special days.',
  'family.noSpecialDays': 'Add birthdays and anniversaries to get a reminder.',
  'settings.deleteBody': 'Your login, preferences and practice history will be deleted within 30 days. Membership and donation records stay with the center. You will be signed out now.',
  'settings.languageNote': "Other languages show English until the center's translations are added.",

  // Where a pledge came from
  'source.boli': 'Pledge auction',
  'source.pujan': 'Sponsored service',
  'source.labh': 'Special offering',

  // Home: the Today card, the rows and tiles
  'home.navkarsi': 'Morning fast ends',
  'home.chauvihar': 'Evening fast begins',
  'home.aartiAt': 'Live at {time}',
  'home.watchDarshan': 'Watch the live stream',
  'home.watchDarshanAarti': 'Watch the live stream · Live at {time}',
  'home.special.labhHint': 'Opens the planner for this day',
  'home.life.specialDaysLine': 'Birthdays and anniversaries',
  'home.ll.playlistLine': 'Play your favorite songs',
  'home.ll.playlistEmpty': 'Add songs you like',
  'home.ll.recipes': 'Recipes',
  'home.myWayHint': "Opens your practice, with all of today's practices",
  'home.myWay': 'My practice',
  'home.allDone': 'All practices done today · well done',
  'home.planLabh': 'Plan a special offering',
  'home.storeTitle': 'Fresh food and treats, made to order',
  'home.guestBody': 'Sign in to RSVP, give and see your family.',

  // Calendar
  'calendar.parva': 'Special day',
  'calendar.virSamvat': 'Year {year}',
  'calendar.disclaimer': 'School calendars come from each district.',

  // Give
  'give.signIn': "Sign in to see your family's giving and pledges.",
  'give.bolis': 'Auctions',
  'opp.dedicationPlaceholder': 'e.g. In honor of Grandma',
  'opp.showName': "Show our family's name with this gift",
  'opp.choosePujans': 'Choose the offerings your family will take',
  'opp.fixedBoli': 'Fixed pledge',
  'opp.selectPujans': 'Select offerings',
  'opp.pujanSelected': '1 offering selected',
  'opp.pujansSelected': '{n} offerings selected',

  // Auctions of pledges (the bolis module)
  'bolis.title': 'Auctions',
  'bolis.inAppBody': 'Pledge at or above the floor until the cutoff. The highest pledge receives the honor.',
  'bolis.noneDigital': 'No auctions are open for pledges right now.',
  'bolis.inPersonBody': 'Called live in the hall. The honor is recorded in your pledges after the event.',
  'bolis.noneHall': 'No in-person auctions are scheduled.',
  'bolis.whatIs': 'What is this auction?',
  'bolis.notifyNote': "You'll be notified if another family pledges more. If you receive the honor, pay your pledge anytime.",
  'bolis.hallNote': "This auction is called live in the hall. Be present to take part; the highest pledge receives the honor and is added to that family's pledges.",
  'bolis.reminderTitle': 'Auction coming up',
  'bolis.reminderNoTime': "The center hasn't published a time for this auction yet, so we can't set a reminder.",
  'bolis.hallTitle': 'In-person auction',

  // Daily practice (the jain_way module): the practice tab
  'jw.title': '{Practice}',
  'jw.threeL': 'Learn',
  'jw.signIn': 'Sign in to see your classes and keep up your learning.',
  'jw.dayCompleteTitle': 'Day complete · well done',
  'jw.pointsToast': '+{points} points · well done',
  'jw.reminderBody': 'Your daily practice.',
  'jw.standingSubDone': '{n} practicing · {k} done today',
  'jw.standingSubNone': '{n} practicing · none done yet today',
  'jw.cat.mantra_jaap': 'Prayer & chanting',
  'jw.cat.tapasya_pachchakhan': 'Fasting & vows',
  'jw.cat.darshan_puja': 'Worship',
  'jw.cat.samayik_pratikraman': 'Meditation & reflection',
  'jw.cat.swadhyay_learning': 'Study & learning',

  // Learn: the learning path and the school
  'learn.contentNote': 'Level order, text and audio come from your {school} and may differ by tradition.',
  'learn.signedOff': 'Signed off by your teacher · well done',
  'learn.sutraLines': 'Text, line by line',
  'learn.sutraPending': 'Text with word meanings will be added once your {school} has reviewed it.',
  'learn.recitationSaved': 'Well done. Your recitation is saved for your teacher to hear.',
  'learn.goalFinishedNoSignoff': 'You completed {goal}. Well done.',
  'learn.goalsBody': 'Short daily levels with listening, quizzes and recitation. A {school} teacher signs off your final level. Points and streak are shared with your daily practice.',
  'gyan.stepPujaLearn': 'Learn the steps',
  'gyan.stepPujaPractice': 'Practise the steps',
  'gyan.imagePlaceholder': 'A simple drawing for now · a photo will take its place',
  'gyan.pujaOf': 'Part {n} of {total}',
  'gyan.learnIntro': 'Touch each glowing spot to learn the order.',
  'gyan.learnedAll': 'You have learned all {n} touches. Well done.',
  'gyan.sayAllPass': 'Well done. You said it all.',
  'gyan.langUnavailable': "Your phone can't listen in this language. You can listen in English letters instead — the check still works.",

  // A guided practice (the virtual puja of the learning path)
  'puja.title': 'Guided practice',
  'puja.heading': 'A guided practice',
  'puja.intro': 'Take a calm breath, then touch each place in order, as you would in person.',
  'puja.learnHint': 'Shows each place in order, with what to do and why, then brings you back to the practice.',
  'puja.complete': 'Well done. Your practice is complete.',
  'puja.entry': 'Do the practice',
  'puja.entryA11y': 'Do the guided practice',
  'puja.unavailable': "The guided practice isn't available yet",
  'puja.unavailableBody': 'It uses a lesson of the {learning}. Once your community adds it, you can do the practice here.',
  'puja.learned': "You've learned the order. Now do the practice.",
  'puja.learnedPoints': "You've learned the order · +{n} points. Now do the practice.",
  'puja.learnedLevel': "You've learned the order and finished the lesson. Now do the practice.",
  'puja.learnedLevelPoints': "You've learned the order and finished the lesson · +{n} points. Now do the practice.",
  'puja.guestPoints': 'Sign in to earn practice points',

  // The family circle
  'saathi.intro': "Celebrate each other's progress and lend a hand when someone falls behind. A cheer earns you {anumodana} points, support earns {support}.",
  'saathi.othersSentMine': 'You sent a cheer · +{points} {center} points for you',
  'saathi.othersSentOne': '1 cheer sent',
  'saathi.othersSentMany': '{n} cheers sent',
  'saathi.beFirst': 'Be the first to send a cheer',
  'saathi.sendCta': 'Send a cheer · +{points} points',
  'saathi.sentCta': 'Cheer sent ✓',
  'saathi.sentToast': 'Cheer sent · +{points} {center} points',
  'saathi.received': 'Cheers for you',
  'saathi.receivedCelebrate': '{name} sent you a cheer',
  'saathi.pushSent': 'Cheer sent to {name} · +{points} {center} points',

  // Library: the live stream, daily readings, songs, recipes
  'library.intro': 'Reference for your practice: the live stream, daily readings and the {center} guide.',
  'library.darshanCaption': '{title} · Live at {time}',
  'library.darshanPlay': 'Play the live stream',
  'library.darshanOffline': 'The live stream is offline',
  'library.darshanOfflineSub': 'Next live at {time}',
  'darshan.title': 'Live stream',
  'darshan.aarti': 'Live at {time}',
  'library.pachchakhan': 'Daily readings',
  'library.none': "Your center hasn't published daily readings yet.",
  'library.pachTitle': 'Daily reading',
  'library.sutra': 'Text',
  'library.sutraPending': 'The text will be added once your {school} has reviewed it.',
  'library.reminderBody': 'Your reading: {when}',
  'library.reminderNoTime': "This reading doesn't have a set time today, so there's nothing to remind you before.",
  'library.reminderPassed': "Today's time for this reading has already passed.",
  'library.guidance': 'For guidance on your own practice, please consult a teacher or leader of your community.',
  'threeL.heading': 'Look, Listen, Learn',
  'threeL.signIn': "Sign in to see your community's songs, videos, podcasts and recipes.",
  'threeL.recipes': 'Recipes',
  'threeL.playlistEmpty': 'Your playlist is empty. Tap ＋ on a song, podcast or video to add it.',
  'threeL.nothingYet': 'Nothing to play yet — your community has not added any songs or podcasts.',
  'threeL.fallbackNote': "Your playlist is empty, so these are your community's most-liked songs, then podcasts and videos. Tap ＋ to keep one in your playlist.",
  'threeL.randomRecipeTitle': 'A recipe',
  'threeL.noFullyJainBody': 'Your community has added recipes, but none is marked root-vegetable free yet.',
  'media.kind.stavan': 'Song',
  'media.kinds.stavan': 'Songs',
  'media.empty.stavan': 'No songs yet — your community has not added any.',
  'media.noFullyJain': 'No root-vegetable-free recipes yet.',
  'media.fullyJainOnly': 'Root-vegetable free only',
  'media.fullyJain': 'Root-vegetable free',
  'media.fullyJainLong': 'No root vegetables, onion or garlic',
  'media.notFullyJain': 'Not marked root-vegetable free',

  // Special days (the family's dates)
  'days.intro': 'Birthdays and anniversaries for your family. We remind you before each one.',
  'days.kindBirthTithi': 'Lunar birthday',
  'days.kindPunyatithi': 'Remembrance day',
  'days.kindDiksha': 'Initiation',
  'days.tithiUnknown': 'date not in the published lunar calendar yet',
  'days.planLabh': 'Plan an offering',
  'days.planLabhLabel': 'Plan an offering for {name}',
  'days.labelPlaceholder': "e.g. Late Grandma's remembrance day",
  'days.byTithi': 'Lunar date',
  'days.tithiField': 'Lunar date (month, phase and day)',
  'days.tithiPlaceholder': 'Month, phase and day',
  'days.tithiRequired': 'Enter the lunar month, phase and day.',
  'days.labhTitle': 'Plan an offering for this day (optional)',
  'days.labhBody': 'Each offering you pick is recorded as a pledge when you save the day. Pay it any time from Give › Family pledges.',
  'days.labhFailed': 'The day was saved, but the offering could not be recorded — {reason}.',
  'days.skipLabh': 'Continue without the offering',
  'labh.title': 'Birthday offering',
  'labh.titleOther': 'Plan an offering',
  'labh.noOptions': "The center hasn't published offering options yet. Please check back later or ask the office.",
  'labh.selectOne': 'Select an offering',
  'labh.oneSelected': '1 offering selected',
  'labh.nSelected': '{n} offerings selected',
  'labh.dedication': 'Dedication (shown at the {place} and to the {school} class)',
  'labh.savingTitle': 'Saving your offering',

  // The guide
  'guide.heroEyebrow': '{Greeting}',
  'guide.step.volunteer': 'Share your volunteering interests',
  'guide.guestNote': 'Sign in to join WhatsApp groups, share volunteering interests and ask questions.',
  'guide.tile.timingsSub': '{Place} hours and address',
  'guide.tile.volunteerSub': 'Send your volunteering interests',
  'guide.derasarToday': '{Place} today',
  'guide.aartiToday': 'Live today',
  'guide.volIntro': 'Volunteering is at the heart of {center}. Pick the groups that interest you and the right coordinator will reach out.',
  'guide.volThanks': 'Thank you for volunteering',
  'guide.volNone': "The center hasn't listed its volunteer groups yet.",

  // The school
  'announce.all': 'The whole {school}',
  'announce.allTerm': 'The whole {school} · {term}',
  'enrollReq.sentBody': 'The {School} office will place {name} in a class. You will see it under {practice}.',
  'reg.strip.hint': 'Opens {School} in {practice}',
  'reg.err.unreadableRegister': "We couldn't confirm your registration. Look under {practice} before you register again.",
  'teach.qualifications': 'Qualifications (studies, teaching)',

  // Store, Niva, modules, access
  'store.heroBody': 'Made to order in our kitchen.',
  'store.pickup': 'Pickup at the {place}',
  'store.placedResult': 'Order {order} is confirmed for pickup {when} at the {place}.',
  'store.giftMessagePlaceholder': 'e.g. Happy holidays from the {name} family',
  'niva.fabQ1': 'When can I visit?',
  'niva.fabQ2': 'Where is the {place}, and where can I park?',
  'niva.footer': "Niva answers from {center}-approved content and shows its sources. Doctrinal questions are referred to your community's teachers.",
  'modules.label.bolis': 'Auctions',
  'modules.label.pathshala': '{School}',
  'modules.label.gyan_path': '{Learning}',
  'modules.label.jain_way': 'Daily practice',
  'access.area.darshan': 'Live stream',
  'access.area.puja': 'Guided practice',
  'access.area.listen': 'Listen (songs, podcasts and playlist)',
  'access.area.learn': '{Learning}',
  'howToGive.method.cash': 'Cash',
  'learn.noLevels': 'Levels for this goal are coming from the {school}.',
};

/**
 * Words of the sentences written in code, outside the dictionary: the action of a failure ("We couldn't load stavans and
 * podcasts"), a message the data layer writes. They are said with these in place of the Jain word, whatever its capital letter
 * (src/lib/wording.ts retargetActive); a Jain Center says them as written. The longer phrase goes first.
 */
export const NEUTRAL_PHRASES: readonly Phrase[] = [
  { re: /\bmy jain way\b/gi, to: 'this page' },
  { re: /\bjain way\b/gi, to: 'this page' },
  { re: /\bvirtual puja\b/gi, to: 'guided practice' },
  { re: /\bpuja\b/gi, to: 'practice' },
  { re: /\blive darshan\b/gi, to: 'live stream' },
  { re: /\bstavans\b/gi, to: 'songs' },
  { re: /\bstavan\b/gi, to: 'song' },
  { re: /\bpachchakhan\b/gi, to: 'daily reading' },
  { re: /\bseva\b/gi, to: 'volunteering' },
  { re: /\banumodana\b/gi, to: 'a cheer' },
  { re: /\blabh\b/gi, to: 'offering' },
  { re: /\btithi dates\b/gi, to: 'lunar dates' },
  { re: /\btithis\b/gi, to: 'lunar dates' },
  { re: /\btithi\b/gi, to: 'lunar date' },
  { re: /\bbolis\b/gi, to: 'auctions' },
  { re: /\bboli\b/gi, to: 'auction' },
  // a notification topic or a store the database names "Satvik Store"
  { re: /\bsatvik\s+/gi, to: '' },
];
