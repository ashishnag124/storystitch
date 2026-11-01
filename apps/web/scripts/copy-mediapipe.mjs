// Copies the MediaPipe WebAssembly runtime from node_modules into public/, so it's served
// from our own origin. Only the ES-module + SIMD build is needed (see src/detect/worker.ts).
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const wasmDir = join(dirname(createRequire(import.meta.url).resolve("@mediapipe/tasks-vision")), "wasm");
const out = new URL("../public/mediapipe/", import.meta.url);
mkdirSync(out, { recursive: true });
for (const file of ["vision_wasm_module_internal.js", "vision_wasm_module_internal.wasm"]) {
  copyFileSync(join(wasmDir, file), new URL(file, out));
}
