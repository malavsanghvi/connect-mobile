import { useEffect, type RefObject } from 'react';
import { Platform, type ScrollView } from 'react-native';

/** Pixels per line when a browser reports the wheel in lines (Firefox: deltaMode 1). */
const LINE = 16;

/**
 * Where a sideways strip should scroll for one mouse-wheel step, or null to
 * leave the event alone (the page scrolls as usual). Only a mostly-vertical
 * wheel is turned sideways, and only while the strip can still move that way,
 * so at either end the page carries on scrolling. Trackpads already send
 * sideways deltas; ctrl+wheel is the browser's zoom.
 */
export function sidewaysScroll(
  e: { deltaX: number; deltaY: number; deltaMode: number; ctrlKey: boolean },
  scrollLeft: number,
  maxScroll: number,
): number | null {
  if (e.ctrlKey || maxScroll <= 0) return null;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return null;
  const dy = e.deltaMode === 1 ? e.deltaY * LINE : e.deltaY;
  if (dy < 0 && scrollLeft <= 0) return null;
  if (dy > 0 && scrollLeft >= maxScroll - 1) return null;
  return Math.max(0, Math.min(maxScroll, scrollLeft + dy));
}

/**
 * On the web a mouse wheel only scrolls up and down, so a horizontal
 * ScrollView can't be moved with a mouse: turn the wheel sideways over it.
 * Native apps and touch are unchanged. `ready` should turn true once the
 * ScrollView is on screen (the effect attaches to its DOM node then).
 */
export function useWheelScrollsSideways(ref: RefObject<ScrollView | null>, ready: boolean): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || !ready) return;
    const node = (ref.current as unknown as { getScrollableNode?: () => HTMLElement | null } | null)?.getScrollableNode?.();
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      const next = sidewaysScroll(e, node.scrollLeft, node.scrollWidth - node.clientWidth);
      if (next === null) return;
      e.preventDefault();
      node.scrollLeft = next;
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [ref, ready]);
}
