import { useRouter } from 'expo-router';
import { useMemo, useRef, useState, type ReactNode } from 'react';

import { Screen } from '@/components/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { Banner, Button } from '@/components/ui';
import { chooseOfficePayment, loadRegistrationOptions, loadRegistrationTerms, previewRegistration, registerLearners } from '@/lib/api/pathshala';
import type { Center, Member } from '@/lib/api/member';
import { AppError, report } from '@/lib/errors';
import { todayAt } from '@/lib/format';
import { registrationOpen } from '@/lib/learning';
import {
  chooseTerm,
  expectedOutcomes,
  firstTrack,
  freeTracks,
  learnerRows,
  learnersArg,
  lineNames,
  linePledges,
  meOf,
  myWaiverHolds,
  newChildAge,
  payNowCents,
  REFUSAL_CODES,
  registerRoute,
  selectionsComplete,
  startBlock,
  suggestedLevel,
  unsureAllowed,
  waiverHoldNames,
  type LearnerRow,
  type NewChild,
  type OfficeChoice,
  type RegistrationOptions,
  type RegistrationResult,
  type Selection,
  type TrackChoice,
} from '@/lib/pathshala-registration';
import { newRequestId } from '@/lib/request-context';
import { useLoad } from '@/lib/use-load';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';

import { LegacyEnrollForm } from './legacy-enroll';
import { feeForLabel, money, payFees } from './shared';
import { DoneStep } from './step-done';
import { LevelsStep, type LevelLearner } from './step-levels';
import { ReviewStep, type PreviewState } from './step-review';
import { StartStep } from './step-start';
import { WaiverStep, type AgreeRow } from './step-waiver';
import { WhoStep } from './step-who';

type Step = 'start' | 'who' | 'levels' | 'review' | 'waiver' | 'done';

type SubmitState = { busy: boolean; error: string | null; offerSimple: boolean };
const SUBMIT_IDLE: SubmitState = { busy: false, error: null, offerSimple: false };

/**
 * Registering for Pathshala in the app (connect-crm plan §3.1, both payment modes): before you start → who is joining →
 * a level for each → review the fee → the waiver (when one is published) → register → added to the pledges, or the
 * seats held while the family pays. The database decides everything that costs money or gives a seat; the screens say
 * what it decided. A database without the registration functions gets today's simple request form, unchanged.
 */
export function RegistrationFlow({ center, member, askedTerm }: { center: Center; member: Member; askedTerm: string | null }) {
  const t = useT();
  const router = useRouter();
  const { invalidate } = useDataVersion();
  const timeZone = center.time_zone;
  const today = todayAt(timeZone);
  const terms = useLoad(() => loadRegistrationTerms(center.id, today), [center.id, today], 'load the Pathshala terms');
  const [termId, setTermId] = useState<string | null>(askedTerm);
  const [householdId, setHouseholdId] = useState<string>(member.household?.id ?? '');
  const term = terms.data ? chooseTerm(terms.data, termId, (x) => registrationOpen(x, new Date())) : null;
  const optionsState = useLoad(() => (term ? loadRegistrationOptions(term.id, householdId || null) : Promise.resolve(null)), [term?.id ?? null, householdId], 'load Pathshala registration');

  const [legacy, setLegacy] = useState(false);
  const [step, setStep] = useState<Step>('start');
  const [chosen, setChosen] = useState<Record<string, Selection>>({});
  const [newChildren, setNewChildren] = useState<Selection[]>([]);
  const nextChild = useRef(1);
  const [assistance, setAssistance] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' });
  const previewRun = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [submit, setSubmit] = useState<SubmitState>(SUBMIT_IDLE);
  const [result, setResult] = useState<RegistrationResult | null>(null);
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [office, setOffice] = useState<{ busy: boolean; error: string | null; chosen: OfficeChoice | null }>({ busy: false, error: null, chosen: null });

  const answer = optionsState.data;
  const options: RegistrationOptions | null = answer && answer.kind === 'answered' ? answer.options : null;
  const rows = useMemo(() => (options ? learnerRows(options, member.person.id) : []), [options, member.person.id]);
  const selections = useMemo(() => [...rows.map((r) => chosen[r.learner.personId]).filter((s): s is Selection => !!s), ...newChildren], [rows, chosen, newChildren]);

  const reset = () => {
    setStep('start');
    setChosen({});
    setNewChildren([]);
    setAssistance(false);
    setPreview({ status: 'idle' });
    setNotice(null);
    setAgreed({});
    setSubmit(SUBMIT_IDLE);
    setResult(null);
    setPaid(false);
    setPayError(null);
    setOffice({ busy: false, error: null, chosen: null });
  };

  const close = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/jain-way', params: { tab: 'three_l', section: 'learn' } }));

  // ---- Gates: the terms, the options, the fallback ----
  const title = t('reg.title');
  if (legacy || answer?.kind === 'missing') return <LegacyEnrollForm centerId={center.id} member={member} />;
  // Another term or household was chosen: its options are on their way, or could not be had. The previous ones are not
  // shown meanwhile (they are another term's or another family's).
  const switching = !!options && !!term && (optionsState.loading || !!optionsState.error) && (options.term.id !== term.id || (!!householdId && options.household.id !== householdId));
  if (terms.data === undefined || (term && optionsState.data === undefined) || switching) {
    const error = terms.error ?? optionsState.error;
    return (
      <Screen title={title} tabBar={false}>
        {error ? <ErrorState error={error} onRetry={() => void (terms.error ? terms.reload() : optionsState.reload())} /> : <LoadingState />}
      </Screen>
    );
  }
  if (!term || !options) {
    return (
      <Screen title={title} tabBar={false}>
        {optionsState.error ? <ErrorState error={optionsState.error} onRetry={() => void optionsState.reload()} /> : <EmptyState icon="school-outline" title={t('enrollReq.closed')} body={t('enrollReq.closedBody')} />}
      </Screen>
    );
  }

  const mode = options.term.paymentMode;
  const waiver = options.term.waiver;
  const total = waiver ? 5 : 4;
  const eyebrow = (n: number) => t('reg.step', { n, total });
  // The signed-in adult as the database knows them (`is_me`).
  const meId = meOf(options.learners, member.person.id);
  const learnerOf = (s: Selection) => options.learners.find((l) => l.personId === s.personId) ?? null;
  const nameOf = (s: Selection) => s.newChild?.firstName ?? learnerOf(s)?.firstName ?? '';
  const childAge = (child: NewChild) => newChildAge(child, options.term.ageCutoffOn, today);

  // ---- Who is joining ----
  const toggle = (row: LearnerRow) => {
    const id = row.learner.personId;
    setChosen((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      // Another adult registered me and my seat waits for my agreement to the waiver: go ahead with what they chose.
      const waiting = myWaiverHolds({ ...row.learner, isMe: row.isMe }).filter((e) => row.free.some((x) => x.id === e.trackId));
      if (waiting.length > 0) {
        const tracks: TrackChoice[] = waiting.map((e) => ({ trackId: e.trackId as string, levelId: e.levelId, unsure: !e.levelId && unsureAllowed(mode) }));
        return { ...prev, [id]: { key: id, personId: id, newChild: null, tracks, note: '' } };
      }
      const track = firstTrack(row.learner, row.free);
      const age = { age: row.learner.ageOnCutoff, countsAsChild: row.learner.countsAsChild };
      const s = track ? suggestedLevel({ ...row.learner, ...age }, track) : null;
      return { ...prev, [id]: { key: id, personId: id, newChild: null, tracks: track ? [{ trackId: track.id, levelId: s?.levelId ?? null, unsure: false }] : [], note: '' } };
    });
  };
  const addChild = (child: NewChild) => {
    const key = `new:${nextChild.current}`;
    nextChild.current += 1;
    const free = freeTracks({ ...childAge(child), enrollments: [] }, options.tracks);
    const track = firstTrack({ suggested: [] }, free);
    setNewChildren((prev) => [...prev, { key, personId: null, newChild: child, tracks: track ? [{ trackId: track.id, levelId: null, unsure: false }] : [], note: '' }]);
  };
  const removeChild = (key: string) => setNewChildren((prev) => prev.filter((s) => s.key !== key));
  const needsDob = selections.some((s) => !s.newChild && learnerOf(s)?.needsBirthDate);
  const whoReady = selections.length > 0 && !needsDob && selections.every((s) => s.tracks.length > 0);

  // ---- Levels ----
  const update = (key: string, change: (s: Selection) => Selection) => {
    if (key.startsWith('new:')) setNewChildren((prev) => prev.map((s) => (s.key === key ? change(s) : s)));
    else setChosen((prev) => (prev[key] ? { ...prev, [key]: change(prev[key]) } : prev));
  };
  const levelLearner = (s: Selection): LevelLearner => {
    if (s.newChild) {
      const age = childAge(s.newChild);
      return { ...age, name: s.newChild.firstName, suggested: [], free: freeTracks({ ...age, enrollments: [] }, options.tracks), isNewChild: true };
    }
    const l = learnerOf(s);
    const age = { age: l?.ageOnCutoff ?? null, countsAsChild: l?.countsAsChild ?? false };
    return { ...age, name: l?.firstName ?? '', suggested: l?.suggested ?? [], free: l ? freeTracks({ ...age, enrollments: l.enrollments, isMe: l.personId === meId }, options.tracks) : [], isNewChild: false };
  };
  const pick = (key: string, trackId: string, levelId: string | null, unsure: boolean) => update(key, (s) => ({ ...s, tracks: s.tracks.map((c) => (c.trackId === trackId ? { trackId, levelId, unsure } : c)) }));
  // On to the levels: a track still without a level takes the database's suggestion, which may only have come with a
  // birth date saved on the previous step.
  const toLevels = () => {
    setChosen((prev) => {
      const next: Record<string, Selection> = {};
      for (const [k, s] of Object.entries(prev)) {
        const learner = levelLearner(s);
        next[k] = {
          ...s,
          tracks: s.tracks.map((c) => {
            if (c.levelId || c.unsure) return c;
            const track = learner.free.find((x) => x.id === c.trackId);
            const suggestion = track ? suggestedLevel(learner, track) : null;
            return suggestion ? { ...c, levelId: suggestion.levelId } : c;
          }),
        };
      }
      return next;
    });
    setStep('levels');
  };
  const addTrack = (key: string, trackId: string) =>
    update(key, (s) => {
      const learner = levelLearner(s);
      const track = learner.free.find((x) => x.id === trackId);
      const suggestion = track ? suggestedLevel(learner, track) : null;
      return { ...s, tracks: [...s.tracks, { trackId, levelId: suggestion?.levelId ?? null, unsure: false }] };
    });
  const removeTrack = (key: string, trackId: string) => update(key, (s) => ({ ...s, tracks: s.tracks.filter((c) => c.trackId !== trackId) }));
  const setNote = (key: string, note: string) => update(key, (s) => ({ ...s, note }));

  // ---- Review: the database prices it; nothing is saved ----
  const runPreview = async (withAssistance: boolean) => {
    const run = ++previewRun.current;
    const learners = learnersArg(selections, withAssistance);
    setPreview({ status: 'loading' });
    try {
      const res = await previewRegistration({ termId: options.term.id, householdId: options.household.id, learners });
      // A key per review: Try again after a lost answer sends the same registration, a changed one gets a new key.
      if (run === previewRun.current) setPreview({ status: 'ready', result: res, learners, clientKey: newRequestId() });
    } catch (err) {
      const e = report(err, 'work out the fee');
      // The database refuses what it would refuse at Register (already registered in that track, a level for adults,
      // a withdrawal whose fee is still open): its own sentence, as it comes; trying again would not change it.
      const refused = !!e.code && REFUSAL_CODES.has(e.code);
      if (run === previewRun.current) setPreview({ status: 'error', message: e.userMessage, refused });
    }
  };
  const toReview = () => {
    setNotice(null);
    setSubmit(SUBMIT_IDLE);
    setStep('review');
    void runPreview(assistance);
  };
  const toggleAssistance = (on: boolean) => {
    setAssistance(on);
    void runPreview(on);
  };

  // ---- Register ----
  // "I agree" for each child and for myself, for the waiver now published: a newer version un-ticks every box.
  const agreeKey = (key: string) => `${waiver?.documentId ?? ''}:${key}`;
  const agreeRows: AgreeRow[] = selections
    .filter((s) => s.newChild || learnerOf(s)?.countsAsChild || s.personId === meId)
    .map((s) => ({ key: agreeKey(s.key), label: s.personId === meId ? t('reg.waiver.agreeSelf') : t('reg.waiver.agreeFor', { name: nameOf(s) }) }));
  // Another adult learner agrees in their own app when the preview says their line waits for it (they may have agreed already).
  const otherAdults =
    preview.status === 'ready'
      ? waiverHoldNames(preview.result, lineNames(preview.result, options.learners, selections))
      : selections.filter((s) => !s.newChild && s.personId !== meId && learnerOf(s) && !learnerOf(s)?.countsAsChild).map(nameOf);
  const allAgreed = agreeRows.every((r) => agreed[r.key]);
  const names = selections.map(nameOf).filter(Boolean);

  const openPay = (res: RegistrationResult) => {
    const pay = res.pay;
    if (!pay || pay.amountCents <= 0) return;
    setPaying(true);
    setPayError(null);
    payFees({
      amountCents: pay.amountCents,
      pledgeIds: pay.pledgeIds,
      householdId: options.household.id,
      forLabel: pay.forLabel ?? feeForLabel(t, options.term.name, lineNames(res, options.learners, selections)),
      office: pay.officePaymentAllowed && res.registrationId ? { label: t('reg.done.officeInstead'), run: () => chooseOffice(res) } : null,
    })
      .then((outcome) => {
        if (outcome.status === 'paid') {
          setPaid(true);
          invalidate();
        }
      })
      .catch((err: unknown) => setPayError(t('reg.err.pay', { reason: report(err, 'open the payment').userMessage })))
      .finally(() => setPaying(false));
  };

  const payPledges = (res: RegistrationResult) => {
    const p = linePledges(res);
    if (p.ids.length === 0 || p.cents <= 0) return;
    setPaying(true);
    setPayError(null);
    payFees({ amountCents: p.cents, pledgeIds: p.ids, householdId: options.household.id, forLabel: feeForLabel(t, options.term.name, lineNames(res, options.learners, selections).filter((_, i) => !!res.lines[i].pledge)) })
      .then((outcome) => {
        if (outcome.status === 'paid') {
          setPaid(true);
          invalidate();
        }
      })
      .catch((err: unknown) => setPayError(t('reg.err.pay', { reason: report(err, 'open the payment').userMessage })))
      .finally(() => setPaying(false));
  };

  const chooseOffice = (res: RegistrationResult) => {
    if (!res.registrationId) return;
    setOffice({ busy: true, error: null, chosen: null });
    chooseOfficePayment(res.registrationId)
      .then((choice) => {
        setOffice({ busy: false, error: null, chosen: choice });
        invalidate();
      })
      .catch((err: unknown) => {
        const e = report(err, 'keep the seats for payment at the office');
        setOffice({ busy: false, error: t('reg.err.office', { reason: e.userMessage }), chosen: null });
      });
  };

  const register = async () => {
    if (preview.status !== 'ready' || submit.busy) return;
    setSubmit({ busy: true, error: null, offerSimple: false });
    try {
      const res = await registerLearners({
        termId: options.term.id,
        householdId: options.household.id,
        learners: preview.learners,
        expectedTotalCents: preview.result.totalCents,
        expectedOutcomes: expectedOutcomes(preview.result),
        waiverDocumentId: waiver?.documentId ?? null,
        clientKey: preview.clientKey,
      });
      setSubmit(SUBMIT_IDLE);
      setResult(res);
      setStep('done');
      invalidate();
      // Pay now: the Pay sheet opens at once for the family's total ("Register and pay"); the seats stay held meanwhile.
      // The registration says which mode it was registered in.
      if ((res.paymentMode ?? mode) === 'pay_now') openPay(res);
    } catch (err) {
      const e = err instanceof AppError ? err : report(err, 'register for Pathshala');
      const who = names.join(', ');
      switch (registerRoute(e)) {
        case 'missing':
          setSubmit({ busy: false, error: t('reg.err.unavailable'), offerSimple: true });
          break;
        case 'review':
          // Hint review_again: the fee or an outcome changed since the review. Back to it, with the new lines and the
          // database's words; the boxes are ticked again for what is registered now.
          setSubmit(SUBMIT_IDLE);
          setNotice(e.userMessage);
          setAgreed({});
          setStep('review');
          void runPreview(assistance);
          break;
        case 'refused':
          // The database's sentence where they pressed Register. The options are read again, so a newer waiver (or a
          // window that closed) shows as it is now.
          setSubmit({ busy: false, error: t('reg.err.register', { names: who, reason: e.userMessage }), offerSimple: false });
          void optionsState.reload();
          break;
        default:
          setSubmit({ busy: false, error: t('reg.err.registerRetry', { names: who, reason: e.userMessage }), offerSimple: false });
      }
    }
  };

  // ---- The screen ----
  const back = (to: Step) => (
    <Button
      label={t('common.back')}
      tone="secondary"
      size="md"
      onPress={() => {
        setSubmit(SUBMIT_IDLE);
        setStep(to);
      }}
    />
  );
  const submitError = submit.error ? (
    <Banner tone="error" message={submit.error} action={submit.offerSimple ? { label: t('reg.err.useSimple'), onPress: () => setLegacy(true) } : { label: t('common.retry'), onPress: () => void register() }} />
  ) : null;
  const registerLabel = mode === 'pay_now' && preview.status === 'ready' && payNowCents(preview.result) > 0 ? t('reg.registerPay', { amount: money(payNowCents(preview.result)) }) : t('reg.register');

  let body: ReactNode;
  let footer: ReactNode;
  switch (step) {
    case 'start': {
      const blocked = !!startBlock(options);
      body = (
        <StartStep
          options={options}
          terms={terms.data}
          eyebrow={eyebrow(1)}
          timeZone={timeZone}
          onTerm={(id) => {
            setTermId(id);
            reset();
          }}
          onHousehold={(id) => {
            setHouseholdId(id);
            reset();
          }}
        />
      );
      footer = blocked ? null : <Button label={t('common.continue')} onPress={() => setStep('who')} />;
      break;
    }
    case 'who':
      body = <WhoStep options={options} rows={rows} chosen={chosen} newChildren={newChildren} eyebrow={eyebrow(2)} timeZone={timeZone} newChildAgeOf={(c) => childAge(c).age} onToggle={toggle} onAddChild={addChild} onRemoveChild={removeChild} />;
      footer = (
        <>
          <Button label={t('reg.who.continue')} onPress={toLevels} disabled={!whoReady} />
          {back('start')}
        </>
      );
      break;
    case 'levels':
      body = <LevelsStep selections={selections} learnerOf={levelLearner} mode={mode} eyebrow={eyebrow(3)} onPick={pick} onAddTrack={addTrack} onRemoveTrack={removeTrack} onNote={setNote} />;
      footer = (
        <>
          <Button label={t('reg.levels.continue')} onPress={toReview} disabled={!selectionsComplete(selections, mode)} />
          {back('who')}
        </>
      );
      break;
    case 'review':
      body = <ReviewStep options={options} preview={preview} selections={selections} notice={notice} assistance={assistance} eyebrow={eyebrow(4)} timeZone={timeZone} onAssistance={toggleAssistance} />;
      footer = (
        <>
          {preview.status === 'error' && !preview.refused ? <Button label={t('common.retry')} tone="secondary" size="md" onPress={() => void runPreview(assistance)} /> : null}
          {submitError}
          {waiver ? (
            <Button label={t('reg.review.toWaiver')} onPress={() => setStep('waiver')} disabled={preview.status !== 'ready'} />
          ) : (
            <Button label={submit.busy ? t('reg.registering') : registerLabel} onPress={() => void register()} disabled={preview.status !== 'ready'} busy={submit.busy} />
          )}
          {back('levels')}
        </>
      );
      break;
    case 'waiver':
      body = waiver ? <WaiverStep waiver={waiver} rows={agreeRows} others={otherAdults} agreed={agreed} eyebrow={eyebrow(5)} onAgree={(key, on) => setAgreed((prev) => ({ ...prev, [key]: on }))} /> : null;
      footer = (
        <>
          {submitError}
          <Button label={submit.busy ? t('reg.registering') : registerLabel} onPress={() => void register()} disabled={preview.status !== 'ready' || !allAgreed} busy={submit.busy} />
          {back('review')}
        </>
      );
      break;
    case 'done':
      body = result ? (
        <DoneStep
          options={options}
          result={result}
          selections={selections}
          timeZone={timeZone}
          centerId={center.id}
          paid={paid}
          paying={paying}
          payError={payError}
          officeBusy={office.busy}
          officeError={office.error}
          officeChoice={office.chosen}
          onPay={() => openPay(result)}
          onPayPledges={() => payPledges(result)}
          onOffice={() => chooseOffice(result)}
          onCheckAgain={() => void optionsState.reload()}
        />
      ) : null;
      footer = (
        <>
          <Button label={t('common.done')} onPress={close} />
          <Button label={t('reg.done.again')} tone="secondary" size="md" onPress={reset} />
        </>
      );
      break;
  }

  return (
    <Screen title={title} tabBar={false} footer={footer}>
      {optionsState.error ? <ErrorState error={optionsState.error} onRetry={() => void optionsState.reload()} /> : null}
      {body}
    </Screen>
  );
}
