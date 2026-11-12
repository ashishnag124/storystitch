import type { Size } from "@storystitch/shared";
import { CENTER_CROP, MIN_ZOOM, sourceRect, type Crop } from "./crop";
import { importance, subjectBox, withPaddedFaces, type Detection } from "./subject";

/** Fractions of a frame's edges that sit under Instagram's interface overlays (see SAFE_ZONE). */
export interface SafeInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export const NO_INSETS: SafeInsets = { top: 0, bottom: 0, left: 0, right: 0 };

/** Space kept around the subject, as a fraction of the crop's length along the axis it slides on. */
export const SUBJECT_MARGIN = 0.05;

/** Beyond this share of the frame under the bands, there's no safe part to center the subject in. */
const MAX_INSET_SHARE = 0.9;

/** A face counts as inside or outside the crop within this many photo pixels. */
const EDGE_TOLERANCE_PX = 0.5;

interface Span {
  lo: number;
  hi: number;
  weight: number;
  face: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * The crop for a photo in a frame that keeps what matters:
 *
 * 1. At zoom 1 the crop covers the frame with as much of the photo as possible, so it can only slide
 *    along one axis. The ideal position puts the subject box in the middle of the frame's part that
 *    isn't under the safe-zone bands.
 * 2. No face may be cut through: every face is either fully in the crop or fully out, and the most
 *    important face is always in.
 * 3. Among positions that satisfy (2), it keeps the most importance (whole faces, plus the covered
 *    share of people and objects), then the one nearest the ideal.
 * 4. If no position satisfies (2), it zooms out (down to MIN_ZOOM) until every face fits, leaving
 *    background around the photo.
 */
export function smartCrop(image: Size, frame: Size, detections: Detection[], insets: SafeInsets = NO_INSETS): Crop {
  const subject = subjectBox(detections);
  if (!subject) return CENTER_CROP;

  const crop = sourceRect(image, frame, CENTER_CROP);
  const alongX = crop.width < image.width - EDGE_TOLERANCE_PX;
  const alongY = crop.height < image.height - EDGE_TOLERANCE_PX;
  if (!alongX && !alongY) return CENTER_CROP; // same aspect ratio: the whole photo is already in view

  const N = alongX ? image.width : image.height;
  const L = alongX ? crop.width : crop.height;
  const toSpan = (d: Detection): Span => {
    const lo = (alongX ? d.box.x : d.box.y) * N;
    return { lo, hi: lo + (alongX ? d.box.w : d.box.h) * N, weight: importance(d), face: d.kind === "face" };
  };
  const spans = withPaddedFaces(detections).map(toSpan);
  const faces = spans.filter((s) => s.face);
  const topFace = faces.reduce<Span | null>((best, f) => (!best || f.weight > best.weight ? f : best), null);

  // Ideal: the subject's center lands mid-way through the part of the frame that's outside the safe-zone bands.
  let [insetLo, insetHi] = alongX ? [insets.left, insets.right] : [insets.top, insets.bottom];
  if (insetLo + insetHi > MAX_INSET_SHARE) [insetLo, insetHi] = [0, 0]; // nowhere better to move to
  const subjectCenter = ((alongX ? subject.x + subject.w / 2 : subject.y + subject.h / 2) * N);
  const safeCenter = L * (insetLo + (1 - insetLo - insetHi) / 2);
  /** The best position for a crop `W` long (the frame's L at zoom 1), or null when no position keeps every face whole. */
  const bestPosition = (W: number, edge: number): number | null => {
    const inside = (s: Span, x: number) => s.lo >= x + edge - EDGE_TOLERANCE_PX && s.hi <= x + W - edge + EDGE_TOLERANCE_PX;
    const outside = (s: Span, x: number) => s.hi <= x + EDGE_TOLERANCE_PX || s.lo >= x + W - EDGE_TOLERANCE_PX;
    const allowed = (x: number) => faces.every((f) => inside(f, x) || outside(f, x)) && (!topFace || inside(topFace, x));
    const kept = (x: number) =>
      spans.reduce((sum, s) => {
        if (s.face) return sum + (inside(s, x) ? s.weight : 0);
        const covered = Math.max(0, Math.min(s.hi, x + W) - Math.max(s.lo, x)) / Math.max(s.hi - s.lo, 1e-9);
        return sum + s.weight * covered;
      }, 0);

    // The best position is the ideal one or lies where some face or the subject touches a crop edge.
    const margin = SUBJECT_MARGIN * W;
    const subjectLo = (alongX ? subject.x : subject.y) * N - margin;
    const subjectHi = (alongX ? subject.x + subject.w : subject.y + subject.h) * N + margin;
    // Longer than the photo, the crop is centered on it (as sourceRect does); otherwise it slides inside it.
    const [first, reach] = W >= N ? [(N - W) / 2, (N - W) / 2] : [0, N - W];
    const ideal = clamp(subjectCenter - safeCenter * (W / L), first, reach);
    const candidates = [ideal, first, reach, subjectLo, subjectHi - W, ...spans.flatMap((s) => [s.lo - edge, s.hi - W + edge, s.lo - W, s.hi])]
      .map((x) => clamp(x, first, reach))
      .filter(allowed);
    if (!candidates.length) return null;
    return candidates.reduce((a, b) => {
      const d = kept(b) - kept(a);
      if (Math.abs(d) > 1e-9) return d > 0 ? b : a;
      return Math.abs(b - ideal) < Math.abs(a - ideal) ? b : a;
    });
  };

  const best = bestPosition(L, 0);
  if (best !== null) {
    const center = (best + L / 2) / N;
    return alongX ? { cx: center, cy: 0.5, zoom: 1 } : { cx: 0.5, cy: center, zoom: 1 };
  }

  // No clean cut: zoom out as little as it takes. A crop of length L / zoom needs room for the faces it keeps plus
  // a margin, so try the zooms at which some run of faces just fits, largest first; faces outside the run stay out.
  const zooms = faces
    .flatMap((a) => faces.map((b) => (b.hi - a.lo) / (1 - 2 * SUBJECT_MARGIN)))
    .filter((needed) => needed > L)
    .map((needed) => L / needed)
    .sort((a, b) => b - a);
  for (const zoom of [...zooms, MIN_ZOOM].map((z) => Math.max(z, MIN_ZOOM))) {
    const W = L / zoom;
    const at = bestPosition(W, SUBJECT_MARGIN * W);
    if (at === null && zoom > MIN_ZOOM) continue;
    const center = at !== null ? (W >= N ? 0.5 : (at + W / 2) / N) : (Math.min(...faces.map((f) => f.lo)) + Math.max(...faces.map((f) => f.hi))) / 2 / N; // floor: fit what we can
    return alongX ? { cx: center, cy: 0.5, zoom } : { cx: 0.5, cy: center, zoom };
  }
  return CENTER_CROP;
}
