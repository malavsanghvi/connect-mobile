/**
 * Chamber of commerce (key chamber_of_commerce): a member is a business, its people are the business's contacts, what a member
 * pays is dues and sponsorships. Built on the neutral words (./neutral.ts). The tab names ("Pay", "My business") and the greeting
 * come from the database's named words for the kind, not from here.
 *
 * Where the dictionary says "your family" the swaps below make it "your business" (also in the neutral words, which are
 * swapped before they are used), so only the lines that need more than that are written out.
 *
 * The wording of money (receipts and statements: a chamber's dues are not a charitable gift) is for the owner and the
 * accountant to confirm before a chamber goes live: the lines are marked MONEY.
 */
import type { Swap, WordSet } from '..';

import { NEUTRAL_EN } from './neutral';

/** A household is a member business (v1): "your family" reads "your business" wherever the dictionary says it. */
const CHAMBER_SWAPS: Swap[] = [
  { from: 'your family', to: 'your business' },
  { from: 'Your family', to: 'Your business' },
  { from: 'Family pledges', to: 'Business pledges' },
  { from: 'family pledges', to: 'business pledges' },
  { from: 'family account', to: 'business account' },
  { from: 'family record', to: 'business record' },
  { from: 'family profile', to: 'business profile' },
  { from: 'adult family members', to: 'adult contacts' },
  { from: 'Family members', to: 'Contacts' },
  { from: 'family members', to: 'contacts' },
  { from: 'Family member', to: 'Contact' },
  { from: 'family member', to: 'contact' },
  { from: 'other families', to: 'other businesses' },
  { from: 'families nearby', to: 'businesses nearby' },
  { from: 'the family', to: 'the business' },
];

export const CHAMBER_WORDS: WordSet = {
  en: {
    ...NEUTRAL_EN,
    // Home and the menu
    'home.guestBody': 'Sign in to RSVP, pay your dues and stay connected.',
    'drawer.donations': 'My payments',
    'family.signIn': 'Sign in to see your business, member cards and contacts.',
    'settings.profileFamily': 'Profile and business',
    'settings.profileFamilySub': 'Business name, contact details, the people at your business',
    'opp.showName': "Show our business's name with this sponsorship",

    // Dues and sponsorships (the Pay tab)
    'give.signIn': 'Sign in to see your dues, pledges and payments.',
    'give.heroTitle': "Your business's payments in {year}",
    'give.opportunities': 'Sponsorship opportunities',
    'give.noOpportunities': 'No open sponsorship opportunities right now.',
    'pledges.footer': 'Shows pledges for everyone at your business.',

    // MONEY: receipts and statements (a chamber's dues are not a charitable gift). Owner and accountant to confirm.
    'give.heroSub': 'Annual statement ready in January',
    'opp.footnote': 'Pledges appear in Business pledges · pay anytime · receipt on payment',
    'paid.body': 'Your {amount} payment is received.\nA receipt is on its way to your email.',
    'settings.receipts': 'Receipts and statements',
  },
  swap: CHAMBER_SWAPS,
};
