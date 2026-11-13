import { cellShapes, styleScale, type Scene } from "@storystitch/client";
import { ImageFormat, Skia } from "@shopify/react-native-skia";
import { STORY_CANVAS, drawOrder } from "@storystitch/shared";
import { EncodingType, cacheDirectory, deleteAsync, makeDirectoryAsync, writeAsStringAsync } from "expo-file-system/legacy";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { loadCaptionFonts } from "./captionFonts.native";
import { drawCaptions } from "./captionRender.native";
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
  if (hasBlurredBackground(scene)) await draw(photos[scene.order[0]!]!, (img) => drawBlurredBackground(canvas, size, blurredImage(size, img), scene.style.look));
  for (const i of drawOrder(scene.layout.cells)) {
    await draw(photos[scene.order[i]!]!, (img) => drawCell(canvas, shapes[i]!, img, scene.crops[i]!, radius, border, scene.style.borderColor, scene.style.look));
  }
  if (scene.captions?.length) {
    await loadCaptionFonts();
    drawCaptions(canvas, size, scene.captions);
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

/** The folder the last shared file is in. */
let lastShareFolder: string | undefined;

/**
 * Opens the share sheet, where the user picks Instagram or Save Image. Each share gets a folder of its own, so the
 * file keeps its name but its path is new. With one path for every share, an edited collage sent through Messages
 * went out as the one shared before it. The previous folder is removed.
 */
export async function shareOrDownload(base64: string, filename: string): Promise<boolean> {
  if (!(await isAvailableAsync())) return false;
  if (lastShareFolder) await deleteAsync(lastShareFolder, { idempotent: true });
  lastShareFolder = `${cacheDirectory}share-${Date.now()}/`;
  await makeDirectoryAsync(lastShareFolder, { intermediates: true });
  const uri = `${lastShareFolder}${filename}`;
  await writeAsStringAsync(uri, base64, { encoding: EncodingType.Base64 });
  await shareAsync(uri);
  return true;
}
