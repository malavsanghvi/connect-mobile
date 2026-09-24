import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, Stepper, Toggle, Txt, VStack } from '@/components/ui';
import { boliStatusText } from '@/features/bolis';
import { PlayGlyph } from '@/features/give/icons';
import { useBoliReminders } from '@/features/give/reminders';
import { getBoli, isBoliOpen, placePledge, type BoliWithSummary } from '@/lib/api/bolis';
import { report } from '@/lib/errors';
import { formatCents, formatDateTime, formatTime, formatTimeLeft } from '@/lib/format';
import { boliStatus, canStepDown, clampPledge, stepPledge } from '@/lib/rules';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

const REFRESH_MS = 20000;

/** Digital boli "Make a pledge" (L511–547) and "In-person boli" (L771–791). */
export default function BoliScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useApp();
  const state = useLoad(async () => ({ boli: await getBoli(id), now: new Date() }), [id], 'load this boli');
  const { reload } = state;

  // Live summary: poll while the screen is open (members can't subscribe to other families' entries).
  useEffect(() => {
    const timer = setInterval(() => {
      void reload();
    }, REFRESH_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload reads the latest loader through a ref
  }, [id]);

  const hall = state.data?.boli.kind === 'in_person';
  return (
    <Screen title={hall ? t('bolis.hallTitle') : t('bolis.pledgeTitle')}>
      {!member?.isAdult ? <LockedState /> : <Loaded state={state}>{({ boli, now }) => (boli.kind === 'digital' ? <DigitalBoli boli={boli} now={now} /> : <HallBoli boli={boli} />)}</Loaded>}
    </Screen>
  );
}

function Hero({ color, eyebrow, name, lines }: { color: string; eyebrow?: string; name: string; lines: (string | null)[] }) {
  return (
    <View style={{ borderRadius: radii.xxl, backgroundColor: color, padding: 18, gap: 4 }}>
      {eyebrow ? (
        <Txt variant="eyebrow" color="onBrown" style={{ fontFamily: fonts.body }}>
          {eyebrow}
        </Txt>
      ) : null}
      <Txt color="white" accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 27 }}>
        {name}
      </Txt>
      {lines.filter(Boolean).map((l, i) => (
        <Txt key={i} variant="meta" color="onBrown">
          {l}
        </Txt>
      ))}
    </View>
  );
}

/** Explainer with a video thumbnail and "Read more" for the extra text (prototype L516–527). */
function Explainer({ boli }: { boli: BoliWithSummary }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const main = (boli.description ?? '').trim();
  const extra = (boli.explainer_md ?? '').trim();
  // Without a description, the first paragraph of the explainer is the summary and the rest is "more".
  const [text, more] = main ? [main, extra] : [extra.split(/\n\s*\n/)[0] ?? '', extra.split(/\n\s*\n/).slice(1).join('\n\n')];
  if (!text && !boli.explainer_video_url) return null;
  const play = async () => {
    if (!boli.explainer_video_url) return;
    setError(null);
    setOpening(true);
    try {
      await WebBrowser.openBrowserAsync(boli.explainer_video_url);
    } catch (err) {
      setError(report(err, 'open the explainer video').userMessage);
    } finally {
      setOpening(false);
    }
  };
  return (
    <Card style={{ padding: space.md, flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
      {boli.explainer_video_url ? (
        <Pressable
          onPress={play}
          accessibilityRole="button"
          accessibilityLabel={t('bolis.playVideo')}
          style={({ pressed }) => ({ width: 96, height: 72, borderRadius: radii.lg, backgroundColor: colors.lock, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
          <PlayGlyph color={colors.ground} />
        </Pressable>
      ) : null}
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="caption" color="brown" style={{ fontFamily: fonts.bodyBold, letterSpacing: 0.5 }}>
          {t('bolis.whatIs').toUpperCase()}
        </Txt>
        {text ? (
          <Txt variant="small" style={{ lineHeight: 20 }}>
            {text}
          </Txt>
        ) : null}
        {open && more ? (
          <Txt variant="meta" color="ink2">
            {more}
          </Txt>
        ) : null}
        {opening ? (
          <Txt variant="caption" color="green" style={{ fontFamily: fonts.bodySemi }}>
            {t('bolis.playing')}
          </Txt>
        ) : null}
        {error ? <Banner tone="error" message={error} /> : null}
        {more ? (
          <Pressable onPress={() => setOpen(!open)} accessibilityRole="button" style={{ minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodySemi }}>
              {open ? t('bolis.showLess') : t('bolis.readMore')}
            </Txt>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radii.card, padding: 10 }}>
      <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
        {label}
      </Txt>
      <Txt variant="cardTitle" style={{ fontFamily: fonts.bodyBold }}>
        {value}
      </Txt>
    </View>
  );
}

function DigitalBoli({ boli, now }: { boli: BoliWithSummary; now: Date }) {
  const t = useT();
  const { member, center } = useApp();
  const { toast, confirm } = useFeedback();
  const { invalidate } = useDataVersion();
  const tz = center?.time_zone ?? null;
  const summary = boli.summary;
  const min = summary?.minimumCents ?? boli.floor_cents;
  const step = boli.step_cents;
  const [chosen, setChosen] = useState(min);
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = clampPledge(chosen, min);
  const open = isBoliOpen(boli, summary, now);
  const status = boliStatus({ mineCents: summary?.mineCents, topCents: summary?.topCents, entries: summary?.entries ?? 0, closed: !open });
  const closes = summary?.closesAt ?? boli.closes_at;
  const left = formatTimeLeft(closes, now);

  const place = async () => {
    if (!member?.household) return;
    const ok = await confirm({ title: t('bolis.confirmTitle', { amount: formatCents(amount) }), body: t('bolis.confirmBody', { name: boli.name }), confirmLabel: t('bolis.pledgeAmount', { amount: formatCents(amount) }), tone: 'primary' });
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await placePledge(boli.id, member.household.id, amount, anonymous);
      toast(t('bolis.placed', { amount: formatCents(amount) }));
      setChosen(amount + step);
      invalidate();
    } catch (err) {
      setError(report(err, 'place your pledge').userMessage);
      invalidate();
    } finally {
      setBusy(false);
    }
  };

  const bannerStyle =
    status === 'mine_top' ? { bg: colors.greenTint, fg: colors.greenDark } : status === 'pledged_more' ? { bg: colors.dangerTint, fg: colors.danger } : status === 'closed' ? { bg: colors.chip, fg: colors.muted } : { bg: colors.brownTint, fg: colors.brown };

  return (
    <VStack gap={14}>
      <Hero color={colors.brown} name={boli.name} lines={[boli.eventName, closes ? (left ? t('bolis.closesLeft', { date: formatDateTime(closes, tz), left }) : t('bolis.closedOn', { date: formatDateTime(closes, tz) })) : null]} />
      <Explainer boli={boli} />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <StatTile label={t('bolis.floor')} value={formatCents(boli.floor_cents)} />
        <StatTile label={t('bolis.topPledge')} value={summary?.topCents ? formatCents(summary.topCents) : '—'} />
        <StatTile label={t('bolis.pledges')} value={String(summary?.entries ?? 0)} />
      </View>
      <View style={{ backgroundColor: bannerStyle.bg, borderRadius: radii.card, paddingVertical: space.md, paddingHorizontal: 14 }} accessibilityLiveRegion="polite">
        <Txt variant="smallStrong" style={{ color: bannerStyle.fg }}>
          {boliStatusText(t, status)}
        </Txt>
      </View>
      {open ? (
        <>
          <Card style={{ gap: space.md }}>
            <Txt variant="body" style={{ fontFamily: fonts.bodySemi }}>
              {t('bolis.yourPledge')}
            </Txt>
            <Stepper
              valueLabel={formatCents(amount)}
              onMinus={() => setChosen(stepPledge(amount, step, -1, min))}
              onPlus={() => setChosen(stepPledge(amount, step, 1, min))}
              minusDisabled={!canStepDown(amount, step, min)}
              minusLabel={t('bolis.less', { step: formatCents(step) })}
              plusLabel={t('bolis.more', { step: formatCents(step) })}
            />
            <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
              {t('bolis.minimumLine', { min: formatCents(min), step: formatCents(step) })}
            </Txt>
            <Toggle label={t('bolis.anonymous')} sub={t('bolis.anonymousSub')} value={anonymous} onChange={setAnonymous} />
          </Card>
          {error ? <Banner tone="error" message={error} /> : null}
          <Button label={t('bolis.pledgeAmount', { amount: formatCents(amount) })} onPress={place} busy={busy} />
          <Txt variant="caption" color="muted" center style={{ fontFamily: fonts.body }}>
            {t('bolis.notifyNote')}
          </Txt>
        </>
      ) : null}
    </VStack>
  );
}

function HallBoli({ boli }: { boli: BoliWithSummary }) {
  const t = useT();
  const { center } = useApp();
  const reminders = useBoliReminders();
  const tz = center?.time_zone ?? null;
  const on = reminders.isSet(boli.id);
  return (
    <VStack gap={14}>
      <Hero
        color={colors.brownDark}
        eyebrow={t('bolis.inPersonOnly')}
        name={boli.name}
        lines={[[boli.eventName, boli.opens_at ? t('bolis.calledAbout', { time: formatTime(boli.opens_at, tz) }) : null].filter(Boolean).join(' · ') || null]}
      />
      <Explainer boli={boli} />
      <Txt variant="meta" color="muted">
        {t('bolis.hallNote')}
      </Txt>
      {reminders.error ? <Banner tone="error" message={reminders.error} /> : null}
      <Button label={on ? t('bolis.reminderOn') : t('bolis.remindMe')} tone={on ? 'green' : 'primary'} onPress={() => void reminders.toggle(boli)} disabled={!reminders.ready} />
    </VStack>
  );
}
