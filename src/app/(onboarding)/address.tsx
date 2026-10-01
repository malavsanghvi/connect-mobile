import { useRouter } from 'expo-router';
import { useState } from 'react';

import { ComboField } from '@/components/pickers';
import { Banner, Button, TextField, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { cityOptions, isValidZip, normalizeCity, normalizeState, normalizeZip, placeForZip, stateName, stateOptions, zipOptions, zipStateMismatch } from '@/lib/address';
import { loadAddressSuggestions, updateHouseholdAddress, type AddressDraft } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

const STATES = stateOptions();

/**
 * Onboarding step 4: the household's mailing address, prefilled from what the office loaded (imports often
 * carry it). An adult confirms or corrects it; it is optional, and children never see this step.
 *
 * ZIP, city and state are type-ahead fields (free text always allowed): ZIP codes the community uses (its zones'
 * first) and their cities come from app.address_suggestions; picking a ZIP the community knows one place for fills
 * in city and state. The state starts as the community's when the household has none, and is stored as the 2-letter
 * code. A ZIP that belongs to another state gets a plain-English warning (it does not block saving).
 */
export default function AddressScreen() {
  const router = useRouter();
  const t = useT();
  const { member, center, refreshMember, onboardingPreview } = useApp();
  const h = member?.household ?? null;
  const [draft, setDraft] = useState<AddressDraft>({
    address_line1: h?.address_line1 ?? '',
    address_line2: h?.address_line2 ?? '',
    city: h?.city ?? '',
    state_region: h?.state_region || center?.state_region || '',
    postal_code: h?.postal_code ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AddressDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suggestions = useLoad(() => (center ? loadAddressSuggestions(center.id) : Promise.resolve([])), [center?.id], 'load the address suggestions');
  if (!member || !h) return null;
  const set = (patch: Partial<AddressDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const rows = suggestions.data ?? [];

  /** A ZIP the community knows exactly one place for fills in city and state: always when picked, into an empty city when typed. */
  const setZip = (zip: string, picked: boolean) => {
    const known = placeForZip(rows, zip);
    setDraft((d) => ({ ...d, postal_code: zip, ...(known && (picked || !d.city.trim()) ? { city: known.city, state_region: known.state } : null) }));
  };

  const expected = zipStateMismatch(draft.postal_code, draft.state_region);
  const names = expected?.map((code) => stateName(code) ?? code) ?? [];
  const mismatch = expected
    ? t('address.zipMismatch', {
        zip: normalizeZip(draft.postal_code),
        expected: names.length === 2 ? t('address.either', { a: names[0], b: names[1] }) : names[0],
        state: stateName(draft.state_region) ?? draft.state_region.trim().toUpperCase(),
      })
    : null;

  const save = async () => {
    const clean: AddressDraft = { ...draft, city: normalizeCity(draft.city), state_region: normalizeState(draft.state_region), postal_code: normalizeZip(draft.postal_code) };
    setDraft(clean);
    const errs: Partial<Record<keyof AddressDraft, string>> = {};
    // A state on its own (perhaps only the community's, filled in for them) is not an address to save.
    const any = [clean.address_line1, clean.address_line2, clean.city, clean.postal_code].some((v) => v.trim());
    if (any && !clean.address_line1.trim()) errs.address_line1 = t('address.needLine1');
    if (clean.postal_code && !isValidZip(clean.postal_code)) errs.postal_code = t('address.zipInvalid');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    // Preview: the same checks, then on without saving.
    if (onboardingPreview) return router.push('/details');
    setBusy(true);
    setError(null);
    try {
      if (any) {
        await updateHouseholdAddress(h.id, clean);
        await refreshMember();
      }
      router.push('/details');
    } catch (err) {
      setError(report(err, 'save your address').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingFrame step="address" title={t('address.title')} subtitle={t('address.subtitle')} onBack={() => router.back()} onSkip={() => router.push('/details')}>
      <VStack gap={space.md}>
        {error ? <Banner tone="error" message={error} /> : null}
        {suggestions.error ? (
          <Banner tone="warning" message={t('address.suggestionsFailed', { reason: suggestions.error.userMessage })} action={{ label: t('common.retry'), onPress: () => void suggestions.reload() }} />
        ) : null}
        <TextField label={t('address.line1')} value={draft.address_line1} onChangeText={(v) => set({ address_line1: v })} error={errors.address_line1} autoComplete="street-address" />
        <TextField label={t('address.line2')} value={draft.address_line2} onChangeText={(v) => set({ address_line2: v })} />
        <ComboField
          label={t('address.zip')}
          value={draft.postal_code}
          onChangeText={(v) => setZip(v, false)}
          onPick={(o) => setZip(o.value, true)}
          options={zipOptions(rows, t('address.zipZone'))}
          normalize={normalizeZip}
          error={errors.postal_code}
          keyboardType="number-pad"
          autoComplete="postal-code"
        />
        <ComboField
          label={t('address.city')}
          value={draft.city}
          onChangeText={(v) => set({ city: v })}
          options={cityOptions(rows, draft.postal_code)}
          normalize={normalizeCity}
          autoCapitalize="words"
          autoComplete="postal-address-locality"
        />
        <ComboField
          label={t('address.state')}
          value={draft.state_region}
          onChangeText={(v) => set({ state_region: v })}
          options={STATES}
          normalize={normalizeState}
          hint={t('address.stateHint')}
          autoCapitalize="words"
          autoComplete="postal-address-region"
        />
        {mismatch ? <Banner tone="warning" message={mismatch} /> : null}
        <Button label={t('common.continue')} onPress={save} busy={busy} />
      </VStack>
    </OnboardingFrame>
  );
}
