import { useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';

import { Band, Screen } from '@/components/screen';
import { Loaded, LockedState } from '@/components/states';
import { Banner, Button, Card, LinkText, Row, Stat, Stepper, Toggle, Txt, VStack } from '@/components/ui';
import { boliStatusText } from '@/features/bolis';
import { getBoli, isBoliOpen, placePledge, type BoliWithSummary } from '@/lib/api/bolis';
import { logError, report } from '@/lib/errors';
import { formatCents, formatDateTime, formatTimeLeft } from '@/lib/format';
import { cancelLocalReminder, scheduleLocalReminder } from '@/lib/push';
import { boliStatus, canStepDown, clampPledge, stepPledge } from '@/lib/rules';
import { readPref, writePref } from '@/lib/storage';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

const REFRESH_MS = 20000;

/** Digital boli pledge screen and in-person boli info (prototype §2.10, §2.11). */
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

  return (
    <Screen title={t('bolis.pledgeTitle')}>
      {!member?.isAdult ? <LockedState /> : <Loaded state={state}>{({ boli, now }) => (boli.kind === 'digital' ? <DigitalBoli boli={boli} now={now} /> : <HallBoli boli={boli} />)}</Loaded>}
    </Screen>
  );
}

function Explainer({ boli }: { boli: BoliWithSummary }) {
  const t = useT();
  const [more, setMore] = useState(false);
  if (!boli.explainer_md && !boli.description && !boli.explainer_video_url) return null;
  const text = boli.explainer_md ?? boli.description ?? '';
  const short = text.length > 220 && !more ? `${text.slice(0, 220).trim()}…` : text;
  const playVideo = async () => {
    if (!boli.explainer_video_url) return;
    try {
      await WebBrowser.openBrowserAsync(boli.explainer_video_url);
    } catch (err) {
      report(err, 'open the explainer video');
    }
  };
  return (
    <Card>
      <Txt variant="eyebrow" color="brown">
        {t('bolis.whatIs')}
      </Txt>
      {text ? (
        <Txt variant="small" color="ink2">
          {short}
        </Txt>
      ) : null}
      {text.length > 220 ? <LinkText label={more ? t('bolis.showLess') : t('bolis.readMore')} onPress={() => setMore(!more)} /> : null}
      {boli.explainer_video_url ? <Button label={t('bolis.playVideo')} tone="secondary" size="md" icon="play-circle-outline" onPress={playVideo} /> : null}
    </Card>
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
    const ok = await confirm({ title: t('bolis.confirmTitle', { amount: formatCents(amount) }), body: t('bolis.confirmBody', { name: boli.name }), confirmLabel: t('bolis.pledgeAmount', { amount: formatCents(amount) }), tone: 'brown' });
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

  return (
    <VStack gap={space.lg}>
      <Band color={colors.brown} eyebrow={boli.eventName ?? undefined} title={boli.name} subtitle={closes ? (left ? t('bolis.closesLeft', { date: formatDateTime(closes, tz), left }) : t('bolis.closedOn', { date: formatDateTime(closes, tz) })) : undefined} />
      <Explainer boli={boli} />
      <Card>
        <Row gap={space.md}>
          <Stat label={t('bolis.floor')} value={formatCents(boli.floor_cents)} />
          <Stat label={t('bolis.topPledge')} value={summary?.topCents ? formatCents(summary.topCents) : '—'} color="brown" />
          <Stat label={t('bolis.pledges')} value={String(summary?.entries ?? 0)} />
        </Row>
      </Card>
      <Banner tone={status === 'mine_top' ? 'success' : status === 'pledged_more' ? 'error' : status === 'closed' ? 'info' : 'warning'} message={boliStatusText(t, status)} />
      {open ? (
        <Card>
          <Txt variant="section" center>
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
          <Txt variant="meta" color="muted" center>
            {t('bolis.minimumLine', { min: formatCents(min), step: formatCents(step) })}
          </Txt>
          <Toggle label={t('bolis.anonymous')} sub={t('bolis.anonymousSub')} value={anonymous} onChange={setAnonymous} />
          {error ? <Banner tone="error" message={error} /> : null}
          <Button label={t('bolis.pledgeAmount', { amount: formatCents(amount) })} tone="brown" onPress={place} busy={busy} />
          <Txt variant="meta" color="muted">
            {t('bolis.notifyNote')}
          </Txt>
        </Card>
      ) : null}
    </VStack>
  );
}

type Reminders = Record<string, string>;

function HallBoli({ boli }: { boli: BoliWithSummary }) {
  const t = useT();
  const { center } = useApp();
  const { toast } = useFeedback();
  const tz = center?.time_zone ?? null;
  const [reminders, setReminders] = useState<Reminders | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    readPref<Reminders>('boliReminders', {}).then((r) => alive && setReminders(r));
    return () => {
      alive = false;
    };
  }, []);

  const set = reminders?.[boli.id];
  const toggle = async () => {
    setError(null);
    try {
      const next = { ...(reminders ?? {}) };
      if (set) {
        await cancelLocalReminder(set);
        delete next[boli.id];
      } else {
        const at = boli.opens_at ? new Date(new Date(boli.opens_at).getTime() - 15 * 60000) : null;
        const id = at ? await scheduleLocalReminder(t('bolis.reminderTitle'), t('bolis.reminderBody', { name: boli.name }), at) : null;
        if (!id) {
          setError(at ? t('bolis.reminderUnavailable') : t('bolis.reminderNoTime'));
          return;
        }
        next[boli.id] = id;
        toast(t('bolis.reminderSet'));
      }
      setReminders(next);
      await writePref('boliReminders', next).catch((err: unknown) => logError('saving boli reminders on this device', err));
    } catch (err) {
      setError(report(err, 'set a reminder').userMessage);
    }
  };

  return (
    <VStack gap={space.lg}>
      <Band color={colors.brownDark} eyebrow={t('bolis.inPersonOnly')} title={boli.name} subtitle={[boli.eventName, boli.opens_at ? t('bolis.calledAbout', { time: formatDateTime(boli.opens_at, tz) }) : null].filter(Boolean).join(' · ')} />
      <Explainer boli={boli} />
      <Txt variant="body" color="ink2">
        {t('bolis.hallNote')}
      </Txt>
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={set ? t('bolis.reminderOn') : t('bolis.remindMe')} tone={set ? 'secondary' : 'brown'} onPress={toggle} icon="notifications-outline" />
    </VStack>
  );
}
