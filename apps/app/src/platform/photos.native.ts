import type { Detection } from "@storystitch/layout-engine";

// Stage 3: native photo intake and Apple Vision.
export type PickedPhoto = never;

export interface Photo {
  name: string;
  width: number;
  height: number;
  detections: Detection[];
}

export class UnsupportedPhotoError extends Error {
  readonly fileName = "";
}

export const loadPhoto = async (): Promise<Photo> => {
  throw new Error("Not built yet");
};
export const analyzePhoto = async (): Promise<Detection[]> => [];
export const closePhoto = () => {};
