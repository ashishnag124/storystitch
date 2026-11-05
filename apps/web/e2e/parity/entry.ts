// Draws one scene with both of the app's renderers, Canvas (web) and Skia (iOS), from the same photos and crops.
import { DEFAULT_STYLE, newScene, type Scene, type Style } from "@storystitch/client";
import { layouts } from "@storystitch/shared";
import CanvasKitInit from "canvaskit-wasm";
import * as onCanvas from "../../../app/src/platform/render.web";
import * as onSkia from "../../../app/src/platform/render.native";
import { Skia, useCanvasKit } from "./skia";

const WIDTH = 270;
const SIZE = { width: WIDTH, height: 480 };
/** How far apart two color channels can be before a pixel counts as different. */
const TOLERANCE = 12;

/** One built-in look for each photo: different sizes and shapes, so cropping is exercised too. */
const PHOTO_SIZES = [
  [900, 1200],
  [1200, 800],
  [1000, 1000],
  [800, 1400],
  [1400, 700],
  [1100, 900],
  [700, 1000],
  [1300, 1000],
] as const;

function paintPhoto(width: number, height: number, n: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const sky = ctx.createLinearGradient(0, 0, width, height);
  sky.addColorStop(0, `hsl(${n * 45} 70% 45%)`);
  sky.addColorStop(1, `hsl(${n * 45 + 120} 70% 65%)`);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "rgb(255 255 255 / 0.8)";
  ctx.beginPath();
  ctx.arc(width / 2, height / 2, Math.min(width, height) / 4, 0, 2 * Math.PI);
  ctx.fill();
  ctx.fillStyle = "rgb(0 0 0 / 0.7)";
  ctx.fillRect(width * 0.1, height * 0.7, width * 0.5, height * 0.08);
  return canvas;
}

type Photos = Awaited<ReturnType<typeof loadPhotos>>;

async function loadPhotos() {
  return Promise.all(
    PHOTO_SIZES.map(async ([width, height], n) => {
      const canvas = paintPhoto(width, height, n);
      const blob = await new Promise<Blob>((done) => canvas.toBlob((b) => done(b!), "image/png"));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const encoded = Skia.Data.fromBytes(bytes);
      return {
        source: { width, height, detections: [] },
        canvas: { image: canvas, width, height },
        skia: { image: Skia.Image.MakeImageFromEncoded(encoded)!, width, height },
      };
    }),
  );
}

function drawOnCanvas(scene: Scene, photos: Photos) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE.width;
  canvas.height = SIZE.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  onCanvas.drawScene(ctx, SIZE, scene, (i) => photos[i]!.canvas as never);
  return { canvas, pixels: ctx.getImageData(0, 0, SIZE.width, SIZE.height).data };
}

function drawOnSkia(scene: Scene, photos: Photos) {
  const surface = Skia.Surface.Make(SIZE.width, SIZE.height)!;
  const imageFor = (i: number) => photos[i]!.skia as never;
  const blurred = onSkia.hasBlurredBackground(scene as never) ? onSkia.blurredImage(SIZE, imageFor(scene.order[0]!)) : null;
  onSkia.drawScene(surface.getCanvas(), SIZE, scene as never, imageFor, blurred);
  surface.flush();
  const image = surface.makeImageSnapshot();
  const pixels = image.readPixels(0, 0, { width: SIZE.width, height: SIZE.height, colorType: 4, alphaType: 3 }) as Uint8Array;
  return { pixels, png: image.encodeToBase64() };
}

/** The share of pixels that differ visibly, as a percentage, and the mean difference per channel. */
function compare(a: ArrayLike<number>, b: ArrayLike<number>) {
  let different = 0;
  let total = 0;
  for (let i = 0; i < a.length; i += 4) {
    const gaps = [Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)];
    total += gaps[0]! + gaps[1]! + gaps[2]!;
    if (Math.max(...gaps) > TOLERANCE) different++;
  }
  const count = a.length / 4;
  return { differentPct: (different / count) * 100, meanDiff: total / (count * 3) };
}

declare global {
  interface Window {
    compareRenderers: (styles: Partial<Style>[]) => Promise<{ id: string; styled: number; differentPct: number; meanDiff: number; canvas: string; skia: string }[]>;
  }
}

window.compareRenderers = async (styles) => {
  useCanvasKit((await CanvasKitInit({ locateFile: () => "/canvaskit.wasm" })) as never);
  const photos = await loadPhotos();
  const sources = photos.map((p) => p.source);
  const results = [];
  for (const [styled, overrides] of styles.entries()) {
    for (const layout of layouts) {
      const scene = newScene(layout, sources.slice(0, layout.cells.length), { ...DEFAULT_STYLE, ...overrides });
      const web = drawOnCanvas(scene, photos);
      const native = drawOnSkia(scene, photos);
      results.push({
        id: layout.id,
        styled,
        ...compare(web.pixels, native.pixels),
        canvas: web.canvas.toDataURL("image/png").split(",")[1]!,
        skia: native.png,
      });
    }
  }
  return results;
};
