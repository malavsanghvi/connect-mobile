/**
 * Confetti for a celebration, computed up front from a seed so rendering
 * stays pure (no Math.random in render). Tested in __tests__/celebrate.test.ts.
 */
import { seededRandom } from './quiz-logic';

export type ConfettiPiece = {
  /** Horizontal drift at the end (px). */
  dx: number;
  /** Highest point of the throw (px, negative = up). */
  rise: number;
  /** Where it ends up (px below the start). */
  fall: number;
  /** Turns over the whole animation. */
  spin: number;
  /** Index into the palette. */
  color: number;
  size: number;
  /** 0–0.2: a small stagger so pieces don't move as one. */
  delay: number;
};

export function confettiPieces(seed: number, count = 28, spread = 160, paletteSize = 5): ConfettiPiece[] {
  const rnd = seededRandom(seed);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rnd() * 0.4;
    const power = 0.45 + rnd() * 0.55;
    return {
      dx: Math.round(Math.cos(angle) * spread * power),
      rise: -Math.round((60 + rnd() * 120) * power),
      fall: Math.round(120 + rnd() * 160),
      spin: Math.round((rnd() - 0.5) * 4 * 10) / 10,
      color: i % paletteSize,
      size: 6 + Math.round(rnd() * 6),
      delay: Math.round(rnd() * 20) / 100,
    };
  });
}
