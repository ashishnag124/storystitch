import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const here = __dirname;
const fromApp = createRequire(join(here, "../package.json"));
const fromSkia = createRequire(fromApp.resolve("@shopify/react-native-skia/package.json"));
const skiaDir = dirname(fromApp.resolve("@shopify/react-native-skia/package.json"));
const canvasKitDir = dirname(fromSkia.resolve("canvaskit-wasm/package.json"));

interface ParityPage {
  compareRenderers(styles: object[], zoom?: number, scale?: number): Promise<{ id: string; styled: number; differentPct: number; meanDiff: number; canvas: string; skia: string }[]>;
}

/** The part of esbuild's plugin API used here. esbuild is a dependency of apps/app, so its types aren't available. */
interface Build {
  onResolve(options: { filter: RegExp }, resolve: (args: { path: string }) => { path: string; namespace?: string }): void;
  onLoad(options: { filter: RegExp; namespace: string }, load: () => { contents: string }): void;
}

/** Bundles both of the app's renderers for the browser. Neither runs in the app here: only their drawing is compared. */
async function bundle() {
  const { build } = fromApp("esbuild");
  const result = await build({
    entryPoints: [join(here, "parity/entry.ts")],
    bundle: true,
    write: false,
    format: "iife",
    platform: "browser",
    logLevel: "silent",
    // The renderers read the blur fill flag from the environment; the parity run has it on.
    define: { "process.env": "{}", "process.env.EXPO_PUBLIC_FEATURE_BLUR_FILL": '"true"' },
    plugins: [
      {
        name: "parity",
        setup(b: Build) {
          b.onResolve({ filter: /^@shopify\/react-native-skia$/ }, () => ({ path: join(here, "parity/skia.ts") }));
          b.onResolve({ filter: /^@shopify\/react-native-skia\/lib\// }, (a: { path: string }) => ({ path: `${skiaDir}/${a.path.split("/").slice(2).join("/")}.js` }));
          b.onResolve({ filter: /^canvaskit-wasm$/ }, () => ({ path: join(canvasKitDir, "bin/full/canvaskit.js") }));
          b.onResolve({ filter: /^(fs|path)$/ }, (a: { path: string }) => ({ path: a.path, namespace: "empty" }));
          b.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "export default {}" }));
          b.onResolve({ filter: /^\.\.?\/photos(\.native)?$/ }, () => ({ path: "photos", namespace: "empty" }));
        },
      },
    ],
  });
  return result.outputFiles[0]!.text;
}

/** Styles from this one on have blurred backgrounds. */
const BLURRED_FROM = 3;

test("AC-IOS-12 every layout draws the same on Canvas and Skia", async ({ page }, info) => {
  test.skip(info.project.name !== "android-chrome", "Only needs one browser");
  test.setTimeout(240_000);
  const script = await bundle();
  await page.route("http://parity.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/canvaskit.wasm") return route.fulfill({ body: readFileSync(join(canvasKitDir, "bin/full/canvaskit.wasm")), contentType: "application/wasm" });
    if (path === "/parity.js") return route.fulfill({ body: script, contentType: "text/javascript" });
    return route.fulfill({ body: '<!doctype html><script src="/parity.js"></script>', contentType: "text/html" });
  });
  await page.goto("http://parity.test/");

  const styles = [
    { background: { kind: "color", color: "#ffffff" } },
    { background: { kind: "color", color: "#000000" }, gap: 0, margin: 0, radius: 0, border: 0 },
    { background: { kind: "color", color: "#203040" }, gap: 40, margin: 60, radius: 60, border: 12, borderColor: "#ff4f8b" },
    { background: { kind: "blur" }, gap: 40, margin: 60, radius: 60, border: 12, borderColor: "#ff4f8b" },
    {},
  ];
  const results = await page.evaluate((s) => (window as unknown as ParityPage).compareRenderers(s), styles);
  const worst = [...results].sort((a, b) => b.differentPct - a.differentPct);
  const out = resolve(here, "../test-results/parity");
  mkdirSync(out, { recursive: true });
  for (const r of worst.slice(0, 6)) {
    writeFileSync(join(out, `${r.id}-canvas.png`), Buffer.from(r.canvas, "base64"));
    writeFileSync(join(out, `${r.id}-skia.png`), Buffer.from(r.skia, "base64"));
  }
  writeFileSync(join(out, "report.json"), JSON.stringify(worst.map(({ id, styled, differentPct, meanDiff }) => ({ id, styled, differentPct, meanDiff })), null, 1));
  console.log(worst.slice(0, 12).map((r) => `${r.id}: ${r.differentPct.toFixed(2)}% / ${r.meanDiff.toFixed(2)}`).join("\n"));
  expect(results.length).toBeGreaterThan(70);
  // Solid backgrounds show geometry: the real code reaches 2.4% of pixels from edge smoothing, and a photo left unrotated
  // reaches 3.7%. The two blurred styles only guard the blur, which is close but not exact, at 5.7%.
  const worstOf = (blurred: boolean) => Math.max(...results.filter((r) => r.styled >= BLURRED_FROM === blurred).map((r) => r.differentPct));
  expect(worstOf(false)).toBeLessThan(3);
  expect(worstOf(true)).toBeLessThan(7);
});

test("AC-IOS-12 AC-CROP-07 the blurred fill of a zoomed-out photo draws the same on Canvas and Skia", async ({ page }, info) => {
  test.skip(info.project.name !== "android-chrome", "Only needs one browser");
  test.setTimeout(240_000);
  const script = await bundle();
  await page.route("http://parity.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/canvaskit.wasm") return route.fulfill({ body: readFileSync(join(canvasKitDir, "bin/full/canvaskit.wasm")), contentType: "application/wasm" });
    if (path === "/parity.js") return route.fulfill({ body: script, contentType: "text/javascript" });
    return route.fulfill({ body: '<!doctype html><script src="/parity.js"></script>', contentType: "text/html" });
  });
  await page.goto("http://parity.test/");
  const results = await page.evaluate(() => (window as unknown as ParityPage).compareRenderers([{ background: { kind: "color", color: "#ffffff" } }], 0.6));
  expect(results.length).toBeGreaterThan(20);
  // The blur is close but not exact between the two (see above).
  expect(Math.max(...results.map((r) => r.differentPct))).toBeLessThan(7);
});

test("AC-LOOK-05 AC-IOS-12 looks draw the same on Canvas and Skia, from preview copies and from originals", async ({ page }, info) => {
  test.skip(info.project.name !== "android-chrome", "Only needs one browser");
  test.setTimeout(240_000);
  const script = await bundle();
  await page.route("http://parity.test/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/canvaskit.wasm") return route.fulfill({ body: readFileSync(join(canvasKitDir, "bin/full/canvaskit.wasm")), contentType: "application/wasm" });
    if (path === "/parity.js") return route.fulfill({ body: script, contentType: "text/javascript" });
    return route.fulfill({ body: '<!doctype html><script src="/parity.js"></script>', contentType: "text/html" });
  });
  await page.goto("http://parity.test/");
  const styles = [
    { background: { kind: "color", color: "#203040" }, border: 12, borderColor: "#ff4f8b", look: "mono" },
    { background: { kind: "color", color: "#ffffff" }, look: "film" },
    { background: { kind: "color", color: "#ffffff" }, look: "vivid" },
    { background: { kind: "blur" }, look: "noir" },
  ];
  const previews = await page.evaluate((s) => (window as unknown as ParityPage).compareRenderers(s), styles);
  // Photos twice the size: the web code filters them after drawing them into their cells, as at export.
  const originals = await page.evaluate((s) => (window as unknown as ParityPage).compareRenderers(s, undefined, 2), styles.slice(0, 2));
  expect(previews.length).toBeGreaterThan(70);
  expect(originals.length).toBeGreaterThan(35);
  const worst = (results: typeof previews, blurred: boolean) =>
    Math.max(...results.filter((r) => (styles[r.styled]!.background.kind === "blur") === blurred).map((r) => r.differentPct));
  console.log(`looks: previews ${worst(previews, false).toFixed(2)}% (blurred ${worst(previews, true).toFixed(2)}%), originals ${worst(originals, false).toFixed(2)}%`);
  // The same bounds as without a look (see above). Large photos are scaled once more on web (into a cell-sized canvas
  // before filtering), which adds a little edge smoothing: 3.1%.
  expect(worst(previews, false)).toBeLessThan(3);
  expect(worst(previews, true)).toBeLessThan(7);
  expect(worst(originals, false)).toBeLessThan(4);
});
