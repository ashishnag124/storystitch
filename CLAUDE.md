# storystitch

pnpm + Turborepo monorepo. `project.json` lists exactly which apps, services and environments exist. Read it before any structural change. `PROJECT_SETUP.md` has hosted URLs and where config lives.

Product requirements: `docs/product-brief.md`. Acceptance criteria (what QA checks before every release): `docs/acceptance-criteria.md`.

## Where code goes

| Change | Location |
|---|---|
| Data shape / shared contract (layouts and their types) | `packages/shared/src/` (zod) first, then implement |
| Cropping, assignment, ranking (pure functions) | `packages/layout-engine/src/` |
| App logic with no UI or browser APIs (scene, layout editor drafts, API calls) | `packages/client/src/` |
| Web app UI | `apps/web/src/` |
| On-device subject detection (Web Worker, MediaPipe) | `apps/web/src/detect/`; models in `apps/web/public/models/` |
| End-to-end tests (Playwright) | `apps/web/e2e/` |
| API request/response shapes | `packages/shared/src/api.ts` (zod) first, then the API and its callers |
| API routes, database access | `apps/api/src/` (Hono); tables in `apps/api/src/db/schema.ts` |
| Accounts (sign-in, sessions, emails) | API: `apps/api/src/auth.ts` (Better Auth), `src/email.ts`; web: `apps/web/src/account/` (loaded only when `VITE_FEATURE_ACCOUNTS=true`) |
| Database changes | edit `schema.ts`, then `pnpm db:generate`; commit the SQL in `apps/api/drizzle/`. Must keep working with the previous API version and every supported app version (`MIN_IOS_APP_VERSION` and up; iOS users stay on old versions for months): add first, remove in a later release |

A request that needs an app or service not in `project.json` (e.g. "add an iOS app", "send emails", "add a background job") → stop and propose `/add-app` or a plan. Don't bolt it on ad hoc.

## Environments

- **Local** is the default for everything: `.env`, `pnpm dev`. Run, test and debug here.
- **Staging** = whatever is on `main`. You get there by merging a PR, nothing else.
- **Production** = the `production` branch, moved only by `/release` after the user confirms.
- Never deploy to or change settings on staging or production yourself. If debugging needs hosted logs, ask the user to run the command and paste the output.

## Commands

- `pnpm dev` (local Postgres in Docker, web :5173, API :3001; this Mac has an SSH tunnel on :3000) · `pnpm db:generate` / `pnpm db:migrate` · `pnpm check` (lint + typecheck + test, run before saying done) · `pnpm build` · `pnpm e2e` (Playwright, Android Chrome + iPhone WebKit emulation) · `pnpm qa` (everything above, graded against the acceptance criteria; CI and every release run it; `--target=app` grades the Expo app instead of `apps/web`)

## Rules

- Work on a branch, open a PR with `gh pr create`; CI must pass.
- Gate unfinished user-facing features behind a flag so `main` stays releasable.
- Changing user-facing behavior → add or edit its row in `docs/acceptance-criteria.md` and start a test's title with its ID (`it("AC-CROP-02 …")`). `pnpm qa` fails on untested criteria and on IDs that aren't listed.
- New config value → add to `.env.example` and the "where config lives" table in `PROJECT_SETUP.md`; tell the user which hosted environments need it.
