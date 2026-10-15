import { useEffect, useRef, useState } from 'react';

import type { StringKey } from '@/i18n';
import {
  lookupFamily,
  submitContactRsvp,
  undoContactRsvp,
  verifyContactCode,
  type ContactFailure,
  type ContactPerson,
  type FamilyChoice,
  type MaskedContacts,
} from '@/lib/api/rsvp-contact';
import { report } from '@/lib/errors';

import { stageAfter, type Stage } from './failures';
import { allPicked, assistSlots, MAX_CODES, pickedSlots, readCode, readContact, RESEND_SECONDS, type ContactTab } from './rules';

/**
 * RSVP without signing in, as a visitor goes through it (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2): find the family by a
 * phone number or an email, a 6-digit code when the event asks for one, who is coming, saving, done. The screens are
 * src/features/rsvp-contact/flow.tsx; this holds where the visitor is and what each button does.
 *
 * What is kept: the one-use `handle` the database gave (never an id), the partly hidden names it showed and the choices made.
 * The phone number or email typed stays on this screen only and is sent only to the database; nothing is logged.
 */

export type Step = 'closed' | Stage;
export type Fault = { message: string; retry: () => void };
export type Registered = { count: number; email: string | null; undoUntil: string | null; /** When it was saved, in ms. */ at: number };

export function useGuestRsvp(eventId: string) {
  const [step, setStep] = useState<Step>('closed');
  const [tab, setTabState] = useState<ContactTab>('phone');
  const [typed, setTyped] = useState('');
  const [fieldError, setFieldError] = useState<StringKey | null>(null);
  const [handle, setHandle] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codesSent, setCodesSent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [members, setMembers] = useState<ContactPerson[]>([]);
  const [sendTo, setSendTo] = useState<MaskedContacts>({ email: null, phone: null });
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [assist, setAssist] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [fault, setFault] = useState<Fault | null>(null);
  const [notice, setNotice] = useState<ContactFailure | null>(null);
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [finished, setFinished] = useState(false);
  const [undoAsk, setUndoAsk] = useState(false);
  const [undone, setUndone] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  // Two quick taps are one call, whatever the screen has drawn by then.
  const running = useRef(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  // The undo button goes away by itself when its 15 minutes are over.
  const undoUntil = registered?.undoUntil ?? null;
  useEffect(() => {
    if (step !== 'done' || !undoUntil) return;
    const id = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [step, undoUntil]);

  /** One call to the database: busy while it runs, a fault (no network, a server fault) shown with a retry. */
  const run = async (action: string, retry: () => void, work: () => Promise<void>, onFault?: () => void) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFault(null);
    try {
      await work();
    } catch (err) {
      onFault?.();
      setFault({ message: report(err, action).userMessage, retry });
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  const refuse = (failure: ContactFailure, from: Stage) => {
    setNotice(failure);
    setStep(stageAfter(failure, from));
  };

  const enterChoose = (family: FamilyChoice) => {
    setHandle(family.handle);
    setMembers(family.members);
    setSendTo(family.sendTo);
    setPicked(allPicked(family.members));
    setAssist({});
    setNotice(null);
    setFieldError(null);
    setStep('choose');
  };

  const clearAnswers = () => {
    setHandle(null);
    setCode('');
    setCodesSent(0);
    setSecondsLeft(0);
    setMembers([]);
    setSendTo({ email: null, phone: null });
    setPicked({});
    setAssist({});
    setNotice(null);
    setFault(null);
    setFieldError(null);
  };

  const find = (resend = false) => {
    const read = readContact(tab, typed);
    if (!read.ok) {
      setFieldError(read.error);
      return;
    }
    setFieldError(null);
    setNotice(null);
    void run(
      'look up your family',
      () => find(resend),
      async () => {
        const answer = await lookupFamily(eventId, read.contact);
        if (!answer.ok) return refuse(answer, resend ? 'code' : 'find');
        if (answer.step === 'code') {
          setHandle(answer.handle);
          setCode('');
          setCodesSent((n) => (resend ? n + 1 : 1));
          setSecondsLeft(RESEND_SECONDS);
          setStep('code');
          return;
        }
        enterChoose(answer);
      },
    );
  };

  const verify = () => {
    const digits = readCode(code);
    if (!digits) {
      setFieldError('guestRsvp.codeInvalid');
      return;
    }
    if (!handle) {
      setStep('find');
      return;
    }
    setFieldError(null);
    setNotice(null);
    void run(
      'check your code',
      verify,
      async () => {
        const answer = await verifyContactCode(handle, digits);
        if (!answer.ok) return refuse(answer, 'code');
        enterChoose(answer);
      },
    );
  };

  const submit = () => {
    const slots = pickedSlots(members, picked);
    if (!handle || slots.length === 0) {
      setFieldError('guestRsvp.selectOne');
      return;
    }
    setFieldError(null);
    setNotice(null);
    const going = assistSlots(members, picked, assist);
    setStep('saving');
    void run(
      'save your RSVP',
      submit,
      async () => {
        const answer = await submitContactRsvp(handle, slots, going);
        if (!answer.ok) return refuse(answer, 'choose');
        const now = Date.now();
        setRegistered({ count: answer.count, email: answer.sendTo.email, undoUntil: answer.undoUntil, at: now });
        setNowMs(now);
        setStep('done');
      },
      () => setStep('choose'),
    );
  };

  const undo = () => {
    if (!handle) return;
    void run(
      'undo your RSVP',
      undo,
      async () => {
        const answer = await undoContactRsvp(handle);
        if (!answer.ok) {
          setUndoAsk(false);
          // The database says it is too late (someone has arrived) or the time is up: the button goes.
          setRegistered((r) => (r ? { ...r, undoUntil: null } : r));
          return refuse(answer, 'done');
        }
        clearAnswers();
        setRegistered(null);
        setUndoAsk(false);
        setFinished(false);
        setUndone(true);
        setStep('closed');
      },
    );
  };

  return {
    // where the visitor is
    step,
    busy,
    fault,
    notice,
    fieldError,
    // find
    tab,
    typed,
    setTyped: (v: string) => {
      setTyped(v);
      setFieldError(null);
    },
    setTab: (v: ContactTab) => {
      setTabState(v);
      setTyped('');
      setFieldError(null);
      setNotice(null);
    },
    // code
    code,
    setCode: (v: string) => {
      setCode(v);
      setFieldError(null);
    },
    secondsLeft,
    canResend: codesSent < MAX_CODES,
    // who is coming
    members,
    sendTo,
    picked,
    assist,
    pick: (slot: number, on: boolean) => setPicked((p) => ({ ...p, [slot]: on })),
    needHelp: (slot: number, on: boolean) => setAssist((a) => ({ ...a, [slot]: on })),
    // done
    handle,
    registered,
    finished,
    undone,
    undoAsk,
    nowMs,
    // what the buttons do
    open: () => {
      setUndone(false);
      setStep('find');
    },
    close: () => {
      // After the RSVP is saved the handle stays (it is what the undo needs); before, nothing of the family is kept.
      if (registered) {
        setNotice(null);
        setFault(null);
      } else {
        clearAnswers();
      }
      setStep('closed');
    },
    startAgain: () => {
      clearAnswers();
      setStep('find');
    },
    useEmail: () => {
      clearAnswers();
      setTabState('email');
      setTyped('');
      setStep('find');
    },
    changeContact: () => {
      clearAnswers();
      setStep('find');
    },
    find,
    resend: () => find(true),
    verify,
    submit,
    askUndo: (on: boolean) => setUndoAsk(on),
    undo,
    finish: () => setFinished(true),
  };
}

export type GuestRsvp = ReturnType<typeof useGuestRsvp>;
