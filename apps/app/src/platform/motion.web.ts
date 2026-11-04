// Small animation helpers for the editor: frame-by-frame tweens, and respect for reduced motion.
import { easeOutCubic } from "@storystitch/client";

/** People who ask their device to reduce motion get instant changes instead of animations. */
export const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Calls `onFrame` with eased progress (0 → 1) on every animation frame for `duration` ms, then `onDone`.
 * Returns a function that stops it early. With reduced motion it jumps straight to the end.
 */
export function tween(duration: number, onFrame: (t: number) => void, onDone?: () => void): () => void {
  if (duration <= 0 || prefersReducedMotion()) {
    onFrame(1);
    onDone?.();
    return () => {};
  }
  const start = performance.now();
  let id = requestAnimationFrame(function step(now) {
    const t = Math.min(1, (now - start) / duration);
    onFrame(easeOutCubic(t));
    if (t < 1) id = requestAnimationFrame(step);
    else onDone?.();
  });
  return () => cancelAnimationFrame(id);
}

/** Short vibrations on Android for lift and drop (iPhone Safari has no vibration API). */
export const haptic = (ms: number) => navigator.vibrate?.(ms);
