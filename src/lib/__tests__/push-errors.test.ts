import { describe, expect, it } from '@jest/globals';

import { AppError } from '../errors';
import { explainPushTokenError } from '../push-errors';

describe('explainPushTokenError', () => {
  it('says plainly that a build without Firebase cannot receive notifications', () => {
    const e = explainPushTokenError(new Error('Default FirebaseApp is not initialized in this process org.connectplatform.member.'));
    expect(e).toBeInstanceOf(AppError);
    expect(e.code).toBe('push_not_built');
    expect(e.userMessage).toBe('This copy of the app was installed without notification support. Install the latest Weaver app to receive notifications.');
    expect(e.detail).toContain('FirebaseApp');
  });

  it('recognises the other wordings of the same cause', () => {
    for (const m of ['FCM token registration failed', 'google-services.json is missing', 'MISSING_INSTANCEID_SERVICE senderId']) {
      expect(explainPushTokenError(new Error(m)).code).toBe('push_not_built');
    }
  });

  it('asks for Google Play services when the phone has none', () => {
    const e = explainPushTokenError(new Error('SERVICE_NOT_AVAILABLE'));
    expect(e.code).toBe('push_play_services');
    expect(e.userMessage).toContain('Google Play services');
  });

  it('says when the notification service could not be reached', () => {
    for (const m of ['Network request failed', 'timeout of 10000ms exceeded', 'Unable to resolve host exp.host']) {
      expect(explainPushTokenError(new Error(m)).code).toBe('push_network');
    }
  });

  it('keeps the generic sentence, with the detail logged, for anything else, and accepts non-Error values', () => {
    const e = explainPushTokenError('boom');
    expect(e.code).toBe('push_token');
    expect(e.userMessage).toBe('Something went wrong while trying to register this phone for notifications. Please try again.');
    expect(e.detail).toBe('boom');
  });

  it('never shows the technical detail to the member', () => {
    const e = explainPushTokenError(new Error('Default FirebaseApp is not initialized'));
    expect(e.userMessage).not.toMatch(/FirebaseApp|exception|initialized/i);
  });
});
