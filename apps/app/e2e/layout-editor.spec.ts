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

/** Where a fraction of the editor's canvas is on screen now: the tools under it change, and it fits the space left. */
async function canvasAt(page: Page, fx: number, fy: number) {
  const canvas = editor(page).locator("canvas.builder-canvas");
  await expect.poll(async () => (await canvas.boundingBox())?.width ?? 0).toBeGreaterThan(100);
  let box = (await canvas.boundingBox())!;
  for (let again = true; again; ) {
    await page.waitForTimeout(150); // until it has stopped resizing
    const now = (await canvas.boundingBox())!;
    again = now.width !== box.width || now.height !== box.height;
    box = now;
  }
  return [box.x + box.width * fx, box.y + box.height * fy] as const;
}

/** A mouse drag in small steps, like a finger. */
async function sweep(page: Page, from: readonly [number, number], to: readonly [number, number]) {
  await page.mouse.move(...from);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(from[0] + ((to[0] - from[0]) * i) / 10, from[1] + ((to[1] - from[1]) * i) / 10);
  await page.mouse.up();
}

async function openBlank(page: Page, photos: number) {
  await pickPhotos(page, photos);
  await page.getByRole("button", { name: "Start from blank" }).click();
  return editor(page);
}

/** Adds shapes from the palette: the first goes in the middle, the next two in the top left and top right. Each is chosen when added, so this lets go of it, which brings the palette back. */
async function addShapes(e: Locator, ...shapes: string[]) {
  const page = e.page();
  for (const shape of shapes) {
    await e.getByRole("button", { name: `Add ${shape.toLowerCase()}`, exact: true }).click();
    await page.mouse.click(...(await canvasAt(page, 0.03, 0.97)));
  }
}
const SPOTS = { middle: [0.5, 0.5], topLeft: [0.26, 0.26], topRight: [0.74, 0.26] } as const;

/** Drags a tray photo (1 is the first) to a fraction of the canvas. */
async function dragPhoto(page: Page, photo: number, to: readonly [number, number]) {
  const thumb = editor(page).getByRole("button", { name: new RegExp(`^Photo ${photo},`) });
  const box = (await thumb.boundingBox())!;
  await sweep(page, [box.x + box.width / 2, box.y + box.height / 2], await canvasAt(page, to[0], to[1]));
}
const trayPhoto = (e: Locator, photo: number, state: string) => e.getByRole("button", { name: `Photo ${photo}, ${state}` });

test("AC-CUSTOM-12 starts from an empty canvas: no splitting, and shapes of your own", async ({ page }) => {
  await signedIn(page);
  const e = await openBlank(page, 3);
  await expect(e.getByRole("heading", { name: "0 of 3 photos" })).toBeVisible();
  await expect(e.getByRole("status")).toHaveText("Add a shape or drag on the canvas to draw one.");
  for (const name of ["Split across", "Split down", "Shape", "Grid", "Shapes"]) await expect(e.getByRole("button", { name, exact: true })).toHaveCount(0);
  await expect(e.getByRole("radio")).toHaveCount(0);
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Add a shape or drag on the canvas to draw one.");

  await addShapes(e, "Rectangle", "Circle", "Heart");
  for (const [n, spot] of [[1, SPOTS.middle], [2, SPOTS.topLeft], [3, SPOTS.topRight]] as const) {
    await trayPhoto(e, n, "not placed").click();
    await page.mouse.click(...(await canvasAt(page, spot[0], spot[1])));
  }
  await expect(e.getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();
  await saveAs(page, "From blank");
  const [saved] = await savedLayouts(page);
  expect(saved!.layout.cells).toHaveLength(3);
});

test("AC-CUSTOM-13 adds shapes from the picker: empty, and undoable", async ({ page }) => {
  const e = await openBlank(page, 3);
  await addShapes(e, "Circle");
  await expect(e.getByRole("heading", { name: "0 of 3 photos" })).toBeVisible();
  await expect(e.getByRole("status")).toHaveText("Add 2 more shapes, then drag photos into them.");
  await addShapes(e, "Heart", "Star");
  await expect(e.getByRole("status")).toHaveText("Drag 3 more photos into shapes.");
  await e.getByRole("button", { name: "Undo" }).click(); // takes the star away
  await expect(e.getByRole("status")).toHaveText("Undone.");
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Add 1 more shape, then drag photos into them.");
  await addShapes(e, "Rectangle");
  await expect(e.getByRole("status")).toHaveText("Drag 3 more photos into shapes.");
});

test("AC-CUSTOM-14 draws a shape by dragging on empty space; too small isn't added", async ({ page }) => {
  const e = await openBlank(page, 3);
  await expect(e.getByRole("status")).toContainText("drag on the canvas to draw one");
  await sweep(page, await canvasAt(page, 0.1, 0.12), await canvasAt(page, 0.6, 0.14)); // too thin to be a photo
  await expect(e.getByRole("status")).toContainText("too small");
  await expect(e.getByRole("status")).not.toContainText("Add 2 more");

  await sweep(page, await canvasAt(page, 0.85, 0.2), await canvasAt(page, 0.15, 0.3)); // dragged backwards
  await expect(e.getByRole("status")).toHaveText("Add 2 more shapes, then drag photos into them.");
  await sweep(page, await canvasAt(page, 0.1, 0.75), await canvasAt(page, 0.9, 0.9));
  await expect(e.getByRole("status")).toHaveText("Add 1 more shape, then drag photos into them.");
  await e.getByRole("button", { name: "Undo" }).click();
  await expect(e.getByRole("status")).toHaveText("Undone.");

  await page.mouse.click(...(await canvasAt(page, 0.9, 0.5))); // a tap on empty space draws nothing
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Add 2 more shapes, then drag photos into them.");
});

test("AC-CUSTOM-15 drags photos from the tray into shapes, replaces and moves them, then uses the layout", async ({ page }) => {
  const e = await openBlank(page, 3);
  await addShapes(e, "Rectangle", "Circle", "Heart");
  await expect(e.getByRole("group", { name: "Your photos" }).getByRole("button")).toHaveCount(3);
  for (const n of [1, 2, 3]) await expect(trayPhoto(e, n, "not placed")).toBeVisible();

  await dragPhoto(page, 1, SPOTS.middle);
  await expect(trayPhoto(e, 1, "placed")).toBeVisible();
  await expect(e.getByRole("heading", { name: "1 of 3 photos" })).toBeVisible();
  await dragPhoto(page, 2, SPOTS.topLeft);
  await dragPhoto(page, 3, SPOTS.middle); // onto a filled shape: replaces photo 1
  await expect(trayPhoto(e, 1, "not placed")).toBeVisible();
  await expect(e.getByRole("heading", { name: "2 of 3 photos" })).toBeVisible();
  await dragPhoto(page, 1, [-0.05, 0.5]); // off the canvas: nothing
  await expect(trayPhoto(e, 1, "not placed")).toBeVisible();
  await dragPhoto(page, 2, SPOTS.topRight); // placed elsewhere: moves, and its old shape is empty
  await expect(e.getByRole("heading", { name: "2 of 3 photos" })).toBeVisible();
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Drag 1 more photo into shapes.");
  await dragPhoto(page, 1, SPOTS.topLeft);
  await expect(e.getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();

  await e.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Use this layout" }).click();
  await expect(e).toHaveCount(0);
  await expect(page.getByRole("application", { name: /^Story preview: .*, 3 photos$/ })).toBeVisible();
});

test("AC-CUSTOM-15 taps a photo, then a shape, and takes a photo out again", async ({ page }) => {
  const e = await openBlank(page, 3);
  await addShapes(e, "Rectangle", "Circle", "Heart");
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Drag 3 more photos into shapes.");

  await trayPhoto(e, 2, "not placed").click();
  await expect(e.getByRole("button", { name: "Photo 2, picked up" })).toHaveAttribute("aria-pressed", "true");
  await expect(e.getByRole("status")).toHaveText("Tap a shape to put this photo in it.");
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.topLeft)));
  await expect(trayPhoto(e, 2, "placed")).toBeVisible();
  await expect(e.getByRole("heading", { name: "1 of 3 photos" })).toBeVisible();

  await e.getByRole("button", { name: "Take photo out" }).click(); // the shape is still chosen
  await expect(trayPhoto(e, 2, "not placed")).toBeVisible();
  await expect(e.getByRole("button", { name: "Take photo out" })).toHaveCount(0);

  for (const [n, spot] of [[1, SPOTS.middle], [2, SPOTS.topLeft], [3, SPOTS.topRight]] as const) {
    await trayPhoto(e, n, "not placed").click();
    await page.mouse.click(...(await canvasAt(page, spot[0], spot[1])));
  }
  await expect(e.getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();
  await e.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(/no account needed/)).toBeVisible();
});

/** Drags a palette shape (by its "Add ..." label) onto a fraction of the canvas. */
async function dragShape(page: Page, label: string, to: readonly [number, number]) {
  const box = (await editor(page).getByRole("button", { name: label, exact: true }).boundingBox())!;
  await sweep(page, [box.x + box.width / 2, box.y + box.height / 2], await canvasAt(page, to[0], to[1]));
}

test("AC-CUSTOM-13 adds shapes from the palette by tap or drag, changes a shape, and stops at 8", async ({ page }) => {
  const e = await openBlank(page, 3);
  const palette = e.getByRole("group", { name: "Shapes" });
  for (const name of ["rectangle", "square", "circle", "heart", "star", "arch", "pill"]) await expect(palette.getByRole("button", { name: `Add ${name}`, exact: true })).toBeVisible();
  for (const button of await palette.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await expect(e.getByRole("button", { name: "Add shape" })).toHaveCount(0);

  await dragShape(page, "Add star", [0.7, 0.7]); // lands where it's dropped
  await expect(e.getByRole("status")).toHaveText("Add 2 more shapes, then drag photos into them.");
  await expect(palette).toBeVisible(); // not chosen, so the palette stays
  await page.mouse.click(...(await canvasAt(page, 0.7, 0.7)));
  await expect(palette).toHaveCount(0); // a shape is chosen: its tools take the palette's place
  await e.getByRole("button", { name: "Shape", exact: true }).click();
  await e.getByRole("button", { name: "Pill", exact: true }).click(); // changes it, keeping its place
  await expect(e.getByRole("button", { name: "Shape", exact: true })).toBeVisible();
  await e.getByRole("button", { name: "Undo" }).click(); // takes the change back
  await e.getByRole("button", { name: "Undo" }).click(); // and then the shape
  await expect(e.getByRole("status")).toHaveText("Undone.");
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Add a shape or drag on the canvas to draw one.");

  await dragShape(page, "Add circle", [-0.1, 0.5]); // off the canvas: nothing is added
  await expect(e.getByRole("status")).toHaveText("Add a shape or drag on the canvas to draw one.");
  await e.getByRole("button", { name: "Add circle" }).click(); // a tap adds it in the middle
  await expect(e.getByRole("button", { name: "Add heart" })).toBeVisible();

  // Eight in all: then the palette is off.
  for (let n = 2; n <= 8; n++) {
    await page.mouse.click(...(await canvasAt(page, 0.03, 0.97)));
    await dragShape(page, "Add circle", [0.2 + ((n * 0.13) % 0.6), 0.15 + ((n * 0.11) % 0.7)]);
  }
  await page.mouse.click(...(await canvasAt(page, 0.03, 0.97)));
  await expect(e.getByRole("button", { name: "Add circle" })).toBeDisabled();
  await expect(e.getByRole("status")).toContainText("A layout holds up to 8 photos.");
});

test("AC-CUSTOM-16 a photo dropped on empty space makes a shape in its proportions; just beside a shape it goes in that shape", async ({ page }) => {
  await signedIn(page);
  const e = await openBlank(page, 3);
  await dragPhoto(page, 2, [0.3, 0.3]); // a portrait photo
  await expect(trayPhoto(e, 2, "placed")).toBeVisible();
  await expect(e.getByRole("heading", { name: "1 of 3 photos" })).toBeVisible();
  await expect(e.getByRole("status")).toHaveText("Add 2 more shapes, then drag photos into them.");

  // A few px of screen below the shape's lower edge (it ends near 0.41 of the canvas's height): into it, replacing photo 2.
  await dragPhoto(page, 1, [0.3, 0.45]);
  await expect(trayPhoto(e, 2, "not placed")).toBeVisible();
  await expect(trayPhoto(e, 1, "placed")).toBeVisible();
  await expect(e.getByRole("heading", { name: "1 of 3 photos" })).toBeVisible();

  await dragPhoto(page, 3, [0.7, 0.7]); // far from it: a new shape, a square one
  await expect(e.getByRole("heading", { name: "2 of 3 photos" })).toBeVisible();
  await trayPhoto(e, 2, "not placed").click(); // taking a photo by tap, then tapping empty space, does the same
  await page.mouse.click(...(await canvasAt(page, 0.3, 0.85)));
  await expect(e.getByRole("heading", { name: "3 of 3 photos" })).toBeVisible();

  await saveAs(page, "By photo");
  const [saved] = await savedLayouts(page);
  const ratios = saved!.layout.cells.map((c) => (c.w! * 1080) / (c.h! * 1920));
  // Three shapes: the first made for photo 2 (1500x2600), the second for photo 3 (square), the third for photo 2 again.
  expect(ratios).toHaveLength(3);
  expect(ratios[0]).toBeCloseTo(1500 / 2600, 1);
  expect(ratios[1]).toBeCloseTo(1, 1);
  expect(ratios[2]).toBeCloseTo(1500 / 2600, 1);
});

test("AC-CUSTOM-17 tidies shapes that are nearly lined up, and says so when there's nothing to do", async ({ page }) => {
  await signedIn(page);
  const e = await openBlank(page, 2);
  await expect(e.getByRole("button", { name: "Tidy" })).toBeDisabled(); // one shape or none: nothing to line up
  await dragShape(page, "Add circle", [0.3, 0.3]);
  await page.mouse.click(...(await canvasAt(page, 0.03, 0.97)));
  await dragShape(page, "Add circle", [0.33, 0.62]); // a little off line with the first
  await page.mouse.click(...(await canvasAt(page, 0.03, 0.97)));
  await e.getByRole("button", { name: "Tidy" }).click();
  await expect(e.getByRole("status")).not.toHaveText("Already tidy.");
  await e.getByRole("button", { name: "Tidy" }).click();
  await expect(e.getByRole("status")).toHaveText("Already tidy."); // the second time does nothing

  for (const [n, spot] of [[1, [0.3, 0.3]], [2, [0.3, 0.62]]] as const) {
    await trayPhoto(e, n, "not placed").click();
    await page.mouse.click(...(await canvasAt(page, spot[0], spot[1])));
  }
  await saveAs(page, "Tidied");
  const [saved] = await savedLayouts(page);
  const [a, b] = saved!.layout.cells as unknown as { cx: number; r: number }[];
  expect(a!.cx).toBeCloseTo(b!.cx, 3); // one column now
  expect(a!.cx).toBeCloseTo(0.31, 1);
});

/** Two fingers (Chrome only: the harness drives touch through the DevTools Protocol). */
async function twoFingers(page: Page, centre: readonly [number, number], steps: { spread: number; degrees: number }[]) {
  const cdp = await page.context().newCDPSession(page);
  const points = ({ spread, degrees }: { spread: number; degrees: number }) => {
    const a = (degrees * Math.PI) / 180;
    return [
      { x: centre[0] - spread * Math.cos(a), y: centre[1] - spread * Math.sin(a), id: 1 },
      { x: centre[0] + spread * Math.cos(a), y: centre[1] + spread * Math.sin(a), id: 2 },
    ];
  };
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(steps[0]!) });
  for (const step of steps.slice(1)) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(step) });
  return { end: () => cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }) };
}

test("AC-CUSTOM-18 a blank canvas has no size or turn buttons, keeps the palette while adding, and keeps its handles", async ({ page }) => {
  const e = await openBlank(page, 3);
  await e.getByRole("button", { name: "Add rectangle" }).click();
  await expect(e.getByRole("button", { name: "Add circle" })).toBeVisible(); // not chosen: the palette stays
  await e.getByRole("button", { name: "Add circle" }).click();
  await e.getByRole("button", { name: "Add heart" }).click();
  await expect(e.getByRole("status")).toHaveText("Drag 3 more photos into shapes.");

  await page.mouse.click(...(await canvasAt(page, ...SPOTS.middle))); // choose the rectangle
  await expect(e.getByRole("status")).toHaveText("Drag to move. Pinch to resize, twist to turn.");
  for (const name of ["Shape", "Remove"]) await expect(e.getByRole("button", { name, exact: true })).toBeVisible();
  for (const name of ["Bigger", "Smaller", "Turn left", "Turn right"]) await expect(e.getByRole("button", { name, exact: true })).toHaveCount(0);
  for (const name of [/^Resize photo/, /^Turn photo/]) {
    const handle = e.getByRole("button", { name });
    const box = (await handle.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  }
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.topLeft))); // the circle: it can't turn, so only a size hint and no turn handle
  await expect(e.getByRole("status")).toHaveText("Drag to move. Pinch to resize.");
  await expect(e.getByRole("button", { name: /^Turn photo/ })).toHaveCount(0);

  // The handle still resizes, and says by how much while it does.
  const resize = e.getByRole("button", { name: /^Resize photo/ });
  const box = (await resize.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + box.width / 2 + i * 6, box.y + box.height / 2 + i * 6);
  await expect(e.getByRole("status")).toHaveText(/^\d+%$/);
  await page.mouse.up();
});

test("AC-CUSTOM-18 two fingers pinch and twist the chosen shape wherever they are", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Multi-touch is driven through the Chrome DevTools Protocol; the handles above cover the rest");
  await signedIn(page);
  const e = await openBlank(page, 1);
  await e.getByRole("button", { name: "Add rectangle" }).click();
  await trayPhoto(e, 1, "not placed").click();
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.middle)));
  await page.mouse.click(...(await canvasAt(page, 0.03, 0.97))); // let go of it
  // Two fingers away from it, on empty canvas, with nothing chosen: nothing happens to it. Choose it, then pinch and twist elsewhere.
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.middle)));
  const at = await canvasAt(page, 0.5, 0.2);
  const gesture = await twoFingers(page, at, [
    { spread: 30, degrees: 0 },
    { spread: 36, degrees: 5 },
    { spread: 42, degrees: 10 },
    { spread: 48, degrees: 14 },
    { spread: 54, degrees: 15 },
  ]);
  await expect(e.getByRole("status")).toHaveText("Turned 15°");
  await gesture.end();
  await e.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Name").fill("Pinched");
  await page.getByRole("button", { name: "Save layout" }).click();
  await expect(editor(page)).toHaveCount(0);
  const [saved] = await savedLayouts(page);
  const cell = saved!.layout.cells[0] as unknown as { w: number; rotate: number; turn: number };
  expect(cell.turn).toBe(15); // turned, and stuck to a 15° step
  expect(cell.rotate).toBe(0);
  expect(cell.w).toBeGreaterThan(0.36 * 1.5); // 1.8 times as wide
});

test("AC-CUSTOM-19 dragging a shape off the edge removes it, and Undo brings it back", async ({ page }) => {
  const e = await openBlank(page, 3);
  await e.getByRole("button", { name: "Add circle" }).click();
  await e.getByRole("button", { name: "Add heart" }).click();
  await expect(e.getByRole("status")).toHaveText("Add 1 more shape, then drag photos into them.");
  const from = await canvasAt(page, ...SPOTS.topLeft);
  const box = (await e.locator("canvas.builder-canvas").boundingBox())!;
  await sweep(page, from, [box.x - 40, from[1]]); // mostly off the left edge, then let go
  await expect(e.getByRole("status")).toHaveText("Removed. Undo brings it back.");
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Add 2 more shapes, then drag photos into them."); // one shape left
  await e.getByRole("button", { name: "Undo" }).click();
  await e.getByRole("button", { name: "Done" }).click();
  await expect(e.getByRole("status")).toHaveText("Add 1 more shape, then drag photos into them.");
  // Only partly off: it settles back inside.
  await sweep(page, await canvasAt(page, ...SPOTS.topRight), [box.x + box.width - 10, from[1]]);
  await expect(e.getByRole("status")).not.toHaveText("Removed. Undo brings it back.");
});

test("AC-CUSTOM-20 holding a shape lifts its photo out to another shape or back to the tray", async ({ page }) => {
  const e = await openBlank(page, 2);
  await addShapes(e, "Rectangle", "Circle");
  await dragPhoto(page, 1, SPOTS.middle);
  await expect(trayPhoto(e, 1, "placed")).toBeVisible();
  // Press and hold on it, then drag to the other shape: the photo moves there.
  const [x, y] = await canvasAt(page, ...SPOTS.middle);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  const [tx, ty] = await canvasAt(page, ...SPOTS.topLeft);
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + ((tx - x) * i) / 8, y + ((ty - y) * i) / 8);
  await page.mouse.up();
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.middle)));
  await expect(e.getByRole("button", { name: "Take photo out" })).toHaveCount(0); // the rectangle is empty
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.topLeft)));
  await expect(e.getByRole("button", { name: "Take photo out" })).toBeVisible(); // and the circle has it
  // Hold and drop it on the tray: it's taken out.
  const [cx, cy] = await canvasAt(page, ...SPOTS.topLeft);
  const tray = (await e.getByRole("group", { name: "Your photos" }).boundingBox())!;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.waitForTimeout(600);
  for (let i = 1; i <= 8; i++) await page.mouse.move(cx, cy + ((tray.y + tray.height / 2 - cy) * i) / 8);
  await page.mouse.up();
  await expect(trayPhoto(e, 1, "not placed")).toBeVisible();
  // A plain drag still just moves the shape.
  await dragPhoto(page, 1, SPOTS.topLeft);
  await sweep(page, await canvasAt(page, ...SPOTS.topLeft), await canvasAt(page, 0.3, 0.4));
  await expect(trayPhoto(e, 1, "placed")).toBeVisible();
});

/** Drags the turn handle of the chosen shape (whose center is at a fraction of the canvas) through `degrees` clockwise, in an arc. */
async function turnHandle(page: Page, center: readonly [number, number], degrees: number) {
  const handle = editor(page).getByRole("button", { name: /^Turn photo/ });
  const box = (await handle.boundingBox())!;
  const [hx, hy] = [box.x + box.width / 2, box.y + box.height / 2];
  const [cx, cy] = await canvasAt(page, center[0], center[1]);
  const radius = Math.hypot(hx - cx, hy - cy);
  const start = Math.atan2(hy - cy, hx - cx);
  await page.mouse.move(hx, hy);
  await page.mouse.down();
  const steps = Math.max(6, Math.ceil(Math.abs(degrees) / 10));
  for (let i = 1; i <= steps; i++) {
    const a = start + (((degrees * i) / steps) * Math.PI) / 180;
    await page.mouse.move(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
  }
}

test("AC-CUSTOM-21 every shape but a circle says it turns, and a heart and a rectangle turn a quarter with the handle", async ({ page }) => {
  await signedIn(page);
  const e = await openBlank(page, 2);
  const hint = "Drag to move. Pinch to resize, twist to turn.";
  // Four shapes go in the middle, top left, top right and bottom left; a circle only resizes.
  const spots = [SPOTS.middle, SPOTS.topLeft, SPOTS.topRight, [0.26, 0.74]] as const;
  for (const shape of ["Star", "Arch", "Pill", "Circle"]) await e.getByRole("button", { name: `Add ${shape.toLowerCase()}`, exact: true }).click();
  for (const [i, spot] of spots.entries()) {
    await page.mouse.click(...(await canvasAt(page, spot[0], spot[1])));
    await expect(e.getByRole("status")).toHaveText(i === 3 ? "Drag to move. Pinch to resize." : hint);
    await expect(e.getByRole("button", { name: /^Turn photo/ })).toHaveCount(i === 3 ? 0 : 1);
  }
  await page.mouse.click(...(await canvasAt(page, 0.97, 0.97)));
  await e.getByRole("button", { name: "Undo" }).click(); // the four shapes are more than two photos need: take back the circle and two more
  await e.getByRole("button", { name: "Undo" }).click();
  await e.getByRole("button", { name: "Undo" }).click();
  await e.getByRole("button", { name: "Undo" }).click();
  await e.getByRole("button", { name: "Add heart", exact: true }).click(); // the middle
  await e.getByRole("button", { name: "Add rectangle", exact: true }).click(); // the top left

  await page.mouse.click(...(await canvasAt(page, ...SPOTS.middle)));
  await turnHandle(page, SPOTS.middle, 90);
  await expect(e.getByRole("status")).toHaveText("Turned 90°");
  await page.mouse.up();
  await page.mouse.click(...(await canvasAt(page, ...SPOTS.topLeft)));
  await turnHandle(page, SPOTS.topLeft, 90);
  await expect(e.getByRole("status")).toHaveText("Turned 90°");
  await page.mouse.up();
  for (const [n, spot] of [[1, SPOTS.middle], [2, SPOTS.topLeft]] as const) {
    await trayPhoto(e, n, "not placed").click();
    await page.mouse.click(...(await canvasAt(page, spot[0], spot[1])));
  }
  await saveAs(page, "Turned");
  const [saved] = await savedLayouts(page);
  const [heart, rect] = saved!.layout.cells as unknown as Record<string, number | string>[];
  expect(heart).toMatchObject({ shape: "heart", turn: 90 });
  expect(rect).toMatchObject({ shape: "rect", rotate: 0, turn: 90 }); // a quarter turn: the turn field holds the whole angle
  expect(rect!.w).toBeCloseTo(0.36, 2); // and its size is as it was
});

test("AC-CUSTOM-06 draws nothing over the photos", async ({ page }) => {
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
