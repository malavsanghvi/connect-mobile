import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

/**
 * Which release the member is running. `version` is app.json's version: it is bumped for every release (see
 * CHANGELOG.md), and because the running update carries its own app.json it changes when an over-the-air update is
 * downloaded, not only when a new build is installed. `build` is the installed build's number; `update` is the short
 * id of the over-the-air update in use (none when the build's own bundle runs).
 */
export type Release = { version: string; build: string; update: string | null; channel: string | null };

export function describeRelease(input: { version?: string | null; nativeBuild?: string | null; updateId?: string | null; channel?: string | null; isEmbeddedLaunch?: boolean }): Release {
  return {
    version: input.version?.trim() || '1.0.0',
    build: input.nativeBuild?.trim() || '1',
    update: input.updateId && !input.isEmbeddedLaunch ? input.updateId.slice(0, 8) : null,
    channel: input.channel?.trim() || null,
  };
}

export function currentRelease(): Release {
  let channel: string | null = null;
  let updateId: string | null = null;
  let embedded = true;
  try {
    channel = Updates.channel ?? null;
    updateId = Updates.updateId ?? null;
    embedded = Updates.isEmbeddedLaunch;
  } catch (err) {
    // Updates are not available here (web, Expo Go): the build's own bundle is what runs.
    console.warn('expo-updates is not available; showing the build version only:', err);
  }
  return describeRelease({ version: Constants.expoConfig?.version, nativeBuild: Constants.nativeBuildVersion, updateId, channel, isEmbeddedLaunch: embedded });
}

/** "1.1.0 (build 12) · update 4f3a21c0 · preview" */
export function releaseLabel(r: Release): string {
  return [`${r.version} (build ${r.build})`, r.update ? `update ${r.update}` : null, r.channel].filter(Boolean).join(' · ');
}
