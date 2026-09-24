import { describe, expect, it } from '@jest/globals';

import { familyCircleRecipient, notificationTarget, registerNotificationRoute } from '../notification-routes';

describe('notification routes', () => {
  it('opens the Saathi tab for family-circle pushes', () => {
    expect(notificationTarget({ type: 'family_circle', person_id: 'p1' })).toEqual({ pathname: '/jain-way', params: { tab: 'saathi', person: 'p1' } });
    expect(notificationTarget({ type: 'family_circle' })).toEqual({ pathname: '/jain-way', params: { tab: 'saathi' } });
  });
  it('ignores unknown or malformed payloads', () => {
    expect(notificationTarget({ type: 'nope' })).toBeNull();
    expect(notificationTarget(null)).toBeNull();
    expect(notificationTarget(['family_circle'])).toBeNull();
  });
  it('lets features register their own routes', () => {
    registerNotificationRoute('survey_test', { open: (d) => ({ pathname: '/survey/[id]', params: { id: String(d.survey_id) } }) });
    expect(notificationTarget({ type: 'survey_test', survey_id: 's1' })).toEqual({ pathname: '/survey/[id]', params: { id: 's1' } });
  });
  it('reads the anumodana recipient', () => {
    expect(familyCircleRecipient({ type: 'family_circle', person_id: 'p1', person_name: 'Anya' })).toEqual({ personId: 'p1', name: 'Anya' });
    expect(familyCircleRecipient({ type: 'family_circle' })).toBeNull();
    expect(familyCircleRecipient({ type: 'other', person_id: 'p1' })).toBeNull();
  });
});
