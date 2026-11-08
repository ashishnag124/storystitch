import { cellShapes, styleScale, type Scene } from "@storystitch/client";
import { ImageFormat, Skia } from "@shopify/react-native-skia";
import { STORY_CANVAS, drawOrder } from "@storystitch/shared";
import { EncodingType, cacheDirectory, writeAsStringAsync } from "expo-file-system/legacy";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { decodeFull, type Photo } from "./photos.native";
import { blurredImage, drawBlurredBackground, drawCell, drawMark, fillBackground, hasBlurredBackground } from "./render.native";

export type ExportFormat = "image/jpeg" | "image/png";
const JPEG_QUALITY = 90;

/** Set `cancelled` to stop a render that's no longer wanted. */
export interface ExportJob {
  cancelled: boolean;
}

/**
 * Renders the 1080×1920 export from the original photos, decoding one at a time so memory stays at a single
 * full-resolution photo. `mark` adds the "Made with StoryStitch" mark. Returns the base64 of the encoded file, or null if the job was cancelled.
 */
export async function renderExport(scene: Scene, photos: Photo[], format: ExportFormat, mark: boolean, job: ExportJob): Promise<string | null> {
  const size = STORY_CANVAS;
  const surface = Skia.Surface.Make(size.width, size.height);
  if (!surface) throw new Error("Couldn't make a surface");
  const canvas = surface.getCanvas();
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  const draw = async (photo: Photo, paint: (img: { image: Awaited<ReturnType<typeof decodeFull>>; width: number; height: number }) => void) => {
    if (job.cancelled) return;
    const image = await decodeFull(photo.source);
    paint({ image, width: image.width(), height: image.height() });
    image.dispose();
  };

  fillBackground(canvas, size, scene);
  if (hasBlurredBackground(scene)) await draw(photos[scene.order[0]!]!, (img) => drawBlurredBackground(canvas, size, blurredImage(size, img)));
  for (const i of drawOrder(scene.layout.cells)) {
    await draw(photos[scene.order[i]!]!, (img) => drawCell(canvas, shapes[i]!, img, scene.crops[i]!, radius, border, scene.style.borderColor));
  }
  if (job.cancelled) return null;
  if (mark) drawMark(canvas, size);
  surface.flush();
  const png = format === "image/png";
  return surface.makeImageSnapshot().encodeToBase64(png ? ImageFormat.PNG : ImageFormat.JPEG, png ? undefined : JPEG_QUALITY);
}

export const canShareFiles = () => true;

/**
 * How long nothing has to change before making the export. It decodes every original photo on the thread that handles
 * touches, so it waits for a real pause, and Share starts it straight away.
 */
export const EXPORT_PAUSE_MS = 2000;

/** The share sheet can open whenever the image is ready, so Share stays available while it's made. */
export const canWaitToShare: boolean = true;

/** Opens the share sheet, where the user picks Instagram or Save Image. */
export async function shareOrDownload(base64: string, filename: string): Promise<boolean> {
  if (!(await isAvailableAsync())) return false;
  const uri = `${cacheDirectory}${filename}`;
  await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
  await shareAsync(uri);
  return true;
}
