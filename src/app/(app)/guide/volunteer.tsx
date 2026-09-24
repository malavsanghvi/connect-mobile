import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Card, LinkText, Txt, VStack } from '@/components/ui';
import { GuideIntro, GuideScreen, SignInFirst, useCommunity } from '@/features/guide-ui';
import { listVolunteerGroups, myVolunteerInterests, saveVolunteerInterests, type VolunteerGroup } from '@/lib/api/guide';
import type { Tables } from '@/lib/database.types';
import { report } from '@/lib/errors';
import { joinNames } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Volunteer / seva interests (Welcome.dc.html secVolunteer): tick groups
 * (volunteer_groups), send → volunteer_interests ('interested'); a thank-you
 * card lists what was sent, with "Update my interests".
 */
export default function GuideVolunteerScreen() {
  const t = useT();
  const community = useCommunity();
  const { center, member } = useApp();
  const state = useLoad(
    async () => {
      if (!center || !member) return null;
      const [groups, mine] = await Promise.all([listVolunteerGroups(center.id), myVolunteerInterests(member.person.id)]);
      return { groups, mine };
    },
    [center?.id, member?.person.id],
    'load the seva groups',
  );
  return (
    <GuideScreen title={t('guide.volTitle')}>
      <GuideIntro>{t('guide.volIntro', { center: community })}</GuideIntro>
      {!member ? (
        <SignInFirst />
      ) : (
        <Loaded state={state}>
          {(data) =>
            !data ? null : data.groups.length === 0 ? (
              <Banner tone="info" message={t('guide.volNone')} />
            ) : (
              <Editor key={data.mine.map((m) => `${m.group_id}:${m.status}`).join(',')} groups={data.groups} mine={data.mine} />
            )
          }
        </Loaded>
      )}
    </GuideScreen>
  );
}

function Editor({ groups, mine }: { groups: VolunteerGroup[]; mine: Tables<'volunteer_interests'>[] }) {
  const t = useT();
  const { center, member } = useApp();
  const { invalidate } = useDataVersion();
  const current = mine.filter((m) => m.status !== 'inactive').map((m) => m.group_id);
  const [picked, setPicked] = useState<string[]>(current);
  const [editing, setEditing] = useState(current.length === 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!center || !member) return null;

  const names = groups.filter((g) => (editing ? picked : current).includes(g.id)).map((g) => g.name);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveVolunteerInterests({ centerId: center.id, personId: member.person.id, groupIds: picked, existing: mine });
      setEditing(false);
      invalidate();
    } catch (err) {
      setError(report(err, 'send your seva interests').userMessage);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <Card tone="green" style={{ padding: space.lg, gap: 6 }}>
        <Txt variant="section" color="greenDark" style={{ fontFamily: fonts.bodyBold }}>
          {t('guide.volThanks')}
        </Txt>
        <Txt variant="small" color="greenDark2" style={{ lineHeight: 21 }}>
          {t('guide.volSummary', { groups: joinNames(names) })}
        </Txt>
        <View style={{ alignSelf: 'flex-start' }}>
          <LinkText label={t('guide.volUpdate')} color="greenDark" onPress={() => setEditing(true)} />
        </View>
      </Card>
    );
  }

  const n = picked.length;
  return (
    <VStack gap={10}>
      {groups.map((g) => {
        const on = picked.includes(g.id);
        return (
          <Pressable
            key={g.id}
            onPress={() => setPicked(on ? picked.filter((x) => x !== g.id) : [...picked, g.id])}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={g.requires_background_check ? `${g.name}. ${t('guide.volBgCheck')}` : g.name}
            style={({ pressed }) => ({
              borderWidth: 1,
              borderColor: on ? colors.navy : colors.border,
              backgroundColor: on ? colors.navyTint : colors.card,
              borderRadius: radii.row,
              paddingVertical: space.md,
              paddingHorizontal: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: space.md,
              minHeight: 56,
              opacity: pressed ? 0.85 : 1,
            })}>
            <View style={{ width: 26, height: 26, borderRadius: radii.check, borderWidth: 2, borderColor: colors.navy, backgroundColor: on ? colors.navy : colors.card, alignItems: 'center', justifyContent: 'center' }}>
              {on ? (
                <Txt variant="caption" color="white" style={{ fontFamily: fonts.bodyBold }}>
                  ✓
                </Txt>
              ) : null}
            </View>
            <View style={{ flex: 1 }}>
              <Txt variant="bodyStrong">{g.name}</Txt>
              {g.requires_background_check ? (
                <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                  {t('guide.volBgCheck')}
                </Txt>
              ) : null}
            </View>
          </Pressable>
        );
      })}
      {error ? <Banner tone="error" message={error} /> : null}
      <Button label={n === 0 ? t('guide.volSelect') : n === 1 ? t('guide.volSendOne') : t('guide.volSend', { n })} onPress={send} busy={busy} disabled={n === 0} />
    </VStack>
  );
}
