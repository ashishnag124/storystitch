import AxeBuilder from "@axe-core/playwright";
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

/** Whether a Web Worker here can create a WebGL2 context, which MediaPipe needs even on its CPU delegate. */
async function workerHasWebGL2(page: Page) {
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

test("finds faces and objects with the real on-device models", async ({ page }) => {
  // Headless Linux WebKit has no GPU, so the app correctly falls back to the heuristic there.
  test.skip(!(await workerHasWebGL2(page)), "No WebGL2 in workers, so MediaPipe can't run in this browser");
  const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url));
  await page
    .getByLabel(/choose photos/i)
    .setInputFiles([fixture("native-garhwali-women-of-garhwal.jpg"), fixture("picography-shiba-inu-dog-forest-walk-sm-1.jpg")]);
  // CC0 fixtures from Wikimedia Commons: a portrait (one face) and a dog in a forest (no face).
  await expect(page.getByText("Found 1 face and a dog.")).toBeVisible({ timeout: 45_000 });
  expect(jpegSize(await exportImage(page))).toEqual({ width: 1080, height: 1920 });
});

test.describe("error states", () => {
  test("takes the first 8 of more than 8 photos and says so", async ({ page }) => {
    await page.getByLabel(/choose photos/i).setInputFiles(await makePhotos(page, 9));
    await expect(page.getByText("StoryStitch uses up to 8 photos, so it took the first 8.")).toBeVisible();
    await expect(page.getByRole("application", { name: /8 photos/ })).toBeVisible();
  });

  test("skips a file it can't open and keeps the rest", async ({ page }) => {
    const broken = { name: "broken.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") };
    await page.getByLabel(/choose photos/i).setInputFiles([...(await makePhotos(page, 2)), broken]);
    await expect(page.getByText("Couldn't open broken.jpg. Try a JPEG, PNG, WebP or HEIC photo.")).toBeVisible();
    await expect(page.getByRole("application", { name: /2 photos/ })).toBeVisible();
  });

  test("works when the detection models can't load", async ({ page }) => {
    await page.route(/\/(models|mediapipe)\//, (route) => route.abort());
    await page.getByLabel(/choose photos/i).setInputFiles(await makePhotos(page, 3));
    expect(jpegSize(await exportImage(page))).toEqual({ width: 1080, height: 1920 });
  });

  test("works when the detection worker can't start", async ({ page }) => {
    await page.route(/\/worker[-.]/, (route) => route.abort());
    await page.getByLabel(/choose photos/i).setInputFiles(await makePhotos(page, 3));
    expect(jpegSize(await exportImage(page))).toEqual({ width: 1080, height: 1920 });
  });
});

test.describe("editing", () => {
  /** Opens the "Two stacked" layout and returns the canvas-relative center of each cell. */
  async function openTwoStacked(page: Page) {
    await page.getByLabel(/choose photos/i).setInputFiles(await makePhotos(page, 2));
    await page.getByRole("radio", { name: "Two stacked" }).click();
    const box = (await page.getByRole("application").boundingBox())!;
    return [0.25, 0.75].map((y) => ({ x: box.x + box.width / 2, y: box.y + box.height * y }));
  }

  test("press and hold a photo, then drag it onto another to swap", async ({ page }) => {
    const [top, bottom] = await openTwoStacked(page);
    await page.mouse.move(top!.x, top!.y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(bottom!.x, bottom!.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("Swapped photos 1 and 2.");
  });

  test("a quick drag repositions instead of swapping", async ({ page }) => {
    const [top, bottom] = await openTwoStacked(page);
    await page.mouse.move(top!.x, top!.y);
    await page.mouse.down();
    await page.mouse.move(bottom!.x, bottom!.y, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("");
  });

  test("Ctrl+scroll (trackpad pinch) zooms the photo under the pointer", async ({ page, browserName }) => {
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

  test("two fingers pinch to zoom", async ({ page, browserName }) => {
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
    await expect.poll(async () => Number(await page.getByRole("slider", { name: "Zoom" }).inputValue())).toBeGreaterThan(2.5);
  });

  test("the keyboard picks, moves, zooms and swaps photos", async ({ page }) => {
    await openTwoStacked(page);
    await page.getByRole("application").focus();
    await page.keyboard.press("1");
    await expect(page.getByRole("status")).toHaveText("Photo 1 selected.");
    await page.keyboard.press("+");
    await expect.poll(async () => Number(await page.getByRole("slider", { name: "Zoom" }).inputValue())).toBeGreaterThan(1);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("2");
    await expect(page.getByRole("status")).toHaveText("Swapped photos 1 and 2.");
  });

  test("style changes reach the export", async ({ page }) => {
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
});

test("has no detectable accessibility problems", async ({ page }) => {
  const check = async () => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  };
  await check();
  await page.getByLabel(/choose photos/i).setInputFiles(await makePhotos(page, 3));
  await page.getByText("Style", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Reset style" })).toBeVisible();
  await check();
});
