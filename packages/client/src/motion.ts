/** Axis-aligned bounds of a cell's outline, in canvas pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerpBox = (a: Box, b: Box, t: number): Box => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
});

/** Pointer movement (CSS px) below which a press counts as a tap rather than a drag. */
export const TAP_SLOP_PX = 6;
/** Holding a photo still this long lifts it, to be dropped on another cell. */
export const LONG_PRESS_MS = 400;
/** A second tap on the same photo within this time is a double-tap (zoom in, or back to fit). */
export const DOUBLE_TAP_MS = 300;
/** Zoom a double-tap goes to, and the zoom above which a double-tap goes back to fit. */
export const DOUBLE_TAP_ZOOM = 2;
/** Motion timings (ms) and feel. */
export const MOTION = {
  lift: 140, // photo rises to liftScale under the finger
  liftScale: 1.06,
  flight: 260, // swapped photos glide to their new cells
  settle: 180, // a dropped photo returns to its own cell
  crossfade: 220, // switching layouts
  crop: 220, // Fit and double-tap zoom
  /** Momentum after a flicked drag: velocity kept per 16 ms frame, and the speed (canvas px/ms) where it stops. */
  friction: 0.92,
  minSpeed: 0.02,
};
