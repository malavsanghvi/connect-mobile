import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Banner, Button, Card, Ident, LinkText, Row, Segmented, TextField, Toggle, Txt, VStack } from '@/components/ui';
import { peopleLabel } from '@/features/events';
import type { StringKey } from '@/i18n';
import type { EventRow } from '@/lib/api/events';
import { formatOtp } from '@/lib/format';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

import { failureText, specFor, type FailureAction } from './failures';
import { allowsAssistance, canSeeTickets, canUndo, CODE_LENGTH, mmss, personTagKey, pickedSlots } from './rules';
import { useGuestRsvp, type GuestRsvp as Guest } from './use-guest-rsvp';

/**
 * RSVP without signing in: the screens (connect-crm docs/RSVP_WITHOUT_LOGIN.md section 2). A guest on an event whose own switch
 * is on sees one more button under "Sign in"; it opens these steps in place, on the event: find the family by a mobile number or
 * an email, a 6-digit code when the event asks for one, who is coming, saving, done. The logic is use-guest-rsvp.ts.
 *
 * Names and numbers shown here are the ones the database partly hid ("M***v S**h", "m***@g***.com"); the app never has more.
 */

const ACTION_LABEL: Record<FailureAction, StringKey> = {
  signIn: 'common.signIn',
  join: 'guestRsvp.joinFirst',
  startAgain: 'guestRsvp.startAgain',
  back: 'common.back',
  useEmail: 'guestRsvp.useEmail',
};

/** The bordered checkbox row of "Who's coming?" (the one the signed-in form uses). */
function PersonRow({ label, sub, checked, onPress }: { label: string; sub: string; checked: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={`${label}. ${sub}`}
      accessibilityState={{ checked }}
      // react-native-web reads aria-* (accessibilityState is not mapped on web).
      aria-checked={checked}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        minHeight: 52,
        paddingVertical: space.sm,
        paddingHorizontal: space.md,
        borderRadius: radii.card,
        borderWidth: 1,
        borderColor: checked ? colors.navyBorder : colors.border,
        backgroundColor: checked ? colors.navyTint : colors.card,
        opacity: pressed ? 0.85 : 1,
      })}>
      <View style={{ width: 24, height: 24, borderRadius: radii.xs, borderWidth: 2, borderColor: colors.navy, backgroundColor: checked ? colors.navy : colors.card, alignItems: 'center', justifyContent: 'center' }}>
        {checked ? (
          <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
            {'✓'}
          </Txt>
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="body" style={{ fontFamily: fonts.bodyMedium }}>
          {label}
        </Txt>
        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
          {sub}
        </Txt>
      </View>
    </Pressable>
  );
}

export function GuestRsvp({ event, onSignIn }: { event: EventRow; onSignIn: () => void }) {
  const g = useGuestRsvp(event.id);
  const t = useT();

  if (g.registered && (g.step === 'closed' || (g.step === 'done' && g.finished))) return <RegisteredCard g={g} event={event} />;
  if (g.step === 'closed') {
    return (
      <Card tone="panel">
        {g.undone ? <Banner tone="success" message={t('guestRsvp.undone')} /> : null}
        <Txt variant="small">{t('guestRsvp.entryBody')}</Txt>
        <Button label={t('guestRsvp.entry')} tone="secondary" size="md" onPress={g.open} />
      </Card>
    );
  }
  if (g.step === 'find') return <FindStep g={g} event={event} onSignIn={onSignIn} />;
  if (g.step === 'code') return <CodeStep g={g} event={event} onSignIn={onSignIn} />;
  if (g.step === 'choose') return <ChooseStep g={g} event={event} onSignIn={onSignIn} />;
  if (g.step === 'saving') return <SavingStep g={g} event={event} />;
  if (g.step === 'done') return <RegisteredCard g={g} event={event} />;
  return <FailedStep g={g} event={event} onSignIn={onSignIn} />;
}

/** The database said no (or a call failed): the sentence, and what to do next. */
function Problems({ g, event, onSignIn, primary }: { g: Guest; event: EventRow; onSignIn: () => void; primary?: boolean }) {
  const t = useT();
  const failure = g.notice;
  const run = (action: FailureAction) => {
    if (action === 'signIn' || action === 'join') onSignIn();
    else if (action === 'startAgain') g.startAgain();
    else if (action === 'useEmail') g.useEmail();
    else g.close();
  };
  return (
    <VStack gap={space.sm}>
      {g.fault ? <Banner tone="error" message={g.fault.message} action={{ label: t('common.retry'), onPress: g.fault.retry }} /> : null}
      {failure ? (
        <>
          <Banner tone={specFor(failure.code).tone} message={failureText(t, failure, event.name)} />
          {specFor(failure.code).actions.map((action, i) => (
            <Button key={action} label={t(ACTION_LABEL[action])} tone={primary && i === 0 ? 'primary' : 'secondary'} size="md" onPress={() => run(action)} />
          ))}
        </>
      ) : null}
    </VStack>
  );
}

function FindStep({ g, event, onSignIn }: { g: Guest; event: EventRow; onSignIn: () => void }) {
  const t = useT();
  const phone = g.tab === 'phone';
  return (
    <Card hero style={{ gap: space.md }}>
      <Txt variant="section" accessibilityRole="header">
        {t('guestRsvp.findTitle')}
      </Txt>
      <Txt variant="small" color="ink2">
        {event.contact_rsvp === 'code' ? t('guestRsvp.findIntroCode') : t('guestRsvp.findIntroOpen')}
      </Txt>
      <Segmented
        label={t('guestRsvp.findTitle')}
        value={g.tab}
        onChange={g.setTab}
        options={[
          { value: 'phone', label: t('guestRsvp.tabPhone') },
          { value: 'email', label: t('guestRsvp.tabEmail') },
        ]}
      />
      <TextField
        size="lg"
        label={t(phone ? 'signin.phoneLabel' : 'signin.emailLabel')}
        value={g.typed}
        onChangeText={g.setTyped}
        error={g.fieldError ? t(g.fieldError) : null}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={phone ? 'tel' : 'email'}
        keyboardType={phone ? 'phone-pad' : 'email-address'}
        textContentType={phone ? 'telephoneNumber' : 'emailAddress'}
        placeholder={phone ? '(713) 555-0142' : 'name@example.com'}
        returnKeyType="go"
        onSubmitEditing={() => g.find()}
      />
      <Problems g={g} event={event} onSignIn={onSignIn} />
      <Button label={t('common.continue')} onPress={() => g.find()} busy={g.busy} />
      <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
        <LinkText label={t('guestRsvp.signInInstead')} onPress={onSignIn} />
        <LinkText label={t('guestRsvp.joinFirst')} onPress={onSignIn} />
        <LinkText label={t('common.cancel')} onPress={g.close} color="muted" />
      </Row>
    </Card>
  );
}

function CodeStep({ g, event, onSignIn }: { g: Guest; event: EventRow; onSignIn: () => void }) {
  const t = useT();
  const phone = g.tab === 'phone';
  const digits = g.code.replace(/\D/g, '');
  return (
    <Card hero style={{ gap: space.md }}>
      <Txt variant="section" accessibilityRole="header">
        {t('guestRsvp.codeTitle')}
      </Txt>
      <Txt variant="small" color="ink2">
        {t(phone ? 'guestRsvp.codeBodyPhone' : 'guestRsvp.codeBodyEmail')}
      </Txt>
      <TextField
        size="lg"
        label={t('guestRsvp.codeLabel')}
        value={formatOtp(g.code)}
        onChangeText={(v) => g.setCode(v.replace(/\D/g, '').slice(0, CODE_LENGTH))}
        error={g.fieldError ? t(g.fieldError) : null}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        maxLength={CODE_LENGTH + 1}
        style={{ fontSize: 22, letterSpacing: 4.4 }}
        returnKeyType="done"
        onSubmitEditing={g.verify}
      />
      <Problems g={g} event={event} onSignIn={onSignIn} />
      <Button label={t('guestRsvp.codeCheck')} onPress={g.verify} busy={g.busy} disabled={digits.length < CODE_LENGTH} />
      {g.secondsLeft > 0 ? (
        <Txt variant="meta" color="muted">
          {t('guestRsvp.resendIn', { time: mmss(g.secondsLeft) })}
        </Txt>
      ) : g.canResend ? (
        <Row gap={4}>
          <LinkText label={t('guestRsvp.resend')} onPress={g.resend} />
        </Row>
      ) : (
        <Txt variant="meta" color="muted">
          {t('guestRsvp.resendLimit')}
        </Txt>
      )}
      <Txt variant="meta" color="muted">
        {t(phone ? 'guestRsvp.codeHelpPhone' : 'guestRsvp.codeHelpEmail')}
      </Txt>
      <Row gap={space.lg} style={{ flexWrap: 'wrap' }}>
        <LinkText label={t('guestRsvp.changeContact')} onPress={g.changeContact} />
        <LinkText label={t('guestRsvp.signInInstead')} onPress={onSignIn} />
      </Row>
    </Card>
  );
}

function ChooseStep({ g, event, onSignIn }: { g: Guest; event: EventRow; onSignIn: () => void }) {
  const t = useT();
  const count = pickedSlots(g.members, g.picked).length;
  const help = allowsAssistance(event.attendee_flags);
  return (
    <VStack gap={14}>
      <Card hero style={{ gap: 10 }}>
        <Txt variant="section" accessibilityRole="header">
          {t('events.whosComing')}
        </Txt>
        {g.members.map((m) => {
          const on = !!g.picked[m.slot];
          return (
            <View key={m.slot} style={{ gap: space.xs }}>
              <PersonRow label={m.label} sub={t(personTagKey(m))} checked={on} onPress={() => g.pick(m.slot, !on)} />
              {help && on ? (
                <View style={{ paddingLeft: space.md }}>
                  <Toggle label={t('guestRsvp.needsHelp')} value={!!g.assist[m.slot]} onChange={(v) => g.needHelp(m.slot, v)} />
                </View>
              ) : null}
            </View>
          );
        })}
        <View style={{ gap: space.xs, paddingTop: space.xs }}>
          {g.sendTo.email ? (
            <View>
              <Txt variant="meta" color="muted">
                {t('guestRsvp.confirmTo')}
              </Txt>
              <Txt variant="bodyStrong">
                <Ident>{g.sendTo.email}</Ident>
              </Txt>
            </View>
          ) : null}
          {g.sendTo.phone ? (
            <View>
              <Txt variant="meta" color="muted">
                {t('guestRsvp.phoneOnFile')}
              </Txt>
              <Txt variant="bodyStrong">
                <Ident>{g.sendTo.phone}</Ident>
              </Txt>
            </View>
          ) : null}
          <Txt variant="meta" color="muted">
            {t('guestRsvp.hidden')}
          </Txt>
          <LinkText label={t('guestRsvp.notYourFamily')} onPress={g.changeContact} />
        </View>
        {event.lunch_enabled ? (
          <Txt variant="meta" color="muted">
            {t('guestRsvp.lunchNote')}
          </Txt>
        ) : null}
      </Card>
      <Problems g={g} event={event} onSignIn={onSignIn} />
      {g.fieldError && !g.notice ? <Banner tone="warning" message={t(g.fieldError)} /> : null}
      <Button
        label={count === 0 ? t('events.selectWho') : t('events.rsvpN', { people: peopleLabel(t, count) })}
        onPress={g.submit}
        busy={g.busy}
        disabled={count === 0}
      />
      <Txt variant="meta" color="muted" center>
        {t('guestRsvp.signInForMore')}
      </Txt>
    </VStack>
  );
}

function SavingStep({ g, event }: { g: Guest; event: EventRow }) {
  const t = useT();
  const people = peopleLabel(t, pickedSlots(g.members, g.picked).length);
  const steps = [t('guestRsvp.stepFind'), t('guestRsvp.stepRegister', { people, event: event.name }), t('guestRsvp.stepTickets'), t('guestRsvp.stepConfirm')];
  // The family is already found; the rest happen together on the server, so the list shows the one that is under way.
  const at = 1;
  return (
    <Card hero style={{ gap: space.sm }}>
      <Txt variant="title" style={{ fontFamily: fonts.displayBold, color: colors.ink }} accessibilityRole="header">
        {t('sync.rsvpTitle')}
      </Txt>
      <Txt variant="meta" color="muted">
        {t('sync.keepOpen')}
      </Txt>
      {steps.map((label, i) => {
        const done = i < at;
        const current = i === at;
        return (
          <Row key={label} gap={space.md} style={{ minHeight: 48, borderBottomWidth: i < steps.length - 1 ? 1 : 0, borderBottomColor: colors.dividerLight }}>
            <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: done ? colors.green : current ? colors.saffron : colors.borderInput, alignItems: 'center', justifyContent: 'center' }}>
              <Txt variant="smallStrong" color="white" style={{ fontFamily: fonts.bodyBold }}>
                {done ? '✓' : current ? '…' : ''}
              </Txt>
            </View>
            <Txt variant="body" color={i <= at ? 'ink' : 'faint'} style={{ flex: 1, fontFamily: current ? fonts.bodySemi : fonts.body }}>
              {label}
            </Txt>
          </Row>
        );
      })}
    </Card>
  );
}

/** Saved. Stays on the event (without "Done") so the visitor does not RSVP twice; "Undo" is there for 15 minutes. */
function RegisteredCard({ g, event }: { g: Guest; event: EventRow }) {
  const t = useT();
  const router = useRouter();
  const r = g.registered;
  if (!r) return null;
  const people = peopleLabel(t, r.count);
  const undoable = canUndo(r.undoUntil, g.nowMs);
  // The tickets, with a QR each, for 30 minutes from the visit's handle (look only; the emailed link also cancels). See src/app/rsvp/[token].tsx.
  const tickets = !!g.handle && canSeeTickets(r.at, g.nowMs);
  return (
    <Card tone="green" style={{ gap: space.sm }}>
      <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="header">
        {t('guestRsvp.doneTitle')}
      </Txt>
      <Txt variant="small" color="greenDark2">
        {t('guestRsvp.doneBody', { event: event.name, people })}
      </Txt>
      <Txt variant="small" color="greenDark2">
        {r.email ? t('guestRsvp.doneMail', { email: r.email }) : t('guestRsvp.doneMailOnFile')}
      </Txt>
      {g.fault ? <Banner tone="error" message={g.fault.message} action={{ label: t('common.retry'), onPress: g.fault.retry }} /> : null}
      {undoable && g.undoAsk ? (
        <VStack gap={space.sm}>
          <Txt variant="smallStrong" color="greenDark">
            {t('guestRsvp.undoAsk', { people })}
          </Txt>
          <Button label={t('guestRsvp.undoYes')} tone="secondary" size="md" onPress={g.undo} busy={g.busy} />
          <Button label={t('guestRsvp.undoKeep')} tone="ghost" size="md" onPress={() => g.askUndo(false)} disabled={g.busy} />
        </VStack>
      ) : (
        <>
          {tickets ? <Button label={t('guestRsvp.seeTickets')} onPress={() => router.push({ pathname: '/rsvp/[token]', params: { token: g.handle as string, visit: '1' } })} size="md" /> : null}
          {!g.finished ? <Button label={t('common.done')} onPress={g.finish} size="md" tone={tickets ? 'secondary' : 'primary'} /> : null}
          {undoable ? <Button label={t('guestRsvp.undo')} tone="secondary" size="md" onPress={() => g.askUndo(true)} /> : null}
        </>
      )}
    </Card>
  );
}

/** A refusal that cannot be put right where the visitor is: what happened, and the way on. */
function FailedStep({ g, event, onSignIn }: { g: Guest; event: EventRow; onSignIn: () => void }) {
  return (
    <Card hero style={{ gap: space.md }}>
      <Problems g={g} event={event} onSignIn={onSignIn} primary />
    </Card>
  );
}
