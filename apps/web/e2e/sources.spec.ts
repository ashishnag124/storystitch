import { devices, expect, test, type Page } from "@playwright/test";
import { libraryInput, makePhotos, openApp } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

const button = (page: Page, name: string) => page.getByText(name, { exact: true });

test("AC-PICK-09 phones get one-tap photo sources for their platform", async ({ page }, testInfo) => {
  const camera = page.getByLabel("Take photo");
  await expect(camera).toHaveAttribute("capture", "environment"); // opens the camera directly
  await expect(button(page, "Take photo")).toBeVisible();
  if (testInfo.project.name === "android-chrome") {
    await expect(button(page, "Photo library")).toBeVisible();
    await expect(button(page, "Files")).toBeVisible();
    await expect(page.getByLabel("Files")).not.toHaveAttribute("accept"); // no filter, so the file browser opens
  } else {
    // iPhone Safari sends every file input through Apple's menu, so one button covers library and files.
    await expect(button(page, "Choose photos")).toBeVisible();
    await expect(button(page, "Files")).toHaveCount(0);
  }
  await expect(page.getByText("Drag and drop photos here")).toHaveCount(0);
});

test("AC-PICK-08 camera shots collect in a tray until you make the collage", async ({ page }, testInfo) => {
  const [first, second, third, fourth] = await makePhotos(page, 4);
  await page.getByLabel("Take photo").setInputFiles(first!);
  await expect(page.getByText("1 of 8 photos")).toBeVisible();
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();

  await page.getByLabel("Take another").setInputFiles(second!);
  await expect(page.getByText("2 of 8 photos")).toBeVisible();
  await page.getByRole("button", { name: "Remove photo 1" }).click();
  await expect(page.getByText("1 of 8 photos")).toBeVisible();

  const add = testInfo.project.name === "iphone-webkit" ? "Add photos" : "Add from library";
  await page.getByLabel(add).setInputFiles([third!, fourth!]);
  await expect(page.getByText("3 of 8 photos")).toBeVisible();

  await page.getByRole("button", { name: "Make collage" }).click();
  await expect(page.getByRole("application", { name: /3 photos/ })).toBeVisible();
});

test("AC-PICK-08 the tray stops at 8 photos and says so", async ({ page }) => {
  await page.getByLabel("Take photo").setInputFiles((await makePhotos(page, 1))[0]!);
  await page.getByLabel(/^Add (photos|from library)$/).setInputFiles(await makePhotos(page, 9));
  await expect(page.getByText("8 of 8 photos")).toBeVisible();
  await expect(page.getByText("StoryStitch uses up to 8 photos, so it took the first 8.")).toBeVisible();
  await expect(page.getByLabel("Take another")).toHaveCount(0);
});

test.describe("desktop", () => {
  // A desktop screen and user agent rather than the phone emulation the other tests use (same browser engine).
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Desktop Chrome"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("AC-PICK-09 offers an upload button and a drag-and-drop area, and no camera", async ({ page }) => {
    await expect(page.getByText("Drag and drop photos here")).toBeVisible();
    await expect(button(page, "Upload photos")).toBeVisible();
    await expect(page.getByLabel("Take photo")).toHaveCount(0);
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await expect(page.getByRole("application", { name: /2 photos/ })).toBeVisible();
  });

  test("AC-PICK-10 dropping photos onto the page opens them", async ({ page }) => {
    const photos = await makePhotos(page, 3);
    const transfer = await page.evaluateHandle((files) => {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(new File([Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0))], f.name, { type: "image/jpeg" }));
      return dt;
    }, photos.map((p) => ({ name: p.name, b64: p.buffer.toString("base64") })));
    const zone = page.getByText("Drag and drop photos here");
    await zone.dispatchEvent("dragover", { dataTransfer: transfer });
    await expect(page.locator(".dropzone.dragging")).toBeVisible(); // highlights while dragging
    await zone.dispatchEvent("drop", { dataTransfer: transfer });
    await expect(page.getByRole("application", { name: /3 photos/ })).toBeVisible();
  });
});
