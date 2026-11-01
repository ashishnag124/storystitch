import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { exportImage, fixture, makePhotos, openApp, libraryInput } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

/** The brief's performance targets, in milliseconds. */
const BUDGET = { analysis: 3000, layoutSwitch: 100, export: 2000 } as const;
/** Must match EXPORT_MEASURE in src/exportImage.ts. */
const EXPORT_MEASURE = "storystitch:export";

/** Eight phone-sized (12 MP) JPEGs with enough texture to be photo-sized files. */
async function phonePhotos(page: Page) {
  const encoded = await page.evaluate(async () => {
    const out: string[] = [];
    for (let i = 0; i < 8; i++) {
      const [w, h] = i % 2 ? [3024, 4032] : [4032, 3024];
      const g = new OffscreenCanvas(w, h).getContext("2d")!;
      for (let k = 0; k < 4000; k++) {
        g.fillStyle = `hsl(${(k * 37 + i * 45) % 360} 60% ${30 + (k % 50)}%)`;
        g.fillRect((k * 7919) % w, (k * 104729) % h, 40 + (k % 90), 40 + (k % 70));
      }
      const bytes = new Uint8Array(
        await (await g.canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 })).arrayBuffer(),
      );
      let binary = "";
      bytes.forEach((b) => (binary += String.fromCharCode(b)));
      out.push(btoa(binary));
    }
    return out;
  });
  return encoded.map((b64, i) => ({
    name: `phone-${i}.jpg`,
    mimeType: "image/jpeg",
    buffer: Buffer.from(b64, "base64"),
  }));
}

test("AC-PERF-01 AC-PERF-02 AC-PERF-03 analysis, layout switching and export meet the brief's targets", async ({
  page,
  browserName,
}) => {
  // Timed on Chromium only: Playwright's mobile WebKit runs without a GPU, so its timings say little about Safari.
  test.skip(browserName !== "chromium", "Timed on Chromium; check real-phone timings by hand (AC-PERF-04)");
  test.setTimeout(180_000);
  const photos = await phonePhotos(page);
  const pick = libraryInput(page);

  // First pick loads the models; the brief's analysis target applies once they're loaded.
  await pick.setInputFiles(photos);
  await expect(page.getByRole("application")).toBeVisible({ timeout: 120_000 });
  await page.getByRole("button", { name: "Start over" }).click();
  await pick.setInputFiles(photos);
  await expect(page.getByRole("status")).toHaveText(/Finding subjects/, {
    timeout: 60_000,
  });
  const analysisStart = Date.now();
  await expect(page.getByRole("application")).toBeVisible({ timeout: 60_000 });
  const analysis = Date.now() - analysisStart;

  // Layout switch: from the tap until the next frame has been painted.
  const radios = page.getByRole("radio");
  let layoutSwitch = 0;
  for (let i = 1; i < (await radios.count()); i++) {
    const ms = await radios.nth(i).evaluate(
      (el) =>
        new Promise<number>((resolve) => {
          const start = performance.now();
          (el as HTMLElement).click();
          requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
        }),
    );
    layoutSwitch = Math.max(layoutSwitch, ms);
  }

  // Export: the app measures each render itself (decode originals → encoded JPEG). Let earlier renders
  // settle, then time a fresh one.
  const download = page.getByRole("button", { name: "Download" });
  await expect(download).toBeEnabled({ timeout: 30_000 });
  await page.evaluate((name) => performance.clearMeasures(name), EXPORT_MEASURE);
  await radios.nth(0).click();
  await expect(download).toBeEnabled({ timeout: 30_000 });
  const exportMs = await page.evaluate((name) => performance.getEntriesByName(name).at(-1)!.duration, EXPORT_MEASURE);

  console.log(
    `timings: analysis ${analysis} ms, worst layout switch ${layoutSwitch.toFixed(1)} ms, export ${exportMs.toFixed(0)} ms`,
  );
  expect.soft(analysis, "analysis of 8 photos").toBeLessThan(BUDGET.analysis);
  expect.soft(layoutSwitch, "layout switch").toBeLessThan(BUDGET.layoutSwitch);
  expect.soft(exportMs, "export").toBeLessThan(BUDGET.export);
});

test("AC-PRIV-01 nothing leaves the device: every request is a same-origin read", async ({ page, baseURL }) => {
  const offending: string[] = [];
  const check = (url: string, method: string) => {
    if (url.startsWith("data:") || url.startsWith("blob:")) return;
    if (new URL(url).origin !== new URL(baseURL!).origin || !["GET", "HEAD"].includes(method))
      offending.push(`${method} ${url}`);
  };
  page.on("request", (r) => check(r.url(), r.method()));
  page.on("websocket", (ws) => offending.push(`WebSocket ${ws.url()}`));
  await page.reload();

  // Real photos so the detection models download and run, plus generated ones.
  const real = ["native-garhwali-women-of-garhwal.jpg", "picography-shiba-inu-dog-forest-walk-sm-1.jpg"];
  const files = await Promise.all(
    real.map(async (name) => ({
      name,
      mimeType: "image/jpeg",
      buffer: await readFile(fixture(name)),
    })),
  );
  await libraryInput(page).setInputFiles([...files, ...(await makePhotos(page, 2))]);
  await expect(page.getByRole("application")).toBeVisible({ timeout: 45_000 });
  await exportImage(page);
  expect(offending).toEqual([]);
});

/** Every control on screen narrower or shorter than 44 CSS pixels. */
function smallTargets(page: Page) {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "button, [role=radio], select, summary, label.button, .swatch, input[type=range], input[type=color]:not(.swatch input)",
      ),
    ]
      .filter((el) => el.checkVisibility())
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(
        ({ el, box }) =>
          `${el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName} ${box.width}×${box.height}`,
      ),
  );
}

test("AC-A11Y-03 every control is at least 44×44 CSS pixels", async ({ page }) => {
  expect(await smallTargets(page)).toEqual([]);
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await page.getByRole("radio", { name: "Three stacked" }).click();
  // Select a photo so its zoom controls are on screen too.
  const preview = page.getByRole("application");
  await preview.scrollIntoViewIfNeeded();
  const box = (await preview.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 6);
  await expect(page.getByRole("slider", { name: "Zoom" })).toBeVisible();
  await page.getByText("Style", { exact: true }).click();
  expect(await smallTargets(page)).toEqual([]);
});

test("AC-MOBILE-01 nothing scrolls sideways at phone width", async ({ page }) => {
  const overflow = () =>
    page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  for (const width of [375, page.viewportSize()!.width]) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/");
    expect(await overflow(), `pick screen at ${width}px`).toBeLessThanOrEqual(0);
    await libraryInput(page).setInputFiles(await makePhotos(page, 8));
    await page.getByText("Style", { exact: true }).click();
    expect(await overflow(), `editor at ${width}px`).toBeLessThanOrEqual(0);
  }
});
