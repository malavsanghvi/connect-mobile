import { describe, expect, it } from '@jest/globals';

import { translate } from '../../i18n';
import { audienceLabel, buildAnnouncements, type AnnouncementRow } from '../class-announcements';

const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('en', key, vars);

const CLASS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLASS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TERM = '22222222-2222-4222-8222-222222222222';

const classNames = new Map([
  [CLASS_A, 'Jainism 6'],
  [CLASS_B, 'Hindi 2'],
]);
const termNames = new Map([[TERM, 'Fall 2026']]);

function row(over: Partial<AnnouncementRow> & { id: string }): AnnouncementRow {
  return { title: 'Hello', body_md: 'Body', published_at: '2026-10-01T15:00:00+00:00', class_id: CLASS_A, term_id: TERM, ...over };
}

describe('buildAnnouncements', () => {
  it('lists the newest first, whatever order the rows come in', () => {
    const out = buildAnnouncements(
      [
        row({ id: 'old', published_at: '2026-09-01T10:00:00+00:00' }),
        row({ id: 'new', published_at: '2026-10-05T10:00:00+00:00' }),
        row({ id: 'mid', published_at: '2026-09-20T10:00:00+00:00' }),
      ],
      classNames,
      termNames,
    );
    expect(out.map((a) => a.id)).toEqual(['new', 'mid', 'old']);
  });

  it('orders by the moment, not by the text of the timestamp (offsets differ)', () => {
    const out = buildAnnouncements(
      [
        // 10:00 at -05:00 is 15:00 UTC: later than 14:00 UTC, though "10:00" sorts before "14:00" as text.
        row({ id: 'later', published_at: '2026-10-05T10:00:00-05:00' }),
        row({ id: 'earlier', published_at: '2026-10-05T14:00:00+00:00' }),
      ],
      classNames,
      termNames,
    );
    expect(out.map((a) => a.id)).toEqual(['later', 'earlier']);
  });

  it('keeps the incoming order for two published at the same moment, and puts an unreadable time last', () => {
    const out = buildAnnouncements(
      [row({ id: 'odd', published_at: 'not a time' }), row({ id: 'first' }), row({ id: 'second' })],
      classNames,
      termNames,
    );
    expect(out.map((a) => a.id)).toEqual(['first', 'second', 'odd']);
  });

  it('leaves out a draft (no publish time)', () => {
    const out = buildAnnouncements([row({ id: 'draft', published_at: null }), row({ id: 'live' })], classNames, termNames);
    expect(out.map((a) => a.id)).toEqual(['live']);
  });

  it('is for the class when it has one, even if it also names the term', () => {
    const [a] = buildAnnouncements([row({ id: '1', class_id: CLASS_B, term_id: TERM })], classNames, termNames);
    expect(a.audience).toEqual({ kind: 'class', className: 'Hindi 2' });
  });

  it('is for the whole term when it has no class, and carries the term name', () => {
    const [a] = buildAnnouncements([row({ id: '1', class_id: null, term_id: TERM })], classNames, termNames);
    expect(a.audience).toEqual({ kind: 'term', termName: 'Fall 2026' });
  });

  it('has no name when the database gave none (an unknown class or term)', () => {
    const out = buildAnnouncements([row({ id: 'c', class_id: 'gone' }), row({ id: 't', class_id: null, term_id: 'gone' }), row({ id: 'n', class_id: null, term_id: null })], classNames, termNames);
    expect(out.map((a) => a.audience)).toEqual([
      { kind: 'class', className: null },
      { kind: 'term', termName: null },
      { kind: 'term', termName: null },
    ]);
  });

  it('keeps the title and the line breaks of the message, with plain line ends and no stray space around it', () => {
    const [a] = buildAnnouncements([row({ id: '1', title: '  Jai Jinendra ', body_md: '\r\nLine one\r\n\r\nLine two\n  \n' })], classNames, termNames);
    expect(a.title).toBe('Jai Jinendra');
    expect(a.body).toBe('Line one\n\nLine two');
  });

  it('shows the text as plain text: markdown marks are not interpreted or stripped', () => {
    const [a] = buildAnnouncements([row({ id: '1', body_md: '**Bring** a <b>pencil</b>' })], classNames, termNames);
    expect(a.body).toBe('**Bring** a <b>pencil</b>');
  });

  it('reads nothing about who wrote it', () => {
    const [a] = buildAnnouncements([{ ...row({ id: '1' }), author_user: 'someone' } as AnnouncementRow], classNames, termNames);
    expect(Object.keys(a).sort()).toEqual(['audience', 'body', 'id', 'publishedAt', 'title']);
  });

  it('is empty for no rows', () => {
    expect(buildAnnouncements([], classNames, termNames)).toEqual([]);
  });
});

describe('audienceLabel', () => {
  it('is the class name for a class announcement', () => {
    expect(audienceLabel({ kind: 'class', className: 'Jainism 6' }, t)).toBe('Jainism 6');
  });
  it('says "All of Pathshala" for the whole term, with the term when it is known', () => {
    expect(audienceLabel({ kind: 'term', termName: null }, t)).toBe('All of Pathshala');
    expect(audienceLabel({ kind: 'term', termName: 'Fall 2026' }, t)).toBe('All of Pathshala · Fall 2026');
  });
  it('falls back to "Your class" when the class name is not known', () => {
    expect(audienceLabel({ kind: 'class', className: null }, t)).toBe('Your class');
  });
});

describe('the announcement strings', () => {
  it('name no community, tradition or organization', () => {
    const words = ['announce.title', 'announce.entrySub', 'announce.none', 'announce.noneBody', 'announce.all', 'announce.allTerm', 'announce.yourClass', 'announce.needMember', 'announce.posted'] as const;
    for (const key of words) expect(t(key)).not.toMatch(/jain|jsh|houston|jinendra|temple|derasar/i);
    expect(t('announce.none')).toBe('No announcements yet.');
  });
});
