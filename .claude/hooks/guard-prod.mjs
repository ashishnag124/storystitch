#!/usr/bin/env node
// PreToolUse hook: blocks shell commands that would touch production or hosted data.
// Exit code 2 blocks the command and shows the message to Claude.
// Production changes go through /release (which uses `gh workflow run`, prompted by the "ask" rule).
import { readFileSync } from "node:fs";

let cmd = "";
try {
  cmd = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "";
} catch {
  process.exit(0);
}

const S = "[^\\n;&|]*"; // stay within one simple command
const rules = [
  [new RegExp(`\\bgit\\s+push\\b${S}[\\s:+/]production(?![\\w-])`), "Pushing to the production branch is release-only. Use /release."],
  [new RegExp(`\\brailway\\b${S}(?:-e|--environment)[\\s=]+production\\b`), "This targets the Railway production environment. Ask the user to run it."],
  [/\brailway\s+(?:run|shell|connect|ssh)\b/, "railway run/shell/connect/ssh open or inject a hosted environment. Ask the user to run it and share the output."],
  [new RegExp(`\\bwrangler\\b${S}\\bpages\\s+deploy\\b${S}--branch[\\s=]+production\\b`), "Production web deploys go through the release workflow (/release)."],
  [new RegExp(`\\beas(?:-cli)?\\s${S}(?:\\bsubmit\\b|--auto-submit|--channel[\\s=]+production\\b|--profile[\\s=]+production\\b|--branch[\\s=]+production\\b)`), "Production mobile builds and updates go through the mobile-release workflow."],
  [/\b[\w.-]*\.rlwy\.net\b|\brailway\.internal\b/, "This references a hosted Railway database. Use the local database; ask the user for anything hosted."],
];

for (const [re, msg] of rules) {
  if (re.test(cmd)) {
    process.stderr.write(`Blocked by .claude/hooks/guard-prod.mjs: ${msg}\n`);
    process.exit(2);
  }
}
process.exit(0);
