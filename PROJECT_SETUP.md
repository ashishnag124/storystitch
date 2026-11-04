# storystitch — project setup

Web app on Cloudflare Pages, plus an API with Postgres on Railway (from v2). All image processing still runs in the browser.

## Services and URLs

| | Local | Staging | Production |
|---|---|---|---|
| Trigger | `pnpm dev` | merge to `main` (CI deploys) | `/release` → `production` branch |
| Web | http://localhost:5173 | https://staging.storystitch.ashishnag.com (also https://storystitch-web-staging.pages.dev) | https://storystitch.ashishnag.com (also https://storystitch-web.pages.dev) |
| API | http://localhost:3001 | https://api-staging.storystitch.ashishnag.com (also https://api-staging-d014.up.railway.app) | https://api.storystitch.ashishnag.com (set up before the next `/release`) |
| Database | Docker Postgres (`docker compose`) | Railway Postgres, `staging` environment | Railway Postgres, `production` environment |

- GitHub: https://github.com/ashishnag124/storystitch (private)
- Cloudflare Pages projects (classic Pages, Direct Upload):
  - `storystitch-web`: production, deploys the `production` branch (via `/release`).
  - `storystitch-web-staging`: staging, deploys the Expo app (`apps/app`) from `main` as its own production. Production still deploys `apps/web` until Stage 4 of the move to Expo. It's a separate project because Pages routes a custom domain to a branch only through Cloudflare-proxied DNS, and ashishnag.com's DNS was at Squarespace when staging was set up (it moved to Cloudflare on 2026-11-02). The old staging alias `main.storystitch-web.pages.dev` no longer updates.
- Railway project: `storystitch`, services `api` and `Postgres`, environments `staging` (deploys `main`) and `production` (deploys the `production` branch, so only `/release` moves it). The API applies pending migrations itself at startup, before it serves requests (`apps/api/src/db/migrate.ts`; Railway never ran the `railway.json` pre-deploy command for this service), and Railway only switches traffic once `/health` answers.

## Where config lives

| Value | Where | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets (loaded from `~/.config/new-project/secrets.env`) | `_deploy-pages.yml` |
| `PAGES_PROJECT` = `storystitch-web`, `PAGES_PROJECT_STAGING` = `storystitch-web-staging` | GitHub variables | `release.yml` (production), `ci.yml` (staging) |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_FEATURE_ACCOUNTS`, `EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | Set in `_deploy-pages.yml` from the same inputs and secret as the `VITE_*` values; locally from `.env` | Expo app builds |
| `EXPO_TOKEN` | GitHub secret, not set yet | `mobile.yml` |
| `MOBILE_DELIVERY_ENABLED` = `true` | GitHub variable, not set yet. Anything else, or no `EXPO_TOKEN`, and `mobile.yml` does nothing | `mobile.yml` |
| `APP_VARIANT` = `staging` | `apps/app/eas.json`. Unset means production | `apps/app/app.config.ts`: app ID, scheme and name |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_FEATURE_ACCOUNTS`, `EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR` for iOS | `apps/app/eas.json`, read by EAS builds and by `mobile.yml` for updates | iOS builds and updates |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` for iOS | EAS environment variable, `preview` environment, not set yet. GitHub secrets don't reach EAS builds | iOS builds and updates |
| EAS project ID, App Store Connect app ID | Placeholders in `apps/app/app.config.ts` and `apps/app/eas.json` (both public values) | EAS |
| `API_URL_STAGING`, `API_URL_PRODUCTION` | GitHub variables | web builds (`VITE_API_URL`) in `ci.yml` / `release.yml` |
| `DATABASE_URL` (reference `${{Postgres.DATABASE_URL}}`), `CORS_ORIGIN`, `NODE_ENV` | Railway variables on `api`, per environment | the API |
| `BETTER_AUTH_URL` (the API's own URL), `BETTER_AUTH_SECRET` (random, per environment), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` | Railway variables on `api`, per environment | accounts (B2) |
| `APP_SCHEME` (optional, default `storystitch://`; `storystitch-staging://` on staging), `MIN_IOS_APP_VERSION` (optional, default `1.0.0`) | Railway variables on `api`, per environment | iOS app sign-in; `GET /app/minimum-version`, raised when old app versions must update |
| `TURNSTILE_SITE_KEY` (public), plus the Cloudflare and Resend keys | GitHub secrets, synced with `gh secret set -f ~/.config/new-project/secrets.env` | web builds (`VITE_TURNSTILE_SITE_KEY`) |
| Accounts flag (`VITE_FEATURE_ACCOUNTS`) | `accounts:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging) and `release.yml` (production) | web builds |
| Layout editor flag (`VITE_FEATURE_LAYOUT_EDITOR`, needs accounts) | `layout_editor:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging) and `release.yml` (production) | web builds |
| Local values (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `VITE_API_URL`) | `.env` (copy of `.env.example`) | `pnpm dev`, tests |

## Open checklist

- [ ] Protect the `production` branch (GitHub → Settings → Branches). Needs GitHub Pro or a public repo; the release workflow works without it, it just isn't enforced.
- [ ] Before the first release: check staging by hand on a real phone (iPhone Safari and Android Chrome).
- [ ] Cloudflare is moving Pages into Workers: Wrangler 4.156 delegated `pages project create` to Workers and it failed, so this project was created with `--force` as classic Pages. If `wrangler pages deploy` in CI starts failing the same way, the deploy setup needs revisiting.
- [ ] Custom domain: see B0 below.

## Backend milestones (v2)

What and why: the v2 section of `docs/product-brief.md`. Acceptance criteria: the "v2 (planned)" rows of
`docs/acceptance-criteria.md`. Each milestone is its own PR, behind a feature flag, checked on staging before the next.

| | What | Status |
|---|---|---|
| B0 | Brief v2, planned criteria, legal drafts, accounts and DNS (checklist below) | docs merged; checklist in progress |
| B1 | API + Postgres on Railway (staging, production), custom domains, CI/release/QA wiring | in progress: staging API live; checklist below |
| B2 | Optional email and password accounts (Better Auth, Resend, Turnstile), account deletion, behind `VITE_FEATURE_ACCOUNTS` | on in staging; on in production from the next `/release` |
| B3 | Save collages to Cloudflare R2, "My stories", storage limits | not started |
| B4 | Supporter pass (Lemon Squeezy) | deferred: see "Later" in the brief |
| B5 | Admin analytics (`/admin`, desktop, admin login with authenticator code) | not started |

### B0 checklist (yours)

Add each secret as a `KEY=value` line to `~/.config/new-project/secrets.env`, the same file as the Cloudflare token.
Claude never reads that file; it loads values from it into Railway and GitHub when a milestone needs them.

- [x] **Railway**: sign up at railway.com, then run `railway login` in a terminal. Claude creates the project in B1.
- [ ] **Resend** (verification and password-reset email, needed for B2): sign up, add the domain `storystitch.ashishnag.com`, add the DNS
  records it shows (below), wait for "Verified", then create an API key.
  - Secret: `RESEND_API_KEY`.
- [x] **Cloudflare Turnstile** (bot check on sign-up, sign-in and password reset): Cloudflare dashboard → Turnstile → add a widget
  for `storystitch.ashishnag.com` and `staging.storystitch.ashishnag.com`, mode "Managed".
  - Secrets: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- [x] **Cloudflare R2** (saved collages): Cloudflare dashboard → R2 → enable it. It asks for a payment method even on
  the free tier (10 GB free). Claude creates the buckets in B3.
- [x] **Production web domain**: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Custom domains → add
  `storystitch.ashishnag.com`, then add the DNS record below in Cloudflare. The current v1 site goes live there.
- [ ] **Legal drafts** (postponed: the app has no privacy or terms pages for now): fill in the `[TODO]`s in
  `docs/legal/privacy-policy.md` and `docs/legal/terms.md` and have them reviewed, then add the pages back.

### B1 checklist (yours)

- [ ] **Staging web domain**: Cloudflare dashboard → Workers & Pages → `storystitch-web-staging` → Custom domains →
  add `staging.storystitch.ashishnag.com`, then in Cloudflare DNS add `staging.storystitch` · CNAME ·
  `storystitch-web-staging.pages.dev`. (The project fills in after this PR merges and CI deploys `main` to it.)
- [ ] **DNS for the staging API** (Cloudflare), then tell Claude so it can check the certificate:
  - `api-staging.storystitch` · CNAME · `y17fnxjl.up.railway.app`
  - `_railway-verify.api-staging.storystitch` · TXT ·
    `railway-verify=4d8d6b576613c4f6735b1188f2f6a7e761b045b8c1b9d68ab5ec268aa1da0e8d`
- [ ] **Production API**, and "Wait for CI": see "Accounts in production: step by step" below.

### B2 checklist (yours)

- [ ] **Load the two private keys into Railway staging.** Claude can't read the secrets file, so run this from the
  repo folder (it pipes the values without printing them):
  ```bash
  ( set -a; . ~/.config/new-project/secrets.env; set +a
    printf %s "$RESEND_API_KEY" | railway variable set RESEND_API_KEY --stdin -s api -e staging --skip-deploys
    printf %s "$TURNSTILE_SECRET_KEY" | railway variable set TURNSTILE_SECRET_KEY --stdin -s api -e staging --skip-deploys )
  ```
- [ ] **Resend domain, Turnstile hostnames**: see "Accounts in production: step by step" below.

### Accounts in production: step by step (yours)

This replaces the production items in the B1 and B2 checklists above. Do the parts in order; part 1 can wait on DNS while
you do part 2. Run every command in a terminal from the repo folder (`cd ~/storystitch`). Claude can't do these itself:
it can't read your secrets file or change Railway's production environment.

**Adding a DNS record in Cloudflare** (used in parts 1 and 2): ashishnag.com's nameservers point to Cloudflare, so
records in Squarespace no longer do anything. Cloudflare dashboard → `ashishnag.com` → DNS → Records → Add record. In
**Name**, type only the part before `.ashishnag.com` (for `send.storystitch.ashishnag.com`, type `send.storystitch`),
because Cloudflare adds `.ashishnag.com` itself. For CNAME records, set **Proxy status** to **DNS only** (grey cloud):
Railway can't issue its certificate, and Resend can't verify, through Cloudflare's proxy. Records usually work within
a minute.

#### 1. Verify the sending domain in Resend

Until this is done, email can only go to the address on your Resend account.

1. Go to resend.com → Domains → Add Domain → enter `storystitch.ashishnag.com`, region `us-east-1`.
2. Resend shows these records. Leave "Enable sending" on and "Enable receiving" off, and add each record in
   Cloudflare by hand rather than with its "Go to Cloudflare" button, copying the full value
   with Resend's copy button (the page shortens long values with `[...]`):
   - TXT · `resend._domainkey.storystitch` · the long `p=MIGf...` value (DKIM)
   - CNAME · `rsend.storystitch` · the `...mta.net` value Resend shows for it
   - CNAME · `send.storystitch` · the `...mta.net` value Resend shows for it
   - TXT · `_dmarc.storystitch` · `v=DMARC1; p=none;` (marked optional, but Gmail expects it. Resend names it
     `_dmarc`, which would cover all of ashishnag.com; `_dmarc.storystitch` limits it to StoryStitch)
3. In Resend, click **Verify DNS Records**, and wait until the domain shows **Verified**.
4. Tell Claude "Resend verified". Claude checks the records, then switches staging's sender to
   `StoryStitch <no-reply@storystitch.ashishnag.com>`. Production uses that sender from the start.

#### 2. Set up the production API on Railway

1. Set the production API's settings. These don't start a deploy (`--skip-deploys`):
   ```bash
   railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' -s api -e production --skip-deploys
   railway variable set NODE_ENV=production EMAIL_TRANSPORT=resend -s api -e production --skip-deploys
   railway variable set 'CORS_ORIGIN=https://storystitch.ashishnag.com,https://storystitch-web.pages.dev' -s api -e production --skip-deploys
   railway variable set BETTER_AUTH_URL=https://api.storystitch.ashishnag.com -s api -e production --skip-deploys
   railway variable set 'EMAIL_FROM=StoryStitch <no-reply@storystitch.ashishnag.com>' -s api -e production --skip-deploys
   ```
2. Add the secret keys. This copies them from your secrets file, and makes a new random sign-in secret, without
   printing any of them:
   ```bash
   ( set -a; . ~/.config/new-project/secrets.env; set +a
     printf %s "$RESEND_API_KEY" | railway variable set RESEND_API_KEY --stdin -s api -e production --skip-deploys
     printf %s "$TURNSTILE_SECRET_KEY" | railway variable set TURNSTILE_SECRET_KEY --stdin -s api -e production --skip-deploys
     openssl rand -base64 32 | tr -d '\n' | railway variable set BETTER_AUTH_SECRET --stdin -s api -e production --skip-deploys )
   ```
3. Give the API its address:
   ```bash
   railway domain api.storystitch.ashishnag.com -s api -e production --json
   ```
   It prints two records: a CNAME (host `api.storystitch`) and a TXT (host `_railway-verify.api.storystitch`). Add
   both in Cloudflare, with the CNAME set to DNS only.
4. Connect production to the `production` branch, then deploy it. The settings from steps 1 and 2 only reach a deploy
   started after they're saved (`--skip-deploys` holds them back), so the deploy that `connect` starts crashes with
   every setting "undefined"; the redeploy fixes that:
   ```bash
   railway service source connect --repo ashishnag124/storystitch --branch production --service api -e production
   railway redeploy --from-source -s api -e production -y
   ```
5. In the Railway dashboard → `storystitch` → `api` → Settings → Source, turn on **Wait for CI**, once with the
   environment switcher on `production` and once on `staging`.
6. Tell Claude "production API done". Claude checks the DNS records, the certificate, and that
   https://api.storystitch.ashishnag.com/health answers with the released version. If the deploy failed, Claude will
   ask you to run `railway logs -s api -e production` and paste the output.

#### 3. Check the Turnstile hostnames

1. Cloudflare dashboard → Turnstile → open the StoryStitch widget → Settings (or Edit).
2. Under **Hostnames**, make sure both `storystitch.ashishnag.com` and `staging.storystitch.ashishnag.com` are listed.
   Add any that are missing, and save. (The `pages.dev` addresses don't need adding: sign-up there fails the bot check,
   which is fine.)

#### 4. Turn accounts on (Claude)

When parts 1 to 3 are done, tell Claude. Claude opens a PR that builds production with accounts on and, once you
approve, merges it. Then run `/release`, and sign up on https://storystitch.ashishnag.com from a real phone to check
the verification email arrives.

### iOS delivery checklist (yours)

`.github/workflows/mobile.yml` does nothing until step 8. No iOS build has run yet, so expect to fix things on the
first one. Claude can't do these: they need your Apple and Expo accounts. Run commands from `apps/app`.

- [ ] 1. **Apple Developer Program**: join at developer.apple.com/programs. Approval can take a few days.
- [ ] 2. **Expo account**: sign up at expo.dev, then run `npx eas-cli@27.2.0 login`.
- [ ] 3. **EAS project**: on expo.dev, create a project with the slug `storystitch`. Don't use `eas init`: it can't edit
  `app.config.ts`. Copy the project ID into `EAS_PROJECT_ID` in `apps/app/app.config.ts`.
- [ ] 4. **Staging app in App Store Connect**: add an app with the bundle ID `com.ashishnag.storystitch.staging`, named
  StoryStitch Staging. Copy its numeric Apple ID into `ascAppId` in `apps/app/eas.json`. Merge steps 3 and 4 as a PR.
- [ ] 5. **Turnstile site key for iOS**: the same public key as `TURNSTILE_SITE_KEY`, on the `preview` environment:
  ```bash
  npx eas-cli@27.2.0 env:set preview --name EXPO_PUBLIC_TURNSTILE_SITE_KEY --value YOUR_SITE_KEY --visibility plaintext --scope project
  ```
- [ ] 6. **First build and upload, by hand**: CI can't answer Apple's prompts, so run the `testflight` profile once
  with `npx eas-cli@27.2.0 build` and `--platform ios --profile testflight --auto-submit`, signing in to Apple when
  asked. Accept when it offers to create the signing credentials and the App Store Connect API key. Answer the export
  compliance question for the build in App Store Connect.
- [ ] 7. **`EXPO_TOKEN`**: expo.dev → Account settings → Access tokens → create one, then `gh secret set EXPO_TOKEN` and
  paste it.
- [ ] 8. **Turn it on**, last of all: `gh variable set MOBILE_DELIVERY_ENABLED --body true`. The next merge to `main`
  that passes CI runs it. To turn it off, delete the variable.

The API side also needs `APP_SCHEME=storystitch-staging://` on staging.

### DNS records (Cloudflare → ashishnag.com → DNS → Records)

| Host | Type | Value | When |
|---|---|---|---|
| `storystitch` | CNAME | `storystitch-web.pages.dev` | done |
| `resend._domainkey.storystitch`, `rsend.storystitch`, `send.storystitch`, `_dmarc.storystitch` | TXT, CNAME, CNAME, TXT | as Resend shows | done |
| `staging.storystitch` | CNAME | `storystitch-web-staging.pages.dev` | done |
| `api-staging.storystitch` + `_railway-verify.api-staging.storystitch` | CNAME + TXT | see the B1 checklist | done |
| `api.storystitch` + `_railway-verify.api.storystitch` | CNAME + TXT | printed by the production `railway domain` command | done |

## Release

Run `/release` in Claude Code from this repo. It checks CI on `main`, shows what's shipping and the manual acceptance checks, asks for confirmation, then runs the Release workflow. That workflow re-runs `pnpm qa` (every criterion in `docs/acceptance-criteria.md`) on the exact commit, and only if it passes fast-forwards `production`, tags `vX.Y.Z` and deploys the web app to production. The QA report is attached to the run as the `qa-results-vX.Y.Z` artifact.

## Add an app or service

Run `/add-app` (e.g. an iOS app, API + database, accounts). It updates `project.json`, CI and release.

## Rollback

- Web: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Deployments → roll back to a previous production deployment. Then fix forward on `main` and `/release` again.
- API: Railway dashboard → `api` → Deployments → redeploy the previous one. Migrations aren't rolled back: they're written to work with the previous API version (add first, remove later), so the older API keeps working against the newer schema.
