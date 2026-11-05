import { expect, test, type Page, type Request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ACCOUNTS_PORT, PORT } from "../playwright.config.js";
import { PASSWORD, emailedLink, libraryInput, makePhotos, openApp, submit } from "./helpers.js";

// Only the Expo app tracks usage. apps/web is being replaced, so it gets none.
test.skip(process.env.E2E_TARGET !== "app", "Only the Expo app tracks usage");

const isUsage = (req: Request) => req.url().endsWith("/usage/events");

/** Leaves the page, which sends what's waiting, and comes back. Returns the screens in that send. */
async function sentScreens(page: Page) {
  const sent = page.waitForRequest(isUsage);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
  });
  const req = await sent;
  const { events } = req.postDataJSON() as { events: { name: string; props?: { screen?: string } }[] };
  return {
    body: req.postData()!,
    events: events.map((e) => e.name),
    screens: events.flatMap((e) => (e.name === "screen_viewed" ? [e.props!.screen] : [])),
  };
}

test.describe("usage on", () => {
  test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });

  test("AC-USAGE-07 counts a visit and the pick and editor screens, which share a path", async ({ page }) => {
    await openApp(page);
    const first = await sentScreens(page);
    expect(first.events).toContain("visit_started");
    expect(first.screens).toEqual(["pick"]);

    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({ timeout: 30_000 });
    expect((await sentScreens(page)).screens).toEqual(["editor"]);
  });

  test("AC-USAGE-07 sends a fixed name, never a path or query string", async ({ page }) => {
    const secret = randomUUID();
    await page.goto(`/reset-password?token=${secret}`);
    await expect(page.getByRole("heading").first()).toBeVisible();
    const { body, screens } = await sentScreens(page);
    expect(screens).toEqual(["reset_password"]);
    expect(body).not.toContain(secret);
    expect(body).not.toContain("/");
  });

  test("AC-USAGE-07 counts the account and layout editor screens", async ({ page }) => {
    await openApp(page);
    const email = `e2e-${randomUUID()}@example.com`;
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await submit(page, "Create account");
    await expect(page.getByText(/Check your email/)).toBeVisible();
    expect((await sentScreens(page)).screens).toEqual(["sign_up"]);

    await page.goto(await emailedLink(page, email));
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
    expect((await sentScreens(page)).screens).toContain("account");

    await page.goto("/");
    await libraryInput(page).setInputFiles(await makePhotos(page, 2));
    await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Edit this layout" }).click();
    await expect(page.getByRole("dialog", { name: /of \d+ photos/ })).toBeVisible();
    expect((await sentScreens(page)).screens).toContain("layout_editor");
  });

  test("AC-USAGE-07 doesn't count the bot check page", async ({ page }) => {
    const sends: Request[] = [];
    page.on("request", (req) => {
      if (isUsage(req)) sends.push(req);
    });
    await page.goto("/bot-check");
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.waitForTimeout(500);
    expect(sends).toEqual([]);
  });
});

test("AC-USAGE-01 sends nothing in a build with the flag off", async ({ page, baseURL }) => {
  expect(baseURL).toBe(`http://localhost:${PORT}`);
  const sends: Request[] = [];
  page.on("request", (req) => {
    if (isUsage(req)) sends.push(req);
  });
  await openApp(page);
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await page.waitForTimeout(500);
  expect(sends).toEqual([]);
});
