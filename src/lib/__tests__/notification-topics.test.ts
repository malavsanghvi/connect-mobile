import { describe, expect, it } from '@jest/globals';

import { topicHasSender } from '../notification-topics';

// connect-crm 0598: notification_topics.has_sender is false for a topic nothing sends (timings, My Jain Way reminders,
// family celebrations, newsletters, alerts, account). The app lists only the topics that do something.
describe('notification topics', () => {
  const topics = [
    { key: 'events', has_sender: true },
    { key: 'giving', has_sender: true },
    { key: 'pathshala', has_sender: true },
    { key: 'store', has_sender: true },
    { key: 'timings', has_sender: false },
    { key: 'jain_way', has_sender: false },
    { key: 'family', has_sender: false },
    { key: 'newsletter', has_sender: false },
    { key: 'alerts', has_sender: false },
    { key: 'account', has_sender: false },
  ];

  it('shows the topics that have a sender and hides the ones that do not', () => {
    expect(topics.filter(topicHasSender).map((t) => t.key)).toEqual(['events', 'giving', 'pathshala', 'store']);
  });

  it('shows every topic when the portal does not say (an older portal sends no such column)', () => {
    expect(topicHasSender({ key: 'timings' })).toBe(true);
    expect(topicHasSender({ key: 'timings', has_sender: null })).toBe(true);
    expect(topicHasSender({ key: 'timings', has_sender: undefined })).toBe(true);
  });

  it('hides a topic only when the portal says false', () => {
    expect(topicHasSender({ key: 'family', has_sender: false })).toBe(false);
    expect(topicHasSender({ key: 'family', has_sender: true })).toBe(true);
  });
});
