import { useState } from 'react';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded, LockedState } from '@/components/states';
import { Button, Card, Txt, VStack } from '@/components/ui';
import { ClaimsSection, EmployerSection, GiftsSection, HowToSection, OrgSection, type Failure } from '@/features/matching/sections';
import { loadMatchCard, removeMyMatchEmployer, reportMyMatchRequest, setMyMatchEmployer, undoMyMatchRequest } from '@/lib/api/match';
import { report } from '@/lib/errors';
import { matchAvailability, reportedWords, type MatchCard } from '@/lib/match';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';

/**
 * Does your employer match? (CatchTheMatch, connect-crm 0759 and 0920 to 0922; route /matching, the link in the organization's
 * email and the target of its pushes.) An adult tells the organization their employer, with their consent; sees the steps for
 * claiming a match from that employer; says "I have asked my employer"; and follows where each request stands.
 *
 * The database decides everything (adults only, whether CatchTheMatch is on, whose employer it is); this screen shows its
 * answer and its refusals in words, next to what the person did, with a retry. There is no amount anywhere.
 */
export default function MatchingScreen() {
  const t = useT();
  const { member, center, setGuest } = useApp();
  const { invalidate } = useDataVersion();
  const state = useLoad<MatchCard | null>(
    async () => {
      if (!center || !member?.isAdult) return null;
      return loadMatchCard(center.id);
    },
    [center?.id, member?.isAdult ?? false],
    'load your employer match',
  );

  if (!member) {
    return (
      <Screen title={t('matching.title')}>
        <Card tone="panel">
          <Txt variant="small">{t('matching.signIn')}</Txt>
          <Button label={t('common.signIn')} onPress={() => setGuest(false)} size="md" />
        </Card>
      </Screen>
    );
  }
  if (!member.isAdult) {
    return (
      <Screen title={t('matching.title')}>
        <LockedState />
      </Screen>
    );
  }
  return (
    <Screen title={t('matching.title')} onRefresh={async () => invalidate()}>
      <Loaded state={state}>{(card) => (card && center ? <MatchBody card={card} centerId={center.id} reading={state.loading} /> : null)}</Loaded>
    </Screen>
  );
}

/** One thing the member did, kept whole so "Try again" does exactly that again (a confirmation already given is not asked twice). */
type Intent = { kind: 'add'; employer: string; changed: boolean } | { kind: 'remove' } | { kind: 'report' } | { kind: 'undo'; claim: string };
type Area = 'employer' | 'report' | 'claims';
type Failed = Failure & { intent: Intent };

const AREA: Record<Intent['kind'], Area> = { add: 'employer', remove: 'employer', report: 'report', undo: 'claims' };
const WHAT: Record<Intent['kind'], string> = {
  add: 'save your employer',
  remove: 'remove your employer',
  report: 'record that you asked your employer',
  undo: 'take your request back',
};

function keyOf(intent: Intent): string {
  return intent.kind === 'undo' ? `undo:${intent.claim}` : intent.kind;
}

function MatchBody({ card, centerId, reading }: { card: MatchCard; centerId: string; reading: boolean }) {
  const t = useT();
  const { invalidate } = useDataVersion();
  const { toast, confirm } = useFeedback();
  const [busy, setBusy] = useState<string | null>(null);
  const [failures, setFailures] = useState<Partial<Record<Area, Failed>>>({});
  // Nothing else can be pressed while something is being saved or the card is being read again after it.
  const locked = busy !== null || reading;

  const availability = matchAvailability(card);
  if (availability === 'child') return <LockedState />;
  if (availability === 'off') return <EmptyState icon="business-outline" title={t('matching.off')} body={t('matching.offBody')} />;

  const perform = async (intent: Intent): Promise<boolean> => {
    const area = AREA[intent.kind];
    setBusy(keyOf(intent));
    setFailures((f) => ({ ...f, [area]: undefined }));
    try {
      if (intent.kind === 'add') {
        await setMyMatchEmployer(centerId, intent.employer);
        toast(t(intent.changed ? 'matching.employer.saved' : 'matching.employer.added'));
      } else if (intent.kind === 'remove') {
        const removed = await removeMyMatchEmployer(centerId);
        toast(t(removed ? 'matching.employer.removed' : 'matching.employer.alreadyGone'));
      } else if (intent.kind === 'report') {
        toast(reportedWords(t, await reportMyMatchRequest(centerId)));
      } else {
        await undoMyMatchRequest(centerId, intent.claim);
        toast(t('matching.undone'));
      }
      invalidate();
      return true;
    } catch (err) {
      setFailures((f) => ({ ...f, [area]: { message: report(err, WHAT[intent.kind]).userMessage, intent } }));
      // Decided in the meantime (already moved on, already reported)? Read the card again so the screen shows where it really stands.
      if (intent.kind === 'report' || intent.kind === 'undo') invalidate();
      return false;
    } finally {
      setBusy(null);
    }
  };

  const retry = (area: Area) => {
    const failed = failures[area];
    if (failed) void perform(failed.intent);
  };

  const remove = async () => {
    const ok = await confirm({ title: t('matching.employer.removeAsk'), body: t('matching.employer.removeBody'), confirmLabel: t('matching.employer.removeYes'), cancelLabel: t('matching.employer.removeKeep'), tone: 'danger' });
    if (ok) await perform({ kind: 'remove' });
  };

  const sayAsked = async () => {
    const employer = card.program?.companyName ?? card.employer ?? '';
    const ok = await confirm({ title: t('matching.reportAsk', { employer }), body: t('matching.reportBody', { employer }), confirmLabel: t('matching.reportYes'), cancelLabel: t('matching.reportNo') });
    if (ok) await perform({ kind: 'report' });
  };

  const takeBack = async (claim: string) => {
    const ok = await confirm({ title: t('matching.undoAsk'), body: t('matching.undoBody'), confirmLabel: t('matching.undoYes'), cancelLabel: t('matching.undoKeep') });
    if (ok) await perform({ kind: 'undo', claim });
  };

  return (
    <VStack gap={16}>
      <Txt variant="small" color="ink2">
        {t('matching.intro')}
      </Txt>
      <EmployerSection
        // A different employer on file is a different field: the half-typed one of before is not carried over.
        key={card.employer ?? 'none'}
        employer={card.employer}
        suggestion={card.suggestion}
        locked={locked}
        busy={busy}
        failure={failures.employer}
        onSave={(employer, changed) => perform({ kind: 'add', employer, changed })}
        onRemove={() => void remove()}
        onRetry={() => retry('employer')}
      />
      {card.employer ? (
        <>
          <HowToSection card={card} />
          <OrgSection org={card.org} />
          <GiftsSection card={card} locked={locked} busy={busy} failure={failures.report} onReport={() => void sayAsked()} onRetry={() => retry('report')} />
          <ClaimsSection card={card} locked={locked} busy={busy} failure={failures.claims} onUndo={(claim) => void takeBack(claim)} onRetry={() => retry('claims')} />
        </>
      ) : null}
    </VStack>
  );
}
