import { expect, test, type Page, type Request } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ACCOUNTS_PORT, PORT } from "../playwright.config.js";
import { PASSWORD, emailedLink, exportImage, libraryInput, makePhotos, openApp, submit } from "./helpers.js";

// Only the Expo app tracks usage. apps/web is being replaced, so it gets none.
test.skip(process.env.E2E_TARGET !== "app", "Only the Expo app tracks usage");

const isUsage = (req: Request) => req.url().endsWith("/usage/events");

/** Leaves the page, which sends what's waiting, and comes back. */
const leave = (page: Page) =>
  page.evaluate(() => {
    window.dispatchEvent(new Event("pagehide"));
    window.dispatchEvent(new Event("pageshow"));
  });

/**
 * Leaves and comes back until a screen has been sent, and returns everything sent on the way. It may take more than one
 * try: a screen is counted in an effect, which runs after what the test can see is on the page.
 */
async function sentScreens(page: Page) {
  const sends: Request[] = [];
  const record = (req: Request) => {
    if (isUsage(req)) sends.push(req);
  };
  const sentEvents = () => sends.flatMap((req) => (req.postDataJSON() as { events: { name: string; props?: { screen?: string } }[] }).events);
  page.on("request", record);
  await expect
    .poll(async () => {
      await leave(page);
      return sentEvents().some((e) => e.name === "screen_viewed");
    })
    .toBe(true);
  page.off("request", record);
  return {
    body: sends.map((req) => req.postData()!).join("\n"),
    events: sentEvents().map((e) => e.name),
    screens: sentEvents().flatMap((e) => (e.name === "screen_viewed" ? [e.props!.screen] : [])),
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

test.describe("a whole session", () => {
  test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });

  test("AC-ADMIN-01 AC-ADMIN-02 records each event, and every request holds only what the rules allow", async ({ page }) => {
    const bodies: string[] = [];
    page.on("request", (req) => {
      if (isUsage(req)) bodies.push(req.postData()!);
    });
    const email = `e2e-${randomUUID()}@example.com`;
    const layoutName = `Holiday ${randomUUID()}`;

    await openApp(page);
    await page.goto("/sign-up");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await submit(page, "Create account");
    await expect(page.getByText(/Check your email/)).toBeVisible();
    // Sent before leaving: a send made while a page closes arrives, but Playwright doesn't always see it.
    await Promise.all([page.waitForRequest(isUsage), leave(page)]);
    await page.goto(await emailedLink(page, email));
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
    await Promise.all([page.waitForRequest(isUsage), leave(page)]);
    await page.goto("/");

    // A file that can't open, so the session shows an error that names a file.
    const broken = { name: "private-name.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") };
    await libraryInput(page).setInputFiles([...(await makePhotos(page, 3)), broken]);
    await expect(page.getByText(/Couldn't open private-name.jpg/)).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({ timeout: 30_000 });

    await page.getByRole("radiogroup", { name: "Layouts" }).getByRole("radio").nth(1).click();
    await page.getByRole("tab", { name: "Style" }).click();
    await page.getByRole("tab", { name: "Layouts" }).click();
    await exportImage(page);
    await exportImage(page);

    const dialog = page.getByRole("dialog", { name: /of \d+ photos/ });
    await page.getByRole("button", { name: "Edit this layout" }).click();
    await dialog.getByRole("button", { name: "Done" }).click();
    await page.getByLabel("Name").fill(layoutName);
    await page.getByRole("button", { name: "Save layout" }).click();
    await expect(dialog).toHaveCount(0);
    await exportImage(page);
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(libraryInput(page)).toBeAttached();

    const sends = bodies.length;
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await expect.poll(() => bodies.length).toBeGreaterThan(sends);

    // Every property is a fixed value, a true/false or a small number. The registry's own parser is tested in
    // packages/client and apps/api: this build can't load it, because Playwright's Node can't import its JSON.
    const events = bodies.flatMap((body) => {
      const { platform, events, ...rest } = JSON.parse(body) as { platform: string; events: { name: string; props?: Record<string, unknown> }[] };
      expect(platform).toBe("web");
      expect(rest).toEqual({});
      return events;
    });
    for (const { name, props, ...rest } of events) {
      expect(rest).toEqual({});
      expect(name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      for (const value of Object.values(props ?? {})) {
        if (typeof value === "string") expect(value).toMatch(/^[a-z0-9]+([_-][a-z0-9]+)*$/);
        else if (typeof value === "number") expect(value).toBeLessThanOrEqual(8);
        else expect(typeof value).toBe("boolean");
        expect(value).not.toBe("other");
      }
    }

    const everything = bodies.join("\n");
    for (const text of [email, layoutName, "private-name", "custom-", "http", "/"]) expect(everything).not.toContain(text);

    const named = (name: string) => events.filter((e) => e.name === name).map((e) => e.props);
    expect(named("visit_started").length).toBeGreaterThan(0);
    expect(named("screen_viewed")).toEqual(expect.arrayContaining([{ screen: "sign_up" }, { screen: "account" }, { screen: "pick" }, { screen: "editor" }]));
    expect(named("signed_up")).toHaveLength(1);
    expect(named("photos_picked")).toEqual([{ count: 3 }]);
    expect(named("error_shown")).toEqual([{ code: "photo_unreadable" }]);
    expect(named("layout_chosen")).toHaveLength(1);
    expect(named("layout_saved")).toHaveLength(1);
    const exported = named("collage_exported");
    expect(exported.map((p) => p!.first)).toEqual([true, false, false]);
    expect(exported.map((p) => p!.format)).toEqual(["jpeg", "jpeg", "jpeg"]);
    expect(exported[2]!.layout).toBe("custom");
    const shared = named("collage_shared");
    expect(shared.map((p) => p!.first)).toEqual([true, false, false]);
    expect(shared.map((p) => p!.method)).toEqual(["download", "download", "download"]);
    expect(shared[2]!.layout).toBe("custom");
    expect(named("control_pressed").map((p) => p!.control)).toEqual([
      "tool_style",
      "tool_layouts",
      "share",
      "share",
      "edit_layout",
      "share",
      "start_over",
    ]);
  });
});

test.describe("policy notice", () => {
  const notice = (page: Page) => page.getByText(/We now count how the app is used/);

  test.describe("usage on", () => {
    test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });

    test("AC-USAGE-09 shows the notice with a link to the policy, then stops on its date", async ({ page, context }) => {
      await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
      await page.goto("/");
      await expect(notice(page)).toBeVisible();
      const [policy] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "privacy policy" }).click()]);
      await expect(policy).toHaveURL(/\/privacy$/);
      await expect(policy.getByRole("heading", { level: 1, name: "StoryStitch privacy policy" })).toBeVisible();

      await page.clock.setFixedTime(new Date("2100-01-01T12:00:00Z"));
      await page.reload();
      await expect(libraryInput(page)).toBeAttached();
      await expect(notice(page)).toHaveCount(0);
    });
  });

  test("AC-USAGE-09 doesn't show the notice in a build with usage off", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-05T12:00:00Z"));
    await page.goto("/");
    await expect(libraryInput(page)).toBeAttached();
    await expect(notice(page)).toHaveCount(0);
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
