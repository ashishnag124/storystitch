// Copies what the web build serves from public/ out of node_modules. Metro can't bundle the font files a CSS file
// points to, so the font's stylesheet and files go in public/ and index.html links them.
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
