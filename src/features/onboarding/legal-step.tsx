import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Markdownish } from '@/components/markdown';
import { Banner, Button, Card, Checkbox, Chip, ChipGroup, LinkText, Row, Txt, VStack } from '@/components/ui';
import { answersPayload, continueBlocker, type LegalAnswers, type LegalStepDoc } from '@/features/legal-step';
import { recordLegalAnswers } from '@/lib/api/legal';
import { logError, report } from '@/lib/errors';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, fonts, layout, space } from '@/theme';

/**
 * The member's legal step (#20, owner decision 2026-09-25): the community's published privacy
 * policy, terms, notices and consents, shown over the app at the first sign-in (right after the
 * family is linked) and again whenever a new version is published. Nothing continues until the
 * answers are recorded (app.record_member_legal_answers keeps each exact version).
 */
export function LegalStepScreen({ docs }: { docs: LegalStepDoc[] }) {
  const t = useT();
  const { center, finishLegal, signOut } = useApp();
  const [answers, setAnswers] = useState<LegalAnswers>(() =>
    Object.fromEntries(docs.filter((d) => d.mode === 'consent' && d.granted !== null).map((d) => [d.documentId, d.granted ?? undefined])),
  );
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const communityName = center?.short_name || center?.name || '';
  const again = docs.some((d) => d.answeredVersion);

  const submit = async () => {
    if (!center) return;
    const blocker = continueBlocker(docs, answers);
    if (blocker) return setError(t(blocker.key, { title: blocker.title }));
    setBusy(true);
    setError(null);
    try {
      await recordLegalAnswers(center.id, answersPayload(docs, answers));
      finishLegal();
    } catch (err) {
      setError(report(err, 'record your answers').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }} testID="legal-step">
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.xl, paddingBottom: space.xxl }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.lg }}>
          <VStack gap={space.sm}>
            <Txt variant="display" accessibilityRole="header">
              {t('legal.stepTitle')}
            </Txt>
            <Txt variant="body" color="muted">
              {again ? t('legal.stepSubAgain', { center: communityName }) : t('legal.stepSub', { center: communityName })}
            </Txt>
          </VStack>
          {docs.map((d) => {
            const shown = open[d.documentId] ?? false;
            return (
              <Card key={d.documentId} style={{ gap: space.sm }}>
                <Txt variant="section" accessibilityRole="header">
                  {d.title}
                </Txt>
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                  {d.answeredVersion ? t('legal.newVersion', { version: d.version, previous: d.answeredVersion }) : t('legal.versionShort', { version: d.version })}
                </Txt>
                <LinkText label={shown ? t('legal.hide') : t('legal.read')} onPress={() => setOpen((o) => ({ ...o, [d.documentId]: !shown }))} />
                {shown ? (
                  <View style={{ backgroundColor: colors.panel, borderRadius: 12, padding: space.md }}>
                    <Markdownish source={d.body} />
                  </View>
                ) : null}
                {d.mode === 'accept' ? (
                  <Checkbox
                    label={t('legal.accept', { title: d.title })}
                    checked={answers[d.documentId] === true}
                    onChange={(v) => setAnswers((a) => ({ ...a, [d.documentId]: v }))}
                  />
                ) : (
                  <ChipGroup columns={2}>
                    <Chip label={t('legal.consentYes')} selected={answers[d.documentId] === true} onPress={() => setAnswers((a) => ({ ...a, [d.documentId]: true }))} grid />
                    <Chip label={t('legal.consentNo')} selected={answers[d.documentId] === false} onPress={() => setAnswers((a) => ({ ...a, [d.documentId]: false }))} grid />
                  </ChipGroup>
                )}
              </Card>
            );
          })}
          {error ? <Banner tone="error" message={error} /> : null}
          <Button label={busy ? t('legal.saving') : t('legal.continue')} onPress={() => void submit()} busy={busy} />
          <Row style={{ justifyContent: 'center' }}>
            <LinkText label={t('legal.signOut')} onPress={() => signOut().catch((err: unknown) => logError('signing out from the legal step', err))} />
          </Row>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
