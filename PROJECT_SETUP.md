# storystitch — project setup

Web-only product: no API, database or backend. All image processing runs in the browser.

## Services and URLs

| | Local | Staging | Production |
|---|---|---|---|
| Trigger | `pnpm dev` | merge to `main` (CI deploys) | `/release` → `production` branch |
| Web | http://localhost:5173 | https://main.storystitch-web.pages.dev | https://storystitch-web.pages.dev |

- GitHub: https://github.com/ashishnag124/storystitch (private)
- Cloudflare Pages project: `storystitch-web` (classic Pages, Direct Upload; production branch `production`)
- Production shows "Deployment Not Found" until the first `/release`.

## Where config lives

| Value | Where | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets (loaded from `~/.config/new-project/secrets.env`) | `_deploy-pages.yml` |
| `PAGES_PROJECT` = `storystitch-web` | GitHub variable | `ci.yml`, `release.yml` |

There are no app config values yet; `.env.example` is empty.

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
| B0 | Brief v2, planned criteria, legal drafts, accounts and DNS (checklist below) | in progress |
| B1 | API + Postgres on Railway (staging, production), custom domains, CI/release/QA wiring, feature flag | not started |
| B2 | Text-message and email sign-in (Better Auth, Twilio Verify, Resend, Turnstile), account deletion | not started |
| B3 | Save collages to Cloudflare R2, "My stories", storage limits | not started |
| B4 | Supporter pass (Lemon Squeezy, pay what you want, $3 minimum) | not started |
| B5 | Admin analytics (`/admin`, desktop, admin login with authenticator code) | not started |

### B0 checklist (yours)

Add each secret as a `KEY=value` line to `~/.config/new-project/secrets.env`, the same file as the Cloudflare token.
Claude never reads that file; it loads values from it into Railway and GitHub when a milestone needs them.

- [ ] **Railway**: sign up at railway.com, then run `railway login` in a terminal. Claude creates the project in B1.
- [ ] **Twilio** (text-message codes): sign up and upgrade from trial (trial accounts can only text verified numbers).
  - Verify → create two services: `StoryStitch staging` and `StoryStitch production`.
  - Verify → Geo permissions: allow only the United States and Canada.
  - Turn on Fraud Guard for both services.
  - Secrets: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SID_STAGING`, `TWILIO_VERIFY_SID_PRODUCTION`.
- [ ] **Resend** (sign-in and password-reset email): sign up, add the domain `storystitch.ashishnag.com`, add the DNS
  records it shows (below), wait for "Verified", then create an API key.
  - Secret: `RESEND_API_KEY`.
- [ ] **Lemon Squeezy**: sign up and create a store named StoryStitch. Stay in test mode: activating the store needs
  the live privacy and terms pages, which ship in B2. Ask support whether a pay-what-you-want "Supporter pass" with
  perks (higher storage limit, badge) is acceptable.
  - Secrets (test mode): `LEMONSQUEEZY_API_KEY`, `LEMONSQUEEZY_STORE_ID`.
- [ ] **Cloudflare Turnstile** (bot check before sending a code): Cloudflare dashboard → Turnstile → add a widget
  for `storystitch.ashishnag.com` and `staging.storystitch.ashishnag.com`, mode "Managed".
  - Secrets: `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`.
- [ ] **Cloudflare R2** (saved collages): Cloudflare dashboard → R2 → enable it. It asks for a payment method even on
  the free tier (10 GB free). Claude creates the buckets in B3.
- [ ] **Production web domain**: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Custom domains → add
  `storystitch.ashishnag.com`, then add the DNS record below in Squarespace. The current v1 site goes live there.
- [ ] **Legal drafts**: fill in the `[TODO]`s in `docs/legal/privacy-policy.md` and `docs/legal/terms.md` and have them
  reviewed.

### DNS records (Squarespace → Domains → ashishnag.com → DNS)

| Host | Type | Value | When |
|---|---|---|---|
| `storystitch` | CNAME | `storystitch-web.pages.dev` | B0, after adding the domain in Cloudflare Pages |
| Records Resend shows (MX and TXT on `send.storystitch`, TXT `resend._domainkey.storystitch`) | as shown | as shown | B0 |
| `staging.storystitch` | CNAME | `main.storystitch-web.pages.dev` | B1, once Claude confirms Pages accepts a custom domain for the `main` branch |
| `api.storystitch` | CNAME | given by Railway | B1 |
| `api-staging.storystitch` | CNAME | given by Railway | B1 |

## Release

Run `/release` in Claude Code from this repo. It checks CI on `main`, shows what's shipping and the manual acceptance checks, asks for confirmation, then runs the Release workflow. That workflow re-runs `pnpm qa` (every criterion in `docs/acceptance-criteria.md`) on the exact commit, and only if it passes fast-forwards `production`, tags `vX.Y.Z` and deploys the web app to production. The QA report is attached to the run as the `qa-results-vX.Y.Z` artifact.

## Add an app or service

Run `/add-app` (e.g. an iOS app, API + database, accounts). It updates `project.json`, CI and release.

## Rollback

- Web: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Deployments → roll back to a previous production deployment. Then fix forward on `main` and `/release` again.
- There is no database, so there are no migrations to roll back.
