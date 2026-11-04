import { devices, expect, test, type Page } from "@playwright/test";
import { libraryInput, makePhotos, openApp } from "./helpers.js";

test.beforeEach(({ page }) => openApp(page));

const button = (page: Page, name: string) => page.getByText(name, { exact: true });

test("AC-PICK-01 AC-PRIV-02 starts on photo picking and says photos stay on the device", async ({ page }) => {
  const input = libraryInput(page);
  await expect(input).toHaveAttribute("type", "file");
  await expect(input).toHaveAttribute("multiple");
  await expect(input).toHaveAttribute("accept", /\.heic/);
  await expect(page.getByText(/nothing is uploaded/i)).toBeVisible();
});

test("AC-PICK-09 phones get one-tap photo sources for their platform, and no camera button", async ({ page }, testInfo) => {
  await expect(page.locator("input[capture]")).toHaveCount(0);
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

test.describe("desktop", () => {
  // A desktop screen and user agent rather than the phone emulation the other tests use (same browser engine).
  const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } = devices["Desktop Chrome"];
  test.use({ viewport, userAgent, deviceScaleFactor, isMobile, hasTouch });

  test("AC-PICK-09 offers an upload button and a drag-and-drop area, and no camera", async ({ page }) => {
    await expect(page.getByText("Drag and drop photos here")).toBeVisible();
    await expect(button(page, "Upload photos")).toBeVisible();
    await expect(page.locator("input[capture]")).toHaveCount(0);
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
    await expect(page.getByTestId("dropzone")).toHaveAttribute("data-dragging", "true"); // highlights while dragging
    await zone.dispatchEvent("drop", { dataTransfer: transfer });
    await expect(page.getByRole("application", { name: /3 photos/ })).toBeVisible();
  });
});
