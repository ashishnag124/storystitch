// Shared by the end-to-end specs. Tests name the acceptance criteria they prove (docs/acceptance-criteria.md).
import { expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Photo sizes cycled through for fixtures: landscape, portrait, square, small. */
export const SIZES = [
  [4000, 3000],
  [1500, 2600],
  [2000, 2000],
  [640, 480],
] as const;

/** Builds JPEG fixtures in the page (no binary photos in the repo). */
export async function makePhotos(page: Page, count: number) {
  const encoded = await page.evaluate(
    async ({ count, sizes }) => {
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        const [w, h] = sizes[i % sizes.length]!;
        const canvas = new OffscreenCanvas(w, h);
        const g = canvas.getContext("2d")!;
        g.fillStyle = `hsl(${i * 45} 70% 50%)`;
        g.fillRect(0, 0, w, h);
        g.fillStyle = "#fff";
        g.fillRect(w / 3, h / 3, w / 3, h / 3);
        const bytes = new Uint8Array(
          await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer(),
        );
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        out.push(btoa(binary));
      }
      return out;
    },
    { count, sizes: SIZES },
  );
  return encoded.map((b64, i) => ({
    name: `photo-${i + 1}.jpg`,
    mimeType: "image/jpeg",
    buffer: Buffer.from(b64, "base64"),
  }));
}

/** Width and height from a JPEG's start-of-frame marker. */
export function jpegSize(buf: Buffer) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xc2)
      return {
        width: buf.readUInt16BE(i + 7),
        height: buf.readUInt16BE(i + 5),
      };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("No SOF marker");
}

export async function exportImage(page: Page) {
  const button = page.getByRole("button", { name: "Download" });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return readFile(await download.path());
}

export const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));

/** Opens the app with browser warnings surfaced in the test output and the share sheet disabled. */
export async function openApp(page: Page) {
  // Surface browser warnings and errors (e.g. model load failures) in the test output.
  page.on("console", (m) => {
    if (m.type() === "warning" || m.type() === "error") console.log(`[browser ${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  // Force the download path: headless browsers have no share sheet to open.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", {
      value: undefined,
    });
  });
  await page.goto("/");
}

/** Whether a Web Worker here can create a WebGL2 context, which MediaPipe needs even on its CPU delegate. */
export async function workerHasWebGL2(page: Page) {
  return page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const src = "postMessage(!!new OffscreenCanvas(1, 1).getContext('webgl2'))";
        const worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
        worker.onmessage = (e) => resolve(e.data as boolean);
        worker.onerror = () => resolve(false);
      }),
  );
}
