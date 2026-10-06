import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Banner, Button, IconButton, Row, Txt } from '@/components/ui';
import { clock, type InAppAudio } from '@/features/audio';
import { MicGlyph } from '@/features/gyan-ui';
import { haptic, usePulse, useReduceMotion } from '@/features/gyan/motion';
import { useVoiceRecorder } from '@/features/gyan/recorder';
import { partUrl } from '@/lib/api/homework';
import { MAX_VOICE_SECONDS, partLabel, type PartKind, type PartState } from '@/lib/homework';
import { useLoad } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

/**
 * A part of the answer as this phone knows it: one still on the phone (`uri`, being uploaded or not uploaded) or
 * one stored for the submission (`storagePath`). A stored part came from the server (`fileId`) or was uploaded here.
 */
export type LocalPart = {
  key: string;
  kind: PartKind;
  uri: string | null;
  storagePath: string | null;
  fileId: string | null;
  mimeType: string | null;
  fileName: string | null;
  bytes: number | null;
  durationSeconds: number | null;
  state: PartState;
  /** Why it is not uploaded, in plain English. */
  error: string | null;
};

const KIND_ICON: Record<PartKind, IconName> = { photo: 'image-outline', voice: 'mic-outline', file: 'document-outline' };

/** A link to show or play the part: the file on this phone, else a signed link to the stored one. */
function usePartLink(part: Pick<LocalPart, 'key' | 'uri' | 'storagePath'>) {
  return useLoad(() => (part.uri ? Promise.resolve(part.uri) : part.storagePath ? partUrl(part.storagePath) : Promise.resolve(null)), [part.key, part.uri, part.storagePath], 'load this part of the homework');
}

/**
 * One row of the parts list: a thumbnail for a photo, Play for a voice note, the words for a file; its upload state
 * ("Uploading…", "Uploaded", "Not uploaded · why", with Try again) and Remove while the answer can be edited.
 */
export function PartRow({ part, editable, audio, onRemove, onRetry }: { part: LocalPart; editable: boolean; audio: InAppAudio; onRemove?: (key: string) => void; onRetry?: (key: string) => void }) {
  const t = useT();
  const link = usePartLink(part);
  const label = partLabel(part);
  const name = t(label.key, label.vars);
  const playing = audio.current === part.key && audio.playing;
  const loading = audio.current === part.key && audio.loading;
  const stateLine = part.state === 'uploading' ? t('hw.part.uploading') : part.state === 'failed' ? `${t('hw.part.notUploaded')}${part.error ? ` · ${part.error}` : ''}` : part.uri ? t('hw.part.uploaded') : null;
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: part.state === 'failed' ? colors.danger : colors.border, borderRadius: radii.card, padding: space.md, gap: space.sm }} accessible={false}>
      <Row gap={space.md} align="center">
        {part.kind === 'photo' ? (
          <View style={{ width: 56, height: 56, borderRadius: radii.md, backgroundColor: colors.panel, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
            {link.data ? <Image source={{ uri: link.data }} style={{ width: 56, height: 56 }} contentFit="cover" accessibilityLabel={t('hw.part.photoAlt')} accessibilityIgnoresInvertColors /> : link.error ? <Icon name="alert-circle-outline" size={22} color={colors.danger} /> : <ActivityIndicator color={colors.navy} />}
          </View>
        ) : (
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: part.kind === 'voice' ? colors.navyTint : colors.panel, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name={KIND_ICON[part.kind]} size={22} color={colors.navy} />
          </View>
        )}
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" accessibilityRole="text">
            {name}
          </Txt>
          {stateLine ? (
            <Txt variant="meta" color={part.state === 'failed' ? 'danger' : part.state === 'uploading' ? 'muted' : 'greenDark'} accessibilityLiveRegion="polite">
              {stateLine}
            </Txt>
          ) : null}
        </View>
        {part.kind === 'voice' && part.state !== 'failed' ? (
          <Pressable
            onPress={() => link.data && audio.toggle(part.key, link.data)}
            disabled={!link.data}
            accessibilityRole="button"
            accessibilityLabel={playing ? t('hw.part.pause', { part: name }) : t('hw.part.play', { part: name })}
            accessibilityState={{ disabled: !link.data, busy: loading }}
            style={({ pressed }) => ({ width: touch.min, height: touch.min, borderRadius: touch.min / 2, backgroundColor: colors.navy, alignItems: 'center', justifyContent: 'center', opacity: !link.data ? 0.4 : pressed ? 0.8 : 1 })}>
            {loading ? <ActivityIndicator color={colors.white} /> : <Icon name={playing ? 'pause' : 'play'} size={20} color={colors.white} />}
          </Pressable>
        ) : null}
        {editable && part.state !== 'uploading' ? <IconButton icon="trash-outline" label={t('hw.part.remove', { part: name })} onPress={() => onRemove?.(part.key)} color={colors.danger} /> : null}
      </Row>
      {part.state === 'failed' && part.uri && onRetry ? <Button label={t('common.retry')} tone="secondary" size="sm" fill={false} onPress={() => onRetry(part.key)} /> : null}
      {link.error ? <Banner tone="error" message={t('hw.part.linkFailed')} action={{ label: t('common.retry'), onPress: () => void link.reload() }} /> : null}
    </View>
  );
}

/**
 * Record a voice note (the lesson's recorder, src/features/gyan/recorder.ts): tap to start, the time runs, tap to
 * stop; it stops by itself at MAX_VOICE_SECONDS (`auto` tells the editor, which says so). The recording is handed to
 * the editor, which uploads it. Cancel is off while the microphone is being asked for or the file is being finished,
 * so a cancelled panel never leaves a recording behind.
 */
export function VoiceNotePanel({ onRecorded, onClose, stopOtherAudio }: { onRecorded: (rec: { uri: string; seconds: number }, auto: boolean) => void; onClose: () => void; stopOtherAudio: () => void }) {
  const t = useT();
  const reduce = useReduceMotion();
  const voice = useVoiceRecorder();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Waiting for the microphone (the phone's or the browser's permission prompt may be open). */
  const [starting, setStarting] = useState(false);
  const pulse = usePulse(voice.listening, reduce);
  const stopping = useRef(false);
  const gone = useRef(false);
  const limit = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finishRef = useRef<(auto: boolean) => Promise<void>>(async () => undefined);

  const clearLimit = () => {
    if (limit.current) clearTimeout(limit.current);
    limit.current = null;
  };

  const finish = async (auto: boolean) => {
    if (stopping.current) return;
    stopping.current = true;
    clearLimit();
    setBusy(true);
    const stopped = await voice.stop();
    stopping.current = false;
    // The screen was left meanwhile: nothing is added after the learner has gone.
    if (gone.current) return;
    setBusy(false);
    if (!stopped.ok) {
      setError(t('hw.voiceFailed'));
      return;
    }
    haptic('right');
    onRecorded({ uri: stopped.uri, seconds: stopped.seconds }, auto);
  };
  // The time limit fires from a timer, so it must reach the newest finish (the one whose props and state are current).
  useEffect(() => {
    finishRef.current = finish;
  });
  // Leaving the panel: no stop after it is gone (the recorder itself lets go of the microphone).
  useEffect(() => {
    gone.current = false;
    return () => {
      gone.current = true;
      if (limit.current) clearTimeout(limit.current);
    };
  }, []);

  const start = async () => {
    setError(null);
    stopOtherAudio();
    setStarting(true);
    const started = await voice.start();
    if (gone.current) return;
    setStarting(false);
    if (!started.ok) {
      setError(started.reason === 'denied' ? t('hw.voiceDenied') : t('hw.voiceFailed'));
      return;
    }
    // The time limit: a recording that reaches it is stopped and added, as if the learner had tapped stop.
    clearLimit();
    limit.current = setTimeout(() => void finishRef.current(true), MAX_VOICE_SECONDS * 1000);
  };

  const micBg = voice.listening ? colors.danger : colors.saffron;
  return (
    <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: space.lg, gap: space.md, alignItems: 'center' }}>
      <Txt variant="bodyStrong" center accessibilityRole="header">
        {t('hw.recordVoice')}
      </Txt>
      <View style={{ width: 96, height: 96, alignItems: 'center', justifyContent: 'center' }}>
        {voice.listening ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: colors.saffron,
              opacity: reduce !== false ? 0.3 : pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }),
              transform: reduce !== false ? [] : [{ scale: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.23, 1.23] }) }],
            }}
          />
        ) : null}
        <Pressable
          onPress={() => {
            if (voice.listening) void finish(false);
            else void start();
          }}
          disabled={busy || starting}
          accessibilityRole="button"
          accessibilityLabel={voice.listening ? t('hw.voiceStopLabel') : t('hw.voiceLabel')}
          accessibilityState={{ busy: busy || starting, disabled: busy || starting }}
          style={({ pressed }) => ({ width: 96, height: 96, borderRadius: 48, backgroundColor: micBg, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.85 : 1 })}>
          <MicGlyph size={40} />
        </Pressable>
      </View>
      <Txt variant="bodyStrong" color={voice.listening ? 'danger' : 'muted'} center accessibilityLiveRegion="polite">
        {voice.listening ? `${t('hw.voiceListening')} · ${clock(voice.seconds)}` : t('hw.voiceStart')}
      </Txt>
      <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
        {t('hw.voiceMax')}
      </Txt>
      {error ? (
        <View style={{ alignSelf: 'stretch' }}>
          <Banner tone="error" message={error} />
        </View>
      ) : null}
      {!voice.listening ? <Button label={t('common.cancel')} tone="secondary" size="sm" fill={false} onPress={onClose} disabled={busy || starting} /> : null}
    </View>
  );
}
