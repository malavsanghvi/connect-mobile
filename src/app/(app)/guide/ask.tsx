import { useState } from 'react';

import { Screen } from '@/components/screen';
import { Loaded } from '@/components/states';
import { Banner, Button, Card, Chip, ChipGroup, ListRow, SectionTitle, TextField, Txt, VStack } from '@/components/ui';
import { listMyThreads, listTeamInboxes, sendToInbox } from '@/lib/api/guide';
import { AppError, report } from '@/lib/errors';
import { formatLongDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { space } from '@/theme';

/** Ask a question → a thread in the chosen team inbox (threads + thread_messages). */
export default function AskScreen() {
  const t = useT();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const inboxes = useLoad(() => (center ? listTeamInboxes(center.id) : Promise.resolve([])), [center?.id], 'load the list of teams');
  const threads = useLoad(() => (member ? listMyThreads(member.person.id) : Promise.resolve([])), [member?.person.id], 'load your questions');
  const [inboxId, setInboxId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  if (!member || !center) return null;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (!text.trim()) throw new AppError(t('guide.askEmpty'), 'empty question');
      const team = inboxes.data?.find((i) => i.id === inboxId) ?? inboxes.data?.[0];
      if (!team) throw new AppError(t('guide.askNoTeams'), 'no inboxes');
      await sendToInbox({ centerId: center.id, userId: member.userId, personId: member.person.id, inboxId: team.id, subject: text.trim().slice(0, 80), body: text.trim() });
      setSent(team.name);
      setText('');
      invalidate();
    } catch (err) {
      setError(report(err, 'send your question').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title={t('guide.askTitle')} tabBar={false}>
      <Txt variant="small" color="ink2">
        {t('guide.askIntro')}
      </Txt>
      {sent ? (
        <Card tone="green">
          <Txt variant="headline" color="greenDark">
            {t('guide.askSent')}
          </Txt>
          <Txt variant="small" color="greenDark">
            {t('guide.askRouted', { team: sent })}
          </Txt>
          <Button label={t('guide.askAnother')} tone="green" size="md" onPress={() => setSent(null)} />
        </Card>
      ) : (
        <Loaded state={inboxes}>
          {(list) => (
            <VStack gap={space.md}>
              <Txt variant="smallStrong" color="ink2">
                {t('guide.topic')}
              </Txt>
              <ChipGroup>
                {list.map((i) => (
                  <Chip key={i.id} label={i.name} selected={(inboxId ?? list[0]?.id) === i.id} onPress={() => setInboxId(i.id)} />
                ))}
              </ChipGroup>
              <TextField label={t('guide.question')} value={text} onChangeText={setText} multiline />
              {error ? <Banner tone="error" message={error} /> : null}
              <Button label={t('guide.sendQuestion')} onPress={send} busy={busy} disabled={!text.trim() || list.length === 0} />
            </VStack>
          )}
        </Loaded>
      )}
      <SectionTitle>{t('guide.myQuestions')}</SectionTitle>
      <Loaded state={threads}>
        {(list) =>
          list.length === 0 ? (
            <Txt variant="small" color="muted">
              {t('guide.noQuestions')}
            </Txt>
          ) : (
            <Card>
              {list.map((th) => (
                <ListRow key={th.id} title={th.subject ?? th.lastMessage ?? ''} subtitle={[th.inboxName, t(`thread.${th.status}` as 'thread.open'), formatLongDate(th.created_at.slice(0, 10))].filter(Boolean).join(' · ')} />
              ))}
            </Card>
          )
        }
      </Loaded>
    </Screen>
  );
}
