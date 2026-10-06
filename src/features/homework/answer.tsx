import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { Banner, Button, Card, Row, TextField, Txt, VStack } from '@/components/ui';
import type { InAppAudio } from '@/features/audio';
import { handIn, isRefusal, removePart as removeUpload, saveDraft, uploadPart } from '@/lib/api/homework';
import { AppError, logError, report } from '@/lib/errors';
import { answerButtons, handInBlock, handInNote, keptFiles, MAX_TEXT_CHARS, type FileArg, type HandInBlock, type HomeworkItem, type PartKind, type Submission, type Viewer } from '@/lib/homework';
import { newRequestId } from '@/lib/request-context';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { PartRow, VoiceNotePanel, type LocalPart } from './parts';

/** The parts the database should hold for the draft: every stored part, in list order. */
function fileArgsOf(parts: readonly LocalPart[]): FileArg[] {
  return parts.filter((p): p is LocalPart & { storagePath: string } => p.state === 'uploaded' && !!p.storagePath).map((p) => ({ kind: p.kind, storage_path: p.storagePath, mime_type: p.mimeType, bytes: p.bytes, duration_seconds: p.durationSeconds }));
}

function initialParts(sub: Submission | null): LocalPart[] {
  return keptFiles(sub).map((f) => ({ key: f.id, kind: f.kind, uri: null, storagePath: f.storagePath, mimeType: f.mimeType, fileName: null, bytes: f.bytes, durationSeconds: f.durationSeconds, state: 'uploaded', error: null }));
}

const BLOCK_KEY: Record<HandInBlock, 'hw.block.uploading' | 'hw.block.notUploaded' | 'hw.block.tooMany' | 'hw.block.textTooLong' | 'hw.block.empty'> = {
  uploading: 'hw.block.uploading',
  not_uploaded: 'hw.block.notUploaded',
  too_many: 'hw.block.tooMany',
  text_too_long: 'hw.block.textTooLong',
  empty: 'hw.block.empty',
};

/**
 * The answer being worked on: the parts (a photo from the library, a voice note from the recorder; a file waits for the
 * next APK), the written answer, Save draft and Hand in.
 *
 * A part is uploaded the moment it is added, to `<center>/<person>/<submission>/<id>.<ext>` (the draft is created first
 * when there is none yet, so the path has a submission), and then registered with the draft right away, so leaving the
 * screen never loses a photo. A part that could not be uploaded stays in the list as "Not uploaded", with Try again
 * and Remove, and nothing is handed in until every part is uploaded. Writes run one at a time, in order, because the
 * database replaces the whole set of parts on every save.
 */
export function AnswerEditor({ item, viewer, sub, centerId, learnerName, audio, onSaved }: { item: HomeworkItem; viewer: Viewer; sub: Submission | null; centerId: string; learnerName: string; audio: InAppAudio; onSaved: (sub: Submission) => void }) {
  const t = useT();
  const { confirm, toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const { assignment } = item;
  const textAllowed = assignment.allowedKinds.includes('text');
  const buttons = answerButtons(assignment.allowedKinds);

  const [text, setTextState] = useState(sub?.textAnswer ?? '');
  const textRef = useRef(text);
  const [parts, setPartsState] = useState<LocalPart[]>(() => initialParts(sub));
  const partsRef = useRef(parts);
  const submissionIdRef = useRef<string | null>(sub?.id ?? null);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const [writing, setWriting] = useState(!!sub?.textAnswer);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState<'saving' | 'handing' | null>(null);
  /** The last failure, in plain English, with what Try again does. */
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** State and the ref together, so a write that runs after an await sees the parts as they are now, not as they were. */
  const setParts = (fn: (prev: LocalPart[]) => LocalPart[]) => {
    const next = fn(partsRef.current);
    partsRef.current = next;
    setPartsState(next);
  };
  const setText = (v: string) => {
    textRef.current = v;
    setTextState(v);
  };
  /** Writes one after another: every save sends the whole set of parts, so two at once would lose one. */
  const enqueue = <T,>(job: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(job, job);
    chain.current = next.catch(() => undefined);
    return next;
  };
  const textArg = () => textRef.current.trim() || null;

  /** The draft's id, creating the draft when there is none: a part's path needs it. No list of parts (null): the database keeps whatever the draft already has. */
  const ensureSubmission = async (): Promise<string> => {
    if (submissionIdRef.current) return submissionIdRef.current;
    const saved = await saveDraft({ assignmentId: assignment.id, personId: item.personId, text: textArg(), files: null });
    submissionIdRef.current = saved.id;
    onSaved(saved);
    return saved.id;
  };

  /**
   * Upload one part and register it with the draft. The part keeps its storage path from the moment its file is in the
   * bucket, so when only the registration failed (a lost reply, no signal) Try again registers that same file instead
   * of uploading another copy. The file is deleted only when the database said no (a refusal: it is certainly not on the
   * draft) or when the learner removes the part.
   */
  const upload = (key: string) =>
    enqueue(async () => {
      const part = partsRef.current.find((p) => p.key === key);
      if (!part || (!part.uri && !part.storagePath)) return;
      // Set once the server has been asked anything (the draft, the bucket, the draft again): only then can a failure mean the answer has moved on.
      let askedServer = false;
      // Where the file is in the bucket, once it is there.
      let stored = part.storagePath ? { storagePath: part.storagePath, mimeType: part.mimeType, bytes: part.bytes } : null;
      try {
        if (!stored && part.uri) {
          const file = await uploadPart({
            centerId,
            personId: item.personId,
            submissionId: () => {
              askedServer = true;
              return ensureSubmission();
            },
            kind: part.kind,
            uri: part.uri,
            fileName: part.fileName,
            mimeType: part.mimeType,
            durationSeconds: part.durationSeconds,
          });
          stored = { storagePath: file.storage_path, mimeType: file.mime_type, bytes: file.bytes };
          // Kept at once: a registration that fails below must not forget where the file is.
          const where = stored;
          setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...where } : p)));
        }
        if (!stored) return;
        const uploaded: LocalPart = { ...part, ...stored, state: 'uploaded', error: null };
        const next = partsRef.current.map((p) => (p.key === key ? uploaded : p));
        askedServer = true;
        const saved = await saveDraft({ assignmentId: assignment.id, personId: item.personId, text: textArg(), files: fileArgsOf(next) });
        setParts((prev) => prev.map((p) => (p.key === key ? uploaded : p)));
        onSaved(saved);
        invalidate();
      } catch (err) {
        // The database refused the draft: the file is certainly not on it, so it must not stay in the bucket (as photo
        // albums do). Any other failure (no signal, a lost reply) leaves it unknown: the file stays, and Try again registers it.
        const refused = isRefusal(err);
        if (refused && stored) await removeUpload(stored.storagePath);
        const message = report(err, 'upload this part').userMessage;
        setParts((prev) => prev.map((p) => (p.key === key ? { ...p, ...(refused ? { storagePath: null } : {}), state: 'failed', error: message } : p)));
        // The server may know better than this screen (the answer was handed in elsewhere): load it again, so what is shown is what is true.
        if (askedServer) invalidate();
      }
    });

  const addPart = (part: { kind: PartKind; uri: string; fileName: string | null; mimeType: string | null; bytes: number | null; durationSeconds: number | null }) => {
    const key = newRequestId();
    setNotice(null);
    setError(null);
    setParts((prev) => [...prev, { key, storagePath: null, state: 'uploading', error: null, ...part }]);
    void upload(key);
  };

  const retryPart = (key: string) => {
    setParts((prev) => prev.map((p) => (p.key === key ? { ...p, state: 'uploading', error: null } : p)));
    void upload(key);
  };

  const removePart = (key: string) => {
    const part = partsRef.current.find((p) => p.key === key);
    if (!part || part.state === 'uploading') return;
    setNotice(null);
    setError(null);
    setParts((prev) => prev.filter((p) => p.key !== key));
    // Never in the bucket: nothing to take off the draft or to delete. In the bucket (registered, or uploaded and not registered yet): off the draft, then deleted.
    if (!part.storagePath) return;
    const path = part.storagePath;
    void enqueue(async () => {
      try {
        const saved = await saveDraft({ assignmentId: assignment.id, personId: item.personId, text: textArg(), files: fileArgsOf(partsRef.current) });
        onSaved(saved);
        invalidate();
        await removeUpload(path);
      } catch (err) {
        // Not taken off the draft: it comes back to the list, and the reason is shown.
        setParts((prev) => (prev.some((p) => p.key === key) ? prev : [...prev, part]));
        setError({ message: report(err, 'remove this part').userMessage, retry: () => removePart(key) });
        invalidate();
      }
    });
  };

  const pickPhoto = async () => {
    setError(null);
    setNotice(null);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) throw new AppError(t('hw.pickDenied'), `image picker permission ${perm.status}`);
      const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, quality: 0.85 });
      const asset = picked.canceled ? null : picked.assets[0];
      if (!asset) return;
      addPart({ kind: 'photo', uri: asset.uri, fileName: asset.fileName ?? null, mimeType: asset.mimeType ?? null, bytes: asset.fileSize ?? null, durationSeconds: null });
    } catch (err) {
      if (err instanceof AppError) logError('choose a photo', err);
      setError({ message: err instanceof AppError ? err.userMessage : `${t('hw.pickFailed')} ${report(err, 'choose a photo').userMessage}`, retry: () => void pickPhoto() });
    }
  };

  const blockFor = (handingIn: boolean): HandInBlock | null => {
    const block = handInBlock({ parts: partsRef.current, text: textRef.current, maxFiles: assignment.maxFiles, textAllowed });
    // An empty draft can still be saved when the draft exists (the text was cleared); handing in needs an answer.
    if (block === 'empty' && !handingIn && submissionIdRef.current) return null;
    return block;
  };

  const say = (block: HandInBlock) => setNotice(t(BLOCK_KEY[block], { n: assignment.maxFiles, max: MAX_TEXT_CHARS }));

  const save = async () => {
    setError(null);
    setNotice(null);
    const block = blockFor(false);
    if (block) return say(block);
    setBusy('saving');
    try {
      const saved = await enqueue(() => saveDraft({ assignmentId: assignment.id, personId: item.personId, text: textArg(), files: fileArgsOf(partsRef.current) }));
      submissionIdRef.current = saved.id;
      onSaved(saved);
      invalidate();
      toast(t('hw.draftSaved'));
    } catch (err) {
      setError({ message: report(err, 'save your draft').userMessage, retry: () => void save() });
      // A refusal usually means the answer is no longer a draft (handed in or decided elsewhere): load it again, so Try again never repeats a doomed call.
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const note = handInNote(item, viewer);
  /** `confirmed`: Try again after a failed hand-in, which the learner already confirmed, so the question is not asked twice. */
  const handInNow = async (confirmed = false) => {
    setError(null);
    setNotice(null);
    const block = blockFor(true);
    if (block) return say(block);
    if (!confirmed) {
      const ok = await confirm({
        title: t('hw.handInTitle', { title: assignment.title }),
        body: note === 'parent_checks_first' ? t('hw.handInParentFirst') : note === 'parent_hands_in' ? t('hw.handInForChild', { name: learnerName }) : t('hw.handInTeacher'),
        confirmLabel: t('hw.handIn'),
        tone: 'primary',
      });
      if (!ok) return;
    }
    setBusy('handing');
    try {
      const result = await enqueue(async () => {
        const saved = await saveDraft({ assignmentId: assignment.id, personId: item.personId, text: textArg(), files: fileArgsOf(partsRef.current) });
        submissionIdRef.current = saved.id;
        return handIn(saved.id);
      });
      onSaved(result);
      invalidate();
      toast(result.status === 'awaiting_parent' ? t('hw.handedInParent') : t('hw.handedInTeacher'));
    } catch (err) {
      setError({ message: report(err, 'hand in your homework').userMessage, retry: () => void handInNow(true) });
      invalidate();
    } finally {
      setBusy(null);
    }
  };

  const full = parts.length >= assignment.maxFiles;
  const working = busy !== null;
  return (
    <VStack gap={space.md}>
      <Txt variant="eyebrow" color="muted" accessibilityRole="header">
        {viewer === 'parent' ? t('hw.answerOf', { name: learnerName }) : t('hw.yourAnswer')}
      </Txt>
      {parts.length === 0 && !writing && !recording ? (
        <Txt variant="small" color="muted">
          {t('hw.noAnswerYet')}
        </Txt>
      ) : null}
      {parts.map((p) => (
        <PartRow key={p.key} part={p} editable={!working} audio={audio} onRemove={removePart} onRetry={retryPart} />
      ))}
      {recording ? (
        <VoiceNotePanel
          stopOtherAudio={audio.stop}
          onClose={() => setRecording(false)}
          onRecorded={(rec, auto) => {
            setRecording(false);
            addPart({ kind: 'voice', uri: rec.uri, fileName: null, mimeType: null, bytes: null, durationSeconds: Math.round(rec.seconds * 10) / 10 });
            // A note cut off at the limit says so (addPart clears the notice first, so this comes after it).
            if (auto) setNotice(t('hw.voiceStopped'));
          }}
        />
      ) : null}
      {writing && textAllowed ? (
        <TextField label={t('hw.textLabel')} value={text} onChangeText={setText} multiline maxLength={MAX_TEXT_CHARS} placeholder={t('hw.textPlaceholder')} hint={t('hw.textCount', { n: text.length, max: MAX_TEXT_CHARS })} editable={!working} />
      ) : null}
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {buttons.map((b) => {
          if (b.kind === 'photo') return <Button key={b.kind} label={t('hw.choosePhoto')} icon="image-outline" tone="secondary" size="md" fill={false} disabled={full || working} onPress={() => void pickPhoto()} />;
          if (b.kind === 'voice') return <Button key={b.kind} label={t('hw.recordVoice')} icon="mic-outline" tone="secondary" size="md" fill={false} disabled={full || working || recording} onPress={() => setRecording(true)} />;
          if (b.kind === 'text') return writing ? null : <Button key={b.kind} label={t('hw.write')} icon="create-outline" tone="secondary" size="md" fill={false} disabled={working} onPress={() => setWriting(true)} />;
          return <Button key={b.kind} label={t('hw.attachFile')} icon="attach-outline" tone="secondary" size="md" fill={false} disabled accessibilityHint={t('hw.attachFileSoon')} onPress={() => undefined} />;
        })}
      </Row>
      {buttons.some((b) => !b.available) ? (
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {t('hw.attachFileSoon')}
        </Txt>
      ) : null}
      {buttons.some((b) => b.kind === 'photo' || b.kind === 'voice') ? (
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {assignment.maxFiles === 1 ? t('hw.maxPartsOne') : t('hw.maxParts', { n: assignment.maxFiles })}
        </Txt>
      ) : null}
      {notice ? <Banner tone="warning" message={notice} /> : null}
      {error ? <Banner tone="error" message={error.message} action={{ label: t('common.retry'), onPress: error.retry }} /> : null}
      <Card tone="panel" style={{ gap: space.sm }}>
        <Button label={t('hw.handIn')} onPress={() => void handInNow()} busy={busy === 'handing'} disabled={working} />
        <Button label={t('hw.saveDraft')} tone="secondary" size="md" onPress={() => void save()} busy={busy === 'saving'} disabled={working} />
        {note === 'parent_checks_first' ? (
          <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
            {t('hw.handInParentFirst')}
          </Txt>
        ) : note === 'parent_hands_in' ? (
          <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
            {t('hw.handInForChild', { name: learnerName })}
          </Txt>
        ) : null}
      </Card>
    </VStack>
  );
}

/** The answer as it was handed in (or as it stands): the written answer and the parts, nothing to change. */
export function AnswerReadOnly({ sub, audio, title }: { sub: Submission | null; audio: InAppAudio; title: string }) {
  const t = useT();
  const parts = initialParts(sub);
  const gone = (sub?.files ?? []).filter((f) => !f.storagePath || f.deleted).length;
  return (
    <VStack gap={space.md}>
      <Txt variant="eyebrow" color="muted" accessibilityRole="header">
        {title}
      </Txt>
      {sub?.textAnswer ? (
        <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: space.md }}>
          <Txt variant="body" selectable>
            {sub.textAnswer}
          </Txt>
        </View>
      ) : null}
      {parts.map((p) => (
        <PartRow key={p.key} part={p} editable={false} audio={audio} />
      ))}
      {gone > 0 ? (
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {t('hw.part.gone')}
        </Txt>
      ) : null}
      {!sub?.textAnswer && parts.length === 0 && gone === 0 ? (
        <Txt variant="small" color="muted">
          {t('hw.noAnswerYet')}
        </Txt>
      ) : null}
    </VStack>
  );
}
