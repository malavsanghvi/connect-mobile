import type { ReactNode } from 'react';

import { Banner } from '@/components/ui';
import { demoAllows, type DemoLimited } from '@/lib/demo';
import { useDemo } from '@/providers/demo';
import { useT } from '@/providers/settings';
import type { StringKey } from '@/i18n';

/** May this be done right now? Always outside a demo; never, for the limited actions, inside one (src/lib/demo.ts DEMO_LIMITED). */
export function useDemoAllows(action: DemoLimited): boolean {
  return demoAllows(useDemo().active, action);
}

/** Shows what it wraps only where `action` is allowed: in a demo, the screen simply does not offer it. */
export function HiddenInDemo({ action, children }: { action: DemoLimited; children: ReactNode }) {
  return useDemoAllows(action) ? <>{children}</> : null;
}

/** The plain sentence that says why, shown in a demo only. */
export function DemoNote({ messageKey }: { messageKey: StringKey }) {
  const t = useT();
  if (!useDemo().active) return null;
  return <Banner tone="info" message={t(messageKey)} />;
}
