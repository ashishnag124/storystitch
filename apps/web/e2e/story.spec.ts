import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

/** Photo sizes cycled through for fixtures: landscape, portrait, square, small. */
const SIZES = [
  [4000, 3000],
  [1500, 2600],
  [2000, 2000],
  [640, 480],
] as const;

/** Builds JPEG fixtures in the page (no binary photos in the repo). */
async function makePhotos(page: Page, count: number) {
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
        const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.8 })).arrayBuffer());
        let binary = "";
        bytes.forEach((b) => (binary += String.fromCharCode(b)));
        out.push(btoa(binary));
      }
      return out;
    },
    { count, sizes: SIZES },
  );
  return encoded.map((b64, i) => ({ name: `photo-${i + 1}.jpg`, mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") }));
}

/** Width and height from a JPEG's start-of-frame marker. */
function jpegSize(buf: Buffer) {
  let i = 2;
  while (i < buf.length) {
    const marker = buf[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xc2) return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("No SOF marker");
}

async function exportImage(page: Page) {
  const button = page.getByRole("button", { name: "Download" });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  return readFile(await download.path());
}

test.beforeEach(async ({ page }) => {
  // Surface browser warnings and errors (e.g. model load failures) in the test output.
  page.on("console", (m) => {
    if (m.type() === "warning" || m.type() === "error") console.log(`[browser ${m.type()}] ${m.text()}`);
  });
  page.on("pageerror", (e) => console.log(`[page error] ${e.message}`));
  // Force the download path: headless browsers have no share sheet to open.
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, "canShare", { value: undefined });
  });
  await page.goto("/");
});

for (const count of [1, 4, 8]) {
  test(`${count} photo${count > 1 ? "s" : ""} → layout options → 1080×1920 JPEG`, async ({ page }) => {
    await page.getByLabel(/choose photos/i).setInputFiles(await makePhotos(page, count));
    const options = page.getByRole("radiogroup", { name: "Layouts" }).getByRole("radio");
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThanOrEqual(2);
    await expect(options.first()).toHaveAttribute("aria-checked", "true");

    expect(jpegSize(await exportImage(page))).toEqual({ width: 1080, height: 1920 });
  });
}

test("opens a HEIC photo", async ({ page }) => {
  const heic = fileURLToPath(new URL("fixtures/gradient.heic", import.meta.url));
  await page.getByLabel(/choose photos/i).setInputFiles(heic);
  await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({ timeout: 30_000 });
  expect(jpegSize(await exportImage(page))).toEqual({ width: 1080, height: 1920 });
});

test("finds faces and objects with the real on-device models", async ({ page }) => {
  const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
  await page
    .getByLabel(/choose photos/i)
    .setInputFiles([fixture("native-garhwali-women-of-garhwal.jpg"), fixture("picography-shiba-inu-dog-forest-walk-sm-1.jpg")]);
  // CC0 fixtures from Wikimedia Commons: a portrait (one face) and a dog in a forest (no face).
  await expect(page.getByText("Found 1 face and a dog.")).toBeVisible({ timeout: 45_000 });
  expect(jpegSize(await exportImage(page))).toEqual({ width: 1080, height: 1920 });
});
