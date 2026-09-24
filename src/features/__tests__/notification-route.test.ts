import { describe, expect, it } from '@jest/globals';

import { notificationPath } from '../notification-route';

describe('notification tap routing', () => {
  it('opens the labh screen for a special-day reminder', () => {
    expect(notificationPath({ special_day_id: '3f2a1c9d-0000-4000-8000-000000000001' })).toBe('/labh/3f2a1c9d-0000-4000-8000-000000000001');
  });
  it('opens safe in-app paths only', () => {
    expect(notificationPath({ path: '/event/abc' })).toBe('/event/abc');
    expect(notificationPath({ path: '//evil.example' })).toBeNull();
    expect(notificationPath({ path: 'https://evil.example' })).toBeNull();
    expect(notificationPath(null)).toBeNull();
  });
});
