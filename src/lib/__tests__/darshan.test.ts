import { describe, expect, it } from '@jest/globals';

import { isSecureStreamUrl, pickDarshan } from '../darshan';

const row = (o: Partial<{ title: string; media_url: string | null; center_id: string | null; metadata: unknown }>) => ({
  title: 'Stream',
  media_url: 'https://rtsp.me/embed/FR8NYFzs/',
  center_id: 'c1',
  metadata: { stream_status: 'live' },
  ...o,
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
