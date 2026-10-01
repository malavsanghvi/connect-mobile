import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useState } from 'react';
import { Animated, Pressable, View } from 'react-native';

import { Banner, LinkText, Txt, VStack } from '@/components/ui';
import { clock } from '@/features/audio';
import { MicGlyph } from '@/features/gyan-ui';
import { uploadRecitation } from '@/lib/api/gyan';
import { logError, report } from '@/lib/errors';
import { useT } from '@/providers/settings';
import { colors } from '@/theme';

import { ListenButton } from './learn-step';
import { LessonFrame, StepFooter } from './lesson-frame';
import { haptic, usePulse, useReduceMotion } from './motion';
import type { StepProps } from './step-types';

type Recording = { path: string | null; uploaded: boolean };

/** Recite: a real recording, uploaded for the teacher (gyan_progress.recording_path, 90-day retention). */
export function ReciteStep({ ctx }: StepProps) {
  const t = useT();
  const reduce = useReduceMotion();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const rec = useAudioRecorderState(recorder, 250);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'saving'>('idle');
  const [recording, setRecording] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const pulse = usePulse(phase === 'listening', reduce);
  const audioUrl = ctx.item?.media_url ?? ctx.levelAudio;

  const start = async () => {
    setError(null);
    try {
      ctx.audio.stop();
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError(t('learn.micDenied'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(null);
      setPhase('listening');
    } catch (err) {
      logError('starting a recitation recording', err);
      setError(t('learn.micFailed'));
      setPhase('idle');
    }
  };

  const stop = async () => {
    setDuration(rec.durationMillis / 1000);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch((err: unknown) => logError('leaving recording mode (continuing)', err));
    } catch (err) {
      logError('stopping a recitation recording', err);
      setError(t('learn.micFailed'));
      setPhase('idle');
      return;
    }
    const uri = recorder.uri;
    if (!uri) {
      logError('recitation recording has no file', new Error(`uri=${String(uri)}`));
      setError(t('learn.micFailed'));
      setPhase('idle');
      return;
    }
    setPhase('saving');
    try {
      const path = await uploadRecitation({ centerId: ctx.centerId, personId: ctx.personId, stepId: ctx.step.id, uri, existing: ctx.data.progress });
      setRecording({ path, uploaded: true });
      haptic('right');
    } catch (err) {
      report(err, 'upload your recitation');
      setRecording({ path: null, uploaded: false });
    } finally {
      setPhase('idle');
    }
  };

  const listening = phase === 'listening';
  const micBg = recording ? colors.green : listening ? colors.danger : colors.saffron;
  const micText = phase === 'saving' ? t('learn.micSaving') : listening ? t('learn.micListening') : recording ? t('learn.micRecorded', { time: clock(duration) }) : t('learn.micStart');
  const short = ctx.level.name.replace(/\s+sutra$/i, '');
  const done = !!recording;

  return (
    <LessonFrame
      frame={ctx.frame}
      answered={done}
      footer={
        <StepFooter
          feedback={recording ? { text: recording.uploaded ? t('learn.recitationSaved') : t('learn.recitationNotSaved'), ok: recording.uploaded } : null}
          label={done ? t('learn.continue') : t('learn.skipRecitation')}
          tone={done ? 'go' : 'skip'}
          busy={ctx.frame.saving}
          disabled={phase !== 'idle'}
          note={done ? null : t('learn.skipNote')}
          onPress={() => ctx.finish({ kind: 'step', stars: recording?.uploaded ? 3 : 2, recordingPath: recording?.uploaded ? recording.path : null })}
        />
      }>
      {ctx.audio.error ? <Banner tone="error" message={ctx.audio.error} /> : null}
      <VStack gap={14} style={{ alignItems: 'center' }}>
        <Txt variant="display" color="ink" center accessibilityRole="header">
          {t('learn.reciteTitle', { name: short })}
        </Txt>
        <Txt variant="small" color="muted" center style={{ lineHeight: 21 }}>
          {t('learn.reciteBody')}
        </Txt>
        {audioUrl ? (
          <View style={{ alignSelf: 'stretch' }}>
            <ListenButton id={`${ctx.step.id}:ref`} url={audioUrl} audio={ctx.audio} />
          </View>
        ) : null}
        <View style={{ width: 120, height: 120, marginVertical: 12, alignItems: 'center', justifyContent: 'center' }}>
          {listening ? (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                width: 120,
                height: 120,
                borderRadius: 60,
                backgroundColor: colors.saffron,
                opacity: reduce !== false ? 0.3 : pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] }),
                transform: reduce !== false ? [] : [{ scale: pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1.23, 1.23] }) }],
              }}
            />
          ) : null}
          <Pressable
            onPress={() => void (listening ? stop() : start())}
            disabled={phase === 'saving'}
            accessibilityRole="button"
            accessibilityLabel={listening ? t('learn.micStopLabel') : t('learn.micLabel')}
            accessibilityState={{ busy: phase === 'saving' }}
            style={({ pressed }) => ({ width: 120, height: 120, borderRadius: 60, backgroundColor: micBg, alignItems: 'center', justifyContent: 'center', opacity: pressed || phase === 'saving' ? 0.85 : 1 })}>
            <MicGlyph />
          </Pressable>
        </View>
        <Txt variant="bodyStrong" color={recording?.uploaded ? 'green' : 'muted'} accessibilityLiveRegion="polite">
          {listening ? `${micText} · ${clock(rec.durationMillis / 1000)}` : micText}
        </Txt>
        {recording && !listening ? <LinkText label={t('learn.recordAgain')} onPress={() => void start()} /> : null}
        {error ? (
          <View style={{ alignSelf: 'stretch' }}>
            <Banner tone="error" message={error} />
          </View>
        ) : null}
      </VStack>
    </LessonFrame>
  );
}
