import type { Detection } from "@storystitch/layout-engine";

/** Finds what matters in a photo. Behind an interface so tests can supply fixed results. */
export interface Detector {
  /** Takes ownership of `image` (it's transferred to the worker). */
  detect(image: ImageBitmap): Promise<Detection[]>;
}

export interface DetectRequest {
  id: number;
  image: ImageBitmap;
}

export interface DetectResponse {
  id: number;
  detections: Detection[];
}

/**
 * Runs detection in a Web Worker. If the worker itself can't start, every photo resolves with no
 * detections, so the app falls back to center crops.
 */
export function createWorkerDetector(): Detector {
  const pending = new Map<number, (detections: Detection[]) => void>();
  let nextId = 0;
  let broken = false;
  const worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = ({ data }: MessageEvent<DetectResponse>) => {
    pending.get(data.id)?.(data.detections);
    pending.delete(data.id);
  };
  worker.onerror = (e) => {
    console.warn("Detection worker failed; using center crops.", e.message);
    broken = true;
    pending.forEach((resolve) => resolve([]));
    pending.clear();
  };
  return {
    detect(image) {
      if (broken) {
        image.close();
        return Promise.resolve([]);
      }
      return new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, resolve);
        worker.postMessage({ id, image } satisfies DetectRequest, [image]);
      });
    },
  };
}
