#!/usr/bin/env node
// `pnpm qa`: runs every check and grades each acceptance criterion in docs/acceptance-criteria.md.
//
// 1. lint and typecheck, 2. unit tests (Vitest) in every package, 3. build, 4. end-to-end tests (Playwright).
// Then each "auto" criterion passes only if at least one test names its ID, none of them failed and at least
// one actually ran. Writes qa-results/report.md (also to the GitHub Actions job summary) and exits non-zero on
// any failure, missing test, unknown ID or failed step.
//
// `pnpm qa --target=app` runs the end-to-end tests against apps/app, the Expo app that's replacing apps/web.
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const out = join(root, "qa-results");
const CRITERIA_FILE = join(root, "docs/acceptance-criteria.md");
const ID = /\bAC-[A-Z0-9]+-\d{2}\b/g;
const target = process.argv.find((a) => a.startsWith("--target="))?.slice("--target=".length) ?? "web";
const ROW = /^\|\s*(AC-[A-Z0-9]+-\d{2})\s*\|\s*(.+?)\s*\|\s*(auto|manual|planned)\s*\|\s*$/;

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const steps = [];
function run(name, cmd, args, opts = {}) {
  console.log(`\n▶ ${name}`);
  const { status } = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: root,
    ...opts,
    env: { ...process.env, ...opts.env },
  });
  steps.push({ name, ok: status === 0 });
  return status === 0;
}

const workspaces = ["apps", "packages"].flatMap((dir) =>
  readdirSync(join(root, dir), { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(root, dir, d.name, "package.json")))
    .map((d) => {
      const path = join(root, dir, d.name);
      return {
        path,
        name: d.name,
        scripts: JSON.parse(readFileSync(join(path, "package.json"), "utf8")).scripts ?? {},
      };
    }),
);

run("Lint and typecheck", "pnpm", ["turbo", "run", "lint", "typecheck"]);
// The API's tests use a real Postgres: Docker locally, a service container in CI (which sets DATABASE_URL).
if (workspaces.some((w) => w.scripts["db:migrate"])) {
  if (!process.env.CI) run("Start local Postgres", "docker", ["compose", "up", "-d", "--wait"]);
  run("Database migrations", "pnpm", ["db:migrate"]);
}
for (const ws of workspaces.filter((w) => w.scripts.test)) {
  run(
    `Unit tests: ${ws.name}`,
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--reporter=default",
      "--reporter=json",
      `--outputFile.json=${join(out, `unit-${ws.name}.json`)}`,
    ],
    { cwd: ws.path },
  );
}
const built = run("Build", "pnpm", ["turbo", "run", "build"]);
for (const ws of workspaces.filter((w) => w.scripts.e2e)) {
  if (!built) break;
  // The builds the end-to-end tests serve (e.g. with a feature flag on and off), when the app defines them.
  const app = workspaces.find((w) => w.name === target);
  if (!app) throw new Error(`No app named ${target}`);
  if (app.scripts["build:e2e"] && !run(`End-to-end builds: ${app.name}`, "pnpm", ["run", "build:e2e"], { cwd: app.path })) continue;
  const reporter = process.env.CI ? "github,json" : "list,json";
  run(`End-to-end tests: ${app.name}`, "pnpm", ["exec", "playwright", "test", `--reporter=${reporter}`], {
    cwd: ws.path,
    env: { E2E_TARGET: app.name, PLAYWRIGHT_JSON_OUTPUT_FILE: join(out, `e2e-${app.name}.json`) },
  });
}

// Collect every test result as { title, where, status } with status passed | failed | skipped.
const results = [];
for (const file of readdirSync(out).filter((f) => f.endsWith(".json"))) {
  const data = JSON.parse(readFileSync(join(out, file), "utf8"));
  if (file.startsWith("unit-")) {
    for (const suite of data.testResults ?? []) {
      for (const t of suite.assertionResults ?? []) {
        const status = t.status === "passed" ? "passed" : t.status === "failed" ? "failed" : "skipped";
        results.push({
          title: t.fullName,
          where: relative(root, suite.name),
          status,
        });
      }
    }
  } else {
    const walk = (suite, path) => {
      const titles = suite.title ? [...path, suite.title] : path;
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          const status =
            t.status === "expected" || t.status === "flaky" ? "passed" : t.status === "skipped" ? "skipped" : "failed";
          results.push({
            title: [...titles, spec.title].join(" › "),
            where: t.projectName,
            status,
            flaky: t.status === "flaky",
          });
        }
      }
      for (const child of suite.suites ?? []) walk(child, titles);
    };
    for (const suite of data.suites ?? []) walk(suite, []);
    for (const e of data.errors ?? [])
      results.push({
        title: `Playwright error: ${e.message ?? e}`,
        where: file,
        status: "failed",
      });
  }
}

const criteria = readFileSync(CRITERIA_FILE, "utf8")
  .split("\n")
  .map((line) => line.match(ROW))
  .filter(Boolean)
  .map(([, id, text, check]) => ({ id, text, check }));
const known = new Set(criteria.map((c) => c.id));

const graded = criteria.map((c) => {
  const tests = results.filter((r) => r.title.match(ID)?.includes(c.id));
  const count = (s) => tests.filter((t) => t.status === s).length;
  const [passed, failed, skipped] = [count("passed"), count("failed"), count("skipped")];
  let result;
  if (c.check === "manual") result = "MANUAL";
  else if (c.check === "planned") result = "PLANNED";
  else if (!tests.length) result = "NO TEST";
  else if (failed) result = "FAIL";
  else if (!passed) result = "SKIPPED";
  else result = "PASS";
  return {
    ...c,
    result,
    passed,
    failed,
    skipped,
    flaky: tests.filter((t) => t.flaky).length,
  };
});
const unknown = [...new Set(results.flatMap((r) => r.title.match(ID) ?? []).filter((id) => !known.has(id)))];
const failedTests = results.filter((r) => r.status === "failed");

const bad = graded.filter((g) => ["FAIL", "NO TEST", "SKIPPED"].includes(g.result));
const ok = steps.every((s) => s.ok) && !bad.length && !unknown.length && !failedTests.length && results.length > 0;
const tally = (r) => graded.filter((g) => g.result === r).length;

const icon = {
  PASS: "✅",
  FAIL: "❌",
  "NO TEST": "❌",
  SKIPPED: "⚠️",
  MANUAL: "👀",
  PLANNED: "🗓️",
};
const lines = [
  `# QA report: ${ok ? "PASS" : "FAIL"}`,
  "",
  `${new Date().toISOString()} · commit \`${spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root }).stdout.toString().trim()}\``,
  "",
  `**${tally("PASS")} of ${graded.filter((g) => g.check === "auto").length} automated criteria pass**, ${tally("FAIL")} fail, ${tally("NO TEST")} have no test, ${tally("SKIPPED")} only skipped. ${tally("MANUAL")} need a check by hand on staging before release; ${tally("PLANNED")} are planned for features not built yet. ${results.length} tests ran (${results.filter((r) => r.status === "passed").length} passed, ${failedTests.length} failed, ${results.filter((r) => r.status === "skipped").length} skipped).`,
  "",
  "## Steps",
  "",
  ...steps.map((s) => `- ${s.ok ? "✅" : "❌"} ${s.name}`),
  "",
];
if (unknown.length)
  lines.push(
    "## Tests naming unknown criteria",
    "",
    ...unknown.map((id) => `- ❌ ${id} isn't in docs/acceptance-criteria.md`),
    "",
  );
if (failedTests.length)
  lines.push("## Failed tests", "", ...failedTests.map((t) => `- ❌ ${t.title} (${t.where})`), "");
lines.push(
  "## Criteria",
  "",
  "| | ID | Criterion | Tests passed / failed / skipped |",
  "|---|---|---|---|",
  ...graded.map(
    (g) =>
      `| ${icon[g.result]} ${g.result} | ${g.id} | ${g.text} | ${g.check === "manual" ? "check by hand" : g.check === "planned" ? "not built yet" : `${g.passed} / ${g.failed} / ${g.skipped}${g.flaky ? ` (${g.flaky} flaky)` : ""}`} |`,
  ),
  "",
);
const report = lines.join("\n");
writeFileSync(join(out, "report.md"), report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);

console.log(`\n${"─".repeat(60)}`);
for (const g of graded)
  if (g.result !== "PASS" && g.result !== "PLANNED") console.log(`${icon[g.result]} ${g.result.padEnd(8)} ${g.id}  ${g.text}`);
for (const id of unknown) console.log(`❌ UNKNOWN  ${id}  named by a test but not in docs/acceptance-criteria.md`);
for (const t of failedTests) console.log(`❌ FAILED   ${t.title} (${t.where})`);
for (const s of steps.filter((s) => !s.ok)) console.log(`❌ STEP     ${s.name}`);
console.log(
  `\nQA ${ok ? "PASSED" : "FAILED"}: ${tally("PASS")}/${graded.filter((g) => g.check === "auto").length} automated criteria pass; ${tally("MANUAL")} manual; ${tally("PLANNED")} planned. Report: qa-results/report.md`,
);
process.exit(ok ? 0 : 1);
