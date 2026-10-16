import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Banner, Button, Pill, Row, Txt, VStack } from '@/components/ui';
import type { Translate } from '@/i18n';
import { proofFileUrls, type PickedProofFile } from '@/lib/api/proofs';
import { report } from '@/lib/errors';
import { formatCents, formatLongDate } from '@/lib/format';
import { formatFileSize, humanizeMethod, isImageType, isPdfType, methodNameKey, proofFileType, proofLook, type EvidenceItem, type ProofStatus, type TimelineTone } from '@/lib/proofs';
import { useLoad } from '@/lib/use-load';
import { useT } from '@/providers/settings';
import { colors, fonts, radii, space, touch } from '@/theme';

import type { useProofFiles } from './use-proof-files';

const THUMB = 72;

/** The chip a proof shows: Waiting, Needs more, Paid, Not accepted, Taken back. "Waiting" is not green: nothing is paid yet. */
export function ProofStatusPill({ status }: { status: ProofStatus }) {
  const t = useT();
  const look = proofLook(status);
  return <Pill label={t(look.labelKey)} tone={look.tone} />;
}

/** A square tile for a file: the photo itself when it is an image and a link is ready, else a labelled tile. */
export function FileTile({ uri, contentType, label, onPress }: { uri: string | null; contentType: string; label: string; onPress?: () => void }) {
  const t = useT();
  const body =
    uri && isImageType(contentType) ? (
      <Image source={{ uri }} style={{ width: THUMB, height: THUMB, borderRadius: radii.lg }} contentFit="cover" accessibilityIgnoresInvertColors accessible={false} />
    ) : (
      <View style={{ width: THUMB, height: THUMB, borderRadius: radii.lg, backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center' }}>
        <Txt variant="smallStrong" color="muted" style={{ fontFamily: fonts.bodyBold }}>
          {isPdfType(contentType) ? 'PDF' : t('proof.photoWord')}
        </Txt>
      </View>
    );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => ({ minWidth: touch.min, minHeight: touch.min, opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  );
}

export type OpenableFile = { id: string; path: string; contentType: string; bytes: number };

/**
 * The files of a proof or a pledge, as thumbnails the family can open (a private link, good for an hour). A file that cannot
 * be signed shows a plain tile; a failure of the whole request is said with a retry.
 */
export function ProofFiles({ files }: { files: readonly OpenableFile[] }) {
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const paths = files.map((f) => f.path);
  const urls = useLoad(() => proofFileUrls(paths), [paths.join('|')], 'open your proof');
  const open = async (file: OpenableFile, n: number) => {
    setError(null);
    const url = urls.data?.get(file.path);
    if (!url) {
      setError(t('proofs.filesLoadFailed'));
      void urls.reload();
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      setError(report(err, `open file ${n}`).userMessage);
    }
  };
  return (
    <VStack gap={space.sm}>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }} align="flex-start">
        {files.map((f, i) => (
          <View key={f.id} style={{ gap: 2, alignItems: 'flex-start' }}>
            <FileTile
              uri={urls.data?.get(f.path) ?? null}
              contentType={f.contentType}
              label={t(isPdfType(f.contentType) ? 'pledge.openPdf' : 'pledge.openPhoto', { n: i + 1 })}
              onPress={() => void open(f, i + 1)}
            />
            <Txt variant="fine" color="faint">
              {formatFileSize(f.bytes)}
            </Txt>
          </View>
        ))}
      </Row>
      {urls.error ? <Banner tone="error" message={urls.error.userMessage} action={{ label: t('common.retry'), onPress: () => void urls.reload() }} /> : null}
      {error ? <Banner tone="error" message={error} /> : null}
    </VStack>
  );
}

const DOT: Record<TimelineTone, string> = { navy: colors.navy, green: colors.green, amber: colors.saffron, grey: colors.muted };

export type TimelineLine = { at: string; text: string; tone: TimelineTone };

/** "What happened": a dot, the date in bold and the words. Oldest first. */
export function Timeline({ entries }: { entries: readonly TimelineLine[] }) {
  return (
    <VStack gap={space.sm}>
      {entries.map((e, i) => (
        <Row key={`${e.at}-${i}`} gap={space.sm} align="flex-start">
          <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: DOT[e.tone] }} accessibilityElementsHidden importantForAccessibility="no" />
          <Txt variant="small" color="ink2" style={{ flex: 1 }}>
            <Txt variant="smallStrong" color="ink">
              {`${formatLongDate(e.at.slice(0, 10))} `}
            </Txt>
            {e.text}
          </Txt>
        </Row>
      ))}
    </VStack>
  );
}

/**
 * Take a photo, Choose a photo, Attach a file: the three ways to add to a proof, with the reason the last one did not work
 * (and a way to the phone's Settings when the camera was refused). Every button waits while pictures are being prepared.
 */
export function ProofFileButtons({ picker, room }: { picker: ReturnType<typeof useProofFiles>; room: number }) {
  const t = useT();
  const off = picker.files.length >= room || picker.working;
  return (
    <VStack gap={space.sm}>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        <Button label={t('proof.takePhoto')} icon="camera-outline" tone="secondary" size="md" fill={false} disabled={off} onPress={() => void picker.pick('camera')} />
        <Button label={t('proof.choosePhoto')} icon="image-outline" tone="secondary" size="md" fill={false} disabled={off} onPress={() => void picker.pick('library')} />
        <Button label={t('proof.attachFile')} icon="attach-outline" tone="secondary" size="md" fill={false} disabled={off} onPress={() => void picker.pick('file')} />
      </Row>
      {picker.working ? (
        <Txt variant="meta" color="muted" accessibilityLiveRegion="polite">
          {t('proof.preparing')}
        </Txt>
      ) : null}
      {picker.notice ? (
        <Banner
          tone="error"
          message={picker.notice.message}
          action={picker.notice.settings ? { label: t('proof.openSettings'), onPress: () => void picker.openSettings() } : { label: t('common.retry'), onPress: () => void picker.retry() }}
        />
      ) : null}
    </VStack>
  );
}

/** The photos and files the family has chosen and not sent yet: a small picture, a name, the size, and Remove. */
export function PickedFiles({ files, onRemove }: { files: readonly PickedProofFile[]; onRemove: (file: PickedProofFile) => void }) {
  const t = useT();
  return (
    <VStack gap={space.sm}>
      {files.map((f, i) => {
        const type = proofFileType({ fileName: f.fileName, mimeType: f.mimeType, uri: f.uri })?.contentType ?? 'image/jpeg';
        const name = t(isPdfType(type) ? 'proof.fileName' : 'proof.photoName', { n: i + 1 });
        return (
          <Row key={f.id} gap={space.md} style={{ borderWidth: 1, borderColor: colors.border, borderRadius: radii.lg, padding: space.sm }}>
            {isImageType(type) ? <Image source={{ uri: f.uri }} style={{ width: 48, height: 48, borderRadius: radii.sm }} contentFit="cover" accessible={false} accessibilityIgnoresInvertColors /> : null}
            <View style={{ flex: 1 }}>
              <Txt variant="smallStrong">{name}</Txt>
              {f.bytes ? (
                <Txt variant="fine" color="faint">
                  {formatFileSize(f.bytes)}
                </Txt>
              ) : null}
            </View>
            <Pressable
              onPress={() => onRemove(f)}
              accessibilityRole="button"
              accessibilityLabel={t('proof.removeA11y', { name })}
              style={({ pressed }) => ({ minHeight: touch.min, minWidth: touch.min, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}>
              <Txt variant="smallStrong" color="danger">
                {t('proof.remove')}
              </Txt>
            </Pressable>
          </Row>
        );
      })}
    </VStack>
  );
}

/** The name of a way of paying ("Check", "Bank transfer"); one this build has no name for is named from its key. */
export function proofMethodName(t: Translate, method: string): string {
  const key = methodNameKey(method);
  const v = t(key);
  return v === key ? humanizeMethod(method) : v;
}

/** The sentence under a proof on a pledge: what it is, what it covered of THIS pledge, and why it was not accepted. */
export function evidenceLine(t: Translate, item: EvidenceItem): string {
  const amount = formatCents(item.coveredCents);
  switch (item.state) {
    case 'waiting':
      return t('pledge.proofWaiting', { amount });
    case 'needs_info':
      return t('pledge.proofNeeds', { amount });
    case 'rejected':
      return item.reason ? t('pledge.proofRejected', { reason: item.reason }) : t('pledge.proofRejectedNoReason');
    case 'withdrawn':
      return t('pledge.proofWithdrawn');
    default: {
      const date = (item.sentOn ?? item.paidOn)?.slice(0, 10);
      return date ? t('pledge.proofSent', { date: formatLongDate(date), amount }) : t('pledge.proofCovered', { amount });
    }
  }
}
