import { useState } from 'react';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Row, TextField, Txt, VStack } from '@/components/ui';
import type { StringKey } from '@/i18n';
import { decideReference, myReferenceRequests, type ReferenceDecision, type ReferenceRequest } from '@/lib/api/membership';
import { report } from '@/lib/errors';
import { formatLongDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { fonts, space } from '@/theme';

/**
 * Membership reference requests (app.my_reference_requests): a family named
 * this member as their reference. They confirm, decline (with a note for the
 * membership team) or say they don't know them (app.decide_reference).
 */
export default function ReferenceRequestsScreen() {
  const t = useT();
  const { member } = useApp();
  const { invalidate } = useDataVersion();
  const requests = useLoad(() => (member ? myReferenceRequests() : Promise.resolve([])), [member?.person.id], 'load the reference requests');
  const [done, setDone] = useState<Record<string, ReferenceDecision>>({});

  return (
    <Screen title={t('refreq.title')} tabBar={false}>
      <Txt variant="small" color="ink2" style={{ lineHeight: 21 }}>
        {t('refreq.intro')}
      </Txt>
      <Loaded state={requests}>
        {(list) =>
          list.length === 0 && Object.keys(done).length === 0 ? (
            <Txt variant="small" color="muted">
              {t('refreq.none')}
            </Txt>
          ) : (
            <VStack gap={space.md}>
              {Object.entries(done).map(([id, d]) => (
                <Banner key={id} tone="success" message={t(`refreq.done.${d}` as StringKey)} />
              ))}
              {list
                .filter((r) => !done[r.application_id])
                .map((r) => (
                  <RequestCard
                    key={r.application_id}
                    request={r}
                    onDone={(d) => {
                      setDone((cur) => ({ ...cur, [r.application_id]: d }));
                      invalidate();
                    }}
                  />
                ))}
            </VStack>
          )
        }
      </Loaded>
    </Screen>
  );
}

function RequestCard({ request: r, onDone }: { request: ReferenceRequest; onDone: (d: ReferenceDecision) => void }) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<ReferenceDecision | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (d: ReferenceDecision) => {
    setBusy(d);
    setError(null);
    try {
      await decideReference(r.application_id, d, reason);
      onDone(d);
    } catch (err) {
      setError(report(err, 'send your reference decision').userMessage);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ gap: space.sm }}>
      <Txt variant="section" style={{ fontFamily: fonts.bodyBold }}>
        {r.applicant_name}
      </Txt>
      <Txt variant="meta" color="ink2">
        {t('refreq.line', { tier: t(`tier.${r.tier}` as StringKey), household: r.household_name })}
      </Txt>
      {r.note ? (
        <Txt variant="small" color="ink2">
          {t('refreq.theirNote', { note: r.note })}
        </Txt>
      ) : null}
      {r.expires_at ? (
        <Txt variant="meta" color="muted">
          {t('refreq.expires', { date: formatLongDate(r.expires_at.slice(0, 10)) })}
        </Txt>
      ) : null}
      <TextField label={t('refreq.reason')} value={reason} onChangeText={setReason} multiline />
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={t('refreq.approve')} tone="green" onPress={() => decide('approved')} busy={busy === 'approved'} disabled={busy !== null} />
      <Row gap={space.sm}>
        <Button label={t('refreq.decline')} tone="secondary" size="md" onPress={() => decide('declined')} busy={busy === 'declined'} disabled={busy !== null} fill />
        <Button label={t('refreq.unknown')} tone="ghost" size="md" onPress={() => decide('unknown')} busy={busy === 'unknown'} disabled={busy !== null} fill />
      </Row>
    </Card>
  );
}
