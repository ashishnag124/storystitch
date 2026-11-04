// Puts what the web build serves from public/ in place. Metro can't bundle the font files a CSS file points to, so
// the font's stylesheet and files go in public/ and index.html links them. The detection worker is built here too:
// Metro's own worker support is experimental. MediaPipe's runtime and the models are served from our own origin.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const font = dirname(createRequire(import.meta.url).resolve("@fontsource-variable/bricolage-grotesque/package.json"));
const out = fileURLToPath(new URL("../public/fonts/", import.meta.url));
mkdirSync(out, { recursive: true });
for (const subset of ["vietnamese", "latin-ext", "latin"]) {
  const file = `bricolage-grotesque-${subset}-wght-normal.woff2`;
  cpSync(join(font, "files", file), join(out, file));
}
writeFileSync(join(out, "bricolage-grotesque.css"), readFileSync(join(font, "index.css"), "utf8").replaceAll("./files/", "/fonts/"));

const pub = fileURLToPath(new URL("../public/", import.meta.url));
const wasm = join(dirname(createRequire(import.meta.url).resolve("@mediapipe/tasks-vision")), "wasm");
mkdirSync(join(pub, "mediapipe"), { recursive: true });
cpSync(fileURLToPath(new URL("../../web/public/models/", import.meta.url)), join(pub, "models"), { recursive: true });
for (const file of ["vision_wasm_module_internal.js", "vision_wasm_module_internal.wasm"]) cpSync(join(wasm, file), join(pub, "mediapipe", file));
await build({
  entryPoints: {
    "detect-worker": fileURLToPath(new URL("../src/platform/detect-worker.web.ts", import.meta.url)),
    "encode-worker": fileURLToPath(new URL("../src/platform/encode-worker.web.ts", import.meta.url)),
  },
  outdir: pub,
  bundle: true,
  format: "esm",
  minify: true,
});
