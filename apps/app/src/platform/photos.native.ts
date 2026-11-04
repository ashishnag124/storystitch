import type { Detection } from "@storystitch/layout-engine";

// Stage 3: native photo intake and Apple Vision.
export type PickedPhoto = number;

export interface Photo {
  name: string;
  width: number;
  height: number;
  detections: Detection[];
}

export class UnsupportedPhotoError extends Error {
  readonly fileName = "";
}

export const loadPhoto = async (width: PickedPhoto): Promise<Photo> => ({ name: `sample-${width}`, width, height: 1200, detections: [] });
export const analyzePhoto = async (): Promise<Detection[]> => [];
export const closePhoto = () => {};
