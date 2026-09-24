import { useEffect, useState, type ReactNode } from 'react';

import { authenticate, biometricSupport, readBiometricOptIn } from '@/lib/biometrics';
import { report } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';

import { FullScreen, FullScreenLoading } from './full-screen';
import { CenterMark } from './screen';
import { Banner, Button, Txt } from './ui';

type GateState = { phase: 'checking' } | { phase: 'open' } | { phase: 'locked'; label: string };

/**
 * When the member opted in to Face ID / fingerprint, the app stays locked at
 * launch until the device confirms it is them. The Supabase session itself is
 * in the Keychain/Keystore either way.
 */
export function BiometricGate({ active, children }: { active: boolean; children: ReactNode }) {
  const t = useT();
  const { signOut } = useApp();
  const [state, setState] = useState<GateState>({ phase: 'checking' });
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const optedIn = await readBiometricOptIn();
      if (!optedIn) return { phase: 'open' } as GateState;
      const support = await biometricSupport();
      return support.available ? ({ phase: 'locked', label: support.label } as GateState) : ({ phase: 'open' } as GateState);
    })().then((next) => alive && setState(next));
    return () => {
      alive = false;
    };
  }, []);

  if (!active || state.phase === 'open') return <>{children}</>;
  if (state.phase === 'checking') return <FullScreenLoading />;

  const unlock = async () => {
    setBusy(true);
    setMessage(null);
    const res = await authenticate(state.label);
    setBusy(false);
    if (res.ok) setState({ phase: 'open' });
    else setMessage(res.message);
  };

  return (
    <FullScreen>
      <CenterMark size={64} />
      <Txt variant="display" color="navy" accessibilityRole="header">
        {t('lock.title')}
      </Txt>
      <Txt variant="body" color="ink2">
        {t('lock.body', { method: state.label })}
      </Txt>
      {message ? <Banner tone="error" message={message} /> : null}
      <Button label={t('lock.unlock', { method: state.label })} onPress={unlock} busy={busy} icon="finger-print" />
      <Button
        label={t('lock.signOut')}
        tone="secondary"
        onPress={() => {
          signOut().catch((err: unknown) => setMessage(report(err, 'sign out').userMessage));
        }}
      />
    </FullScreen>
  );
}
