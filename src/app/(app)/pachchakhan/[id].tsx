import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Band, Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Card, Txt, VStack } from '@/components/ui';
import { clock, useInAppAudio } from '@/features/audio';
import { PlayGlyph } from '@/features/gyan-ui';
import { pickTranslation } from '@/i18n';
import { getContentItem } from '@/lib/api/jainway';
import { formatTimeOfDay } from '@/lib/format';
import { logError, report } from '@/lib/errors';
import { parseClockTime, todayAtMinutes } from '@/lib/learning';
import { cancelLocalReminder, scheduleLocalReminder } from '@/lib/push';
import { readPref, writePref } from '@/lib/storage';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useFeedback } from '@/providers/feedback';
import { useSettings } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const PREF = 'pachchakhanReminders';
type Saved = Record<string, { id: string; day: string }>;

/**
 * Pachchakhan detail (prototype Main L550–563): name + when, what, sutra,
 * in-app recitation, and "Remind me today" (a local notification 10 minutes
 * before today's time, or at it when that is sooner).
 */
export default function PachchakhanScreen() {
  const { t, language } = useSettings();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { center } = useApp();
  const { toast } = useFeedback();
  const state = useLoad(() => getContentItem(id), [id], 'load this pachchakhan');
  const audio = useInAppAudio(t('learn.audioFailed'));
  const [saved, setSaved] = useState<Saved>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const todayKey = new Date().toDateString();

  useEffect(() => {
    let alive = true;
    readPref<Saved>(PREF, {}).then((r) => {
      if (alive) setSaved(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  const current = saved[id]?.day === todayKey ? saved[id] : null;

  const toggleReminder = async (name: string, when: string | null, time: unknown) => {
    setError(null);
    setBusy(true);
    try {
      const next = { ...saved };
      if (current) {
        await cancelLocalReminder(current.id);
        delete next[id];
      } else {
        const minutes = parseClockTime(typeof time === 'string' ? time : null) ?? parseClockTime(when);
        if (minutes === null) {
          setError(t('library.reminderNoTime'));
          return;
        }
        const now = new Date();
        const due = todayAtMinutes(minutes, now, center?.time_zone);
        if (due.getTime() <= now.getTime()) {
          setError(t('library.reminderPassed'));
          return;
        }
        const early = new Date(due.getTime() - 10 * 60000);
        const at = early.getTime() > now.getTime() + 30000 ? early : due;
        const nid = await scheduleLocalReminder(t('library.reminderTitle', { name }), t('library.reminderBody', { when: when ?? '' }), at);
        if (!nid) {
          setError(t('library.reminderUnavailable'));
          return;
        }
        next[id] = { id: nid, day: todayKey };
        toast(t('library.reminderSet', { time: formatTimeOfDay(`${at.getHours()}:${String(at.getMinutes()).padStart(2, '0')}`) }));
      }
      setSaved(next);
      await writePref(PREF, next).catch((err: unknown) => logError('saving pachchakhan reminders on this device', err));
    } catch (err) {
      setError(report(err, 'set a reminder').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('library.pachTitle')}>
      <Loaded state={state}>
        {(item) => {
          const tr = pickTranslation({ title: item.title, body_md: item.body_md ?? '' }, item.translations, language);
          const meta = item.metadata && typeof item.metadata === 'object' && !Array.isArray(item.metadata) ? (item.metadata as Record<string, unknown>) : {};
          const when = typeof meta.when === 'string' ? meta.when : null;
          const url = item.media_url;
          const playing = audio.current === item.id && audio.playing;
          const listenLabel = !url ? t('library.listenSoon') : playing ? t('learn.playing', { time: clock(audio.position) }) : t('library.listen');
          return (
            <VStack gap={14}>
              <Band color={colors.navy} title={tr.title} subtitle={when ?? undefined} />
              {typeof meta.what === 'string' ? (
                <Txt variant="body" color="ink2" style={{ lineHeight: 23 }}>
                  {meta.what}
                </Txt>
              ) : null}
              <Card>
                <Txt variant="bodyStrong">{t('library.sutra')}</Txt>
                {tr.body_md ? (
                  <Txt variant="small" selectable>
                    {tr.body_md}
                  </Txt>
                ) : (
                  <Txt variant="small" color="muted" style={{ fontStyle: 'italic' }}>
                    {t('library.sutraPending')}
                  </Txt>
                )}
              </Card>
              {audio.error ? <Banner tone="error" message={audio.error} /> : null}
              <Pressable
                disabled={!url}
                onPress={() => {
                  if (url) audio.toggle(item.id, url);
                }}
                accessibilityRole="button"
                accessibilityState={{ disabled: !url, selected: playing }}
                accessibilityLabel={listenLabel}
                style={({ pressed }) => ({ borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: radii.row, minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 16, opacity: pressed ? 0.85 : 1 })}>
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
                  <PlayGlyph size={16} paused={playing} color={url ? colors.navy : colors.faint} />
                </View>
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: url ? colors.ink : colors.faint }}>{listenLabel}</Text>
              </Pressable>
              {error ? <Banner tone="error" message={error} /> : null}
              <Pressable
                onPress={() => void toggleReminder(tr.title, when, meta.time ?? meta.remind_at)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ busy, checked: !!current }}
                style={({ pressed }) => ({ backgroundColor: current ? colors.green : colors.navy, borderRadius: radii.cta, minHeight: 52, alignItems: 'center', justifyContent: 'center', opacity: pressed || busy ? 0.85 : 1 })}>
                <Text style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: colors.white }}>{current ? t('library.reminderOn') : t('library.remind')}</Text>
              </Pressable>
              <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
                {t('library.guidance')}
              </Txt>
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
