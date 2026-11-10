import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { exportImage, fixture, libraryInput, makePhotos, openApp } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

/** The brief's performance targets, in milliseconds. */
const BUDGET = { analysis: 3000, layoutSwitch: 100, export: 2000 } as const;
/** Switches timed for each layout. Odd, so the median is a real sample. */
const SWITCH_ROUNDS = 5;
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

/** Goes through the editor's first pick: downloads and loads the models, so later analysis is what's timed. */
async function pickPhotos(page: Page, photos: Awaited<ReturnType<typeof phonePhotos>>) {
  await libraryInput(page).setInputFiles(photos);
  await expect(page.getByRole("application")).toBeVisible({ timeout: 120_000 });
}

test.describe("performance targets", () => {
  // Timed on Chromium only: Playwright's mobile WebKit runs without a GPU, so its timings say little about Safari.
  test.skip(({ browserName }) => browserName !== "chromium", "Timed on Chromium; check real-phone timings by hand (AC-PERF-04)");
  test.describe.configure({ timeout: 180_000 });

  test("AC-PERF-01 analyzing 8 photos meets the brief's target", async ({ page }) => {
    const photos = await phonePhotos(page);
    await pickPhotos(page, photos);
    await page.getByRole("button", { name: "Start over" }).click();
    // Timed from the pick: detection runs while the photos decode, so it has no step of its own to time.
    const start = Date.now();
    await libraryInput(page).setInputFiles(photos);
    await expect(page.getByRole("application")).toBeVisible({ timeout: 60_000 });
    const analysis = Date.now() - start;

    console.log(`timings: analysis ${analysis} ms`);
    expect(analysis, "analysis of 8 photos").toBeLessThan(BUDGET.analysis);
  });

  test("AC-PERF-02 switching to any layout meets the brief's target", async ({ page }) => {
    await pickPhotos(page, await phonePhotos(page));

    // Layout switch: from the tap until the next frame has been painted, back to back with no pause, so each
    // tap lands during the last one's crossfade. A CI runner's hiccups (a busy neighbouring test, a stolen core)
    // only ever add time to a sample, so the slowest single sample measures the runner. Each layout's median
    // survives two hiccups in its five samples, while the check stays on the worst layout: one layout that's
    // really slow still fails, however fast the others are.
    const radios = page.getByRole("radio");
    const count = await radios.count();
    const samples: number[][] = Array.from({ length: count }, () => []);
    for (let round = 0; round < SWITCH_ROUNDS; round++) {
      for (let step = 1; step <= count; step++) {
        const layout = step % count; // starts on the layout after the selected one, so every tap changes layout
        const ms = await radios.nth(layout).evaluate(
          (el) =>
            new Promise<number>((resolve) => {
              const start = performance.now();
              (el as HTMLElement).click();
              requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
            }),
        );
        samples[layout]!.push(ms);
      }
    }
    const medians = samples.map((ms) => ms.toSorted((a, b) => a - b)[Math.floor(ms.length / 2)]!);
    const worst = Math.max(...medians);

    console.log(
      `timings: worst layout median ${worst.toFixed(1)} ms, slowest single switch ${Math.max(...samples.flat()).toFixed(1)} ms, ` +
        `first round's slowest ${Math.max(...samples.map((ms) => ms[0]!)).toFixed(1)} ms, ${count} layouts × ${SWITCH_ROUNDS}`,
    );
    expect(worst, "layout switch, worst layout's median").toBeLessThan(BUDGET.layoutSwitch);
  });

  test("AC-PERF-03 exporting 8 12 MP photos meets the brief's target", async ({ page }) => {
    await pickPhotos(page, await phonePhotos(page));

    // The app measures each render itself (decode originals → encoded JPEG). Let earlier renders settle, then
    // time a fresh one.
    const download = page.getByRole("button", { name: "Download" });
    await expect(download).toBeEnabled({ timeout: 30_000 });
    await page.evaluate((name) => performance.clearMeasures(name), EXPORT_MEASURE);
    await page.getByRole("radio").nth(1).click();
    await expect(download).toBeEnabled({ timeout: 30_000 });
    const exportMs = await page.evaluate((name) => performance.getEntriesByName(name).at(-1)!.duration, EXPORT_MEASURE);

    console.log(`timings: export ${exportMs.toFixed(0)} ms`);
    expect(exportMs, "export").toBeLessThan(BUDGET.export);
  });
});

test("AC-EDIT-14 tapping layouts in quick succession runs one crossfade, not one for each tap", async ({ page }) => {
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await expect(page.getByRole("application")).toBeVisible();
  const pendingFrames = await page.evaluate(() => {
    const pending = new Set<number>();
    const { requestAnimationFrame: request, cancelAnimationFrame: cancel } = window;
    window.requestAnimationFrame = (callback) => {
      const id = request.call(window, (now) => {
        pending.delete(id);
        callback(now);
      });
      pending.add(id);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      pending.delete(id);
      cancel.call(window, id);
    };
    const radios = document.querySelectorAll<HTMLElement>("[role=radio]");
    for (const i of [1, 2, 3]) radios[i]!.click();
    return pending.size;
  });
  expect(pendingFrames).toBe(1);
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
        "button, [role=button], [role=link], [role=radio], select, summary, label:has(input[type=file], input[type=color]), input[type=range]",
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
    // Every panel, not just one: the layout strip once stretched the page only while Layouts was open.
    await expect(page.getByRole("radio").first()).toBeVisible();
    for (const tab of ["Layouts", "Style", "Export"]) {
      await page.getByRole("tab", { name: tab }).click();
      expect(await overflow(), `${tab} tool at ${width}px`).toBeLessThanOrEqual(0);
    }
    const box = (await page.getByRole("application").boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole("slider", { name: "Zoom" })).toBeVisible();
    expect(await overflow(), `photo selected at ${width}px`).toBeLessThanOrEqual(0);
  }
});

test("AC-MOBILE-04 the editor fits one phone screen: no page scrolling in any tool", async ({ page }) => {
  for (const size of [{ width: 375, height: 667 }, page.viewportSize()!]) {
    await page.setViewportSize(size);
    await page.goto("/");
    await libraryInput(page).setInputFiles(await makePhotos(page, 8));
    const preview = page.getByRole("application");
    await expect(preview).toBeVisible();
    const fits = async (where: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
      expect(overflow, `page scrolls by ${overflow}px (${where}, ${size.width}×${size.height})`).toBeLessThanOrEqual(0);
      for (const el of [preview, page.getByRole("tablist", { name: "Tools" }), page.getByRole("button", { name: /Download|Preparing/ })]) {
        const box = (await el.boundingBox())!;
        expect(box.y + box.height, `${where}: on screen`).toBeLessThanOrEqual(size.height + 1);
      }
    };
    for (const tab of ["Layouts", "Style", "Export"]) {
      await page.getByRole("tab", { name: tab }).click();
      await fits(`${tab} tool`);
    }
    const box = (await preview.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole("slider", { name: "Zoom" })).toBeVisible();
    await fits("photo selected");
  }
});
