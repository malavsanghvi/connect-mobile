import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StrokeIcon } from '@/components/stroke-icon';
import { Banner, Button, Card, Row, Txt } from '@/components/ui';
import { savePhotos, sharePhoto } from '@/features/media';
import type { EventRow } from '@/lib/api/events';
import { eventFlyerUrl } from '@/lib/api/flyers';
import { report } from '@/lib/errors';
import { flyerFileName, flyerMimeType, isExpiredLinkError, needsResign } from '@/lib/flyer';
import { useLoad } from '@/lib/use-load';
import { useFeedback } from '@/providers/feedback';
import { useT } from '@/providers/settings';
import { colors, radii, space } from '@/theme';

/** A signed flyer link and when it was made (links last an hour). */
type Signed = { url: string; signedAt: number };
type Kind = 'share' | 'save';
type ActionError = { kind: Kind; message: string };
type FlyerActions = { busy: Kind | null; error: ActionError | null; run: (kind: Kind) => Promise<void>; clearError: () => void };

/** Width ÷ height until the image says otherwise (the portal's "post" size). */
const DEFAULT_RATIO = 4 / 5;
const MAX_HEIGHT = 480;

/**
 * The event's flyer (designed or uploaded in the portal): the image, Share (the system share sheet,
 * so WhatsApp, Messages…) and Save (Photos, or a download on the web), and a full-screen viewer.
 * Nothing renders when the event has no flyer. Guests see it for public events (connect-crm 0578).
 */
export function EventFlyer({ event }: { event: Pick<EventRow, 'flyer_path' | 'name'> | null | undefined }) {
  const path = event?.flyer_path?.trim();
  if (!event || !path) return null;
  return <FlyerCard key={path} path={path} eventName={event.name} />;
}

function FlyerCard({ path, eventName }: { path: string; eventName: string }) {
  const t = useT();
  const signed = useLoad(async (): Promise<Signed> => ({ url: await eventFlyerUrl(path), signedAt: Date.now() }), [path], 'load the flyer');
  const actions = useFlyerActions(path, eventName, signed.data ?? null);
  const [ratio, setRatio] = useState<number | null>(null);
  const [imageError, setImageError] = useState<{ url: string; message: string } | null>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [viewer, setViewer] = useState(false);
  const url = signed.data?.url ?? null;
  const imageFailed = !!imageError && imageError.url === url;
  const loadError = imageFailed ? imageError.message : (signed.error?.userMessage ?? null);
  const alt = t('events.flyer.alt', { event: eventName });
  const r = ratio ?? DEFAULT_RATIO;
  const boxHeight = boxWidth > 0 ? Math.min(MAX_HEIGHT, boxWidth / r) : undefined;
  const retry = () => {
    setImageError(null);
    void signed.reload();
  };
  const open = (on: boolean) => {
    actions.clearError();
    setViewer(on);
  };

  return (
    <Card style={{ gap: space.md }}>
      <Txt variant="section" accessibilityRole="header">
        {t('events.flyer.title')}
      </Txt>
      {loadError ? <Banner tone="error" title={t('events.flyer.loadFailed')} message={loadError} action={{ label: t('common.retry'), onPress: retry }} /> : null}
      <View onLayout={(e) => setBoxWidth(e.nativeEvent.layout.width)} style={{ width: '100%' }}>
        {url && !imageFailed ? (
          <Pressable
            onPress={() => open(true)}
            accessibilityRole="button"
            accessibilityLabel={alt}
            accessibilityHint={t('events.flyer.open')}
            style={({ pressed }) => ({ width: '100%', height: boxHeight, aspectRatio: boxHeight ? undefined : r, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.panel, opacity: pressed ? 0.9 : 1 })}>
            <Image
              source={{ uri: url, cacheKey: path }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              transition={150}
              accessibilityIgnoresInvertColors
              onLoad={(e) => setRatio(e.source.width > 0 && e.source.height > 0 ? e.source.width / e.source.height : DEFAULT_RATIO)}
              onError={(e) => setImageError({ url, message: report(new Error(e.error), 'load the flyer').userMessage })}
            />
            {ratio === null ? (
              <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                <ActivityIndicator color={colors.navy} />
              </View>
            ) : null}
          </Pressable>
        ) : !loadError ? (
          <View accessible accessibilityLabel={t('common.loading')} style={{ width: '100%', aspectRatio: DEFAULT_RATIO, maxHeight: MAX_HEIGHT, borderRadius: radii.md, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.navy} />
          </View>
        ) : null}
      </View>
      <Row gap={space.sm}>
        <Button label={t('events.flyer.share')} icon="share-outline" tone="secondary" size="sm" style={{ flex: 1 }} busy={actions.busy === 'share'} disabled={!url || !!actions.busy} onPress={() => void actions.run('share')} />
        <Button label={t('events.flyer.save')} icon="download-outline" tone="secondary" size="sm" style={{ flex: 1 }} busy={actions.busy === 'save'} disabled={!url || !!actions.busy} onPress={() => void actions.run('save')} />
      </Row>
      {!viewer ? <ActionErrorBanner actions={actions} /> : null}
      {viewer && url ? <FlyerViewer url={url} path={path} eventName={eventName} actions={actions} onRetry={retry} onClose={() => open(false)} /> : null}
    </Card>
  );
}

/**
 * Share and Save with a fresh link: one older than 50 minutes is signed again first, and a download
 * that Storage refuses (HTTP 400/403, an expired token) is signed again and retried once.
 */
function useFlyerActions(path: string, eventName: string, signed: Signed | null): FlyerActions {
  const t = useT();
  const { toast } = useFeedback();
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<ActionError | null>(null);
  const [fresh, setFresh] = useState<Signed | null>(null);
  const fileName = flyerFileName(eventName, path);
  const mime = flyerMimeType(fileName);

  const resign = async (): Promise<string> => {
    const next = { url: await eventFlyerUrl(path), signedAt: Date.now() };
    setFresh(next);
    return next.url;
  };
  const currentUrl = async (): Promise<string> => {
    const newest = signed && fresh ? (fresh.signedAt > signed.signedAt ? fresh : signed) : (fresh ?? signed);
    return newest && !needsResign(newest.signedAt, Date.now()) ? newest.url : resign();
  };
  const attempt = async (kind: Kind, url: string) => {
    if (kind === 'share') await sharePhoto(url, fileName, mime);
    else await savePhotos([{ url, fileName }]);
  };

  const run = async (kind: Kind) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const url = await currentUrl();
      try {
        await attempt(kind, url);
      } catch (err) {
        if (!isExpiredLinkError(err)) throw err;
        await attempt(kind, await resign());
      }
      if (kind === 'save') toast(t('events.flyer.saved'));
    } catch (err) {
      setError({ kind, message: report(err, kind === 'share' ? 'share the flyer' : 'save the flyer').userMessage });
    } finally {
      setBusy(null);
    }
  };

  return { busy, error, run, clearError: () => setError(null) };
}

function ActionErrorBanner({ actions }: { actions: FlyerActions }) {
  const t = useT();
  const err = actions.error;
  if (!err) return null;
  return <Banner tone="error" title={t(err.kind === 'share' ? 'events.flyer.shareFailed' : 'events.flyer.saveFailed')} message={err.message} action={{ label: t('common.retry'), onPress: () => void actions.run(err.kind) }} />;
}

/** Full-screen dark viewer (like the album's): Close, the flyer fit to the screen, Share · Save. */
function FlyerViewer({ url, path, eventName, actions, onRetry, onClose }: { url: string; path: string; eventName: string; actions: FlyerActions; onRetry: () => void; onClose: () => void }) {
  const t = useT();
  const [failed, setFailed] = useState<{ url: string; message: string } | null>(null);
  const imageFailed = !!failed && failed.url === url;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.viewerBg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: 18, paddingHorizontal: space.lg, paddingBottom: 10 }}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel={t('events.flyer.close')}
            style={({ pressed }) => ({ minWidth: 44, minHeight: 44, borderRadius: 22, paddingHorizontal: 14, flexDirection: 'row', gap: space.xs, backgroundColor: colors.viewerButton, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1 })}>
            <StrokeIcon name="close" size={14} color={colors.white} strokeWidth={2} />
            <Txt variant="smallStrong" color="white">
              {t('events.flyer.close')}
            </Txt>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Txt variant="smallStrong" color="viewerText" numberOfLines={1}>
              {eventName}
            </Txt>
          </View>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.md, gap: space.sm }}>
          {imageFailed ? (
            <View style={{ alignSelf: 'stretch' }}>
              <Banner
                tone="error"
                title={t('events.flyer.loadFailed')}
                message={failed.message}
                action={{
                  label: t('common.retry'),
                  onPress: () => {
                    setFailed(null);
                    onRetry();
                  },
                }}
              />
            </View>
          ) : (
            <Image
              source={{ uri: url, cacheKey: path }}
              style={{ width: '100%', height: '100%' }}
              contentFit="contain"
              accessibilityLabel={t('events.flyer.alt', { event: eventName })}
              accessibilityIgnoresInvertColors
              onError={(e) => setFailed({ url, message: report(new Error(e.error), 'load the flyer').userMessage })}
            />
          )}
        </View>
        {actions.error ? (
          <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
            <ActionErrorBanner actions={actions} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space.sm, paddingTop: space.lg, paddingHorizontal: space.lg, paddingBottom: 36 }}>
          <ViewerButton label={t('events.flyer.share')} onPress={() => void actions.run('share')} busy={actions.busy === 'share'} disabled={!!actions.busy} />
          <ViewerButton label={t('events.flyer.save')} onPress={() => void actions.run('save')} busy={actions.busy === 'save'} disabled={!!actions.busy} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function ViewerButton({ label, onPress, disabled, busy }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled, busy: !!busy }}
      style={({ pressed }) => ({ flex: 1, minHeight: 48, borderRadius: radii.card, backgroundColor: colors.viewerButton, alignItems: 'center', justifyContent: 'center', opacity: disabled && !busy ? 0.45 : pressed ? 0.8 : 1 })}>
      {busy ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Txt variant="smallStrong" color="white">
          {label}
        </Txt>
      )}
    </Pressable>
  );
}
