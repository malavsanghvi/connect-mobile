import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Icon } from '@/components/icon';
import { Card, Row, Txt } from '@/components/ui';
import { loadMatchCard } from '@/lib/api/match';
import { entryLine, showsMatchEntry, type MatchCard } from '@/lib/match';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useT } from '@/providers/settings';
import { colors, space } from '@/theme';

/**
 * "Does your employer match?" on the Give tab (connect-crm 0922): a card to /matching, for an adult in a community where
 * CatchTheMatch is on. The app's module list does not carry this module, so the card asks the database once (`my_match_card`,
 * kept until a write elsewhere reads it again) and shows only when the answer says the person is an adult and the feature is on.
 *
 * It never slows down or breaks the Give tab: it loads on its own, shows nothing while it loads, and shows nothing when the
 * read fails (the failure is logged by useLoad; the screen it opens has the retry).
 */
export function MatchEntryCard() {
  const t = useT();
  const router = useRouter();
  const { member, center } = useApp();
  const state = useLoad<MatchCard | null>(
    async () => (center && member?.isAdult ? loadMatchCard(center.id) : null),
    [center?.id, member?.isAdult ?? false],
    'load your employer match',
  );
  const card = state.data;
  if (!card || !showsMatchEntry(card)) return null;
  const line = entryLine(t, card);
  return (
    <Card onPress={() => router.push('/matching')} accessibilityLabel={`${t('matching.title')}. ${line}`}>
      <Row gap={space.md}>
        <Icon name="business-outline" size={24} color={colors.brown} />
        <View style={{ flex: 1 }}>
          <Txt variant="section">{t('matching.title')}</Txt>
          <Txt variant="meta" color="muted">
            {line}
          </Txt>
        </View>
        <Txt color="muted" style={{ fontSize: 22, lineHeight: 26 }}>
          {'›'}
        </Txt>
      </Row>
    </Card>
  );
}
