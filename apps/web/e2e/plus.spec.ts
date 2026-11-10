import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ACCOUNTS_PORT } from "../playwright.config.js";
import { PASSWORD, emailedLink, exportImage, libraryInput, openApp, submit } from "./helpers.js";

// The accounts build, which also has StoryStitch Plus on. The e2e API runs with payments off, so these tests answer
// GET /me/entitlements themselves: the API's own side is covered by apps/api/src/payments.test.ts.
test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });
test.beforeEach(({ page }) => {
  test.skip(process.env.E2E_TARGET !== "app", "Plus is only in the Expo app");
  return openApp(page);
});

async function signedIn(page: Page) {
  await page.goto("/sign-up");
  const email = `e2e-${randomUUID()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await submit(page, "Create account");
  await expect(page.getByText(/Check your email/)).toBeVisible();
  await page.goto(await emailedLink(page, email));
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
}

/** What the API says about the account's Plus. */
const answerPlus = (page: Page, plus: boolean) =>
  page.route("**/me/entitlements", (route) => route.fulfill({ json: { plus }, headers: { "Access-Control-Allow-Origin": `http://localhost:${ACCOUNTS_PORT}`, "Access-Control-Allow-Credentials": "true" } }));

/** Opens the editor on one flat grey photo, in the Export tool. */
async function exportTool(page: Page) {
  await page.goto("/");
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
  await libraryInput(page).setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") });
  await page.getByRole("radio", { name: "Full bleed" }).click();
  await page.getByRole("tab", { name: "Export" }).click();
  return page.getByRole("switch", { name: "Made with StoryStitch" });
}

/** The biggest difference in any channel of any pixel between two exported JPEGs. */
function maxDiff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(
    async ([a, b]) => {
      const read = async (b64: string) => {
        const bitmap = await createImageBitmap(await (await fetch(`data:image/jpeg;base64,${b64}`)).blob());
        const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        return ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      };
      const [x, y] = [await read(a!), await read(b!)];
      let max = 0;
      for (let i = 0; i < x.length; i++) if (i % 4 !== 3) max = Math.max(max, Math.abs(x[i]! - y[i]!));
      return max;
    },
    [a.toString("base64"), b.toString("base64")],
  );
}

test("AC-PLUS-01 signed out, the mark can't be turned off, and the upsell asks to sign in", async ({ page }) => {
  const toggle = await exportTool(page);
  await expect(toggle).toBeChecked();
  await expect(toggle).toBeDisabled();
  await page.getByRole("button", { name: "Remove the mark" }).click();
  const upsell = page.getByRole("region", { name: "StoryStitch Plus" });
  await expect(upsell).toContainText("pay once");
  const signIn = upsell.getByRole("button", { name: "Sign in to get Plus" });
  await expect(signIn).toHaveCSS("background-color", "rgb(255, 194, 75)");
  await expect(upsell.getByRole("button", { name: "Not now" }).getByText("Not now")).toHaveCSS("font-size", "14px");
  await upsell.getByRole("button", { name: "Not now" }).click();
  await expect(upsell).toHaveCount(0);
  await page.getByRole("button", { name: "Remove the mark" }).click();
  await page.getByRole("button", { name: "Sign in to get Plus" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("AC-PLUS-01 AC-PLUS-02 without Plus every export has the mark; with Plus the switch takes it off", async ({ page }) => {
  await signedIn(page);
  await answerPlus(page, false);
  const locked = await exportTool(page);
  await expect(locked).toBeDisabled();
  const withoutPlus = await exportImage(page);

  await page.unrouteAll();
  await answerPlus(page, true);
  const toggle = await exportTool(page);
  await expect(toggle).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove the mark" })).toHaveCount(0);
  await expect(toggle).toBeChecked();
  const marked = await exportImage(page);
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  const plain = await exportImage(page);

  expect(await maxDiff(page, withoutPlus, marked)).toBeLessThan(16);
  expect(await maxDiff(page, plain, marked)).toBeGreaterThan(64);
});
