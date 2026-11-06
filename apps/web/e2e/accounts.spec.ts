import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ACCOUNTS_PORT, PORT } from "../playwright.config.js";
import { API, PASSWORD, emailedLink, exportImage, libraryInput, makePhotos, openApp, submit } from "./helpers.js";


// The build with accounts switched on (as on staging), talking to a real API and local Postgres.
test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });
test.beforeEach(({ page }) => openApp(page));

async function signUp(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await submit(page, "Create account");
  await expect(page.getByText(/Check your email/)).toBeVisible();
  return email;
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/account");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await submit(page, "Sign in");
}

const signedInAs = (page: Page, email: string) => expect(page.getByText(`Signed in as ${email}`)).toBeVisible();

test("AC-AUTH-05 AC-AUTH-06 sign up, confirm by email, stay signed in across reloads, sign in again", async ({ page }) => {
  const email = await signUp(page);

  // Not confirmed yet: signing in explains what to do.
  await signIn(page, email);
  await expect(page.getByText(/Please confirm your email first/)).toBeVisible();

  await page.goto(await emailedLink(page, email));
  await expect(page).toHaveURL(/\/account\?welcome=1$/);
  await expect(page.getByText("Your email is confirmed and you're signed in.")).toBeVisible();
  await signedInAs(page, email);

  await page.reload();
  await signedInAs(page, email);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await signIn(page, email);
  await signedInAs(page, email);
});

test("AC-A11Y-03 the account screens' links are at least 44 px tall", async ({ page }) => {
  for (const [path, names] of [
    ["/account", ["Back to StoryStitch", "Forgot your password?", "Create an account", "Privacy policy", "Support"]],
    ["/sign-up", ["Sign in"]],
  ] as const) {
    await page.goto(path);
    for (const name of names) expect((await page.getByRole("link", { name, exact: true }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

test("AC-AUTH-05 reset a forgotten password by email", async ({ page }) => {
  const email = await signUp(page);
  await page.goto(await emailedLink(page, email));
  await page.getByRole("button", { name: "Sign out", exact: true }).click();

  await page.goto("/reset-password");
  await page.getByLabel("Email").fill(email);
  await submit(page, "Send reset link");
  await expect(page.getByText(/we sent it a link to choose a new password/)).toBeVisible();

  await page.goto(await emailedLink(page, email));
  await expect(page).toHaveURL(/\/reset-password\?token=/);
  await page.getByLabel(/New password/).fill("a brand new password");
  await page.getByRole("button", { name: "Set new password" }).click();
  await expect(page.getByText(/Your password is changed/)).toBeVisible();

  await signIn(page, email, "a brand new password");
  await signedInAs(page, email);
});

test("AC-AUTH-07 sign out on every device", async ({ page, browser }) => {
  const email = await signUp(page);
  await page.goto(await emailedLink(page, email));

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, email);
  await signedInAs(otherPage, email);

  await page.getByRole("button", { name: "Sign out on every device" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await otherPage.reload();
  await expect(otherPage.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await other.close();
});

test("AC-AUTH-08 delete the account with its password", async ({ page }) => {
  const email = await signUp(page);
  await page.goto(await emailedLink(page, email));

  await page.getByText("Delete account").click();
  await page.getByLabel("Your password").fill("not my password");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("That password isn't right.")).toBeVisible();

  await page.getByLabel("Your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText(/Your account and everything in it have been deleted/)).toBeVisible();

  await signIn(page, email);
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
});

test("AC-AUTH-11 a lost connection says so, and the form can be tried again", async ({ page }) => {
  await page.goto("/account");
  await page.getByLabel("Email").fill("someone@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.route("**/api/auth/sign-in/email", (route) => route.abort());
  await submit(page, "Sign in");
  await expect(page.getByRole("alert").filter({ hasText: "Couldn't reach StoryStitch" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("AC-PRIV-03 the privacy and support pages are public, and the Account screen links to them", async ({ page }) => {
  await page.goto("/account");
  await expect(page.getByRole("link", { name: "Privacy policy" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Support" })).toBeVisible();

  await page.goto("/privacy");
  await expect(page.getByRole("heading", { level: 1, name: "StoryStitch privacy policy" })).toBeVisible();
  await page.goto("/support");
  await expect(page.getByRole("heading", { level: 1, name: "StoryStitch support" })).toBeVisible();
});

test("AC-AUTH-12 the bot check page holds only the check and passes its token to the iOS app", async ({ page }) => {
  test.skip(process.env.E2E_TARGET !== "app", "apps/web has no /bot-check page");
  // Stands in for the iOS app's WebView.
  await page.addInitScript(() => {
    const sent: string[] = [];
    Object.assign(window, { sent, ReactNativeWebView: { postMessage: (message: string) => sent.push(message) } });
  });
  await page.goto("/bot-check");
  await expect.poll(() => page.evaluate(() => (window as unknown as { sent: string[] }).sent[0] ?? ""), { timeout: 20_000 }).not.toBe("");
  await expect(page.getByRole("heading")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("AC-AUTH-04 a second try waits for a new bot check token", async ({ page }) => {
  test.skip(process.env.E2E_TARGET !== "app", "apps/web is staying as it is until it's replaced");
  // Cloudflare's test key always gives the same token, so this stands in for Turnstile with a new one each time.
  await page.route("**/turnstile/v0/api.js*", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: `window.turnstile = {
        count: 0,
        issue() { this.options.callback("token-" + ++this.count); },
        render(el, options) { this.options = options; this.issue(); return "widget"; },
        reset() { setTimeout(() => this.issue(), 800); },
        remove() {},
      };`,
    }),
  );
  const tokens: string[] = [];
  page.on("request", (r) => r.url().endsWith("/sign-in/email") && tokens.push(r.headers()["x-captcha-response"] ?? ""));
  await page.goto("/account");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill(PASSWORD);
  const signIn = page.getByRole("button", { name: "Sign in", exact: true });
  await signIn.click();
  await expect(page.getByText("That email and password don't match.")).toBeVisible();
  await expect(signIn).toBeDisabled();
  await expect(signIn).toBeEnabled();
  await signIn.click();
  await expect.poll(() => tokens).toEqual(["token-1", "token-2"]);
});

test("AC-AUTH-01 making and exporting a collage never asks you to sign in", async ({ page }) => {
  const authCalls: string[] = [];
  page.on("request", (r) => r.url().startsWith(`${API}/api/auth`) && authCalls.push(r.url()));
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await exportImage(page);
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByText(/sign in/i)).toHaveCount(0);
  expect(authCalls).toEqual([]);
});

test("AC-RANK-05 an export counts its layout, sending nothing but the layout's id", async ({ page }) => {
  const totals = async () => {
    const { exports } = (await (await page.request.get(`${API}/layouts/popularity`)).json()) as { exports: Record<string, number> };
    return exports;
  };
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({ timeout: 30_000 });
  const before = await totals();
  const sent = page.waitForRequest((r) => r.url().startsWith(`${API}/layouts/`) && r.method() === "POST");
  await exportImage(page);
  const request = await sent;
  expect(request.postData()).toBeNull();
  expect(await request.headerValue("cookie")).toBeNull();
  const id = decodeURIComponent(new URL(request.url()).pathname.split("/")[2]!);
  await expect.poll(async () => (await totals())[id] ?? 0).toBe((before[id] ?? 0) + 1);
});

test.describe("accounts switched off", () => {
  test.use({ baseURL: `http://localhost:${PORT}` });

  test("AC-API-03 shows no account features and never calls the API", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (r) => r.url().startsWith(API) && apiCalls.push(r.url()));
    await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
    await libraryInput(page).setInputFiles(await makePhotos(page, 3));
    await expect(page.getByRole("button", { name: "Edit this layout" })).toHaveCount(0); // the layout editor needs accounts
    await exportImage(page);
    await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);

    await page.goto("/account");
    await expect(libraryInput(page)).toBeAttached(); // just the app, no account screen
    await expect(page.getByRole("heading", { name: "Account" })).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });
});
