import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ACCOUNTS_PORT, API_PORT, PORT } from "../playwright.config.js";
import { exportImage, libraryInput, makePhotos, openApp } from "./helpers.js";

const API = `http://localhost:${API_PORT}`;
const PASSWORD = "correct horse battery";

// The build with accounts switched on (as on staging), talking to a real API and local Postgres.
test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });
test.beforeEach(({ page }) => openApp(page));

/** The link in the latest email the API "sent" to `to` (kept in memory by its test transport). */
async function emailedLink(page: Page, to: string) {
  let link = "";
  await expect
    .poll(async () => {
      const res = await page.request.get(`${API}/test/emails/latest?to=${encodeURIComponent(to)}`);
      if (!res.ok()) return "";
      link = ((await res.json()) as { text: string }).text.match(/https?:\/\/\S+/)?.[0] ?? "";
      return link;
    })
    .not.toBe("");
  return link;
}

/** Submits a bot-checked form once Turnstile (Cloudflare's always-pass test key) has issued a token. */
async function submit(page: Page, name: string) {
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.click();
}

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

test("AC-AUTH-01 making and exporting a collage never asks you to sign in", async ({ page }) => {
  const authCalls: string[] = [];
  page.on("request", (r) => r.url().startsWith(API) && authCalls.push(r.url()));
  await libraryInput(page).setInputFiles(await makePhotos(page, 3));
  await exportImage(page);
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByText(/sign in/i)).toHaveCount(0);
  expect(authCalls).toEqual([]);
});

test.describe("accounts switched off", () => {
  test.use({ baseURL: `http://localhost:${PORT}` });

  test("AC-API-03 shows no account features and never calls the API", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (r) => r.url().startsWith(API) && apiCalls.push(r.url()));
    await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
    await libraryInput(page).setInputFiles(await makePhotos(page, 3));
    await exportImage(page);
    await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);

    await page.goto("/account");
    await expect(libraryInput(page)).toBeAttached(); // just the app, no account screen
    await expect(page.getByRole("heading", { name: "Account" })).toHaveCount(0);
    expect(apiCalls).toEqual([]);
  });
});
