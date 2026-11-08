import { expect, test, type Page } from "@playwright/test";
import { exportImage, makePhotos, openApp, libraryInput } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

/** Encodes a canvas drawing as a JPEG in the page and returns its bytes. */
async function drawJpeg(page: Page, width: number, height: number, draw: string): Promise<Buffer> {
  const b64 = await page.evaluate(
    async ({ width, height, draw }) => {
      const canvas = new OffscreenCanvas(width, height);
      const g = canvas.getContext("2d")!;
      new Function("g", "w", "h", draw)(g, width, height);
      const bytes = new Uint8Array(
        await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 })).arrayBuffer(),
      );
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      return btoa(binary);
    },
    { width, height, draw },
  );
  return Buffer.from(b64, "base64");
}

/** Inserts an EXIF block with the given orientation right after the JPEG's start-of-image marker. */
function withExifOrientation(jpeg: Buffer, orientation: number): Buffer {
  const tiff = Buffer.from([
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08, // big-endian TIFF header, first IFD at 8
    0x00,
    0x01, // one entry
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00, // Orientation, SHORT, 1
    0x00,
    0x00,
    0x00,
    0x00, // no next IFD
  ]);
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([jpeg.subarray(0, 2), app1, payload, jpeg.subarray(2)]);
}

/** RGB of exported-image pixels, read back in the page. */
function pixels(page: Page, image: Buffer, points: [number, number][]) {
  return page.evaluate(
    async ({ b64, points }) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)]);
    },
    { b64: image.toString("base64"), points },
  );
}

async function pickOne(page: Page, buffer: Buffer, layout: string) {
  await libraryInput(page).setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer });
  await page.getByRole("radio", { name: layout }).click();
}

test("AC-EXPORT-02 PNG export is a 1080×1920 PNG", async ({ page }) => {
  await libraryInput(page).setInputFiles(await makePhotos(page, 2));
  await page.getByRole("tab", { name: "Export" }).click();
  await page.getByLabel("Format").selectOption("image/png");
  const png = await exportImage(page);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  expect({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }).toEqual({ width: 1080, height: 1920 });
});

test("AC-EXPORT-03 a photo with EXIF rotation exports upright", async ({ page }) => {
  // Stored landscape, left half red and right half blue. Orientation 6 means "rotate 90° clockwise to
  // display", so shown upright it's portrait with red on top.
  const stored = await drawJpeg(
    page,
    1920,
    1080,
    "g.fillStyle='#f00';g.fillRect(0,0,w/2,h);g.fillStyle='#00f';g.fillRect(w/2,0,w/2,h);",
  );
  await pickOne(page, withExifOrientation(stored, 6), "Full bleed");
  const [top, bottom] = await pixels(page, await exportImage(page), [
    [540, 300],
    [540, 1620],
  ]);
  expect(top![0]).toBeGreaterThan(200);
  expect(top![2]).toBeLessThan(60);
  expect(bottom![2]).toBeGreaterThan(200);
  expect(bottom![0]).toBeLessThan(60);
});

test("AC-EXPORT-07 the export is rendered from the original photo, not the preview copy", async ({ page }) => {
  // 2-pixel black and white stripes at exactly twice the export's size: from the original they come
  // out as crisp 1-pixel lines; the 1280-pixel preview copy would have blurred them to grey.
  const stripes = await drawJpeg(
    page,
    2160,
    3840,
    "g.fillStyle='#fff';g.fillRect(0,0,w,h);g.fillStyle='#000';for(let y=0;y<h;y+=4)g.fillRect(0,y,w,2);",
  );
  await pickOne(page, stripes, "Full bleed");
  const column = await pixels(
    page,
    await exportImage(page),
    Array.from({ length: 40 }, (_, i): [number, number] => [540, 940 + i]),
  );
  const contrast =
    column.slice(1).reduce((sum, p, i) => sum + Math.abs(p[0]! - column[i]![0]!), 0) / (column.length - 1);
  expect(contrast).toBeGreaterThan(120);
});

test("AC-EXPORT-05 Share hands a 1080×1920 image to the share sheet", async ({ page }) => {
  await page.addInitScript(() => {
    // Stand in for a phone's share sheet: accept files and keep what was shared.
    const shared: File[] = [];
    Object.assign(window, { __shared: shared });
    Object.defineProperty(navigator, "canShare", {
      value: (data: ShareData) => !!data.files?.length,
    });
    Object.defineProperty(navigator, "share", {
      value: async (data: ShareData) => void shared.push(...(data.files ?? [])),
    });
  });
  await page.reload();
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  const share = page.getByRole("button", { name: "Share" });
  await expect(share).toBeEnabled({ timeout: 20_000 });
  await share.click();
  const file = await page.evaluate(async () => {
    const [f] = (window as unknown as { __shared: File[] }).__shared;
    const bitmap = await createImageBitmap(f!);
    return {
      name: f!.name,
      type: f!.type,
      width: bitmap.width,
      height: bitmap.height,
    };
  });
  expect(file).toEqual({
    name: "storystitch.jpg",
    type: "image/jpeg",
    width: 1080,
    height: 1920,
  });
});

test("AC-EXPORT-09 the StoryStitch mark is small, see-through and in the lower right, and the switch removes it", async ({ page }) => {
  test.skip(process.env.E2E_TARGET !== "app", "apps/web is staying as it is until it's replaced");
  await pickOne(page, await drawJpeg(page, 1080, 1920, "g.fillStyle='#808080';g.fillRect(0,0,w,h);"), "Full bleed");
  await page.getByRole("tab", { name: "Export" }).click();
  const toggle = page.getByRole("switch", { name: "Made with StoryStitch" });
  await expect(toggle).toBeChecked();
  const marked = await exportImage(page);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  const plain = await exportImage(page);

  // Where the two exports differ, and by how much.
  const { box, maxDiff } = await page.evaluate(
    async ([a, b]) => {
      const read = async (b64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [x, y] = [await read(a!), await read(b!)];
      let [x0, y0, x1, y1, maxDiff] = [Infinity, Infinity, -1, -1, 0];
      for (let i = 0; i < x.data.length; i += 4) {
        const d = Math.max(...[0, 1, 2].map((c) => Math.abs(x.data[i + c]! - y.data[i + c]!)));
        if (d < 16) continue;
        const p = i / 4;
        const [px, py] = [p % x.width, Math.floor(p / x.width)];
        [x0, y0, x1, y1, maxDiff] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py), Math.max(maxDiff, d)];
      }
      return { box: { x0, y0, x1, y1 }, maxDiff };
    },
    [marked.toString("base64"), plain.toString("base64")],
  );
  expect(box.x1).toBeGreaterThan(0); // the mark is there
  expect(maxDiff).toBeLessThan(110); // and see-through: solid white on this grey would differ by 127
  expect(box.x1 - box.x0).toBeLessThanOrEqual(1080 / 4);
  expect(box.x0).toBeGreaterThan(540);
  expect(box.y0).toBeGreaterThan(960);
  expect(box.x1).toBeLessThanOrEqual(1080 * 0.94 + 4);
  expect(box.y1).toBeLessThanOrEqual(1920 * 0.82 + 4);
});
