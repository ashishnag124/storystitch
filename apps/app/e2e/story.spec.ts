import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { exportImage, fixture, jpegSize, makePhotos, openApp, workerHasWebGL2, libraryInput } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

for (const count of [1, 4, 8]) {
  test(`AC-PICK-02 AC-EXPORT-01 AC-EXPORT-06 AC-MOBILE-02 ${count} photo${count > 1 ? "s" : ""} → layout options → 1080×1920 JPEG`, async ({
    page,
  }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, count));
    const options = page.getByRole("radiogroup", { name: "Layouts" }).getByRole("radio");
    await expect(options.first()).toBeVisible();
    expect(await options.count()).toBeGreaterThanOrEqual(2);
    await expect(options.first()).toHaveAttribute("aria-checked", "true");

    expect(jpegSize(await exportImage(page))).toEqual({
      width: 1080,
      height: 1920,
    });
  });
}

test("AC-PICK-05 opens a HEIC photo", async ({ page }) => {
  await libraryInput(page).setInputFiles(fixture("gradient.heic"));
  await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({
    timeout: 30_000,
  });
  expect(jpegSize(await exportImage(page))).toEqual({
    width: 1080,
    height: 1920,
  });
});

test("AC-PICK-06 shows progress while photos are analyzed", async ({ page }) => {
  // Hold the detection worker (detect-worker.js) back so the analysis step is
  // on screen long enough to see. The Expo app starts it after the first photo decodes, so it must outlast the rest.
  await page.route(/\/detect-worker\./, async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await expect(page.getByRole("status")).toHaveText(/Finding subjects \d of 3…/);
  await expect(page.getByRole("application")).toBeVisible({ timeout: 30_000 });
});

test("AC-DETECT-01 downloads the detection models only after photos are picked", async ({ page }) => {
  const modelRequests: string[] = [];
  page.on("request", (r) => {
    if (/\/(models|mediapipe)\//.test(r.url())) modelRequests.push(r.url());
  });
  await page.reload();
  await page.waitForLoadState("networkidle");
  expect(modelRequests).toEqual([]);

  await libraryInput(page).setInputFiles(await makePhotos(page, 2));
  await expect(page.getByRole("application")).toBeVisible({ timeout: 30_000 });
  // Browsers without WebGL2 in workers skip the download entirely (they use the heuristic).
  if (await workerHasWebGL2(page)) expect(modelRequests.some((u) => u.endsWith(".tflite"))).toBe(true);
});

test("AC-DETECT-02 finds faces and objects with the real on-device models", async ({ page }) => {
  // Headless Linux WebKit has no GPU, so the app correctly falls back to the heuristic there.
  test.skip(!(await workerHasWebGL2(page)), "No WebGL2 in workers, so MediaPipe can't run in this browser");
  await libraryInput(page)
    .setInputFiles([
      fixture("native-garhwali-women-of-garhwal.jpg"),
      fixture("picography-shiba-inu-dog-forest-walk-sm-1.jpg"),
    ]);
  // CC0 fixtures from Wikimedia Commons: a portrait (one face) and a dog in a forest (no face).
  await expect(page.getByText("Found 1 face and a dog.")).toBeVisible({
    timeout: 45_000,
  });
  expect(jpegSize(await exportImage(page))).toEqual({
    width: 1080,
    height: 1920,
  });
});

test.describe("error states", () => {
  test("AC-PICK-03 takes the first 8 of more than 8 photos and says so", async ({ page }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, 9));
    await expect(page.getByText("StoryStitch uses up to 8 photos, so it took the first 8.")).toBeVisible();
    await expect(page.getByRole("application", { name: /8 photos/ })).toBeVisible();
  });

  test("AC-PICK-04 skips a file it can't open and keeps the rest", async ({ page }) => {
    const broken = {
      name: "broken.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("not an image"),
    };
    await libraryInput(page).setInputFiles([...(await makePhotos(page, 2)), broken]);
    await expect(page.getByText("Couldn't open broken.jpg. Try a JPEG, PNG, WebP or HEIC photo.")).toBeVisible();
    await expect(page.getByRole("application", { name: /2 photos/ })).toBeVisible();
  });

  test("AC-DETECT-03 works when the detection models can't load", async ({ page }) => {
    await page.route(/\/(models|mediapipe)\//, (route) => route.abort());
    await libraryInput(page).setInputFiles(await makePhotos(page, 3));
    expect(jpegSize(await exportImage(page))).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  test("AC-DETECT-04 works when the detection worker can't start", async ({ page }) => {
    await page.route(/\/detect-worker\./, (route) => route.abort());
    await libraryInput(page).setInputFiles(await makePhotos(page, 3));
    expect(jpegSize(await exportImage(page))).toEqual({
      width: 1080,
      height: 1920,
    });
  });
});

test.describe("editing", () => {
  /** Opens the "Two stacked" layout and returns the canvas-relative center of each cell. */
  async function openTwoStacked(page: Page) {
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await page.getByRole("radio", { name: "Two stacked" }).click();
    const box = (await page.getByRole("application").boundingBox())!;
    return [0.25, 0.75].map((y) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height * y,
    }));
  }

  test("AC-EDIT-03 AC-EDIT-06 tap a photo to select it, then tap another to swap", async ({ page }) => {
    const [top, bottom] = await openTwoStacked(page);
    await page.mouse.click(top!.x, top!.y);
    await expect(page.getByRole("status")).toHaveText("Photo 1 selected.");
    await expect(page.getByRole("slider", { name: "Zoom" })).toBeVisible();
    await page.mouse.click(bottom!.x, bottom!.y);
    await expect(page.getByRole("status")).toHaveText("Swapped photos 1 and 2.");
    await expect(page.getByRole("slider", { name: "Zoom" })).toBeHidden();
  });

  test("AC-EDIT-07 tapping a layout opens it", async ({ page }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, 4));
    const second = page.getByRole("radio").nth(1);
    const name = (await second.getAttribute("aria-label"))!;
    await second.click();
    await expect(second).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("application")).toHaveAccessibleName(new RegExp(`^Story preview: ${name},`));
  });

  test("AC-EDIT-13 layouts are shown as diagrams of their cells, without the photos", async ({ page }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, 4));
    const options = page.getByRole("radiogroup", { name: "Layouts" }).getByRole("radio");
    await expect(options.first()).toBeVisible();
    for (const option of await options.all()) {
      await expect(option.getByTestId("diagram-cell")).toHaveCount(4);
      await expect(option.locator("canvas, img, image")).toHaveCount(0);
    }
  });

  test("AC-STYLE-01 the style tool has every control, and Reset restores the defaults", async ({ page }) => {
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await page.getByRole("radio", { name: "Two stacked" }).click();
    await page.getByRole("tab", { name: "Style" }).click();
    // Color is the first property: swatches, blurred photo and a custom color.
    for (const name of ["Auto", "Cream", "White", "Black", "Sage", "Blush", "Navy", "Blurred photo", "Reset style"]) {
      await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByLabel("Custom background color")).toBeAttached();
    await page.getByRole("button", { name: "Navy" }).click();
    await expect(page.getByRole("button", { name: "Navy" })).toHaveAttribute("aria-pressed", "true");

    // Each other property shows its own control when its chip is picked.
    const chip = (name: string) => page.getByRole("radio", { name, exact: true });
    // On an iPhone SE's width, every tool and Reset are on screen, with no sideways scrolling.
    const size = page.viewportSize()!;
    await page.setViewportSize({ width: 375, height: 667 });
    for (const tool of [...["Color", "Spacing", "Margin", "Corners", "Border"].map(chip), page.getByRole("button", { name: "Reset style" })]) {
      const box = (await tool.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    await page.setViewportSize(size);
    for (const name of ["Margin", "Corners", "Border"]) {
      await chip(name).click();
      await expect(page.getByRole("slider", { name })).toBeEnabled();
    }
    await expect(page.getByLabel("Border color")).toBeVisible();
    await chip("Spacing").click();
    await page.getByRole("slider", { name: "Spacing" }).fill("40");

    await page.getByRole("button", { name: "Reset style" }).click();
    await expect(page.getByRole("slider", { name: "Spacing" })).toHaveValue("8");
    await chip("Color").click();
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("AC-EDIT-10 a selected photo gets a floating Fit / Done tooltip, and Fit restores the automatic crop", async ({ page }) => {
    const [top] = await openTwoStacked(page);
    await page.mouse.click(top!.x, top!.y);
    const tip = page.getByRole("toolbar", { name: "Photo 1" });
    await expect(tip).toBeVisible();
    const zoom = page.getByRole("slider", { name: "Zoom" });
    const auto = await zoom.inputValue();
    await zoom.fill("3");
    await tip.getByRole("button", { name: "Fit" }).click();
    await expect.poll(() => zoom.inputValue()).toBe(auto);
    await tip.getByRole("button", { name: "Done" }).click();
    await expect(tip).toBeHidden();
    await expect(page.getByRole("status")).toHaveText("Done.");
  });

  test("AC-EDIT-11 double-tap zooms a photo in, and again goes back to fit", async ({ page }) => {
    const [top] = await openTwoStacked(page);
    const zoom = page.getByRole("slider", { name: "Zoom" });
    await page.mouse.dblclick(top!.x, top!.y);
    await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(1.9);
    await page.waitForTimeout(400);
    await page.mouse.dblclick(top!.x, top!.y);
    await expect.poll(async () => Number(await zoom.inputValue())).toBeLessThan(1.1);
  });

  test("AC-EDIT-02 press and hold a photo, then drag it onto another to swap", async ({ page }) => {
    const [top, bottom] = await openTwoStacked(page);
    await page.mouse.move(top!.x, top!.y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(bottom!.x, bottom!.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("Swapped photos 1 and 2.");
  });

  test("AC-EDIT-01 a quick drag repositions instead of swapping", async ({ page }) => {
    const [top, bottom] = await openTwoStacked(page);
    await page.mouse.move(top!.x, top!.y);
    await page.mouse.down();
    await page.mouse.move(bottom!.x, bottom!.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("");
  });

  test("AC-EDIT-05 Ctrl+scroll (trackpad pinch) zooms the photo under the pointer", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "Playwright's mobile WebKit has no mouse wheel; this is a desktop gesture");
    const [top] = await openTwoStacked(page);
    await page.mouse.click(top!.x, top!.y);
    const zoom = page.getByRole("slider", { name: "Zoom" });
    await expect(zoom).toHaveValue("1");
    await page.keyboard.down("Control");
    await page.mouse.wheel(0, -40);
    await page.keyboard.up("Control");
    await expect.poll(async () => Number(await zoom.inputValue())).toBeGreaterThan(1.05);
  });

  test("AC-EDIT-04 two fingers pinch to zoom", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Multi-touch is driven through the Chrome DevTools Protocol");
    const [top] = await openTwoStacked(page);
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: "touchStart" | "touchMove" | "touchEnd", spread: number) =>
      cdp.send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
          type === "touchEnd"
            ? []
            : [
                { x: top!.x - spread, y: top!.y, id: 1 },
                { x: top!.x + spread, y: top!.y, id: 2 },
              ],
      });
    await touch("touchStart", 20);
    for (const spread of [30, 40, 50, 60]) await touch("touchMove", spread);
    await touch("touchEnd", 60);
    // Pinching doesn't select the photo; tap it to read its zoom.
    await page.mouse.click(top!.x, top!.y);
    await expect
      .poll(async () => Number(await page.getByRole("slider", { name: "Zoom" }).inputValue()))
      .toBeGreaterThan(2.5);
  });

  test("AC-A11Y-02 the keyboard picks, moves, zooms and swaps photos", async ({ page }) => {
    await openTwoStacked(page);
    await page.getByRole("application").focus();
    await page.keyboard.press("1");
    await expect(page.getByRole("status")).toHaveText("Photo 1 selected.");
    await page.keyboard.press("+");
    await expect
      .poll(async () => Number(await page.getByRole("slider", { name: "Zoom" }).inputValue()))
      .toBeGreaterThan(1);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("2");
    await expect(page.getByRole("status")).toHaveText("Swapped photos 1 and 2.");
  });

  test("AC-STYLE-03 style changes reach the export", async ({ page }) => {
    await openTwoStacked(page);
    await page.getByText("Style", { exact: true }).click();
    await page.getByRole("button", { name: "Black" }).click();
    const jpeg = await exportImage(page);
    // The top-left corner is outer margin, so it shows the background.
    const corner = await page.evaluate(async (b64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      const ctx = new OffscreenCanvas(1, 1).getContext("2d")!;
      ctx.drawImage(bitmap, 4, 4, 1, 1, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    }, jpeg.toString("base64"));
    for (const channel of corner) expect(channel).toBeLessThan(40);
  });

  test("AC-STYLE-07 the background defaults to a pale tint of the photos", async ({ page }) => {
    // The fixtures are red and orange.
    await openTwoStacked(page);
    const corner = await page.evaluate(async (b64) => {
      const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
      const ctx = new OffscreenCanvas(1, 1).getContext("2d")!;
      ctx.drawImage(bitmap, 4, 4, 1, 1, 0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    }, (await exportImage(page)).toString("base64"));
    const [r, g, b] = corner as [number, number, number];
    expect(Math.min(r, g, b)).toBeGreaterThan(220);
    expect(r - b).toBeGreaterThan(4);
    await page.getByRole("tab", { name: "Style" }).click();
    await expect(page.getByRole("button", { name: "Auto", exact: true })).toHaveAttribute("aria-pressed", "true");
  });
});

test("AC-A11Y-01 has no detectable accessibility problems", async ({ page }) => {
  // Measure the settled UI, not panels halfway through their fade-in.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const check = async () => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  };
  await check();
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await page.getByText("Style", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset style" })).toBeVisible();
  await check();
});
