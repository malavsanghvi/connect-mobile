import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { Button, Row, Txt } from '@/components/ui';
import { colors, radii, space } from '@/theme';

import { useT } from './settings';

type ToastTone = 'success' | 'error' | 'info';
type ConfirmOptions = { title: string; body: string; confirmLabel: string; tone?: 'danger' | 'brown' | 'primary'; cancelLabel?: string };

type FeedbackContextValue = {
  /** Short confirmation at the top of the screen. Errors should use an inline Banner with retry instead. */
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /**
   * There is no payment edge function yet. Every "Pay" button calls this so
   * the member is told the truth instead of seeing a fake success.
   */
  payNotice: (context?: { amountLabel?: string; saved?: boolean }) => void;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [toastState, setToastState] = useState<{ message: string; tone: ToastTone; id: number } | null>(null);
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null);
  const [payState, setPayState] = useState<{ amountLabel?: string; saved: boolean } | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    if (!toastState) return;
    const timer = setTimeout(() => setToastState(null), 2600);
    return () => clearTimeout(timer);
  }, [toastState]);

  const value: FeedbackContextValue = {
    toast: (message, tone = 'success') => setToastState({ message, tone, id: Date.now() }),
    confirm: (opts) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setConfirmState(opts);
      }),
    payNotice: (context) => setPayState({ amountLabel: context?.amountLabel, saved: context?.saved ?? true }),
  };

  const closeConfirm = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setConfirmState(null);
  };

  const toastBg = toastState?.tone === 'error' ? colors.danger : toastState?.tone === 'info' ? colors.navy : colors.green;

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {toastState ? (
        <View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          accessibilityRole="alert"
          style={{ position: 'absolute', top: insets.top + 12, left: space.gutter, right: space.gutter, backgroundColor: toastBg, borderRadius: radii.card, paddingVertical: space.md, paddingHorizontal: space.lg, zIndex: 1000 }}>
          <Txt variant="smallStrong" color="white" center>
            {toastState.message}
          </Txt>
        </View>
      ) : null}

      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => closeConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', padding: space.xl }}>
          <View accessibilityViewIsModal style={{ backgroundColor: colors.card, borderRadius: radii.sheet, padding: space.xl, gap: space.md }}>
            <Txt variant="title" color="navy" accessibilityRole="header">
              {confirmState?.title ?? ''}
            </Txt>
            <Txt variant="body" color="ink2">
              {confirmState?.body ?? ''}
            </Txt>
            <Button
              label={confirmState?.confirmLabel ?? t('common.confirm')}
              tone={confirmState?.tone === 'danger' ? 'danger' : confirmState?.tone === 'brown' ? 'brown' : 'primary'}
              onPress={() => closeConfirm(true)}
            />
            <Button label={confirmState?.cancelLabel ?? t('common.cancel')} tone="secondary" onPress={() => closeConfirm(false)} />
          </View>
        </View>
      </Modal>

      <Modal visible={!!payState} transparent animationType="slide" onRequestClose={() => setPayState(null)}>
        <Pressable style={{ flex: 1, backgroundColor: colors.scrim }} onPress={() => setPayState(null)} accessibilityLabel={t('common.close')} />
        <View
          accessibilityViewIsModal
          style={{ backgroundColor: colors.card, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, padding: space.xl, paddingBottom: space.xl + insets.bottom, gap: space.md }}>
          <Row gap={space.sm}>
            <Icon name="card-outline" size={24} color={colors.brown} />
            <Txt variant="title" color="navy" accessibilityRole="header">
              {t('pay.title')}
            </Txt>
          </Row>
          {payState?.amountLabel ? (
            <Txt variant="subhead" color="brown">
              {payState.amountLabel}
            </Txt>
          ) : null}
          <Txt variant="body" color="ink2">
            {payState?.saved === false ? t('pay.notSetUpNoPledge') : t('pay.notSetUp')}
          </Txt>
          <Txt variant="meta" color="muted">
            {t('pay.howToPay')}
          </Txt>
          <Button label={t('common.gotIt')} onPress={() => setPayState(null)} />
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside FeedbackProvider');
  return ctx;
}
