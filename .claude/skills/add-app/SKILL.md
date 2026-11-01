---
name: add-app
description: Add an app or service to this existing project (web app, marketing site, iOS app via Expo or native, API + database, background worker, accounts, payments, uploads) and wire it into local dev, CI, staging and release. Use when a request needs something not listed in project.json.
argument-hint: "[web|site|ios-expo|ios-native|api|worker|auth|payments|uploads]"
---

Add `$ARGUMENTS` to this project.

1. Read `project.json` and `PROJECT_SETUP.md`. Already present → say so and stop. Nothing specified → ask what to add (AskUserQuestion), offering only what's missing.
2. The full playbook (service matrix, scaffold details, workflow templates) is in the `new-project` skill: `~/.claude/skills/new-project/reference/stack.md`, `reference/scaffold.md`, and `templates/`. Apply only the parts for this addition, including its implications (e.g. accounts require the API).
3. Show the plan: code to add, services to create, workflow jobs to add, manual steps. Wait for a yes.
4. Work on a branch. Scaffold the app, connect it to the existing `packages/shared` contract, add its `>>> key` workflow jobs (from the templates) to `ci.yml` / `release.yml`, update `CLAUDE.md`'s "Where code goes" table and `project.json`.
5. Prove it locally (`pnpm check`, run it against the local API) before creating any hosted resource.
6. Create hosted resources for staging and production following the same rules as `/new-project`: check `--help` before unfamiliar CLI commands, never touch production data, never type credentials, put dashboard-only steps on the `PROJECT_SETUP.md` checklist.
7. Open a PR. After merge it reaches staging; production follows the next `/release`.
