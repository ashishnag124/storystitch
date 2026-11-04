---
name: release
description: Promote the current main (already deployed to staging) to production via the Release workflow.
disable-model-invocation: true
argument-hint: "[patch|minor|major]"
---

Release to production. Bump type: `$ARGUMENTS` (default `minor`).

1. `git fetch --tags origin`. Get `MAIN_SHA=$(git rev-parse origin/main)`.
2. Check CI for that commit: `gh run list --workflow ci.yml --commit $MAIN_SHA --event push --limit 1`. Not `success` → stop and report.
3. Last tag: `git describe --tags --abbrev=0 origin/main` (none → treat as `v0.0.0`). Compute the next version from the bump type.
4. Show the user, concisely:
   - commits since the last tag (`git log --oneline <last>..$MAIN_SHA`)
   - migration files added since the last tag (`git diff --name-only <last>..$MAIN_SHA -- apps/api/drizzle`), and flag any `DROP`, `RENAME`, or `ALTER ... TYPE` in them as needing a backward-compatibility check
   - the staging URLs from `PROJECT_SETUP.md` so they can confirm staging looks right
   - the `manual` rows of `docs/acceptance-criteria.md`, as the hand checks to confirm on staging (the workflow re-runs every `auto` row itself)
5. Ask for explicit confirmation of version and commit. Stop unless the user says yes.
6. `gh workflow run release.yml -f version=<version> -f sha=$MAIN_SHA`, then find the run and `gh run watch` it. Its `qa` job re-runs `pnpm qa` on that commit before anything is promoted; if it fails, report the failing criteria from the job summary (or the `qa-results-<version>` artifact) and stop.
7. After success: `curl -fsS -o /dev/null <production web URL>` succeeds.
8. If the release changed anything Railway watches (`git diff --name-only <last>..$MAIN_SHA -- apps/api packages pnpm-lock.yaml railway.json` lists files), the API deploys on its own about 80 seconds after promote. Poll the production API's `/health` every 10 seconds, for up to 5 minutes, until `version` equals `$MAIN_SHA`. Don't report the API as behind, and don't send the user to Railway, before those 5 minutes are up. With no such files, Railway skips the deploy and `version` stays on the older commit, which is fine.
9. Report production URLs and the release link. If the API still hasn't updated after 5 minutes, ask the user to paste Railway's deployment list for the `api` service in production. A deploy stuck waiting for approval means Railway has lost the link to their GitHub account: they reconnect GitHub in Railway's account settings and approve that one deploy, and later ones run on their own.

Never push to the `production` branch yourself. If the workflow fails, report the failing step; don't retry with a different method.
