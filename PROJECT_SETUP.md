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
  - `storystitch-web-staging`: staging, deploys `main` as its own production. It's a separate project because Pages routes a custom domain to a branch only through Cloudflare-proxied DNS, and ashishnag.com's DNS is at Squarespace. The old staging alias `main.storystitch-web.pages.dev` no longer updates.
- Railway project: `storystitch`, services `api` and `Postgres`, environments `staging` (deploys `main`) and `production` (deploys the `production` branch, so only `/release` moves it). The API applies pending migrations itself at startup, before it serves requests (`apps/api/src/db/migrate.ts`; Railway never ran the `railway.json` pre-deploy command for this service), and Railway only switches traffic once `/health` answers.

## Where config lives

| Value | Where | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets (loaded from `~/.config/new-project/secrets.env`) | `_deploy-pages.yml` |
| `PAGES_PROJECT` = `storystitch-web`, `PAGES_PROJECT_STAGING` = `storystitch-web-staging` | GitHub variables | `release.yml` (production), `ci.yml` (staging) |
| `API_URL_STAGING`, `API_URL_PRODUCTION` | GitHub variables | web builds (`VITE_API_URL`) in `ci.yml` / `release.yml` |
| `DATABASE_URL` (reference `${{Postgres.DATABASE_URL}}`), `CORS_ORIGIN`, `NODE_ENV` | Railway variables on `api`, per environment | the API |
| `BETTER_AUTH_URL` (the API's own URL), `BETTER_AUTH_SECRET` (random, per environment), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` | Railway variables on `api`, per environment | accounts (B2) |
| `TURNSTILE_SITE_KEY` (public), plus the Cloudflare and Resend keys | GitHub secrets, synced with `gh secret set -f ~/.config/new-project/secrets.env` | web builds (`VITE_TURNSTILE_SITE_KEY`) |
| Accounts flag (`VITE_FEATURE_ACCOUNTS`) | `accounts:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging), off in `release.yml` (production) | web builds |
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
| B2 | Optional email and password accounts (Better Auth, Resend, Turnstile), account deletion. On in staging only, behind `VITE_FEATURE_ACCOUNTS` | in progress: checklist below |
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
  `storystitch.ashishnag.com`, then add the DNS record below in Squarespace. The current v1 site goes live there.
- [ ] **Legal drafts**: fill in the `[TODO]`s in `docs/legal/privacy-policy.md` and `docs/legal/terms.md` and have them
  reviewed.

### B1 checklist (yours)

- [ ] **Staging web domain**: Cloudflare dashboard → Workers & Pages → `storystitch-web-staging` → Custom domains →
  add `staging.storystitch.ashishnag.com`, then in Squarespace add `staging.storystitch` · CNAME ·
  `storystitch-web-staging.pages.dev`. (The project fills in after this PR merges and CI deploys `main` to it.)
- [ ] **DNS for the staging API** (Squarespace), then tell Claude so it can check the certificate:
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
- [ ] **Resend domain, Turnstile hostnames, legal drafts**: see "Accounts in production: step by step" below.

### Accounts in production: step by step (yours)

This replaces the production items in the B1 and B2 checklists above. Do the parts in order; part 1 can wait on DNS while
you do part 2. Run every command in a terminal from the repo folder (`cd ~/storystitch`). Claude can't do these itself:
it can't read your secrets file or change Railway's production environment.

**Adding a DNS record in Squarespace** (used in parts 1 and 2): Squarespace → Domains → `ashishnag.com` → DNS → DNS
Settings → Custom records → Add record. In **Host**, type only the part before `.ashishnag.com` (for
`send.storystitch.ashishnag.com`, type `send.storystitch`), because Squarespace adds `.ashishnag.com` itself. Records
usually work within minutes, but can take up to a few hours.

#### 1. Verify the sending domain in Resend

Until this is done, email can only go to the address on your Resend account.

1. Go to resend.com → Domains → Add Domain → enter `storystitch.ashishnag.com`, region `us-east-1`.
2. Resend shows about three records: an MX and a TXT record on `send.storystitch`, and a TXT record on
   `resend._domainkey.storystitch`. Add each one in Squarespace. Copy every value exactly; for the MX record, also
   copy the priority (usually 10).
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
   both in Squarespace.
4. Connect production to the `production` branch. This starts the first production deploy:
   ```bash
   railway service source connect --repo ashishnag124/storystitch --branch production --service api -e production
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

#### 4. Fill in the legal pages

`/privacy` and `/terms` show `docs/legal/privacy-policy.md` and `docs/legal/terms.md`. The easiest way: send Claude
these answers, and it fills in every `[TODO]` in a PR.

- Your legal name or business name, as the one running StoryStitch.
- A contact email for privacy questions (for example `privacy@storystitch.ashishnag.com`; it needs to be a real inbox).
- How many days server logs are kept (the draft suggests 30), and how many days until deleted data leaves backups
  (the draft suggests 30).
- The minimum age: 13, or 16 if you want to serve people in the EU.
- The US state whose laws apply.
- The effective date (the day accounts go live in production).

These are drafts, not legal advice: have someone qualified review them before accounts go live.

#### 5. Turn accounts on (Claude)

When parts 1 to 4 are done, tell Claude. Claude opens a PR that builds production with accounts on and, once you
approve, merges it. Then run `/release`, and sign up on https://storystitch.ashishnag.com from a real phone to check
the verification email arrives.

### DNS records (Squarespace → Domains → ashishnag.com → DNS)

| Host | Type | Value | When |
|---|---|---|---|
| `storystitch` | CNAME | `storystitch-web.pages.dev` | done |
| Records Resend shows (MX and TXT on `send.storystitch`, TXT `resend._domainkey.storystitch`) | as shown | as shown | B0 |
| `staging.storystitch` | CNAME | `storystitch-web-staging.pages.dev` | B1, after adding the domain to the `storystitch-web-staging` Pages project |
| `api-staging.storystitch` + `_railway-verify.api-staging.storystitch` | CNAME + TXT | see the B1 checklist | B1 |
| `api.storystitch` + `_railway-verify.api.storystitch` | CNAME + TXT | printed by the production `railway domain` command | B1 |

## Release

Run `/release` in Claude Code from this repo. It checks CI on `main`, shows what's shipping and the manual acceptance checks, asks for confirmation, then runs the Release workflow. That workflow re-runs `pnpm qa` (every criterion in `docs/acceptance-criteria.md`) on the exact commit, and only if it passes fast-forwards `production`, tags `vX.Y.Z` and deploys the web app to production. The QA report is attached to the run as the `qa-results-vX.Y.Z` artifact.

## Add an app or service

Run `/add-app` (e.g. an iOS app, API + database, accounts). It updates `project.json`, CI and release.

## Rollback

- Web: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Deployments → roll back to a previous production deployment. Then fix forward on `main` and `/release` again.
- API: Railway dashboard → `api` → Deployments → redeploy the previous one. Migrations aren't rolled back: they're written to work with the previous API version (add first, remove later), so the older API keeps working against the newer schema.
