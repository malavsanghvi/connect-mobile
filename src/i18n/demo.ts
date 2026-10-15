/**
 * "Try the demo" strings (docs/DEMO.md). Kept in their own file and spread into en.ts, so the dictionary changes by one line;
 * gu.ts / hi.ts take every key from en.ts and fall back to English until the community's reviewed translations are added.
 *
 * Nothing here names a tradition or an organization: the demo is offered before anyone has chosen one.
 */
export const demoStrings = {
  // The entry on "Find your community"
  'demo.entryTitle': 'Just looking?',
  'demo.entryBody': 'See the app as a family, a volunteer or a teacher. Nothing real is sent.',
  'demo.entryButton': 'Try the demo',
  'demo.entryHint': 'Opens a list of demo communities to look around',

  // Step 1: which demo community (opens it as a guest, no sign-in)
  'demo.title': 'Try the demo',
  'demo.subtitle': 'Look around a demo community as a guest, then be someone in it if you like. Nothing real is sent, and the demo starts over every night.',
  'demo.communityTitle': 'Choose a demo community',
  'demo.communityLabel': '{kind}: {name}. {blurb}',
  'demo.communityHint': 'Opens {name} in the app as a guest',
  'demo.opening': 'Opening the demo community…',
  'demo.loading': 'Loading the demo…',
  'demo.off': 'The demo is switched off right now. Please try again later.',
  'demo.empty': 'No demo communities are ready yet. Please try again later.',
  'demo.guestNotReady': 'The demo communities are not open to guests yet. Please try again later.',
  'demo.kindLabel': 'Kind of community',
  'demo.kind.faith': 'Faith-based',
  'demo.kind.neutral': 'Not faith-based',
  'demo.kindBlurb.faith': 'A place of worship with classes, pledges, events and a store.',
  'demo.kindBlurb.neutral': 'A neighborhood club with events, giving, a directory and notices.',
  'demo.signedInWarning': 'You are signed in on this device. Opening the demo signs you out here; you can sign in again afterwards.',

  // Step 2: who to be
  'demo.personTitle': 'Be someone in the demo',
  'demo.personSubtitle': 'Choose who to be and use the app as that person for up to two hours. Nothing real is sent.',
  'demo.peopleTitle': 'Who do you want to be?',
  'demo.area.community': 'Community roles',
  'demo.area.operations': 'Non-profit operational roles',
  'demo.personLabel': '{role}: {name}. {story}',
  'demo.start': 'Start as {name}',
  'demo.startNone': 'Choose a person to start',
  'demo.starting': 'Starting the demo…',

  // Why the chooser is back
  'demo.ended': 'The demo ended. Start again any time.',
  'demo.endedOff': 'The demo was switched off, so it ended. Please try again later.',

  // The banner over every screen
  'demo.guestBanner': 'Demo community · Looking around as a guest',
  'demo.guestBannerLabel': 'You are looking around the demo community {community} as a guest.',
  'demo.banner': 'Demo · {role} · {left}',
  'demo.bannerLabel': 'You are exploring a demo community as {role}. {left}.',
  'demo.bePerson': 'Be someone in the demo',
  'demo.bePersonHint': 'Opens the list of demo people to sign in as',
  'demo.switchPerson': 'Switch person',
  'demo.switchPersonHint': 'Opens the list of demo people to choose another',
  'demo.lookAsGuest': 'Look around as a guest',
  'demo.lookAsGuestHint': 'Signs the demo person out and goes back to looking around without signing in',
  'demo.leave': 'Leave the demo',
  'demo.leaving': 'Leaving…',
  'demo.leaveHint': 'Ends the demo and goes back to Find your community',
  'demo.actionFailed': "We couldn't do that. Please try again.",

  // What a demo person cannot do
  'demo.limitNote': 'This is a demo, so changing the email, phone or password, deleting or deactivating the account, notifications and messages to the office are turned off.',
  'demo.pushOff': 'Notifications are turned off in the demo.',
  'demo.contactOff': 'The email, phone and password cannot be changed in the demo.',
  'demo.sendOff': 'Messages to the team are turned off in the demo. Nothing real is sent.',
  'demo.accountOff': 'The account cannot be changed or deleted in the demo.',
} as const;
