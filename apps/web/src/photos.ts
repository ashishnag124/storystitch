import { heicToJpeg, isHeic } from "./heic";

export const MAX_PHOTOS = 8;
/** Long side of the working copies used for previews. Exports always use the originals. */
export const PREVIEW_LONG_SIDE = 1280;
export const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export interface Photo {
  name: string;
  /** The original file, or a full-resolution JPEG of it when the browser can't decode HEIC. */
  source: Blob;
  /** Size of the original after EXIF orientation. */
  width: number;
  height: number;
  preview: ImageBitmap;
}

export class UnsupportedPhotoError extends Error {
  readonly fileName: string;
  constructor(fileName: string) {
    super(`Couldn't open ${fileName}`);
    this.fileName = fileName;
  }
}

/** Decodes a full-resolution image with its EXIF orientation applied. */
export function decodeFull(source: Blob): Promise<ImageBitmap> {
  return createImageBitmap(source, { imageOrientation: "from-image" });
}

async function downscale(full: ImageBitmap, longSide: number): Promise<ImageBitmap> {
  const scale = Math.min(1, longSide / Math.max(full.width, full.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(full.width * scale);
  canvas.height = Math.round(full.height * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(full, 0, 0, canvas.width, canvas.height);
  return createImageBitmap(canvas);
}

/**
 * Decodes one picked file into a Photo. Decode one at a time: a full-resolution decode of a
 * 48 MP photo takes ~190 MB, which mobile Safari can't hold eight of.
 */
export async function loadPhoto(file: File): Promise<Photo> {
  let source: Blob = file;
  let full: ImageBitmap;
  try {
    full = await decodeFull(file);
  } catch {
    if (!(await isHeic(file))) throw new UnsupportedPhotoError(file.name);
    try {
      source = await heicToJpeg(file);
      full = await decodeFull(source);
    } catch {
      throw new UnsupportedPhotoError(file.name);
    }
  }
  try {
    return { name: file.name, source, width: full.width, height: full.height, preview: await downscale(full, PREVIEW_LONG_SIDE) };
  } finally {
    full.close();
  }
}
