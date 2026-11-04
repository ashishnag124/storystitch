import { easeOutCubic } from "@storystitch/client";
import { impactAsync, ImpactFeedbackStyle } from "expo-haptics";
import { AccessibilityInfo } from "react-native";

let reduceMotion = false;
void AccessibilityInfo.isReduceMotionEnabled().then((on) => (reduceMotion = on));
AccessibilityInfo.addEventListener("reduceMotionChanged", (on) => (reduceMotion = on));

/** People who ask their device to reduce motion get instant changes instead of animations. */
export const prefersReducedMotion = () => reduceMotion;

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

/** A light tap under the finger, for lift and drop. */
export const haptic = () => void impactAsync(ImpactFeedbackStyle.Light);
