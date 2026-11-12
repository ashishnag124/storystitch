// Measures how well the iPhone's on-device model follows descriptions, on the evaluation set in
// packages/client/src/describe.eval.json. Development tool only: nothing in the app imports it.
//
//   node apps/app/scripts/eval-describe.mjs [--set tuning|heldOut|all] [--runs 2] [--temps 0.2,0.7,0.7,0.7] [--device <simulator>] [--out results.json] [--work <dir>]
//
// It runs the app's own describeLayouts (prompt, parsing, repair, ranking of up to three different layouts) against the
// real model, which runs in a booted iOS 26+ simulator on this Mac (so a real iPhone may differ). The model call is the
// same Swift file the app uses, modules/story-ai/ios/StoryAIGeneration.swift, built into a small tool and started in the
// simulator for each request (so the seconds include starting it). `--temps` is the temperature of each request.
// Writes one result per case (raw model answers, the layouts offered, top-1 and top-3 structure and size match, seconds)
// and prints the scores.
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const repo = resolve(app, "../..");

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith("--") ? [[a.slice(2), all[i + 1]]] : [])));
const wanted = args.set ?? "all";
const runs = Number(args.runs ?? 2);
const device = args.device ?? "booted";
const temps = args.temps?.split(",").map(Number);
const out = resolve(args.out ?? join(process.cwd(), "eval-results.json"));
const work = resolve(args.work ?? join(tmpdir(), "eval-describe"));
mkdirSync(work, { recursive: true });

// The model call, as a tool that runs in the simulator.
const tool = join(work, "generate");
execFileSync(
  "xcrun",
  ["--sdk", "iphonesimulator", "swiftc", "-target", "arm64-apple-ios26.0-simulator", join(app, "modules/story-ai/ios/StoryAIGeneration.swift"), join(here, "eval-describe/main.swift"), "-o", tool],
  { stdio: "inherit" },
);

// The app's own code, with the native module replaced by a stand-in that starts that tool and keeps what it said.
const standIn = join(work, "story-ai.mjs");
writeFileSync(
  standIn,
  `import { execFileSync } from "node:child_process";
export default {
  availability: async () => "available",
  generate: async (prompt, temperature) => {
    const lines = execFileSync("xcrun", ["simctl", "spawn", ${JSON.stringify(device)}, ${JSON.stringify(tool)}, prompt, String(temperature)], { encoding: "utf8" }).trim().split("\\n");
    const answer = lines.pop();
    globalThis.RAW.push(answer);
    globalThis.MODEL_MS.push(Number(lines.find((l) => l.startsWith("TIME "))?.slice(5) ?? 0));
    if (answer.startsWith("ERROR")) throw Object.assign(new Error(answer), { code: answer.includes("refus") ? "refused" : "failed" });
    return answer;
  },
};`,
);
const bundle = join(work, "app-code.mjs");
await build({
  stdin: {
    contents: `
      export { describeLayouts, TEMPERATURES } from "./apps/app/src/platform/describeLayout.native.ts";
      export { layoutFromSpec, countProblem } from "./packages/client/src/describe.ts";
      export { LayoutSpecSchema } from "./packages/shared/src/describe.ts";
      export * from "./packages/client/src/describe.eval.ts";`,
    resolveDir: repo,
    loader: "ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: bundle,
  logLevel: "error",
  plugins: [{ name: "stand-in", setup: (b) => b.onResolve({ filter: /modules\/story-ai$/ }, () => ({ path: standIn })) }],
});
const code = await import(bundle);
const temperatures = temps ?? code.TEMPERATURES;

/** What became of each raw answer: whether it read as a spec, and what layoutFromSpec made of it. */
function attempt(raw, photos) {
  let spec;
  try {
    spec = JSON.parse(raw);
  } catch {
    return { raw, parsed: false };
  }
  const parsed = code.LayoutSpecSchema.safeParse(spec);
  if (!parsed.success) return { raw, parsed: false };
  const made = code.layoutFromSpec(parsed.data, photos);
  return { raw, parsed: true, spec: parsed.data, countProblem: code.countProblem(parsed.data, photos), problem: made.ok ? null : made.problem };
}

const { cases } = JSON.parse(readFileSync(join(repo, "packages/client/src/describe.eval.json"), "utf8"));
const results = [];
for (const c of cases.filter((c) => wanted === "all" || c.set === wanted)) {
  const hasSizeOrder = c.expected.some((e) => e.sizeOrder);
  const result = { id: c.id, set: c.set, description: c.description, photos: c.photos, hasSizeOrder, runs: [] };
  for (let run = 1; run <= runs; run++) {
    globalThis.RAW = [];
    globalThis.MODEL_MS = [];
    const started = Date.now();
    const made = await code.describeLayouts(c.description, c.photos, { temperatures });
    const seconds = (Date.now() - started) / 1000;
    const offered = made.ok ? made.candidates : [];
    const scored = offered.map((o) => {
      const match = code.structureMatch(o.draft.layout, c.expected);
      return { topology: code.layoutTopology(o.draft.layout), count: o.count, adjusted: o.adjusted, structure: Boolean(match), size: match ? code.sizeMatch(o.draft.layout, match) : hasSizeOrder ? false : null };
    });
    result.runs.push({
      run,
      samples: globalThis.RAW.length,
      raw: globalThis.RAW,
      attempts: globalThis.RAW.map((raw) => attempt(raw, c.photos)),
      ok: made.ok,
      reason: made.ok ? null : made.reason,
      seconds,
      modelSeconds: globalThis.MODEL_MS.reduce((a, b) => a + b, 0) / 1000,
      candidates: scored,
      top1: Boolean(scored[0]?.structure),
      top3: scored.some((s) => s.structure),
      top1Size: scored[0]?.size ?? (hasSizeOrder ? false : null),
      top3Size: hasSizeOrder ? scored.some((s) => s.structure && s.size) : null,
    });
  }
  result.top1DiffersAcrossRuns = new Set(result.runs.map((r) => r.candidates[0]?.topology)).size > 1;
  results.push(result);
  console.log(`${c.id} ${c.description} (${c.photos}): ${result.runs.map((r) => `${r.candidates.map((s) => `${s.topology}${s.structure ? "*" : ""}`).join(", ") || r.reason} [${r.seconds.toFixed(1)}s]`).join(" | ")}`);
}
writeFileSync(out, JSON.stringify({ temperatures, results }, null, 1));

// Scores, per set and run.
const rate = (n, of) => `${n}/${of}`;
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
for (const set of ["tuning", "heldOut"]) {
  const mine = results.filter((r) => r.set === set);
  if (!mine.length) continue;
  const sized = mine.filter((r) => r.hasSizeOrder);
  console.log(`\n${set}: ${mine.length} cases, temperatures ${temperatures.join(", ")}`);
  for (let i = 0; i < runs; i++) {
    const rs = mine.map((r) => r.runs[i]);
    console.log(
      `  run ${i + 1}: top-1 ${rate(rs.filter((r) => r.top1).length, mine.length)}; top-3 ${rate(rs.filter((r) => r.top3).length, mine.length)}; size top-1 ${rate(sized.filter((r) => r.runs[i].top1Size).length, sized.length)}, any of 3 ${rate(sized.filter((r) => r.runs[i].top3Size).length, sized.length)}; distinct layouts ${mean(rs.map((r) => r.candidates.length)).toFixed(2)} on average; seconds ${mean(rs.map((r) => r.seconds)).toFixed(1)} on average, ${Math.max(...rs.map((r) => r.seconds)).toFixed(1)} worst (model alone ${mean(rs.map((r) => r.modelSeconds)).toFixed(1)}); answers asked for ${mean(rs.map((r) => r.samples)).toFixed(1)}; failed ${rs.filter((r) => !r.ok).length} (${[...new Set(rs.filter((r) => !r.ok).map((r) => r.reason))].join(", ") || "none"})`,
    );
  }
  console.log(`  top-3 right in every run: ${rate(mine.filter((r) => r.runs.every((x) => x.top3)).length, mine.length)}; first layout differs across runs: ${mine.filter((r) => r.top1DiffersAcrossRuns).length}`);
}
console.log(`\nResults: ${out}`);
