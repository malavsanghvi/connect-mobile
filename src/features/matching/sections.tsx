import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { Banner, Button, Card, Ident, LinkText, Pill, Row, TextField, Txt, VStack } from '@/components/ui';
import { Heading } from '@/features/give/parts';
import { copyText } from '@/lib/clipboard';
import { report } from '@/lib/errors';
import {
  canReport,
  claimStateWords,
  claimTone,
  cleanEmployer,
  deadlineLine,
  giftLine,
  httpsUrl,
  MAX_EMPLOYER_CHARS,
  typicalDaysLine,
  whoSubmitsWords,
  type MatchCard,
  type MatchOrg,
} from '@/lib/match';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** What went wrong with the last try in one part of the screen, in plain words (the screen keeps what to run again). */
export type Failure = { message: string };

function FailureBanner({ failure, onRetry }: { failure: Failure | undefined; onRetry: () => void }) {
  const t = useT();
  if (!failure) return null;
  return <Banner tone="error" message={failure.message} action={{ label: t('common.retry'), onPress: onRetry }} />;
}

// ---------------------------------------------------------------------------
// Your employer
// ---------------------------------------------------------------------------

type EmployerProps = {
  employer: string | null;
  suggestion: string | null;
  /** Something is being saved or the card is being read again: nothing else can be pressed. */
  locked: boolean;
  /** The key of what is running ("add", "remove"), for the label of its button. */
  busy: string | null;
  failure: Failure | undefined;
  /** Adds or changes the employer; true when the database has it. */
  onSave: (employer: string, changed: boolean) => Promise<boolean>;
  onRemove: () => void;
  onRetry: () => void;
};

/**
 * The employer, kept only with the member's consent: a field and "Add my employer" when none is on file (and a one-tap
 * confirmation when the profile already names one), the name with Change and Remove when it is. The consent is stated right
 * next to the button that gives it.
 */
export function EmployerSection({ employer, suggestion, locked, busy, failure, onSave, onRemove, onRetry }: EmployerProps) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async (value: string, changed: boolean) => {
    const clean = cleanEmployer(value);
    if (!clean.ok) {
      setProblem(clean.problem === 'empty' ? t('matching.employer.empty') : t('matching.employer.long'));
      return;
    }
    setProblem(null);
    if (await onSave(clean.employer, changed)) {
      setEditing(false);
      setDraft('');
    }
  };

  const retry = <FailureBanner failure={failure} onRetry={onRetry} />;

  if (employer && !editing) {
    return (
      <VStack gap={space.sm}>
        <Heading>{t('matching.employer.title')}</Heading>
        <Card style={{ gap: space.sm }}>
          <Txt variant="bodyStrong" selectable>
            {employer}
          </Txt>
          <Txt variant="meta" color="muted">
            {t('matching.employer.onFile')}
          </Txt>
          <Row gap={space.sm}>
            <Button
              label={t('matching.employer.change')}
              tone="secondary"
              size="card"
              fill={false}
              disabled={locked}
              onPress={() => {
                setDraft(employer);
                setProblem(null);
                setEditing(true);
              }}
            />
            <Button label={busy === 'remove' ? t('matching.employer.removing') : t('matching.employer.remove')} tone="outlineDanger" size="card" fill={false} busy={busy === 'remove'} disabled={locked} onPress={onRemove} />
          </Row>
          {retry}
        </Card>
      </VStack>
    );
  }

  const changing = !!employer;
  return (
    <VStack gap={space.sm}>
      <Heading>{t('matching.employer.title')}</Heading>
      <Card style={{ gap: space.md }}>
        {!changing && suggestion ? (
          <VStack gap={space.sm}>
            <Txt variant="bodyStrong">{t('matching.employer.suggestion', { employer: suggestion })}</Txt>
            <Button
              label={busy === 'add' ? t('matching.employer.adding') : t('matching.employer.suggestionYes', { employer: suggestion })}
              busy={busy === 'add'}
              disabled={locked}
              onPress={() => void submit(suggestion, false)}
            />
            <Txt variant="meta" color="muted">
              {t('matching.employer.otherName')}
            </Txt>
          </VStack>
        ) : null}
        <TextField
          label={t('matching.employer.field')}
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            if (problem) setProblem(null);
          }}
          maxLength={MAX_EMPLOYER_CHARS}
          autoCapitalize="words"
          autoCorrect={false}
          editable={!locked}
          error={problem}
          hint={t('matching.employer.hint')}
        />
        <Row gap={space.sm}>
          <Button
            label={busy === 'add' ? (changing ? t('matching.employer.saving') : t('matching.employer.adding')) : changing ? t('matching.employer.save') : t('matching.employer.add')}
            fill={!changing}
            busy={busy === 'add'}
            disabled={locked}
            onPress={() => void submit(draft, changing)}
          />
          {changing ? (
            <Button
              label={t('common.cancel')}
              tone="secondary"
              fill={false}
              disabled={locked}
              onPress={() => {
                setEditing(false);
                setProblem(null);
                setDraft('');
              }}
            />
          ) : null}
        </Row>
        {retry}
      </Card>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// How to ask
// ---------------------------------------------------------------------------

function Numbered({ items }: { items: string[] }) {
  return (
    <VStack gap={space.xs}>
      {items.map((step, i) => (
        <Row key={`${i}-${step}`} align="flex-start" gap={space.sm}>
          <Txt variant="smallStrong" color="navy" style={{ minWidth: 24 }}>
            {`${i + 1}.`}
          </Txt>
          <Txt variant="small" style={{ flex: 1 }}>
            {step}
          </Txt>
        </Row>
      ))}
    </VStack>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <VStack gap={space.xs}>
      {items.map((item, i) => (
        <Row key={`${i}-${item}`} align="flex-start" gap={space.sm}>
          <Txt variant="small" color="muted" style={{ minWidth: 24 }}>
            {'•'}
          </Txt>
          <Txt variant="small" style={{ flex: 1 }}>
            {item}
          </Txt>
        </Row>
      ))}
    </VStack>
  );
}

/**
 * The steps for the employer, from the shared library: who makes the request, a summary, the numbered steps, what to have
 * ready, https links that open in the browser, the employer's portal, how long it takes and the tips. With no steps on file it
 * says so plainly and what to do instead.
 */
export function HowToSection({ card }: { card: MatchCard }) {
  const t = useT();
  const [linkError, setLinkError] = useState<string | null>(null);
  const process = card.process;
  const name = card.program?.companyName ?? card.employer ?? '';
  if (!card.employer) return null;

  const open = (url: string) => {
    const safe = httpsUrl(url);
    if (!safe) return;
    setLinkError(null);
    WebBrowser.openBrowserAsync(safe).catch((err: unknown) => {
      report(err, 'open that link');
      setLinkError(t('matching.howTo.openError'));
    });
  };

  if (!process) {
    return (
      <VStack gap={space.sm}>
        <Heading>{t('matching.howTo.title', { employer: name })}</Heading>
        <Card tone="panel" style={{ gap: space.xs }}>
          <Txt variant="bodyStrong">{t('matching.noSteps.title', { employer: name })}</Txt>
          <Txt variant="small" color="ink2">
            {t('matching.noSteps.body')}
          </Txt>
        </Card>
      </VStack>
    );
  }

  const portalUrl = card.program?.portalUrl ?? null;
  const days = typicalDaysLine(t, process.typicalDays);
  return (
    <VStack gap={space.sm}>
      <Heading>{t('matching.howTo.title', { employer: name })}</Heading>
      <Card style={{ gap: space.md }}>
        {process.whoSubmits ? (
          <Txt variant="smallStrong" color="navy">
            {whoSubmitsWords(t, process.whoSubmits)}
          </Txt>
        ) : null}
        {process.summary ? <Txt variant="small">{process.summary}</Txt> : null}
        <VStack gap={space.xs}>
          <Txt variant="eyebrow" color="muted" accessibilityRole="header">
            {t('matching.howTo.steps')}
          </Txt>
          <Numbered items={process.steps} />
        </VStack>
        {process.documents.length > 0 ? (
          <VStack gap={space.xs}>
            <Txt variant="eyebrow" color="muted" accessibilityRole="header">
              {t('matching.howTo.documents')}
            </Txt>
            <Bullets items={process.documents} />
          </VStack>
        ) : null}
        {process.links.length > 0 ? (
          <VStack gap={0}>
            <Txt variant="eyebrow" color="muted" accessibilityRole="header">
              {t('matching.howTo.links')}
            </Txt>
            {process.links.map((l) => (
              <LinkText key={l.url} label={l.label} onPress={() => open(l.url)} underline />
            ))}
          </VStack>
        ) : null}
        {portalUrl ? (
          <Button
            label={card.program?.portal ? t('matching.howTo.portal', { portal: card.program.portal }) : t('matching.howTo.portalPlain')}
            tone="secondary"
            size="card"
            onPress={() => open(portalUrl)}
          />
        ) : null}
        {linkError ? <Banner tone="error" message={linkError} /> : null}
        {days ? (
          <Txt variant="meta" color="muted">
            {days}
          </Txt>
        ) : null}
        {card.program?.deadlineNote ? (
          <Txt variant="meta" color="muted">
            {t('matching.howTo.deadlineNote', { note: card.program.deadlineNote })}
          </Txt>
        ) : null}
        {process.tips ? (
          <VStack gap={space.xs}>
            <Txt variant="eyebrow" color="muted" accessibilityRole="header">
              {t('matching.howTo.tips')}
            </Txt>
            <Txt variant="small">{process.tips}</Txt>
          </VStack>
        ) : null}
      </Card>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// The organization's name and tax ID
// ---------------------------------------------------------------------------

function CopyRow({ label, value, copyLabel, mono }: { label: string; value: string; copyLabel: string; mono?: boolean }) {
  const t = useT();
  const { toast } = useFeedback();
  const [error, setError] = useState<string | null>(null);
  const copy = () => {
    setError(null);
    copyText(value).then(
      // 'copied' is on the clipboard; on a phone the share sheet opens instead, and nothing more is claimed.
      (result) => {
        if (result === 'copied') toast(t('matching.org.copied'));
      },
      (err: unknown) => setError(report(err, 'copy that').userMessage),
    );
  };
  return (
    <View style={{ gap: space.xs }}>
      <Row gap={space.sm} style={{ justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Txt variant="meta" color="muted">
            {label}
          </Txt>
          {mono ? (
            <Txt variant="bodyStrong" selectable>
              <Ident>{value}</Ident>
            </Txt>
          ) : (
            <Txt variant="bodyStrong" selectable>
              {value}
            </Txt>
          )}
        </View>
        <Button label={Platform.OS === 'web' ? t('matching.org.copy') : t('matching.org.copyOrShare')} accessibilityLabel={copyLabel} tone="secondary" size="sm" fill={false} onPress={copy} />
      </Row>
      {error ? <Banner tone="error" message={error} /> : null}
    </View>
  );
}

/** The registered name and tax ID the steps ask the member to use, each with a copy button. */
export function OrgSection({ org }: { org: MatchOrg | null }) {
  const t = useT();
  if (!org) return null;
  return (
    <VStack gap={space.sm}>
      <Heading>{t('matching.org.title')}</Heading>
      <Card style={{ gap: space.md }}>
        <Txt variant="small" color="ink2">
          {t('matching.org.intro')}
        </Txt>
        <CopyRow label={org.legalName ? t('matching.org.name') : t('matching.org.nameOnly')} value={org.legalName ?? org.name} copyLabel={t('matching.org.copyName')} />
        {org.ein ? <CopyRow label={t('matching.org.ein')} value={org.ein} copyLabel={t('matching.org.copyEin')} mono /> : <Txt variant="meta" color="muted">{t('matching.org.einMissing')}</Txt>}
      </Card>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Gifts you can still claim
// ---------------------------------------------------------------------------

/**
 * The member's own gifts that can still be claimed: each one's day and the last day to ask (never an amount), and the
 * button that says "I have asked my employer". Offered only when the steps are on the page.
 */
export function GiftsSection({ card, locked, busy, failure, onReport, onRetry }: { card: MatchCard; locked: boolean; busy: string | null; failure: Failure | undefined; onReport: () => void; onRetry: () => void }) {
  const t = useT();
  if (!card.process) return null;
  return (
    <VStack gap={space.sm}>
      <Heading>{t('matching.gifts.title')}</Heading>
      <Card style={{ gap: space.md }}>
        {card.gifts.length === 0 ? (
          <Txt variant="small" color="ink2">
            {t('matching.gifts.none')}
          </Txt>
        ) : (
          <>
            <Txt variant="small" color="ink2">
              {t('matching.gifts.note')}
            </Txt>
            <VStack gap={space.sm}>
              {card.gifts.map((g) => (
                <View key={`${g.receivedOn}-${g.deadlineOn ?? ''}`} style={{ gap: 2 }} accessible accessibilityLabel={[giftLine(t, g.receivedOn), deadlineLine(t, g.deadlineOn, card.today)].filter(Boolean).join('. ')}>
                  <Txt variant="bodyStrong">{giftLine(t, g.receivedOn)}</Txt>
                  {deadlineLine(t, g.deadlineOn, card.today) ? (
                    <Txt variant="meta" color="muted">
                      {deadlineLine(t, g.deadlineOn, card.today)}
                    </Txt>
                  ) : null}
                </View>
              ))}
            </VStack>
            {canReport(card) ? <Button label={busy === 'report' ? t('matching.reporting') : t('matching.report')} busy={busy === 'report'} disabled={locked} onPress={onReport} /> : null}
          </>
        )}
        <FailureBanner failure={failure} onRetry={onRetry} />
      </Card>
    </VStack>
  );
}

// ---------------------------------------------------------------------------
// Your requests
// ---------------------------------------------------------------------------

/** Each request with the employer, the gift's day and where it stands in the member's words; "Take it back" while the database allows it. */
export function ClaimsSection({
  card,
  locked,
  busy,
  failure,
  onUndo,
  onRetry,
}: {
  card: MatchCard;
  locked: boolean;
  busy: string | null;
  failure: Failure | undefined;
  onUndo: (claimId: string) => void;
  onRetry: () => void;
}) {
  const t = useT();
  return (
    <VStack gap={space.sm}>
      <Heading>{t('matching.claims.title')}</Heading>
      {card.claims.length === 0 ? (
        <Card tone="panel">
          <Txt variant="small" color="ink2">
            {t('matching.claims.none')}
          </Txt>
        </Card>
      ) : (
        card.claims.map((c) => {
          const company = c.companyName || card.employer || '';
          const state = claimStateWords(t, c.state);
          const deadline = c.state === 'asked' ? deadlineLine(t, c.deadlineOn, card.today) : null;
          return (
            <Card key={c.id} style={{ gap: space.xs }}>
              <View accessible accessibilityLabel={[company, giftLine(t, c.receivedOn), state, deadline].filter(Boolean).join('. ')} style={{ gap: space.xs }}>
                <Txt variant="bodyStrong">{company}</Txt>
                <Txt variant="meta" color="muted">
                  {giftLine(t, c.receivedOn)}
                </Txt>
                <Pill label={state} tone={claimTone(c.state)} />
                {deadline ? (
                  <Txt variant="meta" color="muted">
                    {deadline}
                  </Txt>
                ) : null}
              </View>
              {c.canUndo ? (
                <Button label={busy === `undo:${c.id}` ? t('matching.undoing') : t('matching.undo')} tone="secondary" size="card" fill={false} busy={busy === `undo:${c.id}`} disabled={locked} onPress={() => onUndo(c.id)} />
              ) : null}
            </Card>
          );
        })
      )}
      <FailureBanner failure={failure} onRetry={onRetry} />
    </VStack>
  );
}
