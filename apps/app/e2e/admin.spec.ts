import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { join } from "node:path";
import { ACCOUNTS_PORT } from "../playwright.config.js";
import { PASSWORD, emailedLink, openApp, submit, totpCode } from "./helpers.js";

// The build with accounts and the admin dashboard switched on, talking to the e2e API (ADMIN_ENABLED) and local Postgres.
test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });
test.beforeEach(({ page }) => openApp(page));

const desktop = { width: 1280, height: 800 };

/** Signs up a new account and confirms its email, which also signs it in. */
async function newAccount(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await submit(page, "Create account");
  await expect(page.getByText(/Check your email/)).toBeVisible();
  await page.goto(await emailedLink(page, email));
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  return email;
}

/** Marks one account as an admin, the way an owner does: by hand in SQL, scoped to that email. */
async function makeAdmin(email: string) {
  // The API package owns the database driver, so borrow it rather than adding a dependency here.
  const { Pool } = createRequire(join(__dirname, "../../api/package.json"))("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL ?? "postgres://app:app@localhost:5432/app" });
  try {
    await pool.query('update "user" set is_admin = true where email = $1', [email]);
  } finally {
    await pool.end();
  }
}

async function enterCode(page: Page, secret: string) {
  await page.getByLabel("Authenticator code").fill(totpCode(secret));
  await page.getByRole("button", { name: "Verify", exact: true }).click();
}

/** An admin account that has set up its authenticator and is looking at the dashboard. Returns its email and secret. */
async function adminDashboard(page: Page) {
  const email = await newAccount(page);
  await makeAdmin(email);
  await page.goto("/admin");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Set up", exact: true }).click();
  const secret = (await page.locator(".secret").textContent())!;
  await enterCode(page, secret);
  await expect(page.getByRole("heading", { name: "Daily totals" })).toBeVisible();
  return { email, secret };
}

test("AC-ADMIN-03 an ordinary account is refused the dashboard", async ({ page }) => {
  await page.setViewportSize(desktop);
  await newAccount(page);
  await page.goto("/admin");
  await expect(page.getByText("This account can't open the admin dashboard.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily totals" })).toHaveCount(0);
});

test("AC-ADMIN-03 an admin sets up an authenticator, and signing in again needs its code", async ({ page }) => {
  await page.setViewportSize(desktop);
  const { email, secret } = await adminDashboard(page);

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await submit(page, "Sign in");
  // The password alone opens nothing: the code is asked for next.
  await expect(page.getByLabel("Authenticator code")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily totals" })).toHaveCount(0);
  await page.getByLabel("Authenticator code").fill("000000");
  await page.getByRole("button", { name: "Verify", exact: true }).click();
  await expect(page.getByText(/That code isn't right/)).toBeVisible();
  await enterCode(page, secret);
  await expect(page.getByRole("heading", { name: "Daily totals" })).toBeVisible();
});

test("AC-ADMIN-04 the dashboard shows daily totals, the funnel, top layouts and errors", async ({ page }) => {
  await page.setViewportSize(desktop);
  await adminDashboard(page);

  for (const name of ["Daily totals", "Funnel", "Top layouts (all time)", "Errors by code"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
  // Thirty days by default, each with a number in every column.
  const days = page.getByRole("table").first().locator("tbody tr");
  await expect(days).toHaveCount(30);
  await expect(days.first().locator("td")).toHaveCount(8);
  for (const cell of await days.first().locator("td").allTextContents()) expect(cell).toMatch(/^\d+$/);
  for (const step of ["Photos picked", "Exported", "Saved"]) await expect(page.getByText(step, { exact: true })).toBeVisible();
  await expect(page.getByText(/of picked/)).toBeVisible();

  await page.getByRole("button", { name: "7 days" }).click();
  await expect(days).toHaveCount(7);
  await page.getByRole("button", { name: "90 days" }).click();
  await expect(days).toHaveCount(90);
});

test("AC-ADMIN-05 at phone width the dashboard asks for a desktop", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/admin");
  await expect(page.getByText("Open the admin dashboard on a desktop.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveCount(0);
});
