import { describe, expect, it } from '@jest/globals';

import { formatMemberCustomValue } from '../custom-fields';

describe('formatMemberCustomValue', () => {
  it('reads each type the way a member expects', () => {
    expect(formatMemberCustomValue('boolean', true)).toBe('Yes');
    expect(formatMemberCustomValue('boolean', false, 'હા', 'ના')).toBe('ના');
    expect(formatMemberCustomValue('date', '2024-03-01')).toBe('03/01/2024');
    expect(formatMemberCustomValue('money', 150000)).toContain('1,500');
    expect(formatMemberCustomValue('text', 'Gold')).toBe('Gold');
    expect(formatMemberCustomValue('text', null)).toBe('');
  });
});
