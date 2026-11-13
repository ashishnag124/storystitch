import { expect, test, type Page } from "@playwright/test";
import { ACCOUNTS_PORT } from "../playwright.config.js";
import { libraryInput, makePhotos, openApp } from "./helpers.js";

/** Must match BUDGET.layoutSwitch in quality.spec.ts (AC-PERF-02). */
const LAYOUT_SWITCH_BUDGET = 100;

test.beforeEach(({ page }) => openApp(page));

async function pick(page: Page, count: number) {
  await libraryInput(page).setInputFiles(await makePhotos(page, count));
  // The first pick loads the detection models.
  await expect(page.getByRole("application")).toBeVisible({ timeout: 60_000 });
}

/** The layout the preview names, from its label "Story preview: <layout>, <n> photos". */
async function previewLayout(page: Page) {
  const label = (await page.getByRole("application").getAttribute("aria-label"))!;
  return /^Story preview: (.*), \d+ photos$/.exec(label)![1]!;
}

test("AC-SHUFFLE-04 each Shuffle tap shows a new layout, named in the preview and selected in the strip", async ({ page }) => {
  await pick(page, 4);
  const button = page.getByRole("button", { name: "Shuffle layout" });
  const box = (await button.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  // At the start of the strip.
  expect(box.x).toBeLessThan((await page.getByRole("radiogroup", { name: "Layouts" }).boundingBox())!.x);

  const seen = [await previewLayout(page)];
  for (let tap = 1; tap <= 6; tap++) {
    await button.click();
    await expect.poll(() => previewLayout(page)).not.toBe(seen.at(-1));
    const name = await previewLayout(page);
    expect(seen, `tap ${tap}`).not.toContain(name);
    seen.push(name);
    const checked = page.locator("[role=radio][aria-checked=true]");
    await expect(checked).toHaveCount(1);
    await expect(checked).toHaveAccessibleName(name);
    await expect(checked).toBeInViewport();
  }
});

test.describe("AC-SHUFFLE-05 Shuffle's layout switch", () => {
  test("meets AC-PERF-02's budget", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Timed on Chromium, as AC-PERF-02");
    await pick(page, 8);
    const samples = await page.getByRole("button", { name: "Shuffle layout" }).evaluate(async (el) => {
      const out: number[] = [];
      for (let i = 0; i < 9; i++) {
        out.push(
          await new Promise<number>((resolve) => {
            const start = performance.now();
            (el as HTMLElement).click();
            requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now() - start)));
          }),
        );
      }
      return out;
    });
    const median = samples.toSorted((a, b) => a - b)[Math.floor(samples.length / 2)]!;
    console.log(`timings: shuffle median ${median.toFixed(1)} ms, slowest ${Math.max(...samples).toFixed(1)} ms`);
    expect(median).toBeLessThan(LAYOUT_SWITCH_BUDGET);
  });

  test("runs one crossfade for quick taps (AC-EDIT-14)", async ({ page }) => {
    await pick(page, 4);
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
      const button = document.querySelector<HTMLElement>("[aria-label='Shuffle layout']")!;
      for (let i = 0; i < 3; i++) button.click();
      return pending.size;
    });
    expect(pendingFrames).toBe(1);
  });
});

test.describe("flag off", () => {
  // The accounts build leaves EXPO_PUBLIC_FEATURE_SHUFFLE unset (see build:e2e in package.json).
  test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });

  test("AC-SHUFFLE-06 there's no Shuffle button", async ({ page }) => {
    await pick(page, 4);
    await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Shuffle layout" })).toHaveCount(0);
  });
});
