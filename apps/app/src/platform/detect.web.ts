import type { Detection } from "@storystitch/layout-engine";

export interface DetectRequest {
  id: number;
  image: ImageBitmap;
}

export interface DetectResponse {
  id: number;
  detections: Detection[];
}

const pending = new Map<number, (detections: Detection[]) => void>();
let nextId = 0;
let broken = false;
let worker: Worker | undefined;

/**
 * Runs detection in a Web Worker, built separately into public/ (scripts/prepare-assets.mjs). Started on first use,
 * so the models only download after photos are picked. If the worker can't start, every photo resolves with no
 * detections and the app falls back to center crops. Takes ownership of `image` (it's transferred to the worker).
 */
export function detect(image: ImageBitmap): Promise<Detection[]> {
  worker ??= start();
  if (broken) {
    image.close();
    return Promise.resolve([]);
  }
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    worker!.postMessage({ id, image } satisfies DetectRequest, [image]);
  });
}

function start() {
  const started = new Worker("/detect-worker.js", { type: "module" });
  started.onmessage = ({ data }: MessageEvent<DetectResponse>) => {
    pending.get(data.id)?.(data.detections);
    pending.delete(data.id);
  };
  started.onerror = (e) => {
    console.warn("Detection worker failed; using center crops.", e.message);
    broken = true;
    pending.forEach((resolve) => resolve([]));
    pending.clear();
  };
  return started;
}
