import type { Detection } from "@storystitch/layout-engine";
import { Skia, type SkImage } from "@shopify/react-native-skia";
import StoryVision from "../../modules/story-vision";

/** Long side of the working copies used for previews. Exports always use the originals. */
const PREVIEW_LONG_SIDE = 1280;

/** What the photo picker hands over. */
export interface PickedPhoto {
  name: string;
  uri: string;
}

export interface Photo {
  name: string;
  /** The picked file. */
  source: string;
  /** Size of the original after its orientation is applied. */
  width: number;
  height: number;
  preview: SkImage;
  /** What subject detection found; empty until analyzed or when nothing was found. */
  detections: Detection[];
}

export class UnsupportedPhotoError extends Error {}

/** Decodes a full-resolution image. */
export async function decodeFull(uri: string): Promise<SkImage> {
  const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(uri));
  if (!image) throw new UnsupportedPhotoError(`Couldn't open ${uri}`);
  return image;
}

function downscale(full: SkImage, longSide: number): SkImage {
  const scale = Math.min(1, longSide / Math.max(full.width(), full.height()));
  const [width, height] = [Math.round(full.width() * scale), Math.round(full.height() * scale)];
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error("Couldn't make a surface");
  surface.getCanvas().drawImageRect(full, Skia.XYWHRect(0, 0, full.width(), full.height()), Skia.XYWHRect(0, 0, width, height), Skia.Paint());
  surface.flush();
  return surface.makeImageSnapshot();
}

/** Decodes one picked photo. One at a time: a full-resolution decode of a 48 MP photo takes about 190 MB. */
export async function loadPhoto({ name, uri }: PickedPhoto): Promise<Photo> {
  const full = await decodeFull(uri);
  try {
    return { name, source: uri, width: full.width(), height: full.height(), preview: downscale(full, PREVIEW_LONG_SIDE), detections: [] };
  } finally {
    full.dispose();
  }
}

/** Finds what matters in a photo. If detection fails, the photo uses a center crop. */
export async function analyzePhoto(photo: Photo): Promise<Detection[]> {
  try {
    return await StoryVision.detect(photo.source);
  } catch (err) {
    console.warn("Detection failed; using a center crop.", err);
    return [];
  }
}

export const closePhoto = (photo: Photo) => photo.preview.dispose();
