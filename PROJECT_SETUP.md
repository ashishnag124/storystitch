# storystitch — project setup

Web app on Cloudflare Pages, plus an API with Postgres on Railway (from v2). All image processing still runs in the browser.

## Services and URLs

| | Local | Staging | Production |
|---|---|---|---|
| Trigger | `pnpm dev` | merge to `main` (CI deploys) | `/release` → `production` branch |
| Web | http://localhost:5173 | https://main.storystitch-web.pages.dev | https://storystitch.ashishnag.com (also https://storystitch-web.pages.dev) |
| API | http://localhost:3000 | https://api-staging.storystitch.ashishnag.com (also https://api-staging-d014.up.railway.app) | https://api.storystitch.ashishnag.com (set up before the next `/release`) |
| Database | Docker Postgres (`docker compose`) | Railway Postgres, `staging` environment | Railway Postgres, `production` environment |

- GitHub: https://github.com/ashishnag124/storystitch (private)
- Cloudflare Pages project: `storystitch-web` (classic Pages, Direct Upload; production branch `production`)
- Railway project: `storystitch`, services `api` and `Postgres`, environments `staging` (deploys `main`) and `production` (deploys the `production` branch, so only `/release` moves it). Migrations run before each deploy (`railway.json` → `preDeployCommand`), and Railway only switches traffic once `/health` answers.

## Where config lives

| Value | Where | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets (loaded from `~/.config/new-project/secrets.env`) | `_deploy-pages.yml` |
| `PAGES_PROJECT` = `storystitch-web` | GitHub variable | `ci.yml`, `release.yml` |
| `API_URL_STAGING`, `API_URL_PRODUCTION` | GitHub variables | web builds (`VITE_API_URL`) in `ci.yml` / `release.yml` |
| `DATABASE_URL` (reference `${{Postgres.DATABASE_URL}}`), `CORS_ORIGIN`, `NODE_ENV` | Railway variables on `api`, per environment | the API |
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
| B2 | Optional email and password accounts (Better Auth, Resend, Turnstile), account deletion. Text-message sign-in deferred | not started |
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

- [ ] **DNS for the staging API** (Squarespace), then tell Claude so it can check the certificate:
  - `api-staging.storystitch` · CNAME · `y17fnxjl.up.railway.app`
  - `_railway-verify.api-staging.storystitch` · TXT ·
    `railway-verify=4d8d6b576613c4f6735b1188f2f6a7e761b045b8c1b9d68ab5ec268aa1da0e8d`
- [ ] **Production API** (Claude can't touch Railway's production environment). From the repo folder, run these and
  share the output of the last one:
  ```bash
  railway variable set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' -s api -e production --skip-deploys
  railway variable set NODE_ENV=production -s api -e production --skip-deploys
  railway variable set 'CORS_ORIGIN=https://storystitch.ashishnag.com,https://storystitch-web.pages.dev' -s api -e production --skip-deploys
  railway domain api.storystitch.ashishnag.com -s api -e production --json
  ```
  Then add the CNAME and TXT records it prints (like the staging ones) in Squarespace.
- [ ] **Before the next `/release`** (when the `production` branch will contain the API): connect production to its
  branch. Doing it earlier starts a deploy of v0.1.0, which has no API, and fails.
  ```bash
  railway service source connect --repo ashishnag124/storystitch --branch production --service api -e production
  ```
- [ ] **Railway dashboard → `api` → Settings**, in each environment: turn on "Wait for CI", so Railway deploys only
  commits whose GitHub checks passed.

### DNS records (Squarespace → Domains → ashishnag.com → DNS)

| Host | Type | Value | When |
|---|---|---|---|
| `storystitch` | CNAME | `storystitch-web.pages.dev` | done |
| Records Resend shows (MX and TXT on `send.storystitch`, TXT `resend._domainkey.storystitch`) | as shown | as shown | B0 |
| `staging.storystitch` | CNAME | on hold: Pages routes a custom domain to a branch only through a proxied Cloudflare DNS record, so a Squarespace CNAME would show production. Decision pending | — |
| `api-staging.storystitch` + `_railway-verify.api-staging.storystitch` | CNAME + TXT | see the B1 checklist | B1 |
| `api.storystitch` + `_railway-verify.api.storystitch` | CNAME + TXT | printed by the production `railway domain` command | B1 |

## Release

Run `/release` in Claude Code from this repo. It checks CI on `main`, shows what's shipping and the manual acceptance checks, asks for confirmation, then runs the Release workflow. That workflow re-runs `pnpm qa` (every criterion in `docs/acceptance-criteria.md`) on the exact commit, and only if it passes fast-forwards `production`, tags `vX.Y.Z` and deploys the web app to production. The QA report is attached to the run as the `qa-results-vX.Y.Z` artifact.

## Add an app or service

Run `/add-app` (e.g. an iOS app, API + database, accounts). It updates `project.json`, CI and release.

## Rollback

- Web: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Deployments → roll back to a previous production deployment. Then fix forward on `main` and `/release` again.
- API: Railway dashboard → `api` → Deployments → redeploy the previous one. Migrations aren't rolled back: they're written to work with the previous API version (add first, remove later), so the older API keeps working against the newer schema.
