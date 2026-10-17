import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Banner, Button, Txt, VStack } from '@/components/ui';
import { changedPrefs, saveThanksPrefs, type RecognitionChoice, type ReachChoice, type ThanksChoice, type ThanksPrefs } from '@/lib/api/care-prefs';
import { report } from '@/lib/errors';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { RECOGNITION_KEYS, REACH_KEYS, THANKS_KEYS } from './choices';

// "How would you like to be thanked?" for an adult of the household. Three questions, each a set of cards (the onboarding radio style): how they would
// like to be thanked, how they would like to be recognised, how to reach them. Choosing the same card again clears it. Saving says what happened; a
// refusal is shown in plain words with the choice kept, so nothing is lost.

function Choice({ title, selected, onPress }: { title: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={title}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        borderWidth: 2,
        borderColor: selected ? colors.navy : colors.borderInput,
        backgroundColor: selected ? colors.navyTint : colors.card,
        borderRadius: radii.card,
        paddingVertical: 10,
        paddingHorizontal: space.md,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 48,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.navy, backgroundColor: selected ? colors.navy : colors.card }} />
      <Txt variant="smallStrong" style={{ fontFamily: fonts.bodyBold, flex: 1 }}>
        {title}
      </Txt>
    </Pressable>
  );
}

export function ThanksForm({ centerId, initial, onSaved }: { centerId: string; initial: ThanksPrefs; onSaved: (next: ThanksPrefs) => void }) {
  const { t } = useSettings();
  const [thanks, setThanks] = useState<ThanksChoice | null>(initial.thanks);
  const [recognition, setRecognition] = useState<RecognitionChoice | null>(initial.recognition);
  const [channel, setChannel] = useState<ReachChoice | null>(initial.channel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = changedPrefs(initial, { thanks, recognition, channel });
  const dirty = Object.keys(patch).length > 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await saveThanksPrefs(centerId, patch));
    } catch (err) {
      setError(report(err, 'save how you would like to be thanked').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <VStack gap={space.lg}>
      <VStack gap={space.sm}>
        <Txt variant="smallStrong">{t('thanks.thankedQ')}</Txt>
        {THANKS_KEYS.map((k) => (
          <Choice key={k} title={t(`thanks.thanked.${k}`)} selected={thanks === k} onPress={() => setThanks(thanks === k ? null : k)} />
        ))}
      </VStack>
      <VStack gap={space.sm}>
        <Txt variant="smallStrong">{t('thanks.recognisedQ')}</Txt>
        {RECOGNITION_KEYS.map((k) => (
          <Choice key={k} title={t(`thanks.recognised.${k}`)} selected={recognition === k} onPress={() => setRecognition(recognition === k ? null : k)} />
        ))}
      </VStack>
      <VStack gap={space.sm}>
        <Txt variant="smallStrong">{t('thanks.reachQ')}</Txt>
        {REACH_KEYS.map((k) => (
          <Choice key={k} title={t(`thanks.reach.${k}`)} selected={channel === k} onPress={() => setChannel(channel === k ? null : k)} />
        ))}
      </VStack>
      <Txt variant="meta" color="muted">
        {t('thanks.privacy')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('common.save')} onPress={save} busy={busy} disabled={!dirty} />
    </VStack>
  );
}
