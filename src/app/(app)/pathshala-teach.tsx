import { useState } from 'react';

import { Screen } from '@/components/screen';
import { EmptyState, Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, Divider, Row, TextField, Txt, VStack } from '@/components/ui';
import { applyToTeach, loadTeaching } from '@/lib/api/gyan';
import { report } from '@/lib/errors';
import { formatDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/**
 * Teach at Pathshala: open teacher positions (teacher_positions, status open)
 * and an application form (teacher_applications). The principal decides in the
 * portal (Pathshala › Teacher positions); the decision shows here.
 */
export default function PathshalaTeachScreen() {
  const t = useT();
  const { center, member } = useApp();
  const personId = member?.person.id ?? null;
  const state = useLoad(() => (center && personId ? loadTeaching(center.id, personId) : Promise.resolve(null)), [center?.id, personId], 'load teaching openings');
  const [positionId, setPositionId] = useState<string | null>(null);
  const [education, setEducation] = useState('');
  const [qualifications, setQualifications] = useState('');
  const [activities, setActivities] = useState('');
  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (!member || !center || !personId) {
    return (
      <Screen title={t('teach.title')} tabBar={false}>
        <EmptyState title={t('profile.notFound')} />
      </Screen>
    );
  }

  return (
    <Screen title={t('teach.title')} tabBar={false}>
      <Loaded state={state}>
        {(data) => {
          if (!data) return null;
          const applied = new Set(data.mine.map((a) => a.position_id));
          const open = data.positions.filter((p) => !applied.has(p.id));
          const chosen = open.find((p) => p.id === positionId) ?? (open.length === 1 ? open[0] : null);
          const submit = async () => {
            if (!chosen) return;
            setBusy(true);
            setError(null);
            try {
              await applyToTeach({
                centerId: center.id,
                positionId: chosen.id,
                personId,
                name: `${member.person.first_name} ${member.person.last_name}`.trim(),
                email: member.person.email ?? member.email,
                phone: member.person.phone_e164 ?? member.phone,
                education: education.trim() || null,
                qualifications: qualifications.trim() || null,
                activities: activities.trim() || null,
                motivation: motivation.trim() || null,
              });
              setSent(true);
              await state.reload();
            } catch (err) {
              setError(report(err, 'send your application').userMessage);
            } finally {
              setBusy(false);
            }
          };
          return (
            <VStack gap={space.md}>
              {sent ? (
                <Card tone="green">
                  <Txt variant="headline" color="greenDark" accessibilityRole="alert">
                    {t('teach.sent')}
                  </Txt>
                  <Txt variant="body">{t('teach.sentBody')}</Txt>
                </Card>
              ) : null}
              {data.mine.length > 0 ? (
                <Card>
                  <Txt variant="smallStrong">{t('teach.mine')}</Txt>
                  {data.mine.map((a, i) => (
                    <VStack key={a.id} gap={2}>
                      {i > 0 ? <Divider /> : null}
                      <Row style={{ justifyContent: 'space-between' }}>
                        <Txt variant="bodyStrong" style={{ flex: 1 }}>
                          {data.positions.find((p) => p.id === a.position_id)?.title ?? t('teach.position')}
                        </Txt>
                        <Txt variant="meta" color={a.outcome === 'selected' ? 'green' : 'muted'}>
                          {t(`teach.${a.outcome}` as 'teach.pending')}
                        </Txt>
                      </Row>
                      <Txt variant="meta" color="muted">
                        {formatDate(a.submitted_at, center.time_zone)}
                      </Txt>
                    </VStack>
                  ))}
                </Card>
              ) : null}
              {open.length === 0 ? (
                data.mine.length === 0 ? <EmptyState icon="school-outline" title={t('teach.none')} body={t('teach.noneBody')} /> : null
              ) : (
                <>
                  <Txt variant="body" color="ink2">
                    {t('teach.intro')}
                  </Txt>
                  <VStack gap={space.xs}>
                    <Txt variant="smallStrong">{t('teach.position')}</Txt>
                    <ChipGroup>
                      {open.map((p) => (
                        <Chip key={p.id} label={p.title} selected={p.id === chosen?.id} onPress={() => setPositionId(p.id)} />
                      ))}
                    </ChipGroup>
                    {chosen?.description ? <Txt variant="small">{chosen.description}</Txt> : null}
                    {chosen?.min_qualifications ? (
                      <Txt variant="meta" color="muted">
                        {t('teach.requirements', { text: chosen.min_qualifications })}
                      </Txt>
                    ) : null}
                  </VStack>
                  <TextField label={t('teach.education')} value={education} onChangeText={setEducation} />
                  <TextField label={t('teach.qualifications')} value={qualifications} onChangeText={setQualifications} multiline />
                  <TextField label={t('teach.activities')} value={activities} onChangeText={setActivities} multiline />
                  <TextField label={t('teach.motivation')} value={motivation} onChangeText={setMotivation} multiline />
                  {error ? <Banner tone="error" message={error} /> : null}
                  <Button label={t('teach.submit')} tone="purple" onPress={() => void submit()} busy={busy} disabled={!chosen} />
                </>
              )}
            </VStack>
          );
        }}
      </Loaded>
    </Screen>
  );
}
