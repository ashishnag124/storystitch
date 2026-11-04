/// <reference lib="webworker" />
// Finds faces, people and objects off the main thread. The models load on the first request,
// i.e. only after the user has picked photos. Any model failure falls back to the saliency heuristic.
import { FaceDetector, FilesetResolver, ObjectDetector, type Detection as MpDetection } from "@mediapipe/tasks-vision";
import { salientRegion, type Detection, type SubjectKind } from "@storystitch/layout-engine";
import type { DetectRequest, DetectResponse } from "./detect.web";

declare const self: DedicatedWorkerGlobalScope;

const FACE_MIN_CONFIDENCE = 0.5;
const OBJECT_MIN_SCORE = 0.5;
const MAX_OBJECTS = 5;
/** Long side of the copy the saliency heuristic reads. */
const SALIENCY_LONG_SIDE = 96;

const asset = (path: string) => new URL(`/${path}`, self.location.origin).href;

interface Models {
  faces: FaceDetector;
  objects: ObjectDetector;
}

let models: Promise<Models | null> | undefined;

function loadModels(): Promise<Models | null> {
  models ??= (async () => {
    // MediaPipe feeds images through WebGL2 even on the CPU delegate. Without it (Safari < 17,
    // GPU-less browsers) the models can't run, so don't download them.
    if (!new OffscreenCanvas(1, 1).getContext("webgl2")) throw new Error("No WebGL2 in workers");
    // ES-module + SIMD runtime, served from our own origin (scripts/copy-mediapipe.mjs).
    const fileset = await FilesetResolver.forVisionTasks(asset("mediapipe"), true);
    const [faces, objects] = await Promise.all([
      FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset("models/blaze_face_full_range.tflite"), delegate: "CPU" },
        runningMode: "IMAGE",
        minDetectionConfidence: FACE_MIN_CONFIDENCE,
      }),
      ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: asset("models/efficientdet_lite0.tflite"), delegate: "CPU" },
        runningMode: "IMAGE",
        scoreThreshold: OBJECT_MIN_SCORE,
        maxResults: MAX_OBJECTS,
      }),
    ]);
    return { faces, objects };
  })().catch((err: unknown) => {
    console.warn("Detection models failed to load; using the saliency heuristic.", err);
    return null;
  });
  return models;
}

function toDetection(d: MpDetection, kind: SubjectKind, width: number, height: number, label?: string): Detection | null {
  const b = d.boundingBox;
  if (!b) return null;
  const x0 = Math.max(0, b.originX / width);
  const y0 = Math.max(0, b.originY / height);
  const x1 = Math.min(1, (b.originX + b.width) / width);
  const y1 = Math.min(1, (b.originY + b.height) / height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { kind, label, score: d.categories[0]?.score ?? 0, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

function detectWithModels(m: Models, image: ImageBitmap): Detection[] {
  const { width, height } = image;
  const faces = m.faces.detect(image).detections.map((d) => toDetection(d, "face", width, height));
  const objects = m.objects.detect(image).detections.map((d) => {
    const label = d.categories[0]?.categoryName;
    return toDetection(d, label === "person" ? "person" : "object", width, height, label);
  });
  return [...faces, ...objects].filter((d): d is Detection => d !== null);
}

function saliency(image: ImageBitmap): Detection[] {
  const scale = SALIENCY_LONG_SIDE / Math.max(image.width, image.height);
  const w = Math.max(1, Math.round(image.width * scale));
  const h = Math.max(1, Math.round(image.height * scale));
  const ctx = new OffscreenCanvas(w, h).getContext("2d")!;
  ctx.drawImage(image, 0, 0, w, h);
  const region = salientRegion(ctx.getImageData(0, 0, w, h));
  return region ? [region] : [];
}

self.onmessage = async ({ data }: MessageEvent<DetectRequest>) => {
  const { id, image } = data;
  let detections: Detection[] = [];
  const m = await loadModels();
  if (m) {
    try {
      detections = detectWithModels(m, image);
    } catch (err) {
      console.warn("Detection failed; using the saliency heuristic.", err);
    }
  }
  try {
    if (!detections.length) detections = saliency(image);
  } finally {
    image.close();
  }
  self.postMessage({ id, detections } satisfies DetectResponse);
};
