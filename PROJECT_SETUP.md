# storystitch — project setup

Web app on Cloudflare Pages, plus an API with Postgres on Railway (from v2). All image processing still runs in the browser.

## Services and URLs

| | Local | Staging | Production |
|---|---|---|---|
| Trigger | `pnpm dev` | merge to `main` (CI deploys) | `/release` → `production` branch |
| Web | http://localhost:5174 | https://staging.storystitch.ashishnag.com (also https://storystitch-web-staging.pages.dev) | https://storystitch.ashishnag.com (also https://storystitch-web.pages.dev) |
| API | http://localhost:3001 | https://api-staging.storystitch.ashishnag.com (also https://api-staging-d014.up.railway.app) | https://api.storystitch.ashishnag.com (set up before the next `/release`) |
| Database | Docker Postgres (`docker compose`) | Railway Postgres, `staging` environment | Railway Postgres, `production` environment |

- GitHub: https://github.com/ashishnag124/storystitch (private)
- Cloudflare Pages projects (classic Pages, Direct Upload):
  - `storystitch-web`: production, deploys the Expo app (`apps/app`) from the `production` branch (via `/release`).
  - `storystitch-web-staging`: staging, deploys the Expo app from `main` as its own production. It's a separate project because Pages routes a custom domain to a branch only through Cloudflare-proxied DNS, and ashishnag.com's DNS was at Squarespace when staging was set up (it moved to Cloudflare on 2026-11-02). The old staging alias `main.storystitch-web.pages.dev` no longer updates.
- Railway project: `storystitch`, services `api` and `Postgres`, environments `staging` (deploys `main`) and `production` (deploys the `production` branch, so only `/release` moves it). The API applies pending migrations itself at startup, before it serves requests (`apps/api/src/db/migrate.ts`; Railway never ran the `railway.json` pre-deploy command for this service), and Railway only switches traffic once `/health` answers.

## Where config lives

| Value | Where | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub secrets (loaded from `~/.config/new-project/secrets.env`) | `_deploy-pages.yml` |
| `PAGES_PROJECT` = `storystitch-web`, `PAGES_PROJECT_STAGING` = `storystitch-web-staging` | GitHub variables | `release.yml` (production), `ci.yml` (staging) |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_FEATURE_ACCOUNTS`, `EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | Set in `_deploy-pages.yml` from its inputs and the `TURNSTILE_SITE_KEY` secret; locally from `.env` | Expo app builds |
| `EXPO_TOKEN` | GitHub secret, not set yet | `mobile.yml` |
| `MOBILE_DELIVERY_ENABLED` = `true` | GitHub variable, not set yet. Anything else, or no `EXPO_TOKEN`, and `mobile.yml` does nothing | `mobile.yml` |
| `APP_VARIANT` = `staging` | `apps/app/eas.json`. Unset means production | `apps/app/app.config.ts`: app ID, scheme and name |
| `EXPO_PUBLIC_WEB_URL` (where the iOS app's bot check and emailed links live) | `apps/app/eas.json`; locally from `.env` | iOS builds |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_FEATURE_ACCOUNTS`, `EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR` for iOS | `apps/app/eas.json`, read by EAS builds and by `mobile.yml` for updates | iOS builds and updates |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` for iOS | EAS environment variable, `preview` environment. GitHub secrets don't reach EAS builds | iOS builds and updates |
| `MOBILE_PRODUCTION_ENABLED` | GitHub variable, off until the "iOS production checklist" is done. Allows `mobile-release.yml` to run | production iOS builds |
| `MOBILE_PRODUCTION_UPDATES_ENABLED` (optional, default off) | GitHub variable. `true` lets `mobile-release.yml` publish an update instead of building when a production build has the same native code | production iOS updates |
| `EXPO_PUBLIC_PERF_READOUT` (optional) | Set by hand for a test build on a real phone; never in a hosted environment | shows timing numbers on screen |
| EAS project ID, App Store Connect app ID | `apps/app/app.config.ts`; `apps/app/eas.json`, a placeholder until the checklist below (both public values) | EAS |
| `API_URL_STAGING`, `API_URL_PRODUCTION` | GitHub variables | web builds (`EXPO_PUBLIC_API_URL`) in `ci.yml` / `release.yml` |
| `DATABASE_URL` (reference `${{Postgres.DATABASE_URL}}`), `CORS_ORIGIN`, `NODE_ENV` | Railway variables on `api`, per environment | the API |
| `BETTER_AUTH_URL` (the API's own URL), `BETTER_AUTH_SECRET` (random, per environment), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` | Railway variables on `api`, per environment | accounts (B2) |
| `APP_SCHEME` (optional, default `storystitch://`; `storystitch-staging://` on staging), `MIN_IOS_APP_VERSION` (optional, default `1.0.0`) | Railway variables on `api`, per environment | iOS app sign-in; `GET /app/minimum-version`, raised when old app versions must update |
| `EXPO_PUBLIC_FEATURE_USAGE` (optional, default `false`; needs an API URL) | `usage:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` and `release.yml`; `apps/app/eas.json` for iOS, `true`; locally from `.env` | Expo app builds and updates |
| `EXPO_PUBLIC_FEATURE_FIT_LAYOUTS` (optional, default `false`) | `fit_layouts:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); `apps/app/eas.json` for iOS, `true` in every profile; locally from `.env` | Expo app builds: grid layouts fit their lines to the photos (`fittedLayout`) |
| `USAGE_INGEST_ENABLED` (optional, default `false`) | Railway variable on `api`, per environment, `true` on staging and production. Also the emergency off switch | `POST /usage/events` counts events only when `true` |
| `EXPO_PUBLIC_FEATURE_PLUS` (optional, default `false`; needs accounts and an API URL), `EXPO_PUBLIC_REVENUECAT_WEB_KEY`, `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (public RevenueCat keys) | Not wired into hosted builds yet: the change that turns Plus on for staging adds them to `_deploy-pages.yml` (web, from GitHub variables) and `apps/app/eas.json` (iOS); locally from `.env` | Expo app builds: with it on, the mark switch unlocks only when the API says the account has Plus |
| `EXPO_PUBLIC_FEATURE_ADMIN` (optional, default `false`; needs accounts and an API URL) | `admin:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); locally from `.env`. Web only: iOS builds ignore it. Safe to ship on: the dashboard also needs an admin account with two-factor and the API's `ADMIN_ENABLED` | Expo web build: the `/admin` dashboard (see "B5 checklist") |
| `ADMIN_ENABLED` (optional, default `false`) | Railway variable on `api`, per environment, not set yet: you set it in the "B5 checklist", staging first. Without it `/admin` says it isn't switched on | `GET /admin/stats` and two-factor sign-in (authenticator app) exist only when it's on |
| `PAYMENTS_ENABLED` (optional, default `false`), `REVENUECAT_SECRET_KEY`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_WEBHOOK_SECRET` (all three needed when it's on) | Railway variables on `api`, per environment, not set yet: staging first, with RevenueCat sandbox data (see "B4 checklist"). The webhook secret is the Authorization value set on RevenueCat's webhook | StoryStitch Plus: `POST /payments/revenuecat`, `GET /me/entitlements`, `POST /me/entitlements/refresh`, `POST /entitlements/check` exist only when it's on |
| `TURNSTILE_SITE_KEY` (public), plus the Cloudflare and Resend keys | GitHub secrets, synced with `gh secret set -f ~/.config/new-project/secrets.env` | web builds (`EXPO_PUBLIC_TURNSTILE_SITE_KEY`) |
| Accounts flag (`EXPO_PUBLIC_FEATURE_ACCOUNTS`) | `accounts:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging) and `release.yml` (production) | web builds |
| Layout editor flag (`EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR`, needs accounts) | `layout_editor:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging) and `release.yml` (production) | web builds |
| Blank layout flag (`EXPO_PUBLIC_FEATURE_BLANK_LAYOUT`, optional, default `false`; needs the layout editor) | `blank_layout:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); `apps/app/eas.json` `base` profile (staging iOS: preview and testflight) and `production` profile; locally from `.env`; the E2E build turns it on in `apps/app/package.json` | Expo app builds: "Start from blank" in the Layouts tool |
| Describe a layout flag (`EXPO_PUBLIC_FEATURE_DESCRIBE_LAYOUT`, optional, default `false`; iOS only; needs the layout editor) | `apps/app/eas.json` `base` profile (staging iOS: preview and testflight) only, not `production`; not wired into any web build or workflow (the web app has none of the feature); locally from `.env`; the E2E build turns it on in `apps/app/package.json` to check the web app still has none of it | iOS app builds: "Describe a layout" in the Layouts tool, on iPhones with Apple Intelligence |
| Blur fill flag (`EXPO_PUBLIC_FEATURE_BLUR_FILL`, optional, default `false`) | `blur_fill:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) only, not `release.yml`; `apps/app/eas.json` `base` profile (staging iOS: preview and testflight) only, not `production`; locally from `.env`; the E2E build turns it on in `apps/app/package.json` | Expo app builds: a photo that doesn't cover its cell shows a blurred copy of itself in the rest of the cell |
| Looks flag (`EXPO_PUBLIC_FEATURE_LOOKS`, optional, default `false`) | `looks:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); `apps/app/eas.json` `base` profile (staging iOS: preview and testflight) and `production` profile; off in `ios.yml`'s simulator build (the core flows swipe the Style panel at screen positions); locally from `.env`; the E2E build turns it on in `apps/app/package.json` (the accounts build turns it off, to check the app without it) | Expo app builds: the Look row in the Style tool, filtering every photo in the preview and the export |
| Shuffle flag (`EXPO_PUBLIC_FEATURE_SHUFFLE`, optional, default `false`) | `shuffle:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); `apps/app/eas.json` `base` profile (staging iOS: preview and testflight) and `production` profile; `true` in `ios.yml`'s simulator build (AC-IOS-19 taps it); locally from `.env`; the E2E build turns it on in `apps/app/package.json` (the accounts build turns it off, to check it stays hidden) | Expo app builds: "Shuffle", first in the layout strip |
| Text flag (`EXPO_PUBLIC_FEATURE_TEXT`, optional, default `false`) | `text:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); `apps/app/eas.json` `base` profile (staging iOS: preview and testflight) and `production` profile; off in `ios.yml`'s simulator build (a fourth tool tab moves what the core flows swipe at screen positions); locally from `.env`; the E2E build turns it on in `apps/app/package.json` (the accounts build turns it off, to check the app without it) | Expo app builds: the Text tool, captions on the collage, with its fonts loaded only when it's used |
| Local values (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `EXPO_PUBLIC_API_URL`) | `.env` (copy of `.env.example`) | `pnpm dev`, tests |

## Reading usage numbers

`pnpm usage:report --days 30` prints the counts as Markdown tables and only reads from the database. Locally it uses `.env`.

For staging or production, run the built copy inside the API's container, where `DATABASE_URL` is already set, so the database needs no public address. This has to be run by hand, and hasn't been tried on a hosted environment yet:

```bash
railway ssh --service api --environment staging node dist/reportUsage.js --days 30
```

Staging and production have separate databases. Visitors are daily estimates, so adding days gives visitor-days, not unique people.

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
| B2 | Optional email and password accounts (Better Auth, Resend, Turnstile), account deletion, behind `EXPO_PUBLIC_FEATURE_ACCOUNTS` | on in staging and production |
| B3 | Save collages to Cloudflare R2, "My stories", storage limits | not started |
| B4 | StoryStitch Plus: pay once ($4.99) to remove the mark, through RevenueCat (Apple in-app purchase on iOS, Paddle on web), behind `EXPO_PUBLIC_FEATURE_PLUS` and `PAYMENTS_ENABLED` | in progress; checklist below |
| B5 | Admin analytics (`/admin`, desktop, admin login with authenticator code), behind `EXPO_PUBLIC_FEATURE_ADMIN` (on in hosted web builds) and `ADMIN_ENABLED` (off until you set it) | built; waiting for you to do the "B5 checklist" |

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
- [ ] **Legal pages**: have the policy reviewed. `apps/app/public/privacy.html` and `support.html` are the pages at
  /privacy and /support. `terms.html` and `refunds.html` (/terms and /refunds, text in `docs/legal/terms.md`) are drafts
  for the owner to read before Plus is turned on.
- [x] **Usage tracking** (on in production since v1.0.0, November 7, 2026), before turning it on: have the policy's usage text reviewed, then in App Store Connect → App
  Privacy, for the staging and production apps, add Usage Data → Product Interaction (Analytics) and Diagnostics → Other
  Diagnostic Data (Analytics), both not linked and not used for tracking. Check that Product Interaction also lists App
  Functionality, for the count that ranks layouts. The tracking answer stays No. On Android, the matching Play Console
  answers are App interactions and Diagnostics, collected, not shared.

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

### B4 checklist: StoryStitch Plus (yours)

What and why: "StoryStitch Plus" in `docs/product-brief.md`. Claude builds it behind the flags and tests it with fakes
and test keys; nothing here can be done from Claude Code. Use sandbox and test modes until the last part.

1. **App Store Connect** (the production app, and the staging app for TestFlight):
   - Business → sign the Paid Applications Agreement and add banking and tax details. Purchases fail until it's active.
   - The app → Monetization → In-App Purchases → a **Non-Consumable**, product ID `plus_lifetime`, $4.99, with a
     display name, description and a review screenshot of the upsell. It's submitted together with the next build.
   - Users and Access → Integrations: an **In-App Purchase key** and an **App Store Connect API key**, for RevenueCat.
   - App Privacy: add **Purchases** (purchase history, linked to the user, not used for tracking).
   - Sandbox testers: one tester account, for TestFlight.
2. **RevenueCat** (one project, two apps):
   - An App Store app (bundle IDs `com.ashishnag.storystitch` and `.staging` as separate apps) with the keys above and
     App Store Server Notifications pointed at RevenueCat.
   - A Web app with **Paddle** as the billing engine. If RevenueCat's Web SDK can't sell through Paddle when we get
     there, Claude will say so and the fallback is RevenueCat Web Billing on Stripe.
   - Entitlement `plus`, attached to the iOS and web products; an offering `default` holding both.
   - A webhook to `https://api-staging.storystitch.ashishnag.com/payments/revenuecat` (and the production API later),
     with an Authorization header value you generate (`openssl rand -hex 32`).
3. **Paddle**: an account (sandbox first), website verification (Paddle checks the site has terms, a refund policy,
   pricing and contact details; the drafts of the terms and refund pages are in `apps/app/public/`, for you to read), a $4.99 one-time product, and the
   connection to RevenueCat.
4. **Config**: the values Claude adds to "Where config lives" as each part lands. Staging gets sandbox keys; production
   gets live keys only when you're ready to sell.
5. **Privacy policy**: name RevenueCat and Paddle as processors (drafted in `apps/app/public/privacy.html`; you read it).
6. **App Review note** for the build that adds the purchase: Plus is a one-time purchase that removes the export's
   mark; it can be bought without an account, and Restore purchases is in the upsell.
7. **Turning it on in production** locks a switch that's been free since v1.1.0. Say so in the release notes.

The iOS purchase needs a new build: it adds native code, so an over-the-air update can't deliver it.

### B5 checklist: admin dashboard (yours)

You get a private page, `/admin`, with StoryStitch's usage numbers: daily totals, how many photo sets get exported, the most used layouts and the errors people hit. Only your account can open it, and only after you type a code from an authenticator app.

**Already done for you.** The code is merged. The web flag (`EXPO_PUBLIC_FEATURE_ADMIN`) is on for staging after the next promotion to `main`, and for production after the next `/release`. Until you do step 1, the page says it isn't switched on. Nothing here touches the iOS app.

You need: a desktop browser with a window at least 900 px wide, an authenticator app on your phone (for example Google Authenticator, Microsoft Authenticator or 1Password), the `railway` command logged in (see the B0 checklist), and `psql` installed. To install it on a Mac, run `brew install libpq` and then `brew link --force libpq`. After that `psql --version` should print a version.

**Before you start.** The promotion into `main` must be merged, and staging must have finished deploying both parts. The API deploys within a couple of minutes: run `curl https://api-staging.storystitch.ashishnag.com/health` and check that `version` shows the new commit. The staging website deploys only after the `check` job on `main` finishes, which takes longer. Until then `/admin` shows the old app.

#### On staging

1. **Switch the API on.** In a terminal, in the repo folder, paste:
   ```bash
   railway variable set ADMIN_ENABLED=true -s api -e staging
   ```
   Setting a variable starts an API deploy straight away, from the latest `main`. You should see the variable listed. To check the deploy finished:
   open the Railway dashboard → the StoryStitch project → the `staging` environment → `api` → Deployments. The top one
   should say "Active" (it takes a minute or two). Or run `curl https://api-staging.storystitch.ashishnag.com/health`
   and look for `"database":"up"`.
2. **Make an account for yourself.** Go to https://staging.storystitch.ashishnag.com/sign-up, use the email you want as
   admin, and open the link in the email we send. You should land on the Account page saying "Your email is confirmed
   and you're signed in."
3. **Mark it as admin.** Nothing in the app can do this; it's one line in the database. Wait until the API deploy from step 1 has finished first: that deploy runs the migration that adds the `is_admin` column. This way of reaching the
   staging database has not been tried yet. In a terminal run:
   ```bash
   railway connect Postgres --environment staging
   ```
   When the prompt appears (it ends in `=>` or `=#`), paste the next line with your own email, then press Enter:
   ```sql
   update "user" set is_admin = true where email = 'you@example.com';
   ```
   You should see `UPDATE 1`. If you see `UPDATE 0`, the email doesn't match: check the spelling. Type `\q` to leave.
4. **Set up the authenticator.** On a desktop browser, open https://staging.storystitch.ashishnag.com/admin. If you
   aren't signed in, it asks for your email and password first. Then, in order:
   1. "Admin accounts need an authenticator app…": type your password and press **Set up**.
   2. It shows a key made of letters and numbers. In your authenticator app choose to add an account by typing a key
      (there is no QR code), name it StoryStitch, paste or type the key, and pick the time-based option.
   3. Type the six-digit code the app now shows and press **Verify**.

   You should see the dashboard. Finishing this signs your account out on every other device, so sign in again
   wherever you need it. From now on `/admin` asks for your email, password and then a code.
5. **Look around.** The buttons at the top switch between 7, 30 and 90 days. The page has four parts:
   - **Daily totals**: one row per day, newest first.
   - **Funnel**: photos picked, exported, and saved, with the percentage who got to the next step.
   - **Top layouts**: the ten most exported layouts.
   - **Errors by code**: how often each error was shown.

   Know these limits. Top layouts count all time, so the 7/30/90 switch doesn't change them. "Saved" stays 0 until saved
   collages exist. Visitors are daily estimates, so adding days gives visitor-days, not unique people.

#### Then production

Do the same, with these differences:

- Wait until the production web build has the flag (it does after the next `/release`).
- Step 1: `railway variable set ADMIN_ENABLED=true -s api -e production`, and check the `production` environment in Railway.
- Step 2: your account on https://storystitch.ashishnag.com. Staging and production have separate accounts and databases, so sign up again.
- Step 3: `railway connect Postgres --environment production`.
- Step 4: https://storystitch.ashishnag.com/admin. Use a second entry in your authenticator app, named for production.

#### If something goes wrong

| What the page says | What it means and what to do |
|---|---|
| "This account can't open the admin dashboard." | The account isn't marked admin. Do step 3 for the environment you're on, with the exact email, then reload. Press **Sign out** if you used another account. |
| "The admin dashboard isn't switched on for this site." | The API's `ADMIN_ENABLED` isn't `true` in this environment, or its deploy hasn't finished. Do step 1 and wait for "Active". |
| "Open the admin dashboard on a desktop." | The browser window is under 900 px wide. Make it wider, or use a computer. |
| "That code isn't right. Check the time on your device and try again." | Codes last 30 seconds. Wait for a new one. If it keeps failing, check your phone's clock is set automatically. After several wrong tries it asks you to wait. |
| "Couldn't load the numbers. Try again in a moment." | The API didn't answer. Reload; if it persists, check the deploy in step 1. |
| You lost the authenticator (new phone) | Remove its record, then do step 4 again. In `railway connect Postgres --environment staging` run both lines (use your email): `delete from two_factor where user_id = (select id from "user" where email = 'you@example.com');` then `update "user" set two_factor_enabled = false where email = 'you@example.com';` Each should print `DELETE 1` and `UPDATE 1`. |

### iOS delivery checklist (yours)

`.github/workflows/mobile.yml` does nothing until step 8. No iOS build has run yet, so expect to fix things on the
first one. Claude can't do these: they need your Apple and Expo accounts. Run commands from `apps/app`.

- [x] 1. **Apple Developer Program**: join at developer.apple.com/programs. Approval can take a few days.
- [x] 2. **Expo account**: sign up at expo.dev, then run `npx eas-cli@27.2.0 login`.
- [x] 3. **EAS project**: on expo.dev, create a project with the slug `storystitch`. Don't use `eas init`: it can't edit
  `app.config.ts`. Copy the project ID into `EAS_PROJECT_ID` in `apps/app/app.config.ts`.
- [x] 4. **Staging app in App Store Connect**: first register `com.ashishnag.storystitch.staging` under Certificates,
  Identifiers & Profiles → Identifiers, or App Store Connect won't list it. Then add an app with that bundle ID, named
  StoryStitch Staging. Copy its numeric Apple ID into `ascAppId` in `apps/app/eas.json`. Merge steps 3 and 4 as a PR.
- [x] 5. **Turnstile site key for iOS**: the same public key as `TURNSTILE_SITE_KEY`, on the `preview` environment:
  ```bash
  npx eas-cli@27.2.0 env:set preview --name EXPO_PUBLIC_TURNSTILE_SITE_KEY --value YOUR_SITE_KEY --visibility plaintext --scope project
  ```
- [x] 6. **First build and upload, by hand**: CI can't answer Apple's prompts, so run the `testflight` profile once
  with `npx eas-cli@27.2.0 build` and `--platform ios --profile testflight --auto-submit`, signing in to Apple when
  asked. Accept when it offers to create the signing credentials and the App Store Connect API key.
- [x] 7. **`EXPO_TOKEN`**: expo.dev → Account settings → Access tokens → create one, then `gh secret set EXPO_TOKEN` and
  paste it.
- [x] 8. **Turn it on**, last of all: `gh variable set MOBILE_DELIVERY_ENABLED --body true`. The next merge to `main`
  that passes CI runs it. To turn it off, delete the variable.

The API side also needs `APP_SCHEME=storystitch-staging://` on staging.

Emailed links open the app through Universal Links. Each app claims its API's address in `apps/app/app.config.ts`, and
the API publishes the matching list at `/.well-known/apple-app-site-association`. A hand-run build enables the Associated
Domains capability on the app ID. iOS reads that list when the app is installed, through Apple's cache, so the API has to
serve it before installing, and a change can take a while to reach phones.

### iOS production checklist (yours)

`.github/workflows/mobile-release.yml` builds the production app from a release tag and sends it to App Store
Connect, or publishes it as an update once step 7 is on. It only runs when started by hand, and no build reaches the
App Store until you submit it for review.
The first production build ran by hand from v1.0.0 on November 7, 2026, and `mobile-release.yml` made build 2 from v1.0.1. Run commands from `apps/app`. What to enter in
App Store Connect is in `docs/app-store-submission.md`.

- [x] 1. **Move production web to the Expo app first** (done in v1.0.0, November 7, 2026). iOS sign-in loads the bot
  check from `/bot-check` on the production site.
- [x] 2. **Production app in App Store Connect**: first register `com.ashishnag.storystitch` under Identifiers, as for
  staging. Then add an app with that bundle ID, named StoryStitch. Copy its numeric Apple ID into `submit.production.ios.ascAppId` in `apps/app/eas.json`, and merge that.
- [x] 3. **Turnstile site key for production builds**: the same public key, on the `production` environment:
  ```bash
  npx eas-cli@27.2.0 env:set production --name EXPO_PUBLIC_TURNSTILE_SITE_KEY --value YOUR_SITE_KEY --visibility plaintext --scope project
  ```
- [x] 4. **First production build, by hand**: run the `production` profile once with `npx eas-cli@27.2.0 build` and
  `--platform ios --profile production --auto-submit`, signing in to Apple when asked.
- [x] 5. **Turn it on**: `gh variable set MOBILE_PRODUCTION_ENABLED --body true`. To turn it off, delete the variable.
- [x] 6. **Each later build**: after `/release`, run `gh workflow run mobile-release.yml -f version=vX.Y.Z`.
- [ ] 7. **Updates over the air**, once 1.0.0 is on the App Store: `gh variable set MOBILE_PRODUCTION_UPDATES_ENABLED --body true`.
  From then on `mobile-release.yml` publishes the release as an update to the `production` channel when a production
  build has the same native code (the runtime version, a fingerprint), and builds as before when not. `/release` asks
  first whether any of those builds is in App Store review: an update would reach the reviewer's copy too, so then it
  builds instead (`-f mode=build`). To turn updates off, delete the variable.

The production API already defaults to `APP_SCHEME=storystitch://`, which matches this app.

**What an update may change.** Apple allows downloaded JavaScript to fix bugs and add features, as long as it doesn't
change the app's main purpose, add a store or storefront for other code, or get around App Store review (the Apple
Developer Program License Agreement, and App Review Guideline 2.5.2). A bigger change, or anything needing new permissions or native code,
goes out as a new build through review (`-f mode=build`). An installed app downloads an update when it starts and
uses it from the next start.

### DNS records (Cloudflare → ashishnag.com → DNS → Records)

| Host | Type | Value | When |
|---|---|---|---|
| `storystitch` | CNAME | `storystitch-web.pages.dev` | done |
| `resend._domainkey.storystitch`, `rsend.storystitch`, `send.storystitch`, `_dmarc.storystitch` | TXT, CNAME, CNAME, TXT | as Resend shows | done |
| `staging.storystitch` | CNAME | `storystitch-web-staging.pages.dev` | done |
| `api-staging.storystitch` + `_railway-verify.api-staging.storystitch` | CNAME + TXT | see the B1 checklist | done |
| `api.storystitch` + `_railway-verify.api.storystitch` | CNAME + TXT | printed by the production `railway domain` command | done |

## Release

Run `/release` in Claude Code from this repo. It checks CI on `main`, shows what's shipping and the manual acceptance checks, asks for confirmation, then runs the Release workflow. That workflow re-runs `pnpm qa` (every criterion in `docs/acceptance-criteria.md`) on the exact commit, and only if it passes fast-forwards `production`, tags `vX.Y.Z` and deploys the Expo web app to production. The QA report is attached to the run as the `qa-results-vX.Y.Z` artifact.

## What differs between staging and production

| Setting | Staging | Production | Change needed |
|---|---|---|---|
| Pages project and domain | `storystitch-web-staging`, staging.storystitch.ashishnag.com | `storystitch-web` (`PAGES_PROJECT`), storystitch.ashishnag.com | None |
| `EXPO_PUBLIC_API_URL` | `API_URL_STAGING` | `API_URL_PRODUCTION`, https://api.storystitch.ashishnag.com | None |
| Accounts and layout editor flags | On in `ci.yml` | On in `release.yml` | None |
| `EXPO_PUBLIC_FEATURE_USAGE`, `USAGE_INGEST_ENABLED` | On | On | Set `USAGE_INGEST_ENABLED=true` on each Railway environment before a release sends counts to it |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | `TURNSTILE_SITE_KEY` secret | The same secret | None. Its Turnstile hostnames must include `storystitch.ashishnag.com` |
| `EXPO_PUBLIC_WEB_URL` | Not set for web | Not set for web | None: only iOS uses it, from `eas.json`. Web uses the page's own address |
| `CORS_ORIGIN` | Railway | `https://storystitch.ashishnag.com,https://storystitch-web.pages.dev`, confirmed from the API's responses on November 5, 2026 | None |
| `APP_SCHEME` | `storystitch-staging://` | Unset, which means `storystitch://` and matches the production app | None. If it's set, it must be `storystitch://` |
| `MIN_IOS_APP_VERSION` | Default | Default, `1.0.0` | None |

## Add an app or service

Run `/add-app` (e.g. an iOS app, API + database, accounts). It updates `project.json`, CI and release.

## Rollback

- Web: Cloudflare dashboard → Workers & Pages → `storystitch-web` → Deployments → roll back to a previous production deployment. Then fix forward on `main` and `/release` again.
- API: Railway dashboard → `api` → Deployments → redeploy the previous one. Migrations aren't rolled back: they're written to work with the previous API version (add first, remove later), so the older API keeps working against the newer schema.
- iOS app, after a bad update: see "Roll back a production update" below. A bad build can't be rolled back: submit a fixed one.

### Roll back a production update

From `apps/app`, signed in with `npx eas-cli@27.2.0 login`. Each takes about a minute. Phones pick up the change when
the app starts and use it from the start after that.

- **Back to the previous update.** Find its group ID in the earlier `mobile-release.yml` run's summary, or in the list:
  ```bash
  npx eas-cli@27.2.0 update:list --branch production --platform ios
  ```
  then publish it again:
  ```bash
  npx eas-cli@27.2.0 update:republish --group GROUP_ID --platform ios --message "Roll back to vX.Y.Z"
  ```
- **Back to the JavaScript inside the build**, when there's no good earlier update. Use the runtime version from the
  run's summary:
  ```bash
  npx eas-cli@27.2.0 update:roll-back-to-embedded --channel production --platform ios --runtime-version RUNTIME_VERSION --message "Roll back to the build"
  ```

Then fix forward on `main` and `/release` again.
