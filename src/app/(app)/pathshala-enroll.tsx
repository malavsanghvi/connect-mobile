import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, TextField, Txt, VStack } from '@/components/ui';
import { loadEnrollOptions, requestEnrollment } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { firstName, formatCents } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Pathshala enrollment request: an adult of the household asks for a place
 * for a child (pathshala_enrollments, status "requested"; RLS
 * enrollments_household_insert). The office places the child in a class in
 * the portal (Pathshala › Enrollments).
 */
export default function PathshalaEnrollScreen() {
  const t = useT();
  const router = useRouter();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const householdId = member?.household?.id ?? null;
  const state = useLoad(() => (center && householdId ? loadEnrollOptions(center.id, householdId) : Promise.resolve(null)), [center?.id, householdId], 'load Pathshala enrollment');
  const [termId, setTermId] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  const students = useMemo(() => (member?.members ?? []).filter((m) => m.role === 'child' || !m.isAdult), [member]);

  if (!member || !center || !householdId) {
    return (
      <Screen title={t('enrollReq.title')} tabBar={false}>
        <EmptyState title={t('profile.notFound')} />
      </Screen>
    );
  }
  if (!member.isAdult) {
    return (
      <Screen title={t('enrollReq.title')} tabBar={false}>
        <EmptyState icon="school-outline" title={t('enrollReq.adultsOnly')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('enrollReq.title')} tabBar={false}>
      <Loaded state={state}>
        {(opts) => {
          if (!opts || opts.terms.length === 0) return <EmptyState icon="school-outline" title={t('enrollReq.closed')} body={t('enrollReq.closedBody')} />;
          if (sent) {
            return (
              <Card tone="green">
                <Txt variant="headline" color="greenDark" accessibilityRole="alert">
                  {t('enrollReq.sent', { name: sent })}
                </Txt>
                <Txt variant="body">{t('enrollReq.sentBody', { name: sent })}</Txt>
                <Button label={t('common.done')} tone="green" onPress={() => (router.canGoBack() ? router.back() : router.replace('/jain-way?tab=learn'))} />
              </Card>
            );
          }
          const term = opts.terms.find((x) => x.id === termId) ?? opts.terms[0];
          const taken = new Set(opts.taken[term.id] ?? []);
          const open = students.filter((s) => !taken.has(s.person.id));
          const chosen = open.find((s) => s.person.id === personId) ?? null;
          const submit = async () => {
            if (!chosen) return;
            setBusy(true);
            setError(null);
            try {
              await requestEnrollment({ centerId: center.id, termId: term.id, householdId, personId: chosen.person.id, levelId, note: note.trim() || null, userId: member.userId });
              setSent(firstName(chosen.person));
              invalidate();
            } catch (err) {
              setError(report(err, 'send the enrollment request').userMessage);
            } finally {
              setBusy(false);
            }
          };
          return (
            <VStack gap={space.md}>
              <Txt variant="body" color="ink2">
                {t('enrollReq.intro')}
              </Txt>
              {opts.terms.length > 1 ? (
                <VStack gap={space.xs}>
                  <Txt variant="smallStrong">{t('enrollReq.term')}</Txt>
                  <ChipGroup>
                    {opts.terms.map((x) => (
                      <Chip key={x.id} label={x.name} selected={x.id === term.id} onPress={() => setTermId(x.id)} />
                    ))}
                  </ChipGroup>
                </VStack>
              ) : (
                <Txt variant="bodyStrong">{`${t('enrollReq.term')}: ${term.name}`}</Txt>
              )}
              {term.fee_per_child_cents > 0 ? (
                <Txt variant="small" color="muted">
                  {t('enrollReq.fee', { fee: formatCents(term.fee_per_child_cents) })}
                </Txt>
              ) : null}
              {term.membership_required ? (
                <Txt variant="small" color="muted">
                  {t('enrollReq.membership')}
                </Txt>
              ) : null}
              <VStack gap={space.xs}>
                <Txt variant="smallStrong">{t('enrollReq.child')}</Txt>
                {open.length === 0 ? (
                  <Txt variant="small" color="muted">
                    {t('enrollReq.everyoneEnrolled')}
                  </Txt>
                ) : (
                  <ChipGroup>
                    {open.map((s) => (
                      <Chip key={s.person.id} label={firstName(s.person)} selected={s.person.id === chosen?.person.id} onPress={() => setPersonId(s.person.id)} />
                    ))}
                  </ChipGroup>
                )}
                {students.filter((s) => taken.has(s.person.id)).map((s) => (
                  <Txt key={s.person.id} variant="meta" color="muted">
                    {`${firstName(s.person)} · ${t('enrollReq.already')}`}
                  </Txt>
                ))}
              </VStack>
              <VStack gap={space.xs}>
                <Txt variant="smallStrong">{t('enrollReq.level')}</Txt>
                <ChipGroup>
                  <Chip label={t('enrollReq.levelUnsure')} selected={levelId === null} onPress={() => setLevelId(null)} />
                </ChipGroup>
                <ChipGroup columns={2}>
                  {opts.levels.map((l) => (
                    <Chip key={l.id} label={l.name} selected={levelId === l.id} onPress={() => setLevelId(l.id)} grid />
                  ))}
                </ChipGroup>
              </VStack>
              <TextField label={t('enrollReq.note')} hint={t('common.optional')} value={note} onChangeText={setNote} multiline />
              {error ? <Banner tone="error" message={error} /> : null}
              <Button label={t('enrollReq.submit')} tone="purple" onPress={() => void submit()} busy={busy} disabled={!chosen} />
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
