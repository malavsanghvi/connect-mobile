import { describe, expect, it } from '@jest/globals';

import { en } from '../../i18n/en';
import { translate, type Translate } from '../../i18n';
import {
  canReport,
  claimStateWords,
  claimTone,
  CLAIM_STATES,
  cleanEmployer,
  countWords,
  deadlineLine,
  entryLine,
  giftLine,
  hasSteps,
  httpsUrl,
  isClaimState,
  matchAvailability,
  MAX_EMPLOYER_CHARS,
  parseEmployerAnswer,
  parseMatchCard,
  parseReported,
  reportedWords,
  showsMatchEntry,
  typicalDaysLine,
  whoSubmitsWords,
  type MatchCard,
} from '../match';

const t: Translate = (key, vars) => translate('en', key, vars);

const PROGRAM = { id: 'pg1', company_name: 'Acme Corp', portal: 'Benevity', portal_url: 'https://acme.benevity.org/donate', deadline_note: 'Within 90 days of the gift' };
const PROCESS = {
  summary: 'Acme matches gifts one to one through its giving portal.',
  who_submits: 'member',
  steps: ['Sign in to the giving portal.', 'Choose your organization by its registered name and tax ID.', 'Enter the date of your gift.'],
  documents: ['Your receipt'],
  links: [
    { label: 'Acme giving portal', url: 'https://acme.benevity.org' },
    { label: 'Not safe', url: 'http://acme.example/plain' },
    { label: 'Worse', url: 'javascript:alert(1)' },
  ],
  typical_days: 14,
  tips: 'Ask early in the year.',
};
const ORG = { name: 'Riverbend Community', legal_name: 'Riverbend Community Association Inc.', ein: '12-3456789' };

/** What `app.my_match_card` answers for a member with an employer on file, steps in the library, two gifts and two requests. */
const FULL = {
  employer: 'Acme Corp',
  source: 'member',
  consented_at: '2026-10-01T10:00:00Z',
  withdrawn_at: null,
  suggestion: null,
  is_adult: true,
  matching_on: true,
  program: PROGRAM,
  process: PROCESS,
  org: ORG,
  gifts: [
    { received_on: '2026-10-03', deadline_on: '2026-11-30' },
    { received_on: '2026-09-12', deadline_on: null },
  ],
  claims: [
    { id: 'c1', state: 'requested', state_at: '2026-10-10T12:00:00Z', company_name: 'Acme Corp', received_on: '2026-08-20', deadline_on: '2026-11-18', reported_by_member: true, can_undo: true },
    { id: 'c2', state: 'received', state_at: '2026-09-30T12:00:00Z', company_name: 'Acme Corp', received_on: '2026-07-04', deadline_on: null, reported_by_member: false, can_undo: false },
  ],
  today: '2026-10-17',
};

function card(over: Record<string, unknown> = {}): MatchCard {
  const parsed = parseMatchCard({ ...FULL, ...over });
  if (!parsed) throw new Error('fixture is not a card');
  return parsed;
}

describe('reading the card the database sends', () => {
  it('reads a whole card', () => {
    const c = card();
    expect(c.employer).toBe('Acme Corp');
    expect(c.source).toBe('member');
    expect(c.isAdult).toBe(true);
    expect(c.matchingOn).toBe(true);
    expect(c.program).toEqual({ id: 'pg1', companyName: 'Acme Corp', portal: 'Benevity', portalUrl: 'https://acme.benevity.org/donate', deadlineNote: 'Within 90 days of the gift' });
    expect(c.process?.whoSubmits).toBe('member');
    expect(c.process?.steps).toHaveLength(3);
    expect(c.process?.documents).toEqual(['Your receipt']);
    expect(c.process?.typicalDays).toBe(14);
    expect(c.process?.tips).toBe('Ask early in the year.');
    expect(c.org).toEqual({ name: 'Riverbend Community', legalName: 'Riverbend Community Association Inc.', ein: '12-3456789' });
    expect(c.gifts).toEqual([
      { receivedOn: '2026-10-03', deadlineOn: '2026-11-30' },
      { receivedOn: '2026-09-12', deadlineOn: null },
    ]);
    expect(c.claims.map((x) => [x.id, x.state, x.canUndo, x.reportedByMember])).toEqual([
      ['c1', 'requested', true, true],
      ['c2', 'received', false, false],
    ]);
    expect(c.today).toBe('2026-10-17');
    expect(c.skippedClaims).toBe(0);
  });

  it('is not a card when the answer is not an object', () => {
    for (const bad of [null, undefined, 'card', 7, true, [], [FULL]]) expect([bad, parseMatchCard(bad)]).toEqual([bad, null]);
  });

  it('turns an empty object into a card that shows nothing: not an adult, not on, no lists', () => {
    expect(parseMatchCard({})).toEqual({
      employer: null,
      source: null,
      consentedAt: null,
      withdrawnAt: null,
      suggestion: null,
      isAdult: false,
      matchingOn: false,
      program: null,
      process: null,
      org: null,
      gifts: [],
      claims: [],
      skippedClaims: 0,
      today: null,
    });
    const c = card({ is_adult: 'yes', matching_on: 1 });
    expect([c.isAdult, c.matchingOn]).toEqual([false, false]);
  });

  it('shows what the database says when only some fields come: nothing else is invented', () => {
    const c = parseMatchCard({ is_adult: true, matching_on: true, employer: '  Globex  ', suggestion: '' });
    expect(c).toMatchObject({ isAdult: true, matchingOn: true, employer: 'Globex', suggestion: null, gifts: [], claims: [], process: null, program: null, org: null });
  });

  it('survives odd JSON in every field without throwing', () => {
    const odd = [
      { employer: 42, source: 'robot', claims: 'oops', gifts: { a: 1 }, process: 'steps', program: [], org: 5, today: 20261017 },
      { employer: { name: 'x' }, claims: [null, 3, 'c', [], {}], gifts: [null, 5, 'x', [], {}, { received_on: 'nope' }], process: { steps: 'one', links: 'none', documents: 7 } },
      { process: { steps: [1, null, '', '  '], links: [null, 4, {}, { url: 7 }], typical_days: 'soon' }, program: { id: 1, company_name: null } },
      { org: { name: 5, legal_name: null, ein: 9 }, program: { id: 'p', company_name: 'X', portal_url: 'ftp://x' } },
    ];
    for (const raw of odd) {
      const c = parseMatchCard(raw);
      expect(c).not.toBeNull();
      expect(c?.gifts).toEqual([]);
      expect(c?.claims).toEqual([]);
      expect(c?.process).toBeNull();
    }
    expect(parseMatchCard({ org: { name: 5, legal_name: null, ein: 9 } })?.org).toBeNull();
    expect(parseMatchCard({ program: { id: 'p', company_name: 'X', portal_url: 'ftp://x' } })?.program).toEqual({ id: 'p', companyName: 'X', portal: null, portalUrl: null, deadlineNote: null });
  });

  it('keeps a request in a state it does not know out of the list and counts it', () => {
    const c = card({
      claims: [
        { id: 'c1', state: 'requested', company_name: 'Acme', received_on: '2026-08-20' },
        { id: 'c2', state: 'paid_in_full', company_name: 'Acme', received_on: '2026-08-21' },
        { state: 'asked' },
        'junk',
      ],
    });
    expect(c.claims.map((x) => x.id)).toEqual(['c1']);
    expect(c.skippedClaims).toBe(3);
  });

  it('reads days: a timestamp is cut to its day, a bad day is nothing, a bad gift is left out', () => {
    const c = card({
      gifts: [
        { received_on: '2026-10-03T00:00:00+00:00', deadline_on: '2026-11-30T00:00:00Z' },
        { received_on: '2026-13-40', deadline_on: '2026-11-30' },
        { received_on: '2026-10-04', deadline_on: 'soon' },
      ],
      today: 'today',
    });
    expect(c.gifts).toEqual([
      { receivedOn: '2026-10-03', deadlineOn: '2026-11-30' },
      { receivedOn: '2026-10-04', deadlineOn: null },
    ]);
    expect(c.today).toBeNull();
  });

  it('has no steps when the library has none, and treats a process with no steps as none', () => {
    expect(card({ process: null }).process).toBeNull();
    expect(card({ process: { summary: 'x', who_submits: 'member', steps: [] } }).process).toBeNull();
    expect(card({ process: { summary: 'x', who_submits: 'member', steps: ['  ', 3] } }).process).toBeNull();
  });

  it('leaves out a link that is not https, keeps the rest, and names a link by its address when it has no label', () => {
    const c = card({ process: { ...PROCESS, links: [...PROCESS.links, { url: 'https://acme.example/a' }, { label: 'Portal', url: 'HTTPS://Acme.Example/b' }] } });
    expect(c.process?.links).toEqual([
      { label: 'Acme giving portal', url: 'https://acme.benevity.org' },
      { label: 'https://acme.example/a', url: 'https://acme.example/a' },
      { label: 'Portal', url: 'HTTPS://Acme.Example/b' },
    ]);
    expect(card({ program: { ...PROGRAM, portal_url: 'http://acme.example' } }).program?.portalUrl).toBeNull();
  });

  it('knows who makes the request, and ignores a value it was never taught', () => {
    for (const who of ['member', 'organization', 'either']) expect(card({ process: { ...PROCESS, who_submits: who } }).process?.whoSubmits).toBe(who);
    expect(card({ process: { ...PROCESS, who_submits: 'someone' } }).process?.whoSubmits).toBeNull();
  });

  it('takes typical days only as a whole number of at least one', () => {
    expect(card({ process: { ...PROCESS, typical_days: 30 } }).process?.typicalDays).toBe(30);
    for (const bad of [0, -3, 1.5, '14', null]) expect([bad, card({ process: { ...PROCESS, typical_days: bad } }).process?.typicalDays]).toEqual([bad, null]);
  });

  it('reads the answers of set_my_match_employer and report_my_match_request', () => {
    expect(parseEmployerAnswer({ employer: 'Acme Corp', is_adult: true })).toBe('Acme Corp');
    for (const bad of [null, {}, { employer: null }, { employer: '  ' }, 'Acme', []]) expect([bad, parseEmployerAnswer(bad)]).toEqual([bad, null]);
    expect(parseReported({ requested: 2 })).toBe(2);
    for (const bad of [null, {}, { requested: 0 }, { requested: -1 }, { requested: 1.5 }, { requested: '2' }, 2]) expect([bad, parseReported(bad)]).toEqual([bad, null]);
  });

  it('carries no amount: nothing in the card type or the fixture reads money', () => {
    const keys = JSON.stringify(Object.keys(card()));
    expect(keys).not.toMatch(/amount|cents|dollar/i);
    expect(JSON.stringify(card())).not.toMatch(/amount|cents/i);
  });
});

describe('links the app may open', () => {
  it('opens https only', () => {
    expect(httpsUrl('https://acme.benevity.org/donate?x=1#top')).toBe('https://acme.benevity.org/donate?x=1#top');
    expect(httpsUrl('  https://example.com  ')).toBe('https://example.com');
    expect(httpsUrl('HTTPS://Example.com:8443/a')).toBe('HTTPS://Example.com:8443/a');
  });
  it('turns away everything else', () => {
    for (const bad of [
      'http://example.com',
      'javascript:alert(1)',
      'data:text/html,<b>x</b>',
      'mailto:hr@example.com',
      'ftp://example.com',
      'file:///etc/passwd',
      '//example.com',
      'example.com',
      'https://',
      'https:///path',
      'https://example',
      'https://exa mple.com',
      'https://example.com/a b',
      'https://user@example.com',
      'https://user:pass@example.com',
      'https://trusted.com@evil.example/path',
      'https://-.',
      '',
      '   ',
      null,
      undefined,
      42,
      {},
    ]) {
      expect([bad, httpsUrl(bad)]).toEqual([bad, null]);
    }
    expect(httpsUrl(`https://example.com/${'a'.repeat(2100)}`)).toBeNull();
  });
});

describe('what the screen shows', () => {
  it('shows the feature to an adult where it is on, nothing to a child, and "not available" where it is off', () => {
    expect(matchAvailability({ isAdult: true, matchingOn: true })).toBe('ready');
    expect(matchAvailability({ isAdult: true, matchingOn: false })).toBe('off');
    expect(matchAvailability({ isAdult: false, matchingOn: true })).toBe('child');
    expect(matchAvailability({ isAdult: false, matchingOn: false })).toBe('child');
    expect(showsMatchEntry({ isAdult: true, matchingOn: true })).toBe(true);
    for (const c of [{ isAdult: false, matchingOn: true }, { isAdult: true, matchingOn: false }, null, undefined]) expect([c, showsMatchEntry(c)]).toEqual([c, false]);
  });

  it('offers "I have asked my employer" only with the steps on screen and a gift that can still be claimed', () => {
    expect(hasSteps(card())).toBe(true);
    expect(canReport(card())).toBe(true);
    expect(canReport(card({ gifts: [] }))).toBe(false);
    expect(canReport(card({ process: null }))).toBe(false);
    expect(canReport(card({ employer: null }))).toBe(false);
    expect(hasSteps(card({ process: null }))).toBe(false);
  });

  it('tidies the employer the member typed, and says why it cannot be added', () => {
    expect(cleanEmployer('  Acme   Corp \n')).toEqual({ ok: true, employer: 'Acme Corp' });
    expect(cleanEmployer('')).toEqual({ ok: false, problem: 'empty' });
    expect(cleanEmployer(' \t\n ')).toEqual({ ok: false, problem: 'empty' });
    expect(cleanEmployer('x'.repeat(MAX_EMPLOYER_CHARS))).toEqual({ ok: true, employer: 'x'.repeat(MAX_EMPLOYER_CHARS) });
    expect(cleanEmployer('x'.repeat(MAX_EMPLOYER_CHARS + 1))).toEqual({ ok: false, problem: 'long' });
  });
});

describe('the words', () => {
  it('says each state of a request in the member\'s own words', () => {
    expect(claimStateWords(t, 'asked')).toBe('Waiting for you to ask your employer');
    expect(claimStateWords(t, 'requested')).toBe('You said you asked your employer');
    expect(claimStateWords(t, 'verified')).toBe("Your organization saw it in your employer's portal");
    expect(claimStateWords(t, 'received')).toBe('Your employer paid the match to your organization. Thank you');
    expect(claimStateWords(t, 'declined')).toBe('Your employer declined');
    expect(claimStateWords(t, 'expired')).toBe('The deadline has passed');
    expect(claimStateWords(t, 'withdrawn')).toBe('Withdrawn');
  });

  it('has words and a tone for every state the database can send, and recognises exactly those', () => {
    expect([...CLAIM_STATES]).toEqual(['asked', 'requested', 'verified', 'received', 'declined', 'expired', 'withdrawn']);
    for (const s of CLAIM_STATES) {
      expect(isClaimState(s)).toBe(true);
      expect(claimStateWords(t, s)).not.toBe(`matching.state.${s}`);
      expect(['amber', 'navy', 'green', 'grey', 'red']).toContain(claimTone(s));
    }
    for (const bad of ['paid', '', null, 3, 'Asked']) expect([bad, isClaimState(bad)]).toEqual([bad, false]);
    expect(claimTone('received')).toBe('green');
    expect(claimTone('asked')).toBe('amber');
    expect(claimTone('declined')).toBe('red');
  });

  it('says who makes the request', () => {
    expect(whoSubmitsWords(t, 'member')).toBe('You make the request with your employer.');
    expect(whoSubmitsWords(t, 'organization')).toBe('Your organization makes the request with your employer.');
    expect(whoSubmitsWords(t, 'either')).toBe('You or your organization can make the request with your employer.');
  });

  it('counts typical days, one or many, and says nothing when the library does not', () => {
    expect(typicalDaysLine(t, 14)).toBe('Usually takes about 14 days.');
    expect(typicalDaysLine(t, 1)).toBe('Usually takes about 1 day.');
    expect(typicalDaysLine(t, null)).toBeNull();
    expect(typicalDaysLine(t, 0)).toBeNull();
  });

  it('names a gift by its day', () => {
    expect(giftLine(t, '2026-10-03')).toBe('Your gift of Oct 3, 2026');
    expect(giftLine(t, null)).toBe('Your gift');
    expect(giftLine(t, 'junk')).toBe('Your gift');
  });

  it('counts the days left to ask from the community\'s own today', () => {
    expect(deadlineLine(t, '2026-11-30', '2026-10-17')).toBe('Last day to ask: Nov 30, 2026 · 44 days left');
    expect(deadlineLine(t, '2026-10-18', '2026-10-17')).toBe('Last day to ask: Oct 18, 2026 · 1 day left');
    expect(deadlineLine(t, '2026-10-17', '2026-10-17')).toBe('Last day to ask: today, Oct 17, 2026');
    expect(deadlineLine(t, '2026-10-16', '2026-10-17')).toBe('The last day to ask was Oct 16, 2026');
    expect(deadlineLine(t, '2027-01-03', '2026-12-31')).toBe('Last day to ask: Jan 3, 2027 · 3 days left');
  });

  it('shows the date alone when it does not know today, and nothing when there is no last day', () => {
    expect(deadlineLine(t, '2026-11-30', null)).toBe('Last day to ask: Nov 30, 2026');
    expect(deadlineLine(t, '2026-11-30', 'not a day')).toBe('Last day to ask: Nov 30, 2026');
    expect(deadlineLine(t, null, '2026-10-17')).toBeNull();
    expect(deadlineLine(t, 'junk', '2026-10-17')).toBeNull();
  });

  it('thanks the member and counts the gifts marked as asked', () => {
    expect(reportedWords(t, 1)).toBe('Thank you. 1 gift was marked as asked.');
    expect(reportedWords(t, 3)).toBe('Thank you. 3 gifts were marked as asked.');
    expect(countWords(t, 1, 'matching.entry.claims.one', 'matching.entry.claims.many')).toBe('1 request. See where it stands.');
  });

  it('tells the entry card\'s story: no employer, gifts to claim, requests, or only the employer', () => {
    expect(entryLine(t, card({ employer: null }))).toBe('Many employers match donations. Add yours to see how to ask.');
    expect(entryLine(t, card())).toBe('2 gifts can still be claimed. See how to ask.');
    expect(entryLine(t, card({ gifts: [{ received_on: '2026-10-03', deadline_on: null }] }))).toBe('1 gift can still be claimed. See how to ask.');
    expect(entryLine(t, card({ gifts: [] }))).toBe('2 requests. See where they stand.');
    expect(entryLine(t, card({ gifts: [], claims: [{ id: 'c1', state: 'asked' }] }))).toBe('1 request. See where it stands.');
    expect(entryLine(t, card({ gifts: [], claims: [] }))).toBe('Acme Corp. See how to ask for a match.');
    // Without steps there is nothing to claim yet, whatever gifts the card lists.
    expect(entryLine(t, card({ process: null, claims: [] }))).toBe('Acme Corp. See how to ask for a match.');
  });

  it('keeps every word of the feature plain: no exclamation mark, no tradition word, no amount', () => {
    const own = Object.entries(en).filter(([key]) => key.startsWith('matching.'));
    expect(own.length).toBeGreaterThan(80);
    for (const [key, text] of own) {
      expect([key, text.includes('!')]).toEqual([key, false]);
      expect([key, /\$|dollar|amount|cents/i.test(text)]).toEqual([key, false]);
      expect([key, /\b(bid|jain|boli|labh|pathshala|seva|puja|temple|derasar)\b/i.test(text)]).toEqual([key, false]);
    }
  });
});
