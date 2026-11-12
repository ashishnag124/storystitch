// Measures how well the iPhone's on-device model follows descriptions, on the evaluation set in
// packages/client/src/describe.eval.json. Development tool only: nothing in the app imports it.
//
//   node apps/app/scripts/eval-describe.mjs [--set tuning|heldOut|all] [--runs 2] [--device <simulator>] [--out results.json] [--work <dir>]
//
// It runs the app's own describeLayout (prompt, parsing, retry, repair) against the real model, which runs in a booted
// iOS 26+ simulator on this Mac (so a real iPhone may differ). The model call is the same Swift file the app uses,
// modules/story-ai/ios/StoryAIGeneration.swift, built into a small tool and started in the simulator for each request.
// Writes one result per case (raw model answers, parsed spec, repair, structure and size match) and prints the scores.
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
  generate: async (prompt) => {
    const answer = execFileSync("xcrun", ["simctl", "spawn", ${JSON.stringify(device)}, ${JSON.stringify(tool)}, prompt], { encoding: "utf8" }).trim().split("\\n").pop();
    globalThis.RAW.push(answer);
    if (answer.startsWith("ERROR")) throw Object.assign(new Error(answer), { code: answer.includes("refus") ? "refused" : "failed" });
    return answer;
  },
};`,
);
const bundle = join(work, "app-code.mjs");
await build({
  stdin: {
    contents: `
      export { describeLayout } from "./apps/app/src/platform/describeLayout.native.ts";
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
  const result = { id: c.id, set: c.set, description: c.description, photos: c.photos, hasSizeOrder: c.expected.some((e) => e.sizeOrder), runs: [] };
  for (let run = 1; run <= runs; run++) {
    globalThis.RAW = [];
    const made = await code.describeLayout(c.description, c.photos);
    const match = made.ok ? code.structureMatch(made.draft.layout, c.expected) : undefined;
    result.runs.push({
      run,
      raw: globalThis.RAW,
      attempts: globalThis.RAW.map((raw) => attempt(raw, c.photos)),
      ok: made.ok,
      reason: made.ok ? null : made.reason,
      adjusted: made.ok ? made.adjusted : null,
      topology: made.ok ? code.layoutTopology(made.draft.layout) : null,
      structure: Boolean(match),
      size: match ? code.sizeMatch(made.draft.layout, match) : c.expected.some((e) => e.sizeOrder) ? false : null,
    });
  }
  result.topologyDiffersAcrossRuns = new Set(result.runs.map((r) => r.topology)).size > 1;
  results.push(result);
  console.log(`${c.id} ${c.description} (${c.photos}): ${result.runs.map((r) => `${r.topology ?? r.reason}${r.structure ? " ok" : ""}${r.adjusted ? " adjusted" : ""}`).join(" | ")}`);
}
writeFileSync(out, JSON.stringify(results, null, 1));

// Scores, per set and run.
const rate = (n, of) => `${n}/${of}`;
for (const set of ["tuning", "heldOut"]) {
  const mine = results.filter((r) => r.set === set);
  if (!mine.length) continue;
  const sized = mine.filter((r) => r.hasSizeOrder);
  console.log(`\n${set}: ${mine.length} cases`);
  for (let i = 0; i < runs; i++) {
    const rs = mine.map((r) => r.runs[i]);
    console.log(
      `  run ${i + 1}: structure ${rate(rs.filter((r) => r.structure).length, mine.length)}; size ${rate(sized.filter((r) => r.runs[i].size).length, sized.length)}; repaired ${rs.filter((r) => r.adjusted).length}; failed ${rs.filter((r) => !r.ok).length} (${[...new Set(rs.filter((r) => !r.ok).map((r) => r.reason))].join(", ") || "none"}); rejected as too thin ${rs.filter((r) => r.attempts.some((a) => a.problem?.includes("too long and thin"))).length}`,
    );
  }
  console.log(`  structure right in every run: ${rate(mine.filter((r) => r.runs.every((x) => x.structure)).length, mine.length)}; different structures across runs: ${mine.filter((r) => r.topologyDiffersAcrossRuns).length}`);
}
console.log(`\nResults: ${out}`);
