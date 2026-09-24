import { useState } from 'react';
import { View } from 'react-native';

import { Loaded } from '@/components/states';
import { Banner, Button, Card, Row, Segmented, Txt, VStack } from '@/components/ui';
import { markFor, rosterBodyLabel } from '@/features/guide';
import { ComposeSheet, GuideFootnote, GuideScreen, useCommunity } from '@/features/guide-ui';
import { listRoster, sendToInbox, type RosterRow } from '@/lib/api/guide';
import { formatLongDate } from '@/lib/format';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDataVersion } from '@/providers/data-version';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space } from '@/theme';

/**
 * Administration (Welcome.dc.html secAdmin): Executive Committee / Trustees
 * tabs from role_roster, one row per role with "Message" opening the compose
 * sheet. Messages go to the center office inbox, addressed to the role.
 */
export default function AdminScreen() {
  const t = useT();
  const community = useCommunity();
  const { center, member } = useApp();
  const { toast } = useFeedback();
  const { invalidate } = useDataVersion();
  const state = useLoad(() => (center ? listRoster(center.id) : Promise.resolve([])), [center?.id], 'load the committee list');
  const [body, setBody] = useState<string | null>(null);
  const [compose, setCompose] = useState<RosterRow | null>(null);

  return (
    <GuideScreen title={t('guide.adminTitle')}>
      <Loaded state={state}>
        {(rows) => {
          if (rows.length === 0) return <Banner tone="info" message={t('guide.adminNone')} />;
          const bodies = [...new Set(rows.map((r) => r.body))];
          const current = body && bodies.includes(body) ? body : bodies[0];
          return (
            <VStack gap={space.md}>
              {bodies.length > 1 ? <Segmented label={t('guide.adminTitle')} value={current} onChange={setBody} options={bodies.map((b) => ({ value: b, label: rosterBodyLabel(b) }))} /> : null}
              {rows
                .filter((r) => r.body === current)
                .map((r) => (
                  <Card key={r.id} style={{ borderRadius: radii.row, paddingVertical: space.md, paddingHorizontal: 14 }}>
                    <Row gap={space.md}>
                      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.navyTint2, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
                        <Txt variant="meta" color="navy" style={{ fontFamily: fonts.bodyBold }}>
                          {markFor(r.title)}
                        </Txt>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Txt variant="bodyStrong">{r.title}</Txt>
                        <Txt variant="caption" color="muted" style={{ fontFamily: fonts.body }}>
                          {[r.name ?? t('guide.adminUnnamed', { center: community }), r.term_ends_on ? t('guide.termUntil', { date: formatLongDate(r.term_ends_on) }) : null].filter(Boolean).join(' · ')}
                        </Txt>
                      </View>
                      {member ? <Button label={t('guide.adminMessage')} tone="secondary" size="sm" fill={false} onPress={() => setCompose(r)} accessibilityHint={t('guide.adminMessageLabel', { role: r.title })} /> : null}
                    </Row>
                  </Card>
                ))}
            </VStack>
          );
        }}
      </Loaded>
      <GuideFootnote>{t('guide.adminFootnote', { center: community })}</GuideFootnote>
      <ComposeSheet
        visible={!!compose}
        to={compose ? t('guide.composeTheRole', { role: compose.title }) : ''}
        initialText={t('guide.composeDefault')}
        onClose={() => setCompose(null)}
        onSend={async (text) => {
          if (!center || !member || !compose) return;
          await sendToInbox({ centerId: center.id, userId: member.userId, personId: member.person.id, preferredKeys: ['office'], subject: t('guide.composeSubjectRole', { role: compose.title }), body: text });
          const to = t('guide.composeTheRole', { role: compose.title });
          setCompose(null);
          invalidate();
          toast(t('guide.messageSentTo', { to }));
        }}
      />
    </GuideScreen>
  );
}
