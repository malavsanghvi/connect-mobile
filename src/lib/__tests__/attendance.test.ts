import { describe, expect, it } from '@jest/globals';

import { parseAttendanceQr } from '../rules';

const SESSION = '3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b';

describe('Pathshala attendance QR', () => {
  it('reads the session and token from the class code', () => {
    expect(parseAttendanceQr(`connect:pathshala-attendance?session=${SESSION}&token=abc123`)).toEqual({ session: SESSION, token: 'abc123' });
  });
  it('keeps "=" inside the token and decodes escapes', () => {
    expect(parseAttendanceQr(`connect:pathshala-attendance?token=a%2Fb%3D%3D&session=${SESSION}`)).toEqual({ session: SESSION, token: 'a/b==' });
    expect(parseAttendanceQr(`  connect:pathshala-attendance?session=${SESSION}&token=x==  `)).toEqual({ session: SESSION, token: 'x==' });
  });
  it('rejects anything that is not a class code', () => {
    expect(parseAttendanceQr('JSH-10421')).toBeNull();
    expect(parseAttendanceQr(`connect:pathshala-attendance?session=not-a-uuid&token=abc`)).toBeNull();
    expect(parseAttendanceQr(`connect:pathshala-attendance?session=${SESSION}`)).toBeNull();
    expect(parseAttendanceQr('https://example.com/?session=x&token=y')).toBeNull();
  });
});
