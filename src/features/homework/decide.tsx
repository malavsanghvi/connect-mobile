import { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Banner, Button, Card, TextField, Txt, VStack } from '@/components/ui';
import { parentDecide } from '@/lib/api/homework';
import { report } from '@/lib/errors';
import { MAX_NOTE_CHARS, type Submission } from '@/lib/homework';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

/**
 * A household adult's part: the child handed the answer in, and it waits here before the teacher sees it. "It's
 * ready — send to the teacher" passes it on; "Send back to {name}" opens the note sheet and returns it to the
 * child as a draft, with the note. Every refusal is shown as the database said it, with Try again.
 */
export function ParentDecision({ submissionId, childName, onDecided }: { submissionId: string; childName: string; onDecided: (sub: Submission) => void }) {
  const t = useT();
  const { confirm, toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const [busy, setBusy] = useState<'ok' | 'send_back' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  const decide = async (decision: 'ok' | 'send_back', note: string | null): Promise<boolean> => {
    setBusy(decision);
    setError(null);
    try {
      const sub = await parentDecide(submissionId, decision, note);
      onDecided(sub);
      invalidate();
      toast(decision === 'ok' ? t('hw.sentToTeacher') : t('hw.sentBackTo', { name: childName }));
      return true;
    } catch (err) {
      setError(report(err, decision === 'ok' ? 'send it to the teacher' : 'send it back').userMessage);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const ready = async () => {
    const ok = await confirm({ title: t('hw.parentReadyTitle'), body: t('hw.parentReadyBody', { name: childName }), confirmLabel: t('hw.parentReady'), tone: 'primary' });
    if (ok) await decide('ok', null);
  };

  return (
    <Card tone="outlineSaffron" style={{ gap: space.md }}>
      <Txt variant="bodyStrong">{t('hw.parentCheckIntro', { name: childName })}</Txt>
      <Button label={t('hw.parentReady')} tone="green" onPress={() => void ready()} busy={busy === 'ok'} disabled={busy !== null} />
      <Button label={t('hw.parentSendBack', { name: childName })} tone="outlineBrown" size="md" onPress={() => setSheet(true)} disabled={busy !== null} />
      {error ? <Banner tone="error" message={error} /> : null}
      <NoteSheet visible={sheet} childName={childName} busy={busy === 'send_back'} onClose={() => setSheet(false)} onSend={async (note) => (await decide('send_back', note)) && setSheet(false)} />
    </Card>
  );
}

/** The note that goes back with the answer: optional, at most MAX_NOTE_CHARS. */
function NoteSheet({ visible, childName, busy, onClose, onSend }: { visible: boolean; childName: string; busy: boolean; onClose: () => void; onSend: (note: string | null) => Promise<unknown> }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [note, setNote] = useState('');
  const tooLong = note.length > MAX_NOTE_CHARS;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={onClose} accessibilityLabel={t('common.close')} disabled={busy} />
      <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: space.xl, paddingBottom: space.xl + insets.bottom, gap: space.md }}>
        <Txt variant="title" color="navy" accessibilityRole="header">
          {t('hw.noteTitle', { name: childName })}
        </Txt>
        <TextField label={t('hw.noteLabel', { name: childName })} value={note} onChangeText={setNote} multiline placeholder={t('hw.notePlaceholder', { name: childName })} hint={t('hw.noteHint')} error={tooLong ? t('hw.noteTooLong', { max: MAX_NOTE_CHARS }) : null} editable={!busy} />
        <VStack gap={space.sm}>
          <Button label={t('hw.noteSend')} tone="brown" onPress={() => void onSend(note.trim() || null)} busy={busy} disabled={tooLong} />
          <Button label={t('common.cancel')} tone="secondary" size="md" onPress={onClose} disabled={busy} />
        </VStack>
      </View>
    </Modal>
  );
}
