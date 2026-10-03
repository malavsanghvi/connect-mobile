import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Platform, Share } from 'react-native';

import { copyText } from '../clipboard';
import { AppError } from '../errors';

const realNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
}

afterEach(() => {
  jest.restoreAllMocks();
  if (realNavigator) Object.defineProperty(globalThis, 'navigator', realNavigator);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

describe('copying the Zelle address', () => {
  it('opens the share sheet on a phone, and says only that (its Copy action does the copying)', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
    await expect(copyText('give@jsh.example')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ message: 'give@jsh.example' });
  });

  it('says nothing was done when the sheet is closed', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction });
    await expect(copyText('give@jsh.example')).resolves.toBe('dismissed');
  });

  it('fails in plain English when the sheet cannot open', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no activity'));
    const err = await copyText('give@jsh.example').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toBe("We couldn't copy it from here. Press and hold the text to copy it yourself.");
  });

  it('uses the browser clipboard on the web', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    const writeText = jest.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    setNavigator({ clipboard: { writeText } });
    await expect(copyText('give@jsh.example')).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith('give@jsh.example');
  });

  it('says so, and does not claim it copied, when the browser refuses', async () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    setNavigator({ clipboard: { writeText: jest.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('blocked')) } });
    const err = await copyText('give@jsh.example').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).userMessage).toMatch(/couldn't copy it/);
  });
});
