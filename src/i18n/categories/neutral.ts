/**
 * The neutral words: what the member app says on the screens every kind of organization has, where the English dictionary
 * (../en.ts, Jain Center's own wording) says "Jai Jinendra", "Pathshala", "stavans", "seva", "derasar" or "Anumodana".
 * They are for a community organization (key nonprofit_secular) and for any kind of organization the app has no words for
 * yet (a new experience starts here, then adds its own file). The chamber of commerce and the faith-based kinds start from
 * these and say a little more in their own files.
 *
 * Only keys of the dictionary (a test checks it), only screens a non-Jain organization can open, and the same placeholders the
 * screen passes. Warm, plain, no jargon: the words an office would use to a member.
 */
import type { WordOverlay } from '@/lib/categories';

export const NEUTRAL_EN: WordOverlay = {
  // Menu
  'drawer.calendarSub': 'Events and important dates',
  'drawer.storeSub': 'Order ahead and pick up',
  'drawer.signInSub': 'RSVP, give and stay connected',

  // The family, sign-up and the profile
  'locked.body': 'RSVPs, donations and pledges are managed by adult family members. You can still see events and what is happening.',
  'profile.childNote': 'Messages about {name} go to parents. Members under 18 can view events and updates; RSVPs and pledges are managed by adult family members.',
  'familyStep.childNote': 'You can add a school grade later from their profile.',
  'planDays.subtitle': 'Add birthdays, anniversaries and other days. We remind you ahead of each one.',
  'planDays.later': 'You can add or change these anytime from Family › Special days.',
  'family.noSpecialDays': 'Add birthdays and anniversaries to get a reminder.',
  'days.intro': 'Birthdays, anniversaries and other special days for your family. We remind you before each one.',
  'days.labelPlaceholder': "e.g. Grandma Rose's birthday",
  'card.qrNote': 'Show at event check-in · works offline',
  'settings.deleteBody': 'Your login and preferences will be deleted within 30 days. Membership and donation records stay with the organization. You will be signed out now.',

  // Home
  'home.life.specialDaysLine': 'Birthdays and anniversaries',
  'home.ll.playlistLine': 'Play your favorite songs',
  'home.ll.playlistEmpty': 'Add songs you like',
  'home.ll.recipes': 'Recipes',
  'home.storeTitle': 'Order ahead from the store',
  'home.storeBody': 'Order ahead for pickup · gift packing available',
  'home.guestBody': 'Sign in to RSVP, give and see your family.',
  'calendar.disclaimer': 'School calendars come from each district.',

  // Giving
  'give.signIn': "Sign in to see your family's giving and pledges.",
  'paid.title': 'Thank you!',
  'paid.feeBody': 'We received {amount} for the fee. Thank you!',
  'opp.showName': "Show our family's name with this gift",
  'opp.choosePujans': 'Choose the items your family will take',
  'opp.fixedBoli': 'Fixed price',
  'opp.selectPujans': 'Select items',
  'opp.pujanSelected': '1 item selected',
  'opp.pujansSelected': '{n} items selected',

  // The guide
  'guide.heroEyebrow': 'Welcome',
  'guide.step.volunteer': 'Share your volunteering interests',
  'guide.guestNote': 'Sign in to join WhatsApp groups, share volunteering interests and ask questions.',
  'guide.tile.timingsSub': 'Opening hours and address',
  'guide.tile.volunteerSub': 'Tell us how you would like to help',
  'guide.tile.registrationsSub': 'Events and membership',
  'guide.derasarToday': 'Open today',
  'guide.aartiToday': 'Program today',
  'guide.volIntro': 'Volunteers are at the heart of {center}. Pick the groups that interest you and the right coordinator will reach out.',
  'guide.volThanks': 'Thank you for offering to help',
  'guide.volNone': "The organization hasn't listed its volunteer groups yet.",
  'guide.composeDefault': 'Hello! ',
  'guide.leadDefault': 'Hello! We are the {family}, new to the {zone} zone. We would love to connect with families nearby.',
  'guide.regPathshala': 'Program enrollment',
  'apply.notePlaceholder': 'e.g. Neighbors for 6 years, fellow volunteers',

  // The store (switched on by the organization)
  'store.heroBody': 'Made to order and ready for pickup.',
  'store.pickup': 'Pickup at the office',
  'store.stepSend': 'Sending {n} items to the {center} store',
  'store.placedResult': 'Order {order} is confirmed for pickup {when}.',

  // Ask Niva
  'niva.fabQ1': 'What are your opening hours?',
  'niva.fabQ2': 'Where are you, and where can I park?',
  'niva.q4': 'How can I volunteer?',
  'niva.greeting': 'Hello! I am Niva, the {center} assistant. Ask me about events, membership, opening hours or how to get involved.',
  'niva.footer': 'Niva answers from {center}-approved content and shows its sources. Anything it cannot answer is passed to the office.',

  // Listen, look and learn
  'threeL.signIn': "Sign in to see your community's songs, videos, podcasts and recipes.",
  'threeL.recipes': 'Recipes',
  'threeL.playlistEmpty': 'Your playlist is empty. Tap ＋ on a song, podcast or video to add it.',
  'threeL.nothingYet': 'Nothing to play yet — your community has not added any songs or podcasts.',
  'threeL.fallbackNote': "Your playlist is empty, so these are your community's most-liked songs, then podcasts and videos. Tap ＋ to keep one in your playlist.",
  'threeL.randomRecipeTitle': 'A recipe',
  'media.kind.stavan': 'Song',
  'media.kinds.stavan': 'Songs',
  'media.empty.stavan': 'No songs yet — your community has not added any.',
  'access.area.darshan': 'Live stream',
  'access.area.listen': 'Listen (songs, podcasts and playlist)',
  'access.area.learn': 'Learning',
};
