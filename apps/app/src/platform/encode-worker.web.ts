/// <reference lib="webworker" />
// Encodes the export off the main thread: see encode() in exportImage.web.ts.
import type { EncodeRequest, EncodeResponse } from "./exportImage.web";

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async ({ data: { id, bitmap, format, quality } }: MessageEvent<EncodeRequest>) => {
  let blob: Blob | null = null;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    blob = await canvas.convertToBlob({ type: format, quality });
  } catch (err) {
    console.warn("Encoding failed in the worker", err);
  }
  bitmap.close();
  self.postMessage({ id, blob } satisfies EncodeResponse);
};
