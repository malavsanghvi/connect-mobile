import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent, type ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Linking, Platform, Pressable, View } from 'react-native';

import { Banner, Button, Row, Txt, VStack } from '@/components/ui';
import { MicGlyph, PlayGlyph } from '@/features/gyan-ui';
import { logError } from '@/lib/errors';
import { useT } from '@/providers/settings';
import { colors, radii, space, touch } from '@/theme';

import { voiceActivity, type VoiceActivity, type VoiceVerse } from './activity';
import { ExtrasBox, LessonFrame, StepFooter, StepTitle } from './lesson-frame';
import { haptic, usePulse, useReduceMotion } from './motion';
import { scoreStars } from './points';
import { speakVerse, stopSpeaking } from './speech';
import { stepActivity, type StepProps } from './step-types';
import { TriesCounter, TryResult, usePracticeTries } from './tries';
import { displayWords, matchAll, matchVerse, type VerseCheck } from './voice-match';

type Mode = 'verse' | 'all';
type Phase = number | 'all';
type Problem = { text: string; action?: 'english' | 'settings' };
type Session = { mode: Mode | null; finals: string[]; lastAlts: string[]; interim: string; errored: boolean };

const freshSession = (mode: Mode | null): Session => ({ mode, finals: [], lastAlts: [], interim: '', errored: false });

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
  if (activity.verses.length === 0) {
    return (
      <LessonFrame frame={ctx.frame} answered footer={<StepFooter label={t('learn.continue')} busy={ctx.frame.saving} onPress={() => ctx.finish({ kind: 'step', stars: 3 })} />}>
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
  const [asking, setAsking] = useState<Mode | null>(null);
  const [passedAll, setPassedAll] = useState(false);
  const [bestScore, setBestScore] = useState(0);
  const [triedAll, setTriedAll] = useState(false);
  const [available] = useState(recognitionAvailable);
  const session = useRef<Session>(freshSession(null));
  const pulse = usePulse(listening !== null, reduce);

  useEffect(
    () => () => {
      try {
        if (session.current.mode) ExpoSpeechRecognitionModule.abort();
      } catch (err) {
        logError('stopping speech recognition on leaving', err);
      }
      stopSpeaking();
    },
    [],
  );

  const problemFor = (code: ExpoSpeechRecognitionErrorCode): Problem => {
    switch (code) {
      case 'no-speech':
      case 'speech-timeout':
        return { text: t('gyan.noSpeech') };
      case 'not-allowed':
        return { text: t('gyan.micNotAllowed'), action: 'settings' };
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
    const said = [...s.finals, s.interim].join(' ').trim();
    if (!said) {
      setProblem({ text: t('gyan.noSpeech') });
      return;
    }
    const before = s.finals.slice(0, -1).join(' ');
    const candidates = s.lastAlts.length > 1 ? s.lastAlts.map((a) => `${before} ${a}`.trim()) : [said];
    if (mode === 'verse' && typeof phase === 'number') {
      const r = matchVerse(verses[phase], candidates, activity.passRatio);
      setChecks({ ...checks, [phase]: r });
      haptic(r.pass ? 'right' : 'wrong');
      AccessibilityInfo.announceForAccessibility(r.pass ? t('gyan.versePass') : t('gyan.verseFix'));
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

  useSpeechRecognitionEvent('result', (e) => {
    const s = session.current;
    if (!s.mode) return;
    const alts = e.results.map((r) => r.transcript).filter((x) => !!x && !!x.trim());
    if (e.isFinal) {
      s.finals.push(alts[0] ?? '');
      s.lastAlts = alts;
      s.interim = '';
    } else s.interim = alts[0] ?? '';
    setHeard([...s.finals, s.interim].join(' ').trim());
  });
  useSpeechRecognitionEvent('error', (e) => {
    const s = session.current;
    if (!s.mode || e.error === 'aborted') return;
    s.errored = true;
    if (e.error !== 'no-speech' && e.error !== 'speech-timeout') logError(`speech recognition (${lang})`, `${e.error}: ${e.message}`);
    setProblem(problemFor(e.error));
  });
  useSpeechRecognitionEvent('end', () => {
    const s = session.current;
    const mode = s.mode;
    s.mode = null;
    setListening(null);
    if (mode && !s.errored) evaluate(mode, s);
  });

  const start = (mode: Mode) => {
    stopSpeaking();
    ctx.audio.stop();
    setSpeaking(false);
    session.current = freshSession(mode);
    setHeard('');
    const lines = mode === 'all' ? verses : typeof phase === 'number' ? [verses[phase]] : [];
    const hints = [...new Set(lines.flatMap((v) => [...displayWords(v.text), ...(v.translit ? displayWords(v.translit) : [])]))].slice(0, 100);
    try {
      ExpoSpeechRecognitionModule.start({ lang, interimResults: true, continuous: mode === 'all', maxAlternatives: 3, contextualStrings: hints, iosTaskHint: 'dictation', addsPunctuation: false });
      setListening(mode);
    } catch (err) {
      logError('starting speech recognition', err);
      session.current = freshSession(null);
      setProblem({ text: t('gyan.listenFailed') });
    }
  };

  const listen = async (mode: Mode) => {
    if (listening) {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch (err) {
        logError('stopping speech recognition', err);
        session.current = freshSession(null);
        setListening(null);
        setProblem({ text: t('gyan.listenFailed') });
      }
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
          if (perm.canAskAgain) setAsking(mode);
          else setProblem({ text: t('gyan.micNotAllowed'), action: 'settings' });
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
    const mode = asking;
    setAsking(null);
    if (!mode) return;
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setProblem({ text: t('gyan.micNotAllowed'), action: perm.canAskAgain ? undefined : 'settings' });
        return;
      }
    } catch (err) {
      logError('asking for microphone and speech permissions', err);
      setProblem({ text: t('gyan.listenFailed') });
      return;
    }
    start(mode);
  };

  const play = (which: Phase) => {
    setProblem(null);
    const verse = typeof which === 'number' ? verses[which] : null;
    if (verse?.audio) {
      ctx.audio.toggle(`${ctx.step.id}:${which}`, verse.audio);
      return;
    }
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    ctx.audio.stop();
    setSpeaking(true);
    const text = verse ?? { text: verses.map((v) => v.text).join(' । '), translit: verses.every((v) => v.translit) ? verses.map((v) => v.translit).join(', ') : null };
    void speakVerse(text, activity.lang, (ok) => {
      setSpeaking(false);
      if (!ok) setProblem({ text: t('gyan.speakFailed') });
    });
  };

  const goTo = (next: Phase) => {
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
    setProblem(null);
    setHeard('');
    setPhase(next);
  };

  const fixAction = problem?.action === 'english' ? { label: t('gyan.useEnglish'), onPress: () => { setLang('en-IN'); setProblem(null); } } : problem?.action === 'settings' ? { label: t('gyan.openSettings'), onPress: () => void Linking.openSettings().catch((err: unknown) => logError('opening settings', err)) } : undefined;

  const verseIndex = typeof phase === 'number' ? phase : null;
  const verse = verseIndex !== null ? verses[verseIndex] : null;
  const check = verseIndex !== null ? checks[verseIndex] : null;
  const playingId = verseIndex !== null ? `${ctx.step.id}:${verseIndex}` : null;
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
        onPress={() => ctx.finish({ kind: 'step', stars: tries.savedStars ?? (passedAll ? scoreStars(bestScore) : 2), savedByTry: tries.savedSuccess })}
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

      {asking ? (
        <VStack gap={space.sm} style={{ backgroundColor: colors.navyTint, borderRadius: radii.row, padding: 14 }}>
          <Txt variant="section" color="navy">
            {t('gyan.micWhyTitle')}
          </Txt>
          <Txt variant="small" color="ink2">
            {t('gyan.micWhy')}
          </Txt>
          <Button label={t('gyan.allowMic')} size="md" onPress={() => void allowAndStart()} />
          <Button label={t('common.cancel')} tone="ghost" size="sm" onPress={() => setAsking(null)} />
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
