import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { Animated, Linking, Platform, Pressable, View } from 'react-native';

import { Banner, Button, Row, Txt, VStack } from '@/components/ui';
import { MicGlyph, PlayGlyph } from '@/features/gyan-ui';
import { BUCKETS, signedUrl } from '@/lib/api/files';
import { logError, report } from '@/lib/errors';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

import { announceIos } from './a11y';
import { voiceActivity, type MediaRef, type VoiceActivity, type VoiceVerse } from './activity';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle, useBrokenContentLog } from './lesson-frame';
import { haptic, usePulse, useReduceMotion } from './motion';
import { scoreStars } from './points';
import { speakVerse, stopSpeaking } from './speech';
import { BROKEN_STEP_STARS, stepActivity, type StepProps } from './step-types';
import { TriesCounter, TryResult, usePracticeTries } from './tries';
import { displayWords, matchAll, matchVerse, type VerseCheck, type VerseText } from './voice-match';
import { addResult, continuousSupported, endAction, errorAction, freshSession, heardCandidates, heardText, type Mode, type Session } from './voice-session';

type Phase = number | 'all';
type Problem = { text: string; action?: 'english' | 'settings' | 'replay' };
/** The parts of the recogniser's events this screen reads. */
type ResultEvent = { isFinal: boolean; results: { transcript: string }[] };
type ErrorEvent = { error: ExpoSpeechRecognitionErrorCode; message: string };

/** After Stop, how long to wait for the recogniser to finish before aborting it (some Android recognisers hang). */
const STOP_GRACE_MS = 3000;
/** After an abort, how long to wait for its "end" before finishing here. */
const ABORT_GRACE_MS = 1500;

function recognitionAvailable(): boolean {
  try {
    return ExpoSpeechRecognitionModule.isRecognitionAvailable();
  } catch (err) {
    logError('checking speech recognition (listening turned off)', err);
    return false;
  }
}

/**
 * Voice (Navkar first): listen to each line (its recording, else the phone's
 * text-to-speech), say it back while the phone listens (device speech
 * recognition), see the words to practise, then say it all. Each "say it all"
 * is a practice try (points up to the daily cap).
 */
export function VoiceStep({ ctx }: StepProps) {
  const t = useT();
  const activity = voiceActivity(stepActivity(ctx.step));
  useBrokenContentLog(activity.verses.length === 0, ctx.step, 'no lines it can show');
  if (activity.verses.length === 0) {
    return (
      <LessonFrame frame={ctx.frame} answered footer={<StepFooter label={t('learn.continue')} busy={ctx.frame.saving} onPress={() => ctx.finish({ kind: 'step', stars: BROKEN_STEP_STARS })} />}>
        <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
        <Txt variant="small" color="muted">
          {t('gyan.versesMissing')}
        </Txt>
      </LessonFrame>
    );
  }
  return <VoicePractice ctx={ctx} activity={activity} />;
}

function VoicePractice({ ctx, activity }: StepProps & { activity: VoiceActivity }) {
  const t = useT();
  const reduce = useReduceMotion();
  const verses = activity.verses;
  const tries = usePracticeTries(ctx);
  const [phase, setPhase] = useState<Phase>(0);
  const [checks, setChecks] = useState<Record<number, VerseCheck>>({});
  const [allCheck, setAllCheck] = useState<{ verses: VerseCheck[]; overall: VerseCheck } | null>(null);
  const [listening, setListening] = useState<Mode | null>(null);
  const [heard, setHeard] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [lang, setLang] = useState(activity.lang);
  const [speaking, setSpeaking] = useState(false);
  const [asking, setAsking] = useState(false);
  const [passedAll, setPassedAll] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [triedAll, setTriedAll] = useState(false);
  // A new number after a recording fails, so Retry loads it again instead of resuming the failed one.
  const [playTry, setPlayTry] = useState(0);
  const [available] = useState(recognitionAvailable);
  const session = useRef<Session>(freshSession(null));
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signedAudio = useRef(new Map<string, string>());
  const pulse = usePulse(listening !== null, reduce);

  const clearStopTimer = () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
  };

  useEffect(
    () => () => {
      if (stopTimer.current) clearTimeout(stopTimer.current);
      try {
        if (session.current.mode) ExpoSpeechRecognitionModule.abort();
      } catch (err) {
        logError('stopping speech recognition on leaving', err);
      }
      session.current = freshSession(null);
      stopSpeaking();
    },
    [],
  );

  const micOff = (): Problem =>
    Platform.OS === 'web'
      ? { text: t('gyan.micBlockedWeb') } // a browser has no settings screen to open
      : { text: Platform.OS === 'android' ? t('gyan.micNotAllowedAndroid') : t('gyan.micNotAllowed'), action: 'settings' };
  const noSpeech = (): Problem => ({ text: Platform.OS === 'android' ? t('gyan.noSpeechAndroid') : t('gyan.noSpeech') });

  const problemFor = (code: ExpoSpeechRecognitionErrorCode): Problem => {
    switch (code) {
      case 'no-speech':
      case 'speech-timeout':
        return noSpeech();
      case 'not-allowed':
        return micOff();
      case 'service-not-allowed':
        return { text: Platform.OS === 'web' ? t('gyan.listenWeb') : t('gyan.listenUnavailable') };
      case 'language-not-supported':
        return lang.toLowerCase().startsWith('en') ? { text: t('gyan.listenUnavailable') } : { text: t('gyan.langUnavailable'), action: 'english' };
      case 'network':
        return { text: t('gyan.listenNetwork') };
      case 'busy':
      case 'audio-capture':
        return { text: t('gyan.listenBusy') };
      case 'interrupted':
        return { text: t('gyan.listenInterrupted') };
      default:
        return { text: t('gyan.listenFailed') };
    }
  };

  const evaluate = (mode: Mode, s: Session) => {
    const candidates = heardCandidates(s);
    if (candidates.length === 0) {
      setProblem(noSpeech());
      return;
    }
    if (mode === 'verse' && typeof phase === 'number') {
      const r = matchVerse(verses[phase], candidates, activity.passRatio);
      setChecks({ ...checks, [phase]: r });
      haptic(r.pass ? 'right' : 'wrong');
      announceIos(r.pass ? t('gyan.versePass') : t('gyan.verseFix')); // the footer note is a live region elsewhere
      return;
    }
    const r = matchAll(verses, candidates, activity.passRatio);
    setAllCheck(r);
    setTriedAll(true);
    if (r.overall.pass) {
      setPassedAll(true);
      setBestScore(Math.max(bestScore, r.overall.score));
    }
    void tries.record({ success: r.overall.pass, score: r.overall.score, detail: { mode: 'say_all', found: r.overall.found, total: r.overall.total, lang } });
  };

  /** The session is over: score what was heard, unless an error was already shown. */
  const finishSession = (s: Session) => {
    const mode = s.mode;
    s.mode = null;
    clearStopTimer();
    setListening(null);
    if (!mode || s.errored) return;
    if (s.forced && !heardText(s)) {
      setProblem({ text: t('gyan.listenFailed') });
      return;
    }
    evaluate(mode, s);
  };

  /** Stop got no answer: abort, and finish here if even the abort brings no "end". */
  const forceEnd = () => {
    const s = session.current;
    if (!s.mode) return;
    s.forced = true;
    clearStopTimer();
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (err) {
      logError('aborting speech recognition after stop got no answer', err);
    }
    stopTimer.current = setTimeout(() => latest.current.finishIfOpen(s), ABORT_GRACE_MS);
  };

  // Timers call the newest handlers (their state is current), not the ones from when they were set.
  const latest = useRef({ forceEnd, finishIfOpen: (s: Session) => void s });
  useEffect(() => {
    latest.current = {
      forceEnd,
      finishIfOpen: (s: Session) => {
        if (session.current === s && s.mode) finishSession(s);
      },
    };
  });

  const startRecognizer = (mode: Mode, restart: boolean): boolean => {
    const lines = mode === 'all' ? verses : typeof phase === 'number' ? [verses[phase]] : [];
    const hints = [...new Set(lines.flatMap((v) => [...displayWords(v.text), ...(v.translit ? displayWords(v.translit) : [])]))].slice(0, 100);
    try {
      ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: mode === 'all' && !restart, maxAlternatives: 3, contextualStrings: hints, iosTaskHint: 'dictation', addsPunctuation: false });
      return true;
    } catch (err) {
      logError('starting speech recognition', err);
      return false;
    }
  };

  useSpeechRecognitionEvent('result', (e: ResultEvent) => {
    const s = session.current;
    if (!s.mode) return;
    addResult(
      s,
      e.results.map((r) => r.transcript).filter((x) => !!x && !!x.trim()),
      e.isFinal,
    );
    setHeard(heardText(s));
  });
  useSpeechRecognitionEvent('error', (e: ErrorEvent) => {
    const s = session.current;
    const action = errorAction(s, e.error);
    if (action === 'ignore' || action === 'evaluate') return; // "evaluate": the end scores what was heard
    if (action === 'pause') {
      s.quiet += 1;
      return;
    }
    s.errored = true;
    if (e.error !== 'no-speech' && e.error !== 'speech-timeout') logError(`speech recognition (${lang})`, `${e.error}: ${e.message}`);
    setProblem(problemFor(e.error));
  });
  useSpeechRecognitionEvent('end', () => {
    const s = session.current;
    const next = endAction(s, Date.now());
    if (next === 'ignore') return;
    if (next === 'restart' && s.mode) {
      // Old Android stopped at a pause: listen on, keeping what was heard.
      s.restarts += 1;
      if (startRecognizer(s.mode, true)) return;
    }
    finishSession(s);
  });

  const start = (mode: Mode) => {
    stopSpeaking();
    ctx.audio.stop();
    setSpeaking(false);
    clearStopTimer();
    const restart = mode === 'all' && !continuousSupported(Platform.OS, Platform.Version);
    session.current = freshSession(mode, restart, Date.now());
    setHeard('');
    if (!startRecognizer(mode, restart)) {
      session.current = freshSession(null);
      setProblem({ text: t('gyan.listenFailed') });
      return;
    }
    setListening(mode);
  };

  /** The member tapped to finish: let the recogniser end; a second tap, or no answer, aborts it. */
  const requestStop = () => {
    const s = session.current;
    if (!s.mode) return;
    if (s.stopRequested) {
      forceEnd();
      return;
    }
    s.stopRequested = true;
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch (err) {
      logError('stopping speech recognition', err);
      forceEnd();
      return;
    }
    clearStopTimer();
    stopTimer.current = setTimeout(() => latest.current.forceEnd(), STOP_GRACE_MS);
  };

  const listen = async (mode: Mode) => {
    if (listening) {
      requestStop();
      return;
    }
    setProblem(null);
    if (!available) {
      setProblem({ text: Platform.OS === 'web' ? t('gyan.listenWeb') : t('gyan.listenUnavailable') });
      return;
    }
    if (Platform.OS !== 'web') {
      try {
        const perm = await ExpoSpeechRecognitionModule.getPermissionsAsync();
        if (!perm.granted) {
          if (perm.canAskAgain) setAsking(true);
          else setProblem(micOff());
          return;
        }
      } catch (err) {
        logError('checking microphone and speech permissions', err);
        setProblem({ text: t('gyan.listenFailed') });
        return;
      }
    }
    start(mode);
  };

  const allowAndStart = async () => {
    setAsking(false);
    // The phase now, not when the card opened.
    const mode: Mode = phase === 'all' ? 'all' : 'verse';
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        // Still allowed to ask: the next tap on the microphone asks again.
        setProblem(perm.canAskAgain ? { text: t('gyan.micAskAgain') } : micOff());
        return;
      }
    } catch (err) {
      logError('asking for microphone and speech permissions', err);
      setProblem({ text: t('gyan.listenFailed') });
      return;
    }
    start(mode);
  };

  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch (err) {
      logError('opening settings', err);
      setProblem({ text: t('gyan.openSettingsFailed') });
    }
  };

  const audioId = (which: Phase, n: number) => `${ctx.step.id}:${which}:${n}`;

  const speak = (text: VerseText) => {
    ctx.audio.stop();
    setSpeaking(true);
    void speakVerse(text, activity.lang, (ok) => {
      setSpeaking(false);
      if (!ok) setProblem({ text: t('gyan.speakFailed') });
    });
  };

  /** A verse's own recording: a URL, or a content-bucket key signed for an hour. */
  const playRecording = async (which: number, ref: Exclude<MediaRef, { kind: 'asset' }>, n: number) => {
    let url = ref.kind === 'url' ? ref.url : (signedAudio.current.get(ref.key) ?? null);
    if (!url && ref.kind === 'storage') {
      try {
        url = await signedUrl(ref.key, BUCKETS.content, 'load the recording');
        signedAudio.current.set(ref.key, url);
      } catch (err) {
        setProblem({ text: report(err, 'load the recording').userMessage, action: 'replay' });
        return;
      }
    }
    if (!url) return;
    stopSpeaking();
    setSpeaking(false);
    ctx.audio.toggle(audioId(which, n), url);
  };

  const play = (which: Phase, n = playTry) => {
    setProblem(null);
    const verse = typeof which === 'number' ? verses[which] : null;
    if (verse && typeof which === 'number' && verse.audio) {
      if (verse.audio.kind !== 'asset') {
        void playRecording(which, verse.audio, n);
        return;
      }
      // No recordings are bundled with the app yet: the phone reads the line, and says so.
      logError(`Gyan Path step ${ctx.step.id}: verse recording "${verse.audio.name}" is not bundled (reading it aloud instead)`, verse.audio);
      setProblem({ text: t('gyan.recordingMissing') });
    }
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    speak(verse ?? { text: verses.map((v) => v.text).join(' । '), translit: verses.every((v) => v.translit) ? verses.map((v) => v.translit).join(', ') : null });
  };

  /** Try a failed recording again from the start (a new player item, and a new link for a stored one). */
  const replay = () => {
    const verse = typeof phase === 'number' ? verses[phase] : null;
    if (verse?.audio?.kind === 'storage') signedAudio.current.delete(verse.audio.key);
    const n = playTry + 1;
    setPlayTry(n);
    play(phase, n);
  };

  const goTo = (next: Phase) => {
    clearStopTimer();
    if (listening) {
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch (err) {
        logError('stopping speech recognition', err);
      }
      session.current = freshSession(null);
      setListening(null);
    }
    stopSpeaking();
    ctx.audio.stop();
    setSpeaking(false);
    setAsking(false);
    setProblem(null);
    setHeard('');
    setPhase(next);
  };

  const fixAction =
    problem?.action === 'english'
      ? {
          label: t('gyan.useEnglish'),
          onPress: () => {
            setLang('en-IN');
            setProblem(null);
          },
        }
      : problem?.action === 'settings'
        ? { label: t('gyan.openSettings'), onPress: () => void openSettings() }
        : problem?.action === 'replay'
          ? { label: t('common.retry'), onPress: replay }
          : undefined;

  const verseIndex = typeof phase === 'number' ? phase : null;
  const verse = verseIndex !== null ? verses[verseIndex] : null;
  const check = verseIndex !== null ? checks[verseIndex] : null;
  const playingId = verseIndex !== null ? audioId(verseIndex, playTry) : null;
  const audioPlaying = !!playingId && ctx.audio.current === playingId && ctx.audio.playing;
  const listenLabel = speaking || audioPlaying ? t('gyan.speaking') : check || allCheck ? t('gyan.listenAgain') : t('gyan.listen');

  const footer =
    verse && verseIndex !== null ? (
      <StepFooter
        feedback={check ? { text: check.pass ? t('gyan.versePass') : t('gyan.verseFix'), ok: check.pass } : null}
        label={t('gyan.nextVerse')}
        tone={check?.pass ? 'go' : 'skip'}
        onPress={() => goTo(verseIndex + 1 < verses.length ? verseIndex + 1 : 'all')}
      />
    ) : (
      <StepFooter
        feedback={allCheck ? { text: allCheck.overall.pass ? t('gyan.sayAllPass') : t('gyan.sayAllFix'), ok: allCheck.overall.pass } : null}
        label={passedAll || triedAll ? t('learn.continue') : t('gyan.skipSpeaking')}
        tone={passedAll || triedAll ? 'go' : 'skip'}
        busy={ctx.frame.saving}
        disabled={tries.saving || !!listening}
        note={passedAll ? null : t('gyan.skipSpeakingNote')}
        // A pass scores by its score; skipping (a phone that can't listen) or not passing is 1 star, still with the step's first-time points.
        onPress={() => ctx.finish({ kind: 'step', stars: tries.savedStars ?? (passedAll ? scoreStars(bestScore) : 1), savedByTry: tries.savedSuccess })}
        secondary={verses.length && !listening ? { label: t('gyan.prevCard'), onPress: () => goTo(verses.length - 1) } : null}
      />
    );

  return (
    <LessonFrame frame={ctx.frame} answered={phase === 'all' && (passedAll || triedAll)} footer={footer}>
      <StepTitle>{ctx.step.title || ctx.level.name}</StepTitle>
      {phase === 0 ? (
        <Txt variant="small" color="muted">
          {t('gyan.voiceIntro')}
        </Txt>
      ) : null}
      {phase === 'all' ? <TriesCounter tries={tries} /> : null}

      {verse && verseIndex !== null ? (
        <VerseCard verse={verse} label={t('gyan.verseOf', { n: verseIndex + 1, total: verses.length })} check={check} />
      ) : (
        <VStack gap={space.md}>
          <Txt variant="headline" color="navy" accessibilityRole="header">
            {t('gyan.sayAllTitle')}
          </Txt>
          <Txt variant="small" color="muted">
            {t('gyan.sayAllBody')}
          </Txt>
          {verses.map((v, i) => (
            <VerseCard key={i} verse={v} label={t('gyan.verseOf', { n: i + 1, total: verses.length })} check={allCheck?.verses[i] ?? null} compact />
          ))}
        </VStack>
      )}

      <Row gap={space.sm} style={{ justifyContent: 'center' }}>
        <Pressable
          onPress={() => play(phase)}
          accessibilityRole="button"
          accessibilityLabel={listenLabel}
          disabled={!!listening}
          style={({ pressed }) => ({ minHeight: touch.min + 4, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.navy, borderRadius: radii.pill, paddingHorizontal: 18, opacity: listening ? 0.5 : pressed ? 0.85 : 1 })}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' }}>
            <PlayGlyph size={14} paused={speaking || audioPlaying} />
          </View>
          <Txt variant="smallStrong" color="white">
            {listenLabel}
          </Txt>
        </Pressable>
      </Row>
      {ctx.audio.error ? <Banner tone="error" message={ctx.audio.error} action={{ label: t('common.retry'), onPress: replay }} /> : null}

      {asking ? (
        <VStack gap={space.sm} style={{ backgroundColor: colors.navyTint, borderRadius: radii.row, padding: 14 }}>
          <Txt variant="section" color="navy">
            {t('gyan.micWhyTitle')}
          </Txt>
          <Txt variant="small" color="ink2">
            {t('gyan.micWhy')}
          </Txt>
          <Button label={t('gyan.allowMic')} size="md" onPress={() => void allowAndStart()} />
          <Button label={t('common.cancel')} tone="ghost" size="sm" onPress={() => setAsking(false)} />
        </VStack>
      ) : (
        <View style={{ alignItems: 'center', gap: space.sm }}>
          <View style={{ width: 104, height: 104, alignItems: 'center', justifyContent: 'center' }}>
            {listening ? (
              <Animated.View
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  width: 104,
                  height: 104,
                  borderRadius: 52,
                  backgroundColor: colors.saffron,
                  opacity: reduce !== false ? 0.3 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: reduce !== false ? [] : [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] }) }],
                }}
              />
            ) : null}
            <Pressable
              onPress={() => void listen(phase === 'all' ? 'all' : 'verse')}
              accessibilityRole="button"
              accessibilityLabel={listening ? t('gyan.stopA11y') : phase === 'all' ? t('gyan.sayAll') : t('gyan.sayItA11y')}
              accessibilityState={{ busy: !!listening }}
              style={({ pressed }) => ({ width: 96, height: 96, borderRadius: 48, backgroundColor: listening ? colors.danger : colors.saffron, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
              <MicGlyph size={40} />
            </Pressable>
          </View>
          <Txt variant="smallStrong" color={listening ? 'danger' : 'muted'} accessibilityLiveRegion="polite">
            {listening ? t('gyan.listening') : phase === 'all' ? t('gyan.sayAll') : check ? t('gyan.tryAgain') : t('gyan.sayIt')}
          </Txt>
          {heard ? (
            <Txt variant="caption" color="muted" center>
              {t('gyan.heard', { text: heard })}
            </Txt>
          ) : null}
        </View>
      )}

      {problem ? <Banner tone="error" message={problem.text} action={fixAction} /> : null}
      {phase === 'all' ? <TryResult tries={tries} /> : null}
      <ExtrasBox extras={activity} showTip={phase === 0 || phase === 'all'} />
    </LessonFrame>
  );
}

/** A verse: script, transliteration (the words to fix in red after a check) and meaning. */
function VerseCard({ verse, label, check, compact }: { verse: VoiceVerse; label: string; check: VerseCheck | null; compact?: boolean }) {
  const t = useT();
  const shownWords = check?.words ?? null;
  const a11y = shownWords ? shownWords.map((w) => (w.ok ? t('gyan.wordOk', { word: w.word }) : t('gyan.wordFix', { word: w.word }))).join('. ') : undefined;
  const roman = verse.translit;
  return (
    <VStack gap={compact ? 2 : 6} style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: check ? (check.pass ? colors.greenBorder : colors.brownBorder) : colors.border, borderRadius: radii.xl, paddingVertical: compact ? 10 : 16, paddingHorizontal: 16 }}>
      <Txt variant="eyebrow" color="brown">
        {label}
      </Txt>
      {roman ? (
        <Txt variant={compact ? 'section' : 'title'} color="ink" selectable>
          {verse.text}
        </Txt>
      ) : null}
      <Txt variant={compact ? 'small' : 'headline'} color="navy" accessibilityLabel={a11y}>
        {shownWords
          ? shownWords.map((w, i) => (
              <Txt key={i} variant={compact ? 'smallStrong' : 'headline'} color={w.ok ? 'green' : 'danger'} style={w.ok ? null : { textDecorationLine: 'underline' }}>
                {`${w.word}${i < shownWords.length - 1 ? ' ' : ''}`}
              </Txt>
            ))
          : (roman ?? verse.text)}
      </Txt>
      {verse.meaning && !compact ? (
        <Txt variant="small" color="muted">
          {`${t('gyan.meaning')}: ${verse.meaning}`}
        </Txt>
      ) : null}
    </VStack>
  );
}
