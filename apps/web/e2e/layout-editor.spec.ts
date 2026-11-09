import { expect, test, type Locator, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ACCOUNTS_PORT } from "../playwright.config.js";
import { API, PASSWORD, emailedLink, exportImage, libraryInput, makePhotos, openApp, submit } from "./helpers.js";

// The build with accounts and the layout editor switched on (as on staging), with a real API and local Postgres.
test.use({ baseURL: `http://localhost:${ACCOUNTS_PORT}` });
test.beforeEach(({ page }) => openApp(page));

/** Fills in the sign-up form for a new account; returns its email. */
async function fillSignUp(page: Page) {
  const email = `e2e-${randomUUID()}@example.com`;
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(/^Password/).fill(PASSWORD);
  await submit(page, "Create account");
  await expect(page.getByText(/Check your email/)).toBeVisible();
  return email;
}

/** A confirmed, signed-in account (confirmed by following the emailed link). */
async function signedIn(page: Page) {
  await page.goto("/sign-up");
  const email = await fillSignUp(page);
  await page.goto(await emailedLink(page, email));
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  await page.goto("/");
}

async function pickPhotos(page: Page, n: number) {
  await libraryInput(page).setInputFiles(await makePhotos(page, n));
  await expect(page.getByRole("radiogroup", { name: "Layouts" })).toBeVisible({ timeout: 30_000 });
}

const editor = (page: Page) => page.getByRole("dialog", { name: /of \d+ photos/ });

/** Drags a handle by (dx, dy) CSS px, in small steps like a finger. */
async function drag(page: Page, target: Locator, dx: number, dy: number) {
  const box = (await target.boundingBox())!;
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up();
}

/** Taps the preview at a fraction of its width and height. */
async function tapAt(page: Page, fx: number, fy: number) {
  const canvas = editor(page).locator("canvas");
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(100); // sized to the screen
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
}

async function saveAs(page: Page, name: string, button = "Save layout") {
  await editor(page).getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: button }).click();
  await expect(editor(page)).toHaveCount(0);
  await expect(page.getByRole("radio", { name: `${name} (yours)` })).toHaveAttribute("aria-checked", "true");
}

const savedLayouts = async (page: Page) =>
  ((await (await page.request.get(`${API}/layouts/mine`)).json()) as { layouts: { name: string; layout: { cells: Record<string, number>[] } }[] })
    .layouts;

test.describe("without an account", () => {
  test.skip(process.env.E2E_TARGET !== "app", "apps/web still asks for an account first");

  test("AC-CUSTOM-01 AC-CUSTOM-11 opens, and the edited layout goes in the collage and exports", async ({ page }) => {
    await pickPhotos(page, 3);
    const edit = page.getByRole("button", { name: "Edit this layout" });
    await expect(edit).toHaveCSS("background-color", "rgb(255, 194, 75)"); // gold, to stand out
    await page.getByRole("radio", { name: "Three stacked", exact: true }).click();
    await edit.click();
    const e = editor(page);
    await expect(e.getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();
    const line = e.getByRole("separator", { name: "Line between rows" }).first();
    await drag(page, line, 0, 60);
    await e.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText(/no account needed/)).toBeVisible();
    await page.getByRole("button", { name: "Use this layout" }).click();
    await expect(e).toHaveCount(0);

    const unsaved = page.getByRole("radio", { name: "Edited layout (yours)" });
    await expect(unsaved).toHaveAttribute("aria-checked", "true");
    await page.getByRole("radio", { name: "Three stacked", exact: true }).click();
    await unsaved.click(); // still there after trying another layout
    await expect(unsaved).toHaveAttribute("aria-checked", "true");

    const counted: string[] = [];
    page.on("request", (r) => r.url().endsWith("/exports") && counted.push(r.url()));
    await exportImage(page);
    await page.waitForTimeout(300);
    expect(counted).toEqual([]);
  });

  test("AC-CUSTOM-11 creating an account comes back to the layout, ready to save", async ({ page, context }) => {
    await pickPhotos(page, 3);
    await page.getByRole("button", { name: "Edit this layout" }).click();
    await editor(page).getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Create account to save" }).click();
    await expect(page).toHaveURL(/\/sign-up$/);
    const email = await fillSignUp(page);

    // They confirm in another tab (their mail app), then come back: the collage and the editor are waiting.
    const mail = await context.newPage();
    await mail.goto(await emailedLink(page, email));
    await mail.close();
    await page.getByRole("link", { name: "Back to StoryStitch" }).click();
    await expect(editor(page).getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();
    await page.getByLabel("Name").fill("Kept");
    await page.getByRole("button", { name: "Save layout" }).click();
    await expect(editor(page)).toHaveCount(0);
    expect((await savedLayouts(page)).map((l) => l.name)).toEqual(["Kept"]);
  });
});

test("AC-CUSTOM-02 AC-CUSTOM-05 AC-CUSTOM-06 AC-CUSTOM-07 reworks a grid by removing and splitting cells and dragging a line, then saves it", async ({ page }) => {
  await signedIn(page);
  await pickPhotos(page, 3);
  await page.getByRole("radio", { name: "Three stacked", exact: true }).click();
  await page.getByRole("button", { name: "Edit this layout" }).click();
  const e = editor(page);
  await tapAt(page, 0.5, 0.5); // the middle row
  await e.getByRole("button", { name: "Remove" }).click();
  await expect(e.getByRole("heading", { name: "2 of 3 photos" })).toBeVisible();
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Split one more cell to fit 3 photos.");

  await tapAt(page, 0.5, 0.18); // the top row, clear of the line below it
  await e.getByRole("button", { name: "Split down" }).click();
  await expect(e.getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();

  const line = e.getByRole("separator", { name: "Line between rows" });
  const before = Number(await line.getAttribute("aria-valuenow"));
  await drag(page, line, 0, 60);
  await expect.poll(async () => Number(await line.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
  await e.getByRole("button", { name: "Undo" }).click();
  await expect(line).toHaveAttribute("aria-valuenow", String(before));
  await drag(page, line, 0, 60);

  await saveAs(page, "Two over one");
  const [saved] = await savedLayouts(page);
  expect(saved!.name).toBe("Two over one");
  expect(saved!.layout.cells).toHaveLength(3);
});

test("AC-CUSTOM-06 draws nothing over the photos", async ({ page }) => {
  test.skip(process.env.E2E_TARGET !== "app", "apps/web keeps its bands until it's replaced");
  await signedIn(page);
  await pickPhotos(page, 3);
  await page.getByRole("button", { name: "Edit this layout" }).click();
  await expect(editor(page).getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();
  await expect(page.getByText("Instagram's buttons")).toHaveCount(0);
});

test("AC-CUSTOM-03 drags the shared corner of a slanted layout", async ({ page }) => {
  await signedIn(page);
  await pickPhotos(page, 4);
  await page.getByRole("radio", { name: "Pinwheel", exact: true }).click();
  await page.getByRole("button", { name: "Edit this layout" }).click();
  const corner = editor(page).getByRole("button", { name: /^Corner/ });
  await expect(corner).toHaveCount(1); // the middle: the canvas corners stay put
  const start = (await corner.boundingBox())!;
  await drag(page, corner, 30, -50);
  const end = (await corner.boundingBox())!;
  expect(end.x - start.x).toBeGreaterThan(20);
  expect(start.y - end.y).toBeGreaterThan(35);
  await saveAs(page, "Off-center pinwheel");
});

test("AC-CUSTOM-04 AC-CUSTOM-07 moves and resizes a circle, then edits and deletes the saved layout", async ({ page }) => {
  await signedIn(page);
  await pickPhotos(page, 4);
  await page.getByRole("radio", { name: "Four circles", exact: true }).click();
  await page.getByRole("button", { name: "Edit this layout" }).click();
  const e = editor(page);
  await tapAt(page, 0.33, 0.25); // the first circle
  await expect(e.getByRole("button", { name: "Resize photo 1" })).toBeVisible();
  await e.getByRole("button", { name: "Smaller" }).click();
  await e.getByRole("button", { name: "Smaller" }).click();
  // Drag the circle itself: down and to the left.
  const canvas = (await e.locator("canvas").boundingBox())!;
  const [x, y] = [canvas.x + canvas.width * 0.33, canvas.y + canvas.height * 0.25];
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x - i * 2, y + i * 4);
  await page.mouse.up();
  await saveAs(page, "Small circle");
  const [saved] = await savedLayouts(page);
  // The first circle started at (0.3, 0.18) with r 0.27.
  expect(saved!.layout.cells[0]!.r).toBeLessThan(0.27);
  expect(saved!.layout.cells[0]!.cy).toBeGreaterThan(0.18);
  expect(saved!.layout.cells[0]!.cx).toBeLessThan(0.3);

  // Editing a saved layout replaces it; deleting it takes it out of the strip and the account.
  await page.getByRole("button", { name: "Edit this layout" }).click();
  await tapAt(page, 0.3, 0.27);
  await expect(e.getByRole("button", { name: "Resize photo 1" })).toBeVisible();
  await e.getByRole("button", { name: "Bigger" }).click();
  await saveAs(page, "Small circle", "Save changes");
  expect(await savedLayouts(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Small circle (yours)" })).toHaveCount(0);
  expect(await savedLayouts(page)).toHaveLength(0);
});

/** A primary, a secondary at the same full width below it, and quiet actions in one row below that. */
async function expectActions(page: Page, primary: string, secondary: string, quiet: string[]) {
  const box = async (name: string) => (await page.getByRole("button", { name, exact: true }).boundingBox())!;
  const [first, second] = [await box(primary), await box(secondary)];
  expect(first.width).toBeGreaterThan(300);
  expect(second).toMatchObject({ x: first.x, width: first.width });
  expect(second.y).toBeGreaterThan(first.y);
  await expect(page.getByRole("button", { name: primary, exact: true })).toHaveCSS("background-color", "rgb(255, 194, 75)");
  const row = (await box(quiet[0]!)).y;
  expect(row).toBeGreaterThan(second.y);
  for (const name of quiet) {
    const { y, height } = await box(name);
    expect(y).toBe(row);
    expect(height).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name, exact: true }).getByText(name)).toHaveCSS("font-size", "14px");
  }
}

test("AC-MOBILE-05 grouped actions keep to one hierarchy at phone width", async ({ page }) => {
  test.skip(process.env.E2E_TARGET !== "app", "apps/web still asks for an account first, and is staying as it is until it's replaced");
  await page.setViewportSize({ width: 375, height: 812 });
  await pickPhotos(page, 3);
  await page.getByRole("radio", { name: "Three stacked", exact: true }).click();
  await page.getByRole("button", { name: "Edit this layout" }).click();
  const e = editor(page);
  await tapAt(page, 0.5, 0.2);
  // Tools of equal rank: even rows of equal widths.
  const tools = await Promise.all(["Split across", "Split down", "Shape", "Remove"].map(async (name) => (await e.getByRole("button", { name }).boundingBox())!));
  expect(new Set(tools.map((t) => t.width)).size).toBe(1);
  expect(tools[1]!.y).toBe(tools[0]!.y);
  expect(tools[3]!.y).toBe(tools[2]!.y);

  await e.getByRole("button", { name: "Done" }).click();
  await expectActions(page, "Use this layout", "Create account to save", ["Sign in", "Keep editing"]);

  await signedIn(page);
  await pickPhotos(page, 3);
  await page.getByRole("radio", { name: "Three stacked", exact: true }).click();
  await page.getByRole("button", { name: "Edit this layout" }).click();
  await e.getByRole("button", { name: "Done" }).click();
  await expectActions(page, "Save layout", "Use without saving", ["Keep editing"]);
  // The longest name allowed, saved with Enter: there's no submit button in the form to do it.
  const name = "A layout name that takes up forty places";
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Name").press("Enter");
  await expect(e).toHaveCount(0);

  // Delete is quiet until it's asked to confirm, then filled, and all of that stays on one line.
  const remove = page.getByRole("button", { name: "Delete", exact: true });
  await expect(remove.getByText("Delete")).toHaveCSS("color", "rgb(255, 143, 143)");
  await remove.click();
  await expect(remove).toHaveCSS("background-color", "rgb(255, 143, 143)");
  const line = async (l: Locator) => {
    const { y, height } = (await l.boundingBox())!;
    return y + height / 2;
  };
  const middle = await line(remove);
  expect(await line(page.getByRole("button", { name: "Keep", exact: true }))).toBe(middle);
  const question = page.getByText(`Delete ${name}?`);
  expect(await line(question)).toBe(middle);
  expect((await question.boundingBox())!.height).toBeLessThan(30);
});

test("AC-CUSTOM-05 fills the screen and keeps every handle thumb-sized", async ({ page }) => {
  await signedIn(page);
  await pickPhotos(page, 6);
  await page.getByRole("radio", { name: "Six slants", exact: true }).click();
  await page.getByRole("button", { name: "Edit this layout" }).click();
  const e = editor(page);
  const viewport = page.viewportSize()!;
  const canvas = e.locator("canvas");
  // The editor sizes itself just after it opens, so wait for that instead of reading it once.
  await expect.poll(async () => (await canvas.boundingBox())?.height ?? 0).toBeGreaterThan(viewport.height * 0.6);
  const handles = e.getByTestId("builder-handle");
  expect(await handles.count()).toBeGreaterThan(3);
  for (const handle of await handles.all()) {
    const box = (await handle.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  for (const button of await e.getByRole("button").all()) {
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
