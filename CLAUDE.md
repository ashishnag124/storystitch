# storystitch

pnpm + Turborepo monorepo. `project.json` lists exactly which apps, services and environments exist. Read it before any structural change. `PROJECT_SETUP.md` has hosted URLs and where config lives.

Product requirements: `docs/product-brief.md`. Acceptance criteria (what QA checks before every release): `docs/acceptance-criteria.md`.

## Where code goes

| Change | Location |
|---|---|
| Data shape / shared contract (layouts and their types) | `packages/shared/src/` (zod) first, then implement |
| Cropping, assignment, ranking (pure functions) | `packages/layout-engine/src/` |
| App logic with no UI or browser APIs (scene, layout editor drafts, API calls) | `packages/client/src/` |
| The Expo app (web and iOS), the only app since `apps/web` was removed after v1.1.0 | `apps/app/src/`; anything browser-only goes in a `*.web.ts(x)` file (lint enforces it) |
| On-device subject detection (Web Worker, MediaPipe) | web: `apps/app/src/platform/detect-worker.web.ts`, built by `apps/app/scripts/prepare-assets.mjs`; models in `apps/app/public/models/` |
| End-to-end tests (Playwright) | `apps/app/e2e/` (against the Expo app's web build) |
| iOS simulator tests (Maestro) | `apps/app/maestro/`: `core/` needs no API and is graded by `pnpm qa --target=ios` (a flow's `name:` starts with its `AC-IOS-*` ID); `local/` needs a signed-in account and the local API, and isn't graded |
| API request/response shapes | `packages/shared/src/api.ts` (zod) first, then the API and its callers |
| API routes, database access | `apps/api/src/` (Hono); tables in `apps/api/src/db/schema.ts` |
| Payments (StoryStitch Plus) | entitlements, RevenueCat webhook and client: `apps/api/src/payments.ts`; buying: `apps/app/src/platform/purchases.{web,native}.ts`. Plus is only ever what the API says, never the app's own record |
| Accounts (sign-in, sessions, emails) | API: `apps/api/src/auth.ts` (Better Auth), `src/email.ts`; app: `apps/app/src/Accounts.tsx` (only when `EXPO_PUBLIC_FEATURE_ACCOUNTS=true`) |
| Database changes | edit `schema.ts`, then `pnpm db:generate`; commit the SQL in `apps/api/drizzle/`. Must keep working with the previous API version and every supported app version (`MIN_IOS_APP_VERSION` and up; iOS users stay on old versions for months): add first, remove in a later release. The `AC-API-02` test allows only new tables, indexes and optional columns. To go further, run the last tagged API against the new schema, then put `-- reviewed: <what you checked>` above the statement |

A request that needs an app or service not in `project.json` (e.g. "add an iOS app", "send emails", "add a background job") → stop and propose `/add-app` or a plan. Don't bolt it on ad hoc.

## Environments

- **Local** is the default for everything: `.env`, `pnpm dev`. Run, test and debug here.
- **Staging** = whatever is on `main`, served by the Expo app (`apps/app`). You get there by promoting `dev` into `main` in a PR, nothing else.
- **Production** = the `production` branch, moved only by `/release` after the user confirms. It serves the Expo app (since v1.0.0, November 7, 2026). To undo a bad web release, roll back to an earlier deployment in Cloudflare (see "Rollback" in `PROJECT_SETUP.md`). The production iOS app is built from a release tag by `mobile-release.yml`, and only the user submits it to Apple.
- Never deploy to or change settings on staging or production yourself. If debugging needs hosted logs, ask the user to run the command and paste the output.

## Commands

- `pnpm dev` (local Postgres in Docker, Expo app :5174, API :3001; this Mac has an SSH tunnel on :3000) · `pnpm db:generate` / `pnpm db:migrate` · `pnpm usage:report --days 30` (usage counts as Markdown tables; read-only) · `pnpm check` (lint + typecheck + test, run before saying done) · `pnpm build` · `pnpm e2e` (Playwright, Android Chrome + iPhone WebKit emulation) · `pnpm qa` (everything above, graded against the acceptance criteria for the Expo app; CI and every release run it; `--target=ios` grades only the `ios` criteria, in the iOS workflow and on a booted simulator with the app installed)

## iOS simulator

No Apple or Expo account is needed. `apps/app/ios` is generated and gitignored, so native changes go through `app.config.ts` and config plugins, never that folder.

1. From `apps/app`: `APP_VARIANT=staging pnpm run prebuild:ios`.
2. Boot a simulator, then open the live panel with the iOS Simulator tool's `attach` action.
3. Build `apps/app/ios/StoryStitchStaging.xcworkspace`, scheme `StoryStitchStaging`, with the tool's `build` action, then follow it with `build_status`. A Debug build needs Metro: `EXPO_PUBLIC_API_URL=http://localhost:3001 APP_VARIANT=staging ./node_modules/.bin/expo start --port 8081`.
4. Open it with `launch`, then check with `screenshot`, `tap`, `touch_path`, `touch2_path` and `open_url`. The simulator reaches this Mac at `localhost`. Add test photos with `xcrun simctl addmedia`.

To test sign-in, start the API with `APP_SCHEME=storystitch://` (a build from Xcode embeds the default scheme) and serve the web app's `/bot-check` page at `EXPO_PUBLIC_WEB_URL`. Failures from the API show up as the bot check message, so read the API's log.

Maestro: `brew install mobile-dev-inc/tap/maestro` (not the `maestro` cask, an unrelated app). Homebrew's Java isn't on the path, so set `JAVA_HOME=/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home`. Maestro sees the accessibility tree, not what Skia draws. The share sheet reports positions relative to itself, so tap inside it with `point`.

Every PR that changes shared screens gets this check. The simulator can't prove real memory limits, speed, the Instagram share or Universal Links.

## CI

- **Fast tier:** `fast` in `ci.yml` on every PR: `pnpm check`, `pnpm build` and the iOS bundle.
- **Slow tier:** `check` in `ci.yml` (`pnpm qa --target=app`) and `ios.yml` (the simulator, 30+ minutes) on PRs into `main`, nightly on `dev`, and PRs labeled `run-sim`. Pushes to `main` run `check` too, because releases and deploys need a passed run on the merge commit. They don't run the simulator.
- **Before pushing:** run the affected tests locally. For simulator changes, run only the affected flows, e.g. `maestro test apps/app/maestro/core/06-share.yaml`. After pushing, move on: don't watch or poll CI.
- **Promoting:** one PR from `dev` into `main`, once or twice a session. It needs 30+ minutes plus fix time, so remind the user and start well before the session ends.
  1. On the latest `dev`, run `pnpm qa --target=app` locally, because PRs into `dev` skip Playwright and acceptance grading. Don't open the PR until it passes.
  2. Read its exit code and check that the end-to-end step ran, then put the commit and result in the PR.
  3. Stop the simulator and local servers first. Only one session can run it at a time, and a worktree needs `.env` and `COMPOSE_PROJECT_NAME=storystitch`.
  4. Skip the local simulator run: a pass here says nothing about iOS, which the promotion PR's simulator run covers.
- **Merging:** `main` has no required checks, so read them first. `release.yml` only looks at `ci.yml`, so a failed simulator run doesn't block a release.

## Rules

- Branch from `dev` and open a PR into it with `gh pr create --base dev`. Never open a PR into `main` unless the user says so.
- Gate unfinished user-facing features behind a flag so `main` stays releasable.
- Grouped buttons in `apps/app` follow the hierarchy in `apps/app/src/ui/Actions.tsx`: one primary, one secondary, the rest quiet.
- Changing user-facing behavior → add or edit its row in `docs/acceptance-criteria.md` and start a test's title with its ID (`it("AC-CROP-02 …")`). `pnpm qa` fails on untested criteria and on IDs that aren't listed.
- New config value → add to `.env.example` and the "where config lives" table in `PROJECT_SETUP.md`; tell the user which hosted environments need it.
