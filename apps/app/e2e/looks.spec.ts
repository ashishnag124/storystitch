import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS_PORT } from "../playwright.config.js";
import { exportImage, libraryInput, makePhotos, openApp } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

const LOOK_NAMES = ["Original", "Film", "Fade", "Warm", "Cool", "Vivid", "Mono", "Noir"];

/** Two photos in "Two stacked" on Navy, with the Style tool open. The first photo is red with a white square in the middle. */
async function openStyle(page: Page) {
  await libraryInput(page).setInputFiles(await makePhotos(page, 2));
  await page.getByRole("radio", { name: "Two stacked" }).click();
  await page.getByRole("tab", { name: "Style" }).click();
  await page.getByRole("button", { name: "Navy" }).click();
}

/** In the red part of the top photo, left of its white square; and the outer margin, which shows the background. */
const PHOTO: [number, number] = [100, 480];
const MARGIN: [number, number] = [4, 4];
const NAVY = [0x1e, 0x3a, 0x5f];

/** RGB of exported-image pixels (1080×1920), read back in the page. */
function exported(page: Page, image: Buffer, points: [number, number][]) {
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

/** The preview's pixels at the same places as the export's. */
function previewed(page: Page, points: [number, number][]) {
  return page.getByRole("application").evaluate((el, points) => {
    const c = el as HTMLCanvasElement;
    const ctx = c.getContext("2d")!;
    return points.map(([x, y]) => [...ctx.getImageData((x * c.width) / 1080, (y * c.height) / 1920, 1, 1).data.slice(0, 3)]);
  }, points);
}

const spread = ([r, g, b]: number[]) => Math.max(r!, g!, b!) - Math.min(r!, g!, b!);
const near = (a: number[], b: number[], within: number) => a.every((v, i) => Math.abs(v - b[i]!) <= within);

test("AC-LOOK-02 the Style tool starts with a Look row: each look on the first photo, named, the chosen one marked", async ({ page }) => {
  await openStyle(page);
  const row = page.getByRole("group", { name: "Look" });
  await expect(row).toBeVisible();
  await expect(row.getByRole("button")).toHaveText(LOOK_NAMES);
  // It comes before the rest of the tool, and each thumbnail is a portrait rectangle.
  expect((await row.boundingBox())!.y).toBeLessThan((await page.getByRole("radio", { name: "Color", exact: true }).boundingBox())!.y);
  const canvas = (await row.locator("canvas").first().boundingBox())!;
  expect(canvas.height / canvas.width).toBeCloseTo(4 / 3, 1);
  expect((await row.getByRole("button").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);

  const original = row.getByRole("button", { name: "Original" });
  const mono = row.getByRole("button", { name: "Mono" });
  await expect(original).toHaveAttribute("aria-pressed", "true");
  await expect(mono).toHaveAttribute("aria-pressed", "false");
  // The Mono thumbnail is the photo in black and white; Original's is red.
  const thumb = (button: typeof mono) =>
    button.locator("canvas").evaluate((c: HTMLCanvasElement) => [...c.getContext("2d")!.getImageData(4, c.height / 2, 1, 1).data.slice(0, 3)]);
  expect(spread(await thumb(mono))).toBeLessThan(4);
  expect(spread(await thumb(original))).toBeGreaterThan(100);

  await mono.click();
  await expect(mono).toHaveAttribute("aria-pressed", "true");
  await expect(original).toHaveAttribute("aria-pressed", "false");
});

test("AC-LOOK-03 a look changes the photos in the preview and the export, and not the background", async ({ page }) => {
  await openStyle(page);
  await expect.poll(async () => spread((await previewed(page, [PHOTO]))[0]!)).toBeGreaterThan(100);
  await page.getByRole("button", { name: "Mono" }).click();
  await expect.poll(async () => spread((await previewed(page, [PHOTO]))[0]!)).toBeLessThan(4);
  expect(near((await previewed(page, [MARGIN]))[0]!, NAVY, 2)).toBe(true);

  const [photo, margin] = await exported(page, await exportImage(page), [PHOTO, MARGIN]);
  // r ≈ g ≈ b, allowing for JPEG's color subsampling.
  expect(spread(photo!)).toBeLessThan(8);
  expect(near(margin!, NAVY, 6)).toBe(true);

  // Film is warm and lifted: still red, but not the same red as the photo.
  await page.getByRole("button", { name: "Film" }).click();
  const [film] = await exported(page, await exportImage(page), [PHOTO]);
  expect(film![0]! - film![2]!).toBeGreaterThan(60);
  // Lifted blacks: the photo's darkest channel (blue, about 38) comes up.
  expect(film![2]!).toBeGreaterThan(43);
});

test("AC-LOOK-04 with Original, the export is the same as before any look was chosen", async ({ page }) => {
  await openStyle(page);
  const before = await exportImage(page);
  await page.getByRole("button", { name: "Noir" }).click();
  const noir = await exportImage(page);
  expect(noir.equals(before)).toBe(false);
  await page.getByRole("button", { name: "Original" }).click();
  await expect(page.getByRole("button", { name: "Original" })).toHaveAttribute("aria-pressed", "true");
  const after = await exportImage(page);
  expect(after.equals(before)).toBe(true);
});

test("AC-LOOK-06 with the flag off there's no Look row", async ({ page }) => {
  // The accounts build is made without EXPO_PUBLIC_FEATURE_LOOKS.
  await page.goto(`http://localhost:${ACCOUNTS_PORT}/`);
  await openStyle(page);
  await expect(page.getByRole("radio", { name: "Color", exact: true })).toBeVisible();
  await expect(page.getByRole("group", { name: "Look" })).toHaveCount(0);
  await expect(page.getByText("Look", { exact: true })).toHaveCount(0);
});
