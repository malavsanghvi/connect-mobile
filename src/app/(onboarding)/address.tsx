import { useRouter } from 'expo-router';
import { useState } from 'react';

import { Banner, Button, TextField, VStack } from '@/components/ui';
import { OnboardingFrame } from '@/features/onboarding/frame';
import { updateHouseholdAddress, type AddressDraft } from '@/lib/api/family';
import { report } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Onboarding step 4: the household's mailing address, prefilled from what the office loaded (imports often
 * carry it). An adult confirms or corrects it; it is optional, and children never see this step.
 */
export default function AddressScreen() {
  const router = useRouter();
  const t = useT();
  const { member, refreshMember } = useApp();
  const h = member?.household ?? null;
  const [draft, setDraft] = useState<AddressDraft>({
    address_line1: h?.address_line1 ?? '',
    address_line2: h?.address_line2 ?? '',
    city: h?.city ?? '',
    state_region: h?.state_region ?? '',
    postal_code: h?.postal_code ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof AddressDraft, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!member || !h) return null;
  const set = (patch: Partial<AddressDraft>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    const errs: Partial<Record<keyof AddressDraft, string>> = {};
    const any = Object.values(draft).some((v) => v.trim());
    if (any && !draft.address_line1.trim()) errs.address_line1 = t('address.needLine1');
    if (draft.postal_code.trim() && !/^\d{5}(-\d{4})?$/.test(draft.postal_code.trim())) errs.postal_code = t('address.zipInvalid');
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      if (any) {
        await updateHouseholdAddress(h.id, draft);
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
    <OnboardingFrame step={4} title={t('address.title')} subtitle={t('address.subtitle')} onBack={() => router.back()} onSkip={() => router.push('/details')}>
      <VStack gap={space.md}>
        {error ? <Banner tone="error" message={error} /> : null}
        <TextField label={t('address.line1')} value={draft.address_line1} onChangeText={(v) => set({ address_line1: v })} error={errors.address_line1} autoComplete="street-address" />
        <TextField label={t('address.line2')} value={draft.address_line2} onChangeText={(v) => set({ address_line2: v })} />
        <TextField label={t('address.city')} value={draft.city} onChangeText={(v) => set({ city: v })} autoComplete="postal-address-locality" />
        <TextField label={t('address.state')} value={draft.state_region} onChangeText={(v) => set({ state_region: v })} autoCapitalize="characters" autoComplete="postal-address-region" />
        <TextField label={t('address.zip')} value={draft.postal_code} onChangeText={(v) => set({ postal_code: v })} error={errors.postal_code} keyboardType="number-pad" autoComplete="postal-code" />
        <Button label={t('common.continue')} onPress={save} busy={busy} />
      </VStack>
    </OnboardingFrame>
  );
}
