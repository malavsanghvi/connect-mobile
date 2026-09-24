import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Card, Checkbox, Chip, ChipGroup, LinkText, SectionTitle, TextField, Txt, VStack } from '@/components/ui';
import { questionRef } from '@/features/guide';
import { GuideIntro, GuideScreen, SignInFirst, useCommunity } from '@/features/guide-ui';
import { listMyThreads, listTeamInboxes, sendToInbox } from '@/lib/api/guide';
import { AppError, report } from '@/lib/errors';
import { formatLongDate, formatPhone } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Ask a question (Welcome.dc.html secAsk) → a thread in the chosen team
 * inbox. "Reply by WhatsApp as well as email" adds the member's mobile to the
 * message (there is no reply-channel column). Also lists the member's own
 * questions so they can follow them.
 */
export default function AskScreen() {
  const t = useT();
  const community = useCommunity();
  const params = useLocalSearchParams<{ topic?: string }>();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const inboxes = useLoad(() => (center ? listTeamInboxes(center.id) : Promise.resolve([])), [center?.id], 'load the list of teams');
  const threads = useLoad(() => (member ? listMyThreads(member.person.id) : Promise.resolve([])), [member?.person.id], 'load your questions');
  const [inboxId, setInboxId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [byWhatsapp, setByWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ team: string; ref: string } | null>(null);
  const phone = member?.person.phone_e164 ?? null;

  const defaultInbox = (list: { id: string; key: string }[]) => list.find((i) => i.key === params.topic)?.id ?? list.find((i) => i.key === 'office')?.id ?? list[0]?.id ?? null;

  const send = async () => {
    if (!center || !member) return;
    setBusy(true);
    setError(null);
    try {
      if (!text.trim()) throw new AppError(t('guide.askEmpty'), 'empty question');
      const list = inboxes.data ?? [];
      const team = list.find((i) => i.id === (inboxId ?? defaultInbox(list)));
      if (!team) throw new AppError(t('guide.askNoTeams'), 'no inboxes');
      const body = byWhatsapp && phone ? `${text.trim()}\n\n${t('guide.askWhatsappLine', { phone: formatPhone(phone) })}` : text.trim();
      const threadId = await sendToInbox({ centerId: center.id, userId: member.userId, personId: member.person.id, inboxId: team.id, subject: text.trim().slice(0, 80), body });
      setSent({ team: team.name, ref: questionRef(threadId) });
      setText('');
      invalidate();
    } catch (err) {
      setError(report(err, 'send your question').userMessage);
    } finally {
      setBusy(false);
    }
  };

  return (
    <GuideScreen title={t('guide.askTitle')}>
      {!member ? (
        <>
          <GuideIntro>{t('guide.askIntro', { center: community })}</GuideIntro>
          <SignInFirst />
        </>
      ) : sent ? (
        <Card tone="green" style={{ padding: space.lg, gap: 6 }}>
          <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }} accessibilityRole="alert">
            {t('guide.askSent', { ref: sent.ref })}
          </Txt>
          <Txt variant="small" color="greenDark2" style={{ lineHeight: 21 }}>
            {t('guide.askRouted', { team: sent.team })}
          </Txt>
          <View style={{ alignSelf: 'flex-start' }}>
            <LinkText label={t('guide.askAnother')} color="greenDark" onPress={() => setSent(null)} />
          </View>
        </Card>
      ) : (
        <>
          <GuideIntro>{t('guide.askIntro', { center: community })}</GuideIntro>
          <Loaded state={inboxes}>
            {(list) => {
              const current = inboxId ?? defaultInbox(list);
              return (
                <VStack gap={space.md}>
                  <Txt variant="smallStrong">{t('guide.topic')}</Txt>
                  <ChipGroup>
                    {list.map((i) => (
                      <Chip key={i.id} label={i.name} selected={current === i.id} onPress={() => setInboxId(i.id)} />
                    ))}
                  </ChipGroup>
                  <TextField label={t('guide.question')} value={text} onChangeText={setText} placeholder={t('guide.questionPlaceholder')} multiline />
                  {phone ? <Checkbox label={t('guide.askWhatsapp')} checked={byWhatsapp} onChange={setByWhatsapp} /> : <Txt variant="meta" color="muted">{t('guide.askWhatsappNoPhone')}</Txt>}
                  {error ? <Banner tone="error" message={error} /> : null}
                  <Button label={t('guide.sendQuestion')} onPress={send} busy={busy} disabled={!text.trim() || list.length === 0} />
                </VStack>
              );
            }}
          </Loaded>
        </>
      )}
      {member ? (
        <>
          <SectionTitle>{t('guide.myQuestions')}</SectionTitle>
          <Loaded state={threads}>
            {(list) =>
              list.length === 0 ? (
                <Txt variant="small" color="muted">
                  {t('guide.noQuestions')}
                </Txt>
              ) : (
                <VStack gap={space.sm}>
                  {list.map((th) => (
                    <Card key={th.id} style={{ gap: 6 }}>
                      <Txt variant="smallStrong">{th.subject ?? th.lastMessage ?? ''}</Txt>
                      <Txt variant="meta" color="muted">
                        {[questionRef(th.id), th.inboxName, t(`thread.${th.status}` as 'thread.open'), formatLongDate(th.created_at.slice(0, 10))].filter(Boolean).join(' · ')}
                      </Txt>
                      {th.messages.map((m, i) => (
                        <View key={`${th.id}-${i}`} style={{ backgroundColor: m.from_role ? colors.greenTint : colors.panel, borderRadius: radii.row, padding: space.sm, gap: 2 }}>
                          <Txt variant="meta" color={m.from_role ? 'greenDark' : 'muted'} style={{ fontFamily: fonts.bodySemi }}>
                            {m.from_role ? t('guide.replyFrom', { team: th.inboxName ?? '' }) : t('guide.youWrote')}
                          </Txt>
                          <Txt variant="small">{m.body}</Txt>
                        </View>
                      ))}
                      {th.messages.every((m) => !m.from_role) ? (
                        <Txt variant="meta" color="muted">
                          {t('guide.noReplyYet')}
                        </Txt>
                      ) : null}
                    </Card>
                  ))}
                </VStack>
              )
            }
          </Loaded>
        </>
      ) : null}
    </GuideScreen>
  );
}
