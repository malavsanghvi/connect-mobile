import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Button, LinkText, Segmented, SectionTitle, Txt } from '@/components/ui';
import { loadDemoChoices } from '@/lib/api/demo';
import { canOpenAsGuest, sectionsByArea, type DemoChoices, type DemoCommunity, type DemoGuest, type DemoKind, type DemoPerson } from '@/lib/demo';
import { logError } from '@/lib/errors';
import { useLoad } from '@/lib/use-load';
import { useApp } from '@/providers/app';
import { useDemo, type DemoNotice } from '@/providers/demo';
import { useT } from '@/providers/settings';
import { colors, layout, radii, space, touch } from '@/theme';

/** What the chooser knows about the list of demo communities and people: it is loading, it could not be read, or it is here. */
export type ChooserLoad = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; choices: DemoChoices };

/** The screen both steps share: Back, the title and what it is for, a sentence about why the chooser is showing, then the step itself. */
function ChooserFrame({
  title,
  subtitle,
  notice,
  warning,
  onBack,
  footer,
  children,
}: {
  title: string;
  subtitle: string;
  notice?: string | null;
  warning?: string | null;
  onBack: () => void;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space.gutter, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
        <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', gap: space.lg }}>
          <View style={{ alignItems: 'flex-start' }}>
            <LinkText label={t('common.back')} onPress={onBack} />
          </View>
          <View style={{ gap: space.sm }}>
            <Txt variant="onboardingHero" accessibilityRole="header">
              {title}
            </Txt>
            <Txt variant="body" color="ink2">
              {subtitle}
            </Txt>
          </View>
          {notice ? <Banner tone="info" message={notice} /> : null}
          {warning ? <Banner tone="warning" message={warning} /> : null}
          {children}
        </View>
      </ScrollView>
      {footer ? (
        <View style={{ paddingHorizontal: space.gutter, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.ground }}>
          <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' }}>{footer}</View>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

/** The loading and "could not load" states, shared by both steps. Null once the list is here. */
function LoadState({ load, onRetry }: { load: ChooserLoad; onRetry: () => void }) {
  const t = useT();
  if (load.status === 'loading') {
    return (
      <View accessibilityLiveRegion="polite" style={{ paddingVertical: space.xl, alignItems: 'center', gap: space.md }}>
        <ActivityIndicator color={colors.navy} size="large" />
        <Txt variant="small" color="muted">
          {t('demo.loading')}
        </Txt>
      </View>
    );
  }
  if (load.status === 'error') return <Banner tone="error" message={load.message} action={{ label: t('common.retry'), onPress: onRetry }} />;
  return null;
}

// ── Step 1: which demo community ─────────────────────────────────────────────

function CommunityCard({ community, disabled, onPress }: { community: DemoCommunity; disabled: boolean; onPress: () => void }) {
  const t = useT();
  const name = community.name || t(`demo.kind.${community.kind}`);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={t('demo.communityLabel', { kind: t(`demo.kind.${community.kind}`), name, blurb: t(`demo.kindBlurb.${community.kind}`) })}
      accessibilityHint={t('demo.communityHint', { name })}
      accessibilityState={{ disabled }}
      style={({ pressed }) => ({
        minHeight: touch.row,
        borderRadius: radii.xl,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        paddingVertical: space.cardY,
        paddingHorizontal: space.cardX,
        gap: space.xxs,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      })}>
      <Txt variant="eyebrow" color="brown">
        {t(`demo.kind.${community.kind}`)}
      </Txt>
      <Txt variant="cardTitle">{name}</Txt>
      <Txt variant="small" color="ink2">
        {t(`demo.kindBlurb.${community.kind}`)}
      </Txt>
    </Pressable>
  );
}

/**
 * Step 1 of "Try the demo": the demo communities, faith-based or not. Choosing one opens it at once as a guest (no sign-in, no other
 * question). A community the portal does not yet name for guests is left out; if none is left, the screen says they are not open yet.
 */
export function DemoCommunityStepView({
  load,
  notice,
  warning,
  opening,
  onPick,
  onRetryLoad,
  onBack,
}: {
  load: ChooserLoad;
  notice?: string | null;
  warning?: string | null;
  /** A community is being opened: the cards wait. */
  opening: boolean;
  onPick: (community: DemoGuest) => void;
  onRetryLoad: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const ready = load.status === 'ready' ? load.choices : null;
  const open = ready?.enabled ? ready.communities.filter(canOpenAsGuest) : [];
  const state = <LoadState load={load} onRetry={onRetryLoad} />;
  let body: ReactNode = state;
  if (ready) {
    if (!ready.enabled) body = <Banner tone="warning" message={ready.message ?? t('demo.off')} action={{ label: t('common.retry'), onPress: onRetryLoad }} />;
    else if (open.length === 0) body = <Banner tone="info" message={ready.communities.length === 0 ? (ready.message ?? t('demo.empty')) : t('demo.guestNotReady')} action={{ label: t('common.retry'), onPress: onRetryLoad }} />;
    else
      body = (
        <View style={{ gap: space.md }}>
          <SectionTitle>{t('demo.communityTitle')}</SectionTitle>
          {open.map((c) => (
            <CommunityCard key={c.slug} community={c} disabled={opening} onPress={() => onPick({ slug: c.slug, name: c.name || t(`demo.kind.${c.kind}`) })} />
          ))}
          {opening ? (
            <Txt variant="small" color="muted" accessibilityLiveRegion="polite">
              {t('demo.opening')}
            </Txt>
          ) : null}
        </View>
      );
  }
  return (
    <ChooserFrame title={t('demo.title')} subtitle={t('demo.subtitle')} notice={notice} warning={warning} onBack={onBack}>
      {body}
    </ChooserFrame>
  );
}

// ── Step 2: who to be ────────────────────────────────────────────────────────

/** One person to be: the role, the name and one sentence. At least 48 px tall, and tall enough for the larger text sizes. */
function PersonCard({ person, selected, disabled, onPress }: { person: DemoPerson; selected: boolean; disabled: boolean; onPress: () => void }) {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={t('demo.personLabel', { role: person.role, name: person.name, story: person.story })}
      accessibilityState={{ checked: selected, disabled }}
      style={({ pressed }) => ({
        minHeight: touch.row,
        borderRadius: radii.xl,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? colors.navy : colors.border,
        backgroundColor: selected ? colors.navyTint : colors.card,
        paddingVertical: space.cardY,
        paddingHorizontal: space.cardX,
        gap: space.xxs,
        opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
      })}>
      <Txt variant="eyebrow" color="brown">
        {person.role}
      </Txt>
      <Txt variant="cardTitle">{person.name}</Txt>
      {person.story ? (
        <Txt variant="small" color="ink2">
          {person.story}
        </Txt>
      ) : null}
    </Pressable>
  );
}

/**
 * Step 2: who to be in the community being looked at. The people come in two sections, "Community roles" first (the member app's own
 * people), then "Non-profit operational roles"; a portal that sends no areas gets one plain list. Start signs in as the chosen person.
 * `communitySlug` names the community whose people to show; when the portal does not name communities, a switch between the kinds does.
 */
export function DemoPersonStepView({
  load,
  communitySlug,
  notice,
  warning,
  starting,
  startError,
  onStart,
  onRetryLoad,
  onBack,
}: {
  load: ChooserLoad;
  communitySlug: string | null;
  notice?: string | null;
  warning?: string | null;
  starting: boolean;
  startError: string | null;
  onStart: (persona: string) => void;
  onRetryLoad: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const [kind, setKind] = useState<DemoKind | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const ready = load.status === 'ready' ? load.choices : null;
  const communities = ready?.enabled ? ready.communities : [];
  const named = communitySlug ? communities.find((c) => c.slug === communitySlug) : undefined;
  const community: DemoCommunity | null = named ?? communities.find((c) => c.kind === kind) ?? communities[0] ?? null;
  const person = community?.people.find((p) => p.id === picked) ?? null;

  let body: ReactNode = <LoadState load={load} onRetry={onRetryLoad} />;
  if (ready) {
    if (!ready.enabled) body = <Banner tone="warning" message={ready.message ?? t('demo.off')} action={{ label: t('common.retry'), onPress: onRetryLoad }} />;
    else if (!community || community.people.length === 0) body = <Banner tone="info" message={ready.message ?? t('demo.empty')} action={{ label: t('common.retry'), onPress: onRetryLoad }} />;
    else
      body = (
        <View style={{ gap: space.lg }}>
          {!named && communities.length > 1 ? (
            <Segmented<DemoKind>
              label={t('demo.kindLabel')}
              value={community.kind}
              options={communities.map((c) => ({ value: c.kind, label: t(`demo.kind.${c.kind}`) }))}
              onChange={(k) => {
                setKind(k);
                setPicked(null);
              }}
            />
          ) : null}
          <View style={{ gap: 2 }}>
            <Txt variant="cardTitle" accessibilityRole="header">
              {community.name || t(`demo.kind.${community.kind}`)}
            </Txt>
            <Txt variant="small" color="muted">
              {t(`demo.kindBlurb.${community.kind}`)}
            </Txt>
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel={t('demo.peopleTitle')} style={{ gap: space.lg }}>
            {sectionsByArea(community.people).map((section) => (
              <View key={section.area ?? 'all'} style={{ gap: space.sm }}>
                {section.area ? <SectionTitle>{t(`demo.area.${section.area}`)}</SectionTitle> : null}
                {section.people.map((p) => (
                  <PersonCard key={p.id} person={p} selected={p.id === picked} disabled={starting} onPress={() => setPicked(p.id)} />
                ))}
              </View>
            ))}
          </View>
          {startError ? <Banner tone="error" message={startError} action={person ? { label: t('common.retry'), onPress: () => onStart(person.id) } : undefined} /> : null}
        </View>
      );
  }
  const showStart = !!community && community.people.length > 0;
  return (
    <ChooserFrame
      title={t('demo.personTitle')}
      subtitle={t('demo.personSubtitle')}
      notice={notice}
      warning={warning}
      onBack={onBack}
      footer={
        showStart ? (
          <Button
            label={starting ? t('demo.starting') : person ? t('demo.start', { name: person.name }) : t('demo.startNone')}
            busy={starting}
            disabled={!person}
            onPress={() => person && onStart(person.id)}
          />
        ) : null
      }>
      {body}
    </ChooserFrame>
  );
}

// ── The chooser as the app shows it ──────────────────────────────────────────

/** The sentence for why the chooser is on screen, or null. */
function noticeText(notice: DemoNotice | null, t: ReturnType<typeof useT>): string | null {
  if (notice === 'ended') return t('demo.ended');
  if (notice === 'off') return t('demo.endedOff');
  return null;
}

/** The chooser: loads the demo communities and people from the portal; the community step opens a community as a guest, the person step starts a demo person. */
export function DemoChooserScreen() {
  const t = useT();
  const demo = useDemo();
  const app = useApp();
  const choices = useLoad(() => loadDemoChoices(), [], 'load the demo');
  const [startError, setStartError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const load: ChooserLoad = choices.data ? { status: 'ready', choices: choices.data } : choices.error ? { status: 'error', message: choices.error.userMessage } : { status: 'loading' };
  const warning = app.session && !demo.active ? t('demo.signedInWarning') : null;

  if (demo.chooser === 'person') {
    return (
      <DemoPersonStepView
        load={load}
        communitySlug={demo.slug}
        notice={noticeText(demo.notice, t)}
        starting={demo.starting}
        startError={startError}
        onStart={(persona) => {
          setStartError(null);
          void demo.start(persona).then((result) => {
            if (!result.ok) setStartError(result.message);
          });
        }}
        onRetryLoad={() => void choices.reload()}
        onBack={demo.closeChooser}
      />
    );
  }
  return (
    <DemoCommunityStepView
      load={load}
      notice={noticeText(demo.notice, t)}
      warning={warning}
      opening={opening}
      onPick={(community) => {
        setOpening(true);
        demo
          .enterGuest(community)
          .catch((err: unknown) => logError('opening the demo community', err))
          .finally(() => setOpening(false));
      }}
      onRetryLoad={() => void choices.reload()}
      onBack={demo.closeChooser}
    />
  );
}
