import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable } from 'react-native';

import { Banner, Button, Checkbox, Row, TextField, Txt } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { biometricSupport, writeBiometricOptIn, type BiometricSupport } from '@/lib/biometrics';
import { logError, report } from '@/lib/errors';
import { formatOtp, isValidEmail, toE164 } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useT } from '@/providers/settings';

const RESEND_SECONDS = 60;

/** Onboarding step 1: email or mobile → one-time code (Supabase OTP). */

// The code length is a Supabase project setting (6–10 digits); accept any of them.
const CODE_MIN = 6;
const CODE_MAX = 10;
export default function SignInScreen() {
  const router = useRouter();
  const t = useT();
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: 'email' | 'phone' = params.mode === 'phone' ? 'phone' : 'email';

  const [stage, setStage] = useState<'enter' | 'code'>('enter');
  const [identifier, setIdentifier] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [bio, setBio] = useState<BiometricSupport | null>(null);
  const [useBio, setUseBio] = useState(true);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let alive = true;
    biometricSupport().then((s) => alive && setBio(s));
    return () => {
      alive = false;
    };
  }, []);

  const sendCode = async () => {
    setError(null);
    setFieldError(null);
    let target: string | null;
    if (mode === 'email') {
      target = isValidEmail(identifier) ? identifier.trim().toLowerCase() : null;
      if (!target) return setFieldError(t('signin.emailInvalid'));
    } else {
      target = toE164(identifier);
      if (!target) return setFieldError(t('signin.phoneInvalid'));
    }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithOtp(mode === 'email' ? { email: target, options: { shouldCreateUser: true } } : { phone: target, options: { shouldCreateUser: true } });
    setBusy(false);
    if (err) return setError(report(err, 'send your sign-in code').userMessage);
    setSentTo(target);
    setCode('');
    setStage('code');
    setSecondsLeft(RESEND_SECONDS);
  };

  const verify = async () => {
    const token = code.replace(/\D/g, '');
    if (token.length < CODE_MIN || token.length > CODE_MAX) return setFieldError(t('signin.codeInvalid'));
    setError(null);
    setFieldError(null);
    setBusy(true);
    const { error: err } = await supabase.auth.verifyOtp(mode === 'email' ? { email: sentTo, token, type: 'email' } : { phone: sentTo, token, type: 'sms' });
    if (err) {
      setBusy(false);
      return setError(report(err, 'check your code').userMessage);
    }
    if (bio?.available) {
      await writeBiometricOptIn(useBio).catch((e: unknown) => logError('saving the Face ID choice on this device', e));
    }
    // The session listener in AppProvider moves the member on to "Is this your family?".
  };

  const codeSent = stage === 'code';
  const mmss = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`;

  // Onboarding.dc.html s1: one "Sign in" screen — address, code, resend, Verify, then the Face ID checkbox.
  return (
    <OnboardingFrame step={1} title={t('signin.title')} onBack={() => router.back()}>
      {error ? <Banner tone="error" message={error} /> : null}
      <TextField
        size="lg"
        label={t(mode === 'email' ? 'signin.emailLabel' : 'signin.phoneLabel')}
        value={identifier}
        onChangeText={(v) => {
          setIdentifier(v);
          if (codeSent) setStage('enter');
        }}
        error={codeSent ? null : fieldError}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={mode === 'email' ? 'email' : 'tel'}
        keyboardType={mode === 'email' ? 'email-address' : 'phone-pad'}
        textContentType={mode === 'email' ? 'emailAddress' : 'telephoneNumber'}
        placeholder={mode === 'email' ? 'name@example.com' : '(713) 555-0142'}
        returnKeyType="send"
        onSubmitEditing={sendCode}
      />
      {!codeSent ? (
        <Button label={t('signin.sendCode')} onPress={sendCode} busy={busy} />
      ) : (
        <>
          <TextField
            size="lg"
            label={t('signin.codeLabel')}
            value={formatOtp(code)}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, CODE_MAX))}
            error={fieldError}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={CODE_MAX + 2}
            style={{ fontSize: 22, letterSpacing: 4.4 }}
            returnKeyType="done"
            onSubmitEditing={verify}
          />
          {secondsLeft > 0 ? (
            <Txt variant="meta" color="muted">
              {t('signin.resendIn', { time: mmss })}
            </Txt>
          ) : (
            <Row gap={4}>
              <Txt variant="meta" color="muted">
                {t('signin.didntGet')}
              </Txt>
              <Pressable onPress={sendCode} accessibilityRole="button" hitSlop={12}>
                <Txt variant="meta" color="navy" style={{ textDecorationLine: 'underline' }}>
                  {t('signin.resend')}
                </Txt>
              </Pressable>
            </Row>
          )}
          <Button label={t('signin.verify')} onPress={verify} busy={busy} disabled={code.replace(/\D/g, '').length < CODE_MIN} />
          {bio ? (
            bio.available ? (
              <Checkbox label={t('signin.useBiometric', { method: bio.label })} checked={useBio} onChange={setUseBio} />
            ) : (
              <Txt variant="meta" color="muted">
                {bio.reason}
              </Txt>
            )
          ) : null}
        </>
      )}
    </OnboardingFrame>
  );
}
