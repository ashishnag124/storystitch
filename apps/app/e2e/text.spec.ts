import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS_PORT } from "../playwright.config.js";
import { exportImage, libraryInput, makePhotos, openApp } from "./helpers.js";

const GREY = 128;

/** A plain grey photo, the size of the canvas, in "Full bleed": anything not grey on it is a caption (or the mark). */
async function pickGrey(page: Page) {
  const b64 = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1080, 1920);
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#808080";
    g.fillRect(0, 0, 1080, 1920);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/jpeg", quality: 0.95 })).arrayBuffer());
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary);
  });
  await libraryInput(page).setInputFiles({ name: "grey.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") });
  await page.getByRole("radio", { name: "Full bleed" }).click();
}

/** The box (export pixels) around everything in the preview that isn't the grey photo, or null. */
const previewInk = (page: Page) =>
  page.getByRole("application").evaluate((el, grey) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -1, -1];
    for (let i = 0; i < data.length; i += 4) {
      if (Math.max(...[0, 1, 2].map((k) => Math.abs(data[i + k]! - grey))) < 40) continue;
      const p = i / 4;
      const [x, y] = [p % c.width, Math.floor(p / c.width)];
      [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
    }
    const k = 1080 / c.width;
    return x1 < 0 ? null : { x0: x0 * k, y0: y0 * k, x1: x1 * k, y1: y1 * k, cx: ((x0 + x1) / 2) * k };
  }, GREY);

/** Where two exported JPEGs differ visibly. */
function exportDiff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([a, b]) => {
      const read = async (b64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
      };
      const [x, y] = [await read(a!), await read(b!)];
      let [x0, y0, x1, y1, count] = [Infinity, Infinity, -1, -1, 0];
      for (let i = 0; i < x.data.length; i += 4) {
        if (Math.max(...[0, 1, 2].map((c) => Math.abs(x.data[i + c]! - y.data[i + c]!))) < 40) continue;
        const p = i / 4;
        const [px, py] = [p % x.width, Math.floor(p / x.width)];
        [x0, y0, x1, y1, count] = [Math.min(x0, px), Math.min(y0, py), Math.max(x1, px), Math.max(y1, py), count + 1];
      }
      return { x0, y0, x1, y1, count, width: x.width, height: x.height };
    },
    [a.toString("base64"), b.toString("base64")],
  );
}

/** Turns off the "Made with StoryStitch" mark, so only captions show on the grey photo. */
async function noMark(page: Page) {
  await page.getByRole("tab", { name: "Export" }).click();
  await page.getByRole("switch", { name: "Made with StoryStitch" }).click();
}

/** A point on the preview, from export pixels. */
async function onPreview(page: Page, x: number, y: number) {
  // The preview resizes when a tool's panel changes height: wait for it to settle.
  let box = (await page.getByRole("application").boundingBox())!;
  await expect
    .poll(async () => {
      const now = (await page.getByRole("application").boundingBox())!;
      const same = now.width === box.width && now.y === box.y;
      box = now;
      return same;
    })
    .toBe(true);
  return { x: box.x + (x / 1080) * box.width, y: box.y + (y / 1920) * box.height };
}

test.describe("text", () => {
  const fontRequests: string[] = [];
  test.beforeEach(async ({ page }) => {
    fontRequests.length = 0;
    page.on("request", (r) => r.url().includes("/fonts/captions/") && fontRequests.push(r.url()));
    await openApp(page);
  });

  test("AC-TEXT-02 AC-TEXT-08 a caption shows in the preview and the exported image, and its fonts load only once Text opens", async ({ page }) => {
    await pickGrey(page);
    await noMark(page);
    const plain = await exportImage(page);
    expect(fontRequests).toEqual([]);
    await page.getByRole("tab", { name: "Text" }).click();
    await expect.poll(() => fontRequests.length).toBe(4);
    await page.getByRole("button", { name: "Add text" }).click();
    await page.getByRole("textbox", { name: "Caption text" }).fill("Summer\n2026");
    await expect(page.getByRole("button", { name: "Caption 1: Summer 2026" })).toBeAttached();
    // In the preview: centered across, near the top of the area Instagram leaves clear.
    await expect.poll(async () => (await previewInk(page))?.cx).toBeGreaterThan(500);
    const ink = (await previewInk(page))!;
    expect(Math.abs(ink.cx - 540)).toBeLessThan(20);
    expect(ink.y0).toBeGreaterThan(1920 * 0.14);
    expect(ink.y1).toBeLessThan(1920 * 0.5);

    // In the export: only the caption's box differs from the same export without it.
    const captioned = await exportImage(page);
    const diff = await exportDiff(page, plain, captioned);
    expect(diff).toMatchObject({ width: 1080, height: 1920 });
    expect(diff.count).toBeGreaterThan(500);
    expect(diff.x0).toBeGreaterThan(ink.x0 - 30);
    expect(diff.x1).toBeLessThan(ink.x1 + 30);
    expect(diff.y0).toBeGreaterThan(ink.y0 - 30);
    expect(diff.y1).toBeLessThan(ink.y1 + 30);

    // Each font, color and size draws differently.
    let last = captioned;
    for (const font of ["Serif", "Hand", "Type"]) {
      await page.getByRole("radio", { name: font }).click();
      await expect(page.getByRole("radio", { name: font })).toBeChecked();
      const next = await exportImage(page);
      expect((await exportDiff(page, last, next)).count, `${font} looks different`).toBeGreaterThan(200);
      last = next;
    }
    await page.getByRole("button", { name: "Coral" }).click();
    const coral = await exportImage(page);
    expect((await exportDiff(page, last, coral)).count).toBeGreaterThan(200);
    // A look filters the photos, never the captions: coral text stays coral under Mono.
    const coralPixels = (image: Buffer) =>
      page.evaluate(async (b64) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        const d = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) if (d[i]! > 200 && d[i + 1]! > 90 && d[i + 1]! < 160 && d[i + 2]! < 120) n++;
        return n;
      }, image.toString("base64"));
    const coralBefore = await coralPixels(coral);
    expect(coralBefore).toBeGreaterThan(200);
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByRole("button", { name: "Mono" }).click();
    const mono = await exportImage(page);
    expect(await coralPixels(mono)).toBeGreaterThan(coralBefore * 0.8);
    await page.getByRole("tab", { name: "Text" }).click();
    await page.getByRole("button", { name: /^Caption 1/ }).evaluate((b) => (b as HTMLButtonElement).click());
    await page.getByRole("slider", { name: "Size" }).fill("0.12");
    const bigger = await exportDiff(page, plain, await exportImage(page));
    expect(bigger.x1 - bigger.x0).toBeGreaterThan(diff.x1 - diff.x0);
  });

  test("AC-TEXT-03 captions stay through a layout switch, a photo swap and a style change, and Start over clears them", async ({ page }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await page.getByRole("radio", { name: "Two stacked", exact: true }).click();
    await page.getByRole("tab", { name: "Text" }).click();
    await page.getByRole("button", { name: "Add text" }).click();
    await page.getByRole("textbox", { name: "Caption text" }).fill("Hello");
    const caption = page.getByRole("button", { name: "Caption 1: Hello" });
    await expect(caption).toBeAttached();

    await page.getByRole("tab", { name: "Layouts" }).click();
    await page.getByRole("radio", { name: "Side by side", exact: true }).click();
    await expect(caption).toBeAttached();
    await page.getByRole("radio", { name: "Two stacked", exact: true }).click();
    // Swap the photos, tapping away from the caption (near the top).
    for (const y of [0.4, 0.75]) {
      const at = await onPreview(page, 540, 1920 * y);
      await page.mouse.click(at.x, at.y);
    }
    await expect(page.getByRole("status")).toHaveText("Swapped photos 1 and 2.");
    await expect(caption).toBeAttached();
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByRole("button", { name: "Black" }).click();
    await expect(caption).toBeAttached();

    await page.getByRole("button", { name: "Start over" }).click();
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await expect(page.getByRole("application")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Caption 1/ })).toHaveCount(0);
  });

  test("AC-TEXT-04 three captions at most, + says why at the limit, and the trash removes the chosen one", async ({ page }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await page.getByRole("tab", { name: "Text" }).click();
    // With no captions, a full-width "Add text"; then the "+" beside the text field has the same name.
    const add = page.getByRole("button", { name: "Add text" });
    const hint = page.getByText("Up to 3 captions. Remove one to add another.");
    for (let i = 0; i < 3; i++) await add.click();
    await expect(page.getByRole("button", { name: /^Caption \d/ })).toHaveCount(3);
    await expect(hint).toBeHidden();
    await add.click();
    await expect(page.getByRole("button", { name: /^Caption \d/ })).toHaveCount(3);
    await expect(hint).toBeVisible();
    for (const name of ["Add text", "Remove text"]) {
      const box = (await page.getByRole("button", { name }).boundingBox())!;
      expect(Math.min(box.width, box.height), name).toBeGreaterThanOrEqual(44);
    }
    await page.getByRole("button", { name: "Remove text" }).click();
    await expect(page.getByRole("button", { name: /^Caption \d/ })).toHaveCount(2);
    await expect(hint).toBeHidden();
  });

  test("AC-TEXT-05 a caption is chosen by a tap, dragged within the canvas, snapped to the middle and nudged by keys; photos still work", async ({ page }) => {
    await pickGrey(page);
    await noMark(page);
    await page.getByRole("tab", { name: "Text" }).click();
    await page.getByRole("button", { name: "Add text" }).click();
    await expect.poll(async () => (await previewInk(page))?.cx).toBeGreaterThan(500);
    const start = (await previewInk(page))!;
    const center = { x: 540, y: (start.y0 + start.y1) / 2 };

    // Leave the caption, then tap it again: it's chosen.
    await page.getByRole("tab", { name: "Layouts" }).click();
    const tap = await onPreview(page, center.x, center.y);
    await page.mouse.click(tap.x, tap.y);
    await expect(page.getByRole("status")).toHaveText("Caption 1 selected.");
    await expect(page.getByRole("textbox", { name: "Caption text" })).toBeVisible();

    // Dragged far past the lower right corner, it stops at the canvas's edge. Turn off the outline first by leaving the tool.
    const drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      const a = await onPreview(page, from.x, from.y);
      const b = await onPreview(page, to.x, to.y);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await page.mouse.up();
    };
    await drag(center, { x: 1080 + 400, y: 1920 + 400 });
    await page.getByRole("tab", { name: "Layouts" }).click();
    await expect.poll(async () => (await previewInk(page))!.x1).toBeGreaterThan(1000);
    const corner = (await previewInk(page))!;
    expect(corner.x1).toBeLessThanOrEqual(1080);
    expect(corner.y1).toBeLessThanOrEqual(1920);
    expect(corner.y1).toBeGreaterThan(1800);

    // Dropped a little off the middle, it lines up with it.
    const here = { x: (corner.x0 + corner.x1) / 2, y: (corner.y0 + corner.y1) / 2 };
    await drag(here, { x: 552, y: 1000 });
    await page.getByRole("tab", { name: "Layouts" }).click();
    await expect.poll(async () => Math.abs((await previewInk(page))!.cx - 540)).toBeLessThan(6);

    // The keyboard nudges the chosen caption.
    const before = (await previewInk(page))!;
    await page.getByRole("button", { name: /^Caption 1/ }).evaluate((b) => (b as HTMLButtonElement).click());
    await page.getByRole("application").focus();
    await page.keyboard.press("ArrowLeft");
    await page.getByRole("tab", { name: "Layouts" }).click();
    await expect.poll(async () => before.cx - (await previewInk(page))!.cx).toBeGreaterThan(5);

    // A tap away from the caption still picks the photo.
    const away = await onPreview(page, 540, 300);
    await page.mouse.click(away.x, away.y);
    await expect(page.getByRole("status")).toHaveText("Photo 1 selected.");
    await expect(page.getByRole("slider", { name: "Zoom" })).toBeVisible();
  });
});

test("AC-TEXT-06 with the Text flag off there's no Text tab and no caption fonts load", async ({ page }) => {
  const fontRequests: string[] = [];
  page.on("request", (r) => r.url().includes("/fonts/captions/") && fontRequests.push(r.url()));
  // The accounts build is made without the Text flag.
  await page.goto(`http://localhost:${ACCOUNTS_PORT}/`);
  await libraryInput(page).setInputFiles(await makePhotos(page, 2));
  await expect(page.getByRole("tab", { name: "Style" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Text" })).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(3);
  expect(fontRequests).toEqual([]);
});
