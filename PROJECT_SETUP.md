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
  - `storystitch-web`: production, deploys the `production` branch (via `/release`). It deploys `apps/web` until `PRODUCTION_WEB_APP` is `app`, then the Expo app (`apps/app`).
  - `storystitch-web-staging`: staging, deploys the Expo app from `main` as its own production. It's a separate project because Pages routes a custom domain to a branch only through Cloudflare-proxied DNS, and ashishnag.com's DNS was at Squarespace when staging was set up (it moved to Cloudflare on 2026-11-02). The old staging alias `main.storystitch-web.pages.dev` no longer updates.
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
| `EXPO_PUBLIC_WEB_URL` (where the iOS app's bot check and emailed links live) | `apps/app/eas.json`; locally from `.env` | iOS builds |
| `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_FEATURE_ACCOUNTS`, `EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR` for iOS | `apps/app/eas.json`, read by EAS builds and by `mobile.yml` for updates | iOS builds and updates |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` for iOS | EAS environment variable, `preview` environment. GitHub secrets don't reach EAS builds | iOS builds and updates |
| `MOBILE_PRODUCTION_ENABLED` | GitHub variable, off until the "iOS production checklist" is done. Allows `mobile-release.yml` to run | production iOS builds |
| `MOBILE_PRODUCTION_UPDATES_ENABLED` (optional, default off) | GitHub variable. `true` lets `mobile-release.yml` publish an update instead of building when a production build has the same native code | production iOS updates |
| `EXPO_PUBLIC_PERF_READOUT` (optional) | Set by hand for a test build on a real phone; never in a hosted environment | shows timing numbers on screen |
| EAS project ID, App Store Connect app ID | `apps/app/app.config.ts`; `apps/app/eas.json`, a placeholder until the checklist below (both public values) | EAS |
| `API_URL_STAGING`, `API_URL_PRODUCTION` | GitHub variables | web builds (`VITE_API_URL`) in `ci.yml` / `release.yml` |
| `PRODUCTION_WEB_APP` = `app` | GitHub variable, not set yet. Unset means `apps/web`. Remove it when `apps/web` is removed | `release.yml`: which web app is graded and deployed |
| `DATABASE_URL` (reference `${{Postgres.DATABASE_URL}}`), `CORS_ORIGIN`, `NODE_ENV` | Railway variables on `api`, per environment | the API |
| `BETTER_AUTH_URL` (the API's own URL), `BETTER_AUTH_SECRET` (random, per environment), `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY` | Railway variables on `api`, per environment | accounts (B2) |
| `APP_SCHEME` (optional, default `storystitch://`; `storystitch-staging://` on staging), `MIN_IOS_APP_VERSION` (optional, default `1.0.0`) | Railway variables on `api`, per environment | iOS app sign-in; `GET /app/minimum-version`, raised when old app versions must update |
| `EXPO_PUBLIC_FEATURE_USAGE` (optional, default `false`; needs an API URL) | `usage:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` and `release.yml`; `apps/app/eas.json` for iOS, `true`; locally from `.env` | Expo app builds and updates |
| `EXPO_PUBLIC_FEATURE_FIT_LAYOUTS` (optional, default `false`) | `fit_layouts:` input to `_deploy-pages.yml` for web, `true` in `ci.yml` (staging) and `release.yml` (production); `apps/app/eas.json` for iOS, `true` in every profile; locally from `.env` | Expo app builds: grid layouts fit their lines to the photos (`fittedLayout`) |
| `USAGE_INGEST_ENABLED` (optional, default `false`) | Railway variable on `api`, per environment, `true` on staging and production. Also the emergency off switch | `POST /usage/events` counts events only when `true` |
| `PAYMENTS_ENABLED` (optional, default `false`), `REVENUECAT_SECRET_KEY`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_WEBHOOK_SECRET` (all three needed when it's on) | Railway variables on `api`, per environment, not set yet: staging first, with RevenueCat sandbox data (see "B4 checklist"). The webhook secret is the Authorization value set on RevenueCat's webhook | StoryStitch Plus: `POST /payments/revenuecat`, `GET /me/entitlements`, `POST /me/entitlements/refresh`, `POST /entitlements/check` exist only when it's on |
| `TURNSTILE_SITE_KEY` (public), plus the Cloudflare and Resend keys | GitHub secrets, synced with `gh secret set -f ~/.config/new-project/secrets.env` | web builds (`VITE_TURNSTILE_SITE_KEY`) |
| Accounts flag (`VITE_FEATURE_ACCOUNTS`) | `accounts:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging) and `release.yml` (production) | web builds |
| Layout editor flag (`VITE_FEATURE_LAYOUT_EDITOR`, needs accounts) | `layout_editor:` input to `_deploy-pages.yml`: `true` in `ci.yml` (staging) and `release.yml` (production) | web builds |
| Local values (`DATABASE_URL`, `PORT`, `CORS_ORIGIN`, `VITE_API_URL`) | `.env` (copy of `.env.example`) | `pnpm dev`, tests |

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
| B2 | Optional email and password accounts (Better Auth, Resend, Turnstile), account deletion, behind `VITE_FEATURE_ACCOUNTS` | on in staging and production |
| B3 | Save collages to Cloudflare R2, "My stories", storage limits | not started |
| B4 | StoryStitch Plus: pay once ($4.99) to remove the mark, through RevenueCat (Apple in-app purchase on iOS, Paddle on web), behind `EXPO_PUBLIC_FEATURE_PLUS` and `PAYMENTS_ENABLED` | in progress; checklist below |
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
- [ ] **Legal pages**: have the policy reviewed. `apps/web/public/privacy.html` and `support.html` are the pages at
  /privacy and /support, and the Expo app copies them when it builds. Terms are postponed: `docs/legal/terms.md` is a
  draft, and the app has no terms page.
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
   pricing and contact details; Claude can draft the terms and refund pages), a $4.99 one-time product, and the
   connection to RevenueCat.
4. **Config**: the values Claude adds to "Where config lives" as each part lands. Staging gets sandbox keys; production
   gets live keys only when you're ready to sell.
5. **Privacy policy**: name RevenueCat and Paddle as processors (Claude drafts the change).
6. **App Review note** for the build that adds the purchase: Plus is a one-time purchase that removes the export's
   mark; it can be bought without an account, and Restore purchases is in the upsell.
7. **Turning it on in production** locks a switch that's been free since v1.1.0. Say so in the release notes.

The iOS purchase needs a new build: it adds native code, so an over-the-air update can't deliver it.

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

- [x] 1. **Move production web to the Expo app first**, as in "Move production web to the Expo app" below. iOS sign-in
  loads the bot check from `/bot-check` on the production site, and `apps/web` doesn't have that page. Until this ships,
  sign-in fails in the production iOS app.
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

Run `/release` in Claude Code from this repo. It checks CI on `main`, shows what's shipping and the manual acceptance checks, asks for confirmation, then runs the Release workflow. That workflow re-runs `pnpm qa` for the web app production serves (every criterion in `docs/acceptance-criteria.md`) on the exact commit, and only if it passes fast-forwards `production`, tags `vX.Y.Z` and deploys that web app to production. The QA report is attached to the run as the `qa-results-vX.Y.Z` artifact.

## Move production web to the Expo app

**Done:** `PRODUCTION_WEB_APP=app` was set and v1.0.0 moved production to the Expo app on November 7, 2026. The steps below are kept for reference and for a rollback.

`release.yml` grades and deploys `apps/web` while `PRODUCTION_WEB_APP` is unset, and the Expo app once it's `app`.

### Before the release (yours)

1. Pass the TestFlight gate, and check the `manual` rows of `docs/acceptance-criteria.md` on staging.
2. Cloudflare dashboard → Turnstile → the StoryStitch widget → Hostnames: confirm `storystitch.ashishnag.com` and `staging.storystitch.ashishnag.com` are listed. Add `storystitch.ashishnag.com` if it isn't. The bot check can't be proved from here. `storystitch-web.pages.dev` isn't on the list, so account forms don't work at that address: add it only if you want them to.
3. Turn the switch on:
   ```bash
   gh variable set PRODUCTION_WEB_APP --body app
   ```
4. Run `/release`. It says which web app it's about to ship, and it checks `/privacy` and `/support` afterwards.

To split the risk, you can first run `/release` with the variable unset. That ships the API, migration `0004` and the real `/privacy` and `/support` pages with `apps/web`, then steps 3 and 4 move only the web app.

### What differs from staging

| Setting | Staging | Production | Change needed |
|---|---|---|---|
| Pages project and domain | `storystitch-web-staging`, staging.storystitch.ashishnag.com | `storystitch-web` (`PAGES_PROJECT`), storystitch.ashishnag.com | None |
| `EXPO_PUBLIC_API_URL` | `API_URL_STAGING` | `API_URL_PRODUCTION`, https://api.storystitch.ashishnag.com | None |
| Accounts and layout editor flags | On in `ci.yml` | On in `release.yml` | None |
| `EXPO_PUBLIC_FEATURE_USAGE`, `USAGE_INGEST_ENABLED` | On | On | Set `USAGE_INGEST_ENABLED=true` on each Railway environment before a release sends counts to it |
| `EXPO_PUBLIC_TURNSTILE_SITE_KEY` | `TURNSTILE_SITE_KEY` secret | The same secret | None. Its hostnames need the check above |
| `EXPO_PUBLIC_WEB_URL` | Not set for web | Not set for web | None: only iOS uses it, from `eas.json`. Web uses the page's own address |
| `CORS_ORIGIN` | Railway | `https://storystitch.ashishnag.com,https://storystitch-web.pages.dev`, confirmed from the API's responses on November 5, 2026 | None |
| `APP_SCHEME` | `storystitch-staging://` | Unset, which means `storystitch://` and matches the production app | None. If it's set, it must be `storystitch://` |
| `MIN_IOS_APP_VERSION` | Default | Default, `1.0.0` | None |

Saved sign-ins carry over, because the session cookie belongs to the API's address. Neither web app keeps anything in browser storage or uses a service worker.

### What to test on staging

Staging runs the same build with different settings, so these checks hold for production, except that `release.yml`'s new setting only runs for real at the first release.

- The `manual` rows, on iPhone Safari and Android Chrome, including real emails (`AC-AUTH-10`).
- The real bot check at `/bot-check`, through sign-up and sign-in in the TestFlight build. Automated tests use Cloudflare's test key.
- Save a layout, then sign in with the same account on another device.

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

### Rolling back from the Expo app to `apps/web`

`apps/web` stays for one release after the switch. Roll back the web app first, and the API only if the API is the problem.

1. **Fastest, about a minute:** use the Cloudflare rollback above, choosing the last deployment built from `apps/web`. Its files are at `/assets/`, and the Expo app's are at `/_expo/`:
   ```bash
   curl -s https://storystitch.ashishnag.com/ | grep -o '/assets/index\|/_expo/static' | head -1
   ```
2. **Stop the next release from bringing it back.** Do this straight after step 1:
   ```bash
   gh variable delete PRODUCTION_WEB_APP
   ```
3. **To rebuild `apps/web` from the same commit**, run `/release` with a new patch version once the variable is gone. Use this when the deployment from step 1 is too old, for example v0.6.0, which has no real `/privacy` or `/support` pages. It re-runs `pnpm qa --target=web` first, and needs no API change.
4. **API:** only if it's also at fault, redeploy the previous version in Railway. Leave migration `0004` in place. There's no down migration, and `usage_daily` is unused while `USAGE_INGEST_ENABLED` is off.

Don't move or force-push the `production` branch. It stays where it is, and the next `/release` fast-forwards it.

Tested locally on November 5, 2026, on a database with `0004`: v0.6.0's API kept working during a deploy and after rolling back and forward again, v0.6.0's `apps/web` passed its own end-to-end tests against the current API, and the Expo app passed its end-to-end tests, leaving out usage, against v0.6.0's API. The Cloudflare and Railway rollback buttons themselves haven't been tried.

**Once a production iOS app is live**, rolling web back removes `/bot-check`, so sign-in and sign-up fail in that app until the Expo web app is back. Prefer fixing forward then. Rolling back the API is safe for the app until the app depends on something newer.
