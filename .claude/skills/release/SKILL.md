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
5. Ask for explicit confirmation of version and commit. Stop unless the user says yes.
6. `gh workflow run release.yml -f version=<version> -f sha=$MAIN_SHA`, then find the run and `gh run watch` it.
7. After success: `curl -fsS -o /dev/null <production web URL>` succeeds. Report production URLs and the release link.

Never push to the `production` branch yourself. If the workflow fails, report the failing step; don't retry with a different method.
