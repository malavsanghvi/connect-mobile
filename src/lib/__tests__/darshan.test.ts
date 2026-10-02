import { describe, expect, it } from '@jest/globals';

import { darshanDoorVisible, isSecureStreamUrl, pickDarshan } from '../darshan';

const row = (o: Partial<{ title: string; media_url: string | null; center_id: string | null; metadata: unknown }>) => ({
  title: 'Stream',
  media_url: 'https://rtsp.me/embed/FR8NYFzs/',
  center_id: 'c1',
  metadata: { stream_status: 'live' },
  ...o,
});

describe("Home's Watch live darshan button", () => {
  it('shows when the person may use Live darshan and there is a stream or an aarti time', () => {
    expect(darshanDoorVisible(true, true, null)).toBe(true);
    expect(darshanDoorVisible(true, false, '7:30 AM')).toBe(true);
    expect(darshanDoorVisible(true, true, '7:30 AM')).toBe(true);
  });
  it('is left out for a community with no darshan set up at all', () => {
    expect(darshanDoorVisible(true, false, null)).toBe(false);
    expect(darshanDoorVisible(true, false, '')).toBe(false);
  });
  it('is left out for someone the organization keeps it from', () => {
    expect(darshanDoorVisible(false, true, '7:30 AM')).toBe(false);
    expect(darshanDoorVisible(false, false, null)).toBe(false);
  });
});

describe('live darshan', () => {
  it('only opens secure links', () => {
    expect(isSecureStreamUrl('https://rtsp.me/embed/FR8NYFzs/')).toBe(true);
    expect(isSecureStreamUrl('http://rtsp.me/embed/x/')).toBe(false);
    expect(isSecureStreamUrl('javascript:alert(1)')).toBe(false);
    expect(isSecureStreamUrl(null)).toBe(false);
  });
  it("prefers the organization's own live stream and skips switched-off or insecure ones", () => {
    expect(pickDarshan([], 'c1')).toBeNull();
    expect(
      pickDarshan(
        [
          row({ title: 'Shared', center_id: null }),
          row({ title: 'Idle', metadata: { stream_status: 'idle' } }),
          row({ title: 'Ours', metadata: { stream_status: 'live', schedule: '24 hours' } }),
        ],
        'c1',
      ),
    ).toEqual({ title: 'Ours', url: 'https://rtsp.me/embed/FR8NYFzs/', live: true, schedule: '24 hours' });
    expect(pickDarshan([row({ metadata: { stream_status: 'off' } }), row({ title: 'Plain', media_url: 'http://x/y' })], 'c1')).toBeNull();
    expect(pickDarshan([row({ title: 'Idle', metadata: {} })], 'c1')).toMatchObject({ title: 'Idle', live: false });
  });
});
