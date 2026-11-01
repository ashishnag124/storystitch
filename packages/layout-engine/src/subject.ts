import type { Box } from "@storystitch/shared";

export type SubjectKind = "face" | "person" | "object" | "salient";

/** Something worth keeping in frame. `box` is in 0–1 coordinates of the (EXIF-oriented) photo. */
export interface Detection {
  kind: SubjectKind;
  /** What the detector called it, e.g. "dog". */
  label?: string;
  /** Detector confidence, 0–1. */
  score: number;
  box: Box;
}

/**
 * How much each kind of detection matters when deciding what a crop must keep.
 * Faces dominate: they're what people look at first and the brief forbids cutting them.
 */
export const SUBJECT_WEIGHTS: Record<SubjectKind, number> = {
  face: 4,
  person: 2, // bodies, or people facing away from the camera
  object: 1, // pets, food, products…
  salient: 0.5, // the heuristic's guess when no detector found anything
};

/** Detections less important than this fraction of the most important one don't shape the subject box. */
export const KEEP_FRACTION = 0.3;

/** Face detectors box the eyes, nose and mouth; this much extra (× face size) keeps hair and chin in. */
export const FACE_PADDING = { side: 0.2, top: 0.4, bottom: 0.15 } as const;

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** Weight × confidence × √area: square root so a large object doesn't drown out a small face. */
export function importance(d: Detection): number {
  return SUBJECT_WEIGHTS[d.kind] * d.score * Math.sqrt(d.box.w * d.box.h);
}

/** A face box grown to cover the whole head, clamped to the photo. */
export function padFace(box: Box): Box {
  const x0 = clamp01(box.x - box.w * FACE_PADDING.side);
  const y0 = clamp01(box.y - box.h * FACE_PADDING.top);
  const x1 = clamp01(box.x + box.w * (1 + FACE_PADDING.side));
  const y1 = clamp01(box.y + box.h * (1 + FACE_PADDING.bottom));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Detections as crops should treat them: faces padded to whole heads. */
export function withPaddedFaces(detections: Detection[]): Detection[] {
  return detections.map((d) => (d.kind === "face" ? { ...d, box: padFace(d.box) } : d));
}

export function union(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * The weighted subject box: the union of every detection at least KEEP_FRACTION as important as
 * the most important one, faces padded. Null when there's nothing to keep.
 */
export function subjectBox(detections: Detection[]): Box | null {
  const padded = withPaddedFaces(detections);
  if (!padded.length) return null;
  const top = Math.max(...padded.map(importance));
  return union(padded.filter((d) => importance(d) >= top * KEEP_FRACTION).map((d) => d.box));
}
