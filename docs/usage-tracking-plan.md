# Usage tracking plan

Status: proposal, November 4, 2026. Nothing here is built. Line numbers refer to the top of the stacked PRs
(`expo/image-compare`), because that's where the code is heading.

## In short

Add first-party usage counts: the app sends a small batch of named events to our own API, and the API adds them to
daily counters in Postgres. It stores no event log, no user or device ID, and no session. One registry in
`packages/shared` lists every event, and every property has to be a fixed list or a bounded number, so free text
can't get in, whatever a future call site does. The tracker lives in `packages/client`. Each app adds one small
platform file.

This keeps the promise that photos stay on the device, keeps "no third-party tracking" true, adds no service or
monthly cost, and needs no native module, so it adds no iOS build risk.

The main cost is that the numbers are high-level on purpose. There's no retention, no cross-day unique count and no
per-person journey. Decision 2 covers that.

## Decisions for you

Everything below assumes the recommendations. You can reply "approve all", or change any by number.

| # | Decision | Recommendation | What it costs |
|---|---|---|---|
| 1 | Build first-party or use a tool? | **First-party** (section 1) | 8 small PRs, and we own the reporting |
| 2 | Keep raw events, or only daily counts? | **Only daily counts.** It needs no background job and leaves nothing about any one person to protect or delete | Past data can't be re-sliced. No retention, cohorts or per-person funnels |
| 3 | How do we count daily visitors? | **A hash on the server, held in memory and never written to the database** (section 5) | The count is an estimate. It over-counts on days the API restarts. Weekly and monthly uniques aren't possible |
| 4 | Keep events on the device while offline? | **No, memory only.** No new storage, no new dependency and nothing written to the device | Events are lost if the app is closed while offline |
| 5 | Add an opt-out switch? | **Not at launch.** Nothing is linked to a person, so a switch wouldn't change any stored data. Most users are signed out, and signed out, the Account screen is just the sign-in form, so a switch has no natural home. Ask whoever reviews the policy, which is already an open item in `PROJECT_SETUP.md` | If the review says yes, it's one extra small PR |
| 6 | Change the line "Nothing is uploaded"? | **Yes**, to "Your photos stay on this device. They're never uploaded." The old line stops being strictly true for an app that sends counts | Small copy change in both apps and two tests |
| 7 | When does it go on? | **Merge it switched off, so the first App Store build already contains it. Turn it on for staging once the policy text is ready, and for production at or after the web cutover** (section 9) | No production data until then |
| 8 | How do you read the numbers first? | **A report command now, `/admin` later** (section 6). `/admin` needs admin accounts and an authenticator code, which is a large piece of work on its own | A terminal table until `/admin` ships |

## Scope

- **In:** page and click tracking for the Expo app (`apps/app`) on web and iOS, ready for Android, plus the API, the
  reporting and the policy changes.
- **Assumption to confirm:** "the web app" means the Expo web app. `apps/web` gets no tracking, because it's being
  replaced and the rule is no new features before the cutover. If the cutover slips a long way, wiring `apps/web` is
  a separate job, since none of its screens are shared.
- **Out:** crash reporting, session replay, A/B tests, attribution and anything aimed at advertising.
- **Unchanged:** `POST /layouts/:id/exports` and `layout_exports`. Ranking is a product feature, not reporting, and
  it has its own contract and test (`AC-RANK-05`).

## What in the code shapes this

- **There's no background job, and `project.json` doesn't allow one to be bolted on.** A raw event table would need a
  job to roll up and delete rows. Counters written at the moment of ingest need neither.
- **`renderExport` can't mean "the user exported".** It runs by itself after a pause on every change
  (`Editor.tsx:86`), so the export event has to come from the Share or Download tap.
- **"Share" means something different per platform.** On web, `shareOrDownload` returns false when the user cancels.
  On iOS, `shareAsync` resolves however the sheet closes, so a cancel counts as a share
  (`exportImage.native.ts:58`). Reports must split by platform and must not compare share rates across them.
- **The editor isn't a route.** `App.tsx` shows `PickScreen` or `Editor` at the same path, depending on whether photos
  are loaded, so path changes alone would miss the main screen.
- **URLs carry secrets.** `/reset-password?token=…` holds a live reset token and `/account?deleted=1` holds state.
  Raw paths and URLs must never be sent.
- **Text in the app can be personal.** File names appear in notices (`App.tsx:38`) and warnings (`Editor.tsx:293`), and
  layout names are typed by users (`Editor.tsx:274`). This rules out button-label autocapture and raw error messages.
- **`/bot-check` runs inside the iOS app.** Counting it would add a fake web visit each time someone signs in on iOS.
- **The policy makes promises this work would break.** The layout row says the count records "not who shared it,
  when or from where". The Changes section promises a notice in the app when the policy changes in a way that
  matters. `AC-PRIV-01` says "No analytics."
- **`pnpm qa` grades `apps/web` by default,** and a criterion must be proved by the app being graded. See section 10.

## 1. First-party or third-party

Prices are from a search on November 4, 2026. Aptabase's come from its own docs, and PostHog's and Plausible's from
third-party listings, which disagree on the higher tiers. Check them before relying on them.

| Option | Cost | Privacy | Effort | Fit |
|---|---|---|---|---|
| **First-party counters** | $0 extra, inside the $5–10/month Railway budget | Best. No new company sees anything. Nothing per person is stored | Highest: 8 small PRs, and we write the reports | Works on every platform the API serves |
| PostHog cloud | Free up to about 1M events/month | A new processor sees event data. Its default is per-person, so it would need configuring down. It adds an SDK to the iOS app | Low to add, and the dashboards are excellent | Far more than this needs. Its web requests go to another origin |
| Aptabase | Free up to 20k events/month, then from $10/month for 200k | Good: no cookies or device IDs. Still a new processor | Low. Has a React Native SDK | The closest alternative, but tracking pauses when the limit is reached |
| Plausible | From about $9/month for 10k pageviews, no free plan | Good on web | Low on web, but no native SDK | Web-first, with weak iOS coverage |
| Firebase / Google Analytics | Free | Worst fit: Google processes the data, and it uses device-level IDs | Medium, plus a native module and a full iOS build | Conflicts with "no third-party tracking" |
| Self-hosted PostHog or Umami | A new service on Railway | Good | High: a new service to run, against `project.json` | Not worth running at this size |

**Recommendation: first-party.** A processor can be defensible under the policy's wording, but the product's main
promise is simple, and "no other company sees anything" is the simplest version of it. Every third-party option also
needs the same policy work, so the saving is only the reporting screens. If you'd rather have dashboards now, Aptabase
is the one to pick. It would replace sections 3 to 5 and the transport, and the registry would stay.

App Store Connect's own analytics is free and needs no code, but covers only iOS and only people who agreed to share
data. Use it as a sanity check on the iOS numbers once the app is live.

## 2. Event model

`packages/shared/src/usage.ts` is the only list of events. Both the types and the API's validation come from it.

```ts
export const SCREENS = ["pick", "editor", "layout_editor", "account", "sign_up", "reset_password", "other"] as const;
export const CONTROLS = ["share", "start_over", "edit_layout", "tool_layouts", "tool_style", "tool_export", "other"] as const;
export const ERROR_CODES = ["photo_unreadable", "export_failed", "layout_save_failed", "layout_delete_failed", "other"] as const;

/** A built-in layout's id, "custom" for the user's own, and "other" for anything the API doesn't know. */
const layoutRef = z.enum([...builtInLayoutIds, "custom", "other"]).catch("other");

export const USAGE_EVENTS = {
  visit_started: {},
  screen_viewed: { screen: z.enum(SCREENS).catch("other") },
  control_pressed: { control: z.enum(CONTROLS).catch("other") },
  photos_picked: { count: z.number().int().min(1).max(8) },
  layout_chosen: { layout: layoutRef },
  collage_exported: { layout: layoutRef, format: z.enum(["jpeg", "png"]), first: z.boolean() },
  collage_shared: { layout: layoutRef, method: z.enum(["share", "download"]), first: z.boolean() },
  layout_saved: {},
  signed_up: {},
  error_shown: { code: z.enum(ERROR_CODES).catch("other") },
} as const;
```

| Event | Fires when | From `AC-ADMIN-01` |
|---|---|---|
| `visit_started` | The app opens, or returns after 30 minutes or more in the background | visit |
| `screen_viewed` | The screen changes (section 4) | |
| `control_pressed` | A tagged button is pressed | |
| `photos_picked` | Photos finish loading, with the number opened, not the number chosen | photos picked (count) |
| `layout_chosen` | The user taps a layout in the strip. Not the switch after a delete (`Editor.tsx:195`) | layout chosen |
| `collage_exported` | The user taps Share or Download | export |
| `collage_shared` | `shareOrDownload` returns true | share |
| `layout_saved` | A saved layout is created or updated | save |
| `signed_up` | Sign-up succeeds | sign-up |
| `error_shown` | The user sees an error, sent as a code only | error |

`collage_saved` joins the list when saved collages ship (milestone B3). Until then the funnel is picked → exported →
shared, because the brief's "saved" step doesn't exist yet.

**Naming.** `snake_case`, as `thing_verbed`, past tense, for something that happened. Values are `snake_case` too.

**Hard rules, enforced by a test** that walks the registry:

- A property is a fixed list, a true/false value or a bounded number. `z.string()` fails the test.
- Nothing about a photo beyond the count. No file names, no layout names, no message text and no raw URLs.
- No identifiers of any kind. No timestamps either: the API stamps the UTC day when a batch arrives.
- Saved layouts are always `"custom"`. Even if a call site passes a saved layout's id by mistake, `layoutRef` turns it
  into `"other"` on the server, so it's never stored.

**Funnel.** One person can share a collage five times, so plain totals overstate the funnel. The tracker adds
`first: true` the first time `collage_exported` and `collage_shared` fire after each `photos_picked`, and the funnel
counts only those. Call sites don't pass it. It's kept in memory and needs no session ID.

**Adding an event:**

1. Add one line to `USAGE_EVENTS`, plus any new list values. The registry test checks the rules.
2. Call `track("name", props)` where it happens. TypeScript checks the name and props.
3. If a person reading the policy would be surprised by it, update `privacy.html` in the same PR. The file's first
   line already asks for this.
4. Merge. The API ships from the same registry, so it knows the event first (section 7).

Adding a tracked button is smaller: add an id to `CONTROLS`, then pass `trackAs="that_id"` to the `Button` or `Choice`.

## 3. Shared client API

`packages/client/src/usage.ts` has no UI and no browser APIs, so it fits the "where code goes" table and its tests can
use fake timers.

```ts
export function createUsage({ apiUrl, enabled, platform, appVersion }: UsageOptions): {
  track<K extends UsageEvent>(name: K, ...props: PropsOf<K>): void;
  foreground(): void; // starts a visit if the gap was long enough, and starts the timer
  background(): void; // flushes now and stops the timer
};
```

The app adds one file, `apps/app/src/usage.ts`, that exports `track` from `createUsage`. The platform layer is the
only per-platform code:

```ts
// platform/usage.web.ts: about 10 lines. Listens for visibilitychange and pagehide. Off on /bot-check.
// platform/usage.native.ts: about 10 lines. Uses AppState, Platform.OS and nativeApplicationVersion.
export const usagePlatform = { platform, appVersion, enabled, onAppState };
```

Android needs no new code, because `usage.native.ts` reads `Platform.OS`. `tsc` resolves platform imports to the web
files, so native wiring has to be checked on the simulator (see `HANDOFF.md`).

**Why it can't slow or break the app:**

- `track` is synchronous, returns nothing, does one array push and sits in a `try/catch`. Nothing awaits it.
- Switched off, `createUsage` returns a function that does nothing, with no timer and no request.
- There's no work at startup. The first send waits until 5 seconds after launch.
- Sends happen on a timer, away from any tap, with a 5-second timeout. They're small: 50 events is about 3 KB.
- **Events are never fired from a gesture or animation frame**, only at commits such as a tap or a finished action.
  No drag, pinch or slider-move events, because the iOS JS thread also handles touches (PR 50 exists for that reason).
- It adds no dependencies and no native code, so it can reach iOS by EAS Update without a full build.

**Batching and failure:**

| Situation | What happens |
|---|---|
| Normal | Send at 20 queued events, or every 30 seconds, or when the app goes to the background. One send at a time, up to 50 events |
| Offline, timeout or a 5xx | Keep the batch. Wait twice as long each time, up to 5 minutes |
| Queue passes 100 events | Drop the oldest. Reports can stay approximate, and memory has to stay bounded |
| A 4xx, including 429 | Drop the batch and never retry. Retrying can't fix it |
| App closed while offline | The queue is lost (decision 4) |
| A timed-out send actually arrived | A retry counts it twice. Rare, and there's no ID to dedupe on, by design |

**Transport.** `fetch` with `credentials: "omit"`, `keepalive: true` and `Content-Type: text/plain`.

- `omit` means no session cookie, so events can't be tied to an account even for signed-in users. Never pass
  `sessionHeaders` here. `sendBeacon` is ruled out because it always sends cookies.
- `text/plain` skips the CORS preflight, which makes each send one request and works while a page is closing.
- `keepalive` lets a send outlive the page on web. React Native ignores it, and the OS gives a backgrounded iOS app a
  few seconds, which is enough for a small POST.

## 4. Page views

The router needs no change. Both `route.web.ts` and `route.native.ts` expose `useLocation`, which already re-renders on
`navigate()` and the back button. A small pure function in `apps/app/src/usage.ts` turns location and app state into a
screen name:

```ts
const screenFor = (pathname: string, hasPhotos: boolean): Screen => {
  if (pathname === "/account") return "account";
  if (pathname === "/sign-up") return "sign_up";
  if (pathname === "/reset-password") return "reset_password";
  if (pathname === "/") return hasPhotos ? "editor" : "pick";
  return "other";
};
```

A `useEffect` in `App.tsx` fires `screen_viewed` when the name changes. This has three benefits:

- It covers the editor, which has no path of its own.
- Only the fixed name is sent, so `?token=…` can't leak.
- It keeps working if deep links arrive (the note in `route.native.ts`), or if Expo Router ever replaces the custom
  router, because only this one function reads paths.

Two more cases: the layout editor is state inside `Editor`, so it fires `screen_viewed` directly when it opens, and
`/privacy` and `/support` are static pages with no app code, so they aren't counted. `/bot-check` and a future `/admin`
are never counted.

The tool tabs (Layouts, Style, Export) are `control_pressed` events, not screens. They share a screen and would swamp
page counts.

## 5. API, database and aggregation

**Route.** `POST /usage/events`, in a new file `apps/api/src/usage.ts` wired up like `savedLayoutRoutes`. The body is
defined in `packages/shared/src/usage.ts`:

```json
{ "platform": "ios", "appVersion": "1.2.0", "events": [{ "name": "photos_picked", "props": { "count": 3 } }] }
```

`appVersion` is left out on web. The API handles a request in this order:

1. Return 204 and write nothing if `USAGE_INGEST_ENABLED` is off.
2. Limit the body to 16 KB with `bodyLimit`, as `savedLayouts.ts` does.
3. Accept only our own web origins, or no `Origin` plus `NATIVE_APP_HEADER`. This is the same check as
   `savedLayouts.ts:57`, and it matters because a `text/plain` POST skips CORS.
4. Allow about 60 batches a minute per visitor hash, kept in memory, then return 429.
5. Parse the outer shape, with `events` as `z.array(z.unknown()).max(50)`. Return 400 if that fails.
6. Parse **each event alone** and skip the ones that fail, counting them as `usage_dropped`. It's the same approach as
   `SavedLayoutsEnvelopeSchema`, so one bad event never loses the batch.
7. Upsert every counter in one statement, then return 204. If the database is down, return 503 and the client retries.

**Table.** It's additive. No existing table changes, and `pnpm db:generate` produces the SQL.

```ts
export const usageDaily = pgTable("usage_daily", {
  day: date("day").notNull(),                     // UTC, stamped by the API
  event: text("event").notNull(),
  platform: text("platform").notNull(),           // web | ios | android
  appVersion: text("app_version").notNull().default(""),
  propKey: text("prop_key").notNull().default(""),  // "" is the event's total
  propValue: text("prop_value").notNull().default(""),
  count: bigint("count", { mode: "number" }).notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.day, t.event, t.platform, t.appVersion, t.propKey, t.propValue] }),
  index("usage_daily_event_day_idx").on(t.event, t.day),
]);
```

Each event adds 1 to its total row and 1 to one row per property. So `collage_shared` with three properties updates four
rows.

The trade-off is that properties can be counted alone but not against each other. You can see the top layouts and the
JPEG share of exports, but not which format each layout used. That keeps the table small: even a very busy day is a few
thousand rows, so a couple of hundred MB a year at worst, and far less in practice. A rare cross-count can be added
later as a combined property.

**Aggregation is the insert.** There's no event log, no rollup and no scheduled job, so no retention job is needed
either. Counts are kept like `layout_exports`, because they aren't linked to anyone.

**Daily visitors.** This meets the brief's "a hash that changes every day" as strictly as we can:

- On `visit_started`, compute `sha256(salt + platform + ip + user agent)`. The IP comes from `x-real-ip`, the header
  `auth.ts` already trusts on Railway.
- The salt is 32 random bytes. It's created at startup, replaced at UTC midnight and never written anywhere.
- If the hash is new to today's in-memory `Set`, add 1 to a reserved `visitors` row. The `Set` is cleared at midnight.
- The IP and user agent are never stored, and the hash never reaches the database or a backup. Once the salt is gone,
  the hash can't be recomputed. After midnight, only the count remains.

What this can't do, and why decision 3 is worth a look:

- It's an **estimate**. Phones change IP addresses, and households can share one. It's weakest on iOS.
- **Each restart starts a new salt**, so visitors are counted again on deploy days. It also assumes one API instance,
  which is what runs today.
- **Weekly and monthly unique visitors, and retention, are impossible**, because the code changes daily. Adding up days
  gives "visitor-days". That's the point of the design, not a bug. Reports should be labeled so nobody reads it as
  unique people.

The alternatives are storing the hash in Postgres, which survives restarts but puts it in backups, or a random ID kept
on the device, which is steadier on iOS but is a stored ID, against the brief.

**Abuse.** Anyone can POST to a public route, so the numbers can be inflated, but no bad data can be stored. Every
stored value is from a fixed list, except the app version, which `AppVersionSchema` checks. The limits above
are enough at this size.

**Config.**

| Value | Where | Default |
|---|---|---|
| `USAGE_INGEST_ENABLED` | Railway, per environment. Also the emergency off switch: one variable, no client release | `false` |
| `EXPO_PUBLIC_FEATURE_USAGE` | `_deploy-pages.yml` input for web, `apps/app/eas.json` for iOS. Tracking needs this and an API URL | `false` |

Both go in `.env.example` and the "where config lives" table in `PROJECT_SETUP.md`. Railway variables on staging and
production are yours to set. `apps/app/src/config.ts` gets `USAGE_ENABLED`, following `LAYOUT_EDITOR_ENABLED`.

## 6. Reporting

**First: `pnpm usage:report --days 30`.** It's a read-only script that takes `DATABASE_URL` and prints Markdown tables.
You run it through Railway, since we don't touch hosted environments. It shows:

| Section | Source | Note |
|---|---|---|
| Daily totals | `visitors`, `visit_started`, `photos_picked`, `collage_shared` by platform | |
| Funnel | `photos_picked` → `collage_exported` (`first`) → `collage_shared` (`first`) | Split by platform, because of the iOS share difference |
| Top layouts | `layout_chosen` and `collage_shared` by `layout` | Unlike `layout_exports`, this is per day |
| Screens and controls | `screen_viewed`, `control_pressed` | Which tools get used |
| Errors | `error_shown` by `code`, and `usage_dropped` | A rise in dropped events means a broken client |
| Versions | Rows by `app_version` on iOS | Shows how far a new version has spread |

**Later: `/admin` (milestone B5, `AC-ADMIN-03` to `05`).** The same queries move behind `GET /admin/usage`, with the
shape in `packages/shared/src/api.ts`. The page is a lazy, web-only screen in `lazyScreens.web.ts`, so it never ships in
the iOS bundle. It needs an admin flag on `user`, added as a new column, and Better Auth's two-factor plugin. It adds to
this plan without changing it: nothing in the data model has to change.

Staging and production have separate databases, so test traffic stays out of production numbers. CI uses a local one.

## 7. Keeping old iOS versions working

iOS users stay on old versions for months, so the client and the server have to tolerate being out of step.

- **Add first, remove later.** The new table and route touch nothing that exists. `/layouts/:id/exports`,
  `/layouts/popularity` and `/app/minimum-version` don't change.
- **The API ships first.** A new event goes live on the API before any app can send it. If an app gets there first, the
  event is dropped and counted, and nothing fails.
- **Never rename or narrow.** While any version at or above `MIN_IOS_APP_VERSION` can send an event, the registry keeps
  accepting it. To rename, add the new event and map both in the report. To remove one, stop calling it, then delete it
  from the registry only once `MIN_IOS_APP_VERSION` has passed the last version that sent it.
- **Adding a value is safe for old apps.** Old apps never send it. The `.catch("other")` covers the reverse case, a newer
  app with a value an older API doesn't know. `photos_picked.count` has no fallback, so raising the 8-photo limit means
  widening the registry on the API first.
- **A breaking change gets a new route** (`/usage/v2/events`), and the old route stays until no supported version uses
  it.
- **Tracking must not raise `MIN_IOS_APP_VERSION`.** Reporting never justifies forcing an update.
- **Versions from before tracking send nothing**, so their users don't appear in reports. If the tracker is in the first
  App Store build, that version never exists (decision 7).

## 8. Privacy policy and App Store answers

### `apps/web/public/privacy.html`

This file arrives with PR 51 and isn't on `main` yet, so these edits wait for it. Edit it in the PR that turns tracking
on, because it has to match what the app does at that moment.

**The short version:** add after the "No ads" bullet:

> **We count how StoryStitch is used, anonymously.** Things like how many collages were shared today, never who shared
> them.

**What we collect, new row:**

| What | When | Why |
|---|---|---|
| Anonymous usage counts: daily totals of app opens, screens viewed, buttons pressed, how many photos were picked (the number only), layouts chosen, collages exported and shared, layouts saved, sign-ups and error types, split by platform and app version | You use the app or website | To see which features get used and what goes wrong. These counts aren't linked to you, your account or your device |

**What we collect, change the layout row's "Why".** It says "not who shared it, when or from where", which would mislead
next to daily counts by layout. Replace it with:

> To put popular layouts first. This count holds the layout only. The daily usage counts above also include which
> layouts are chosen and shared, with no link to who did it.

**After the table, add:**

> To estimate how many people use StoryStitch each day, our server briefly combines your IP address and device or
> browser type with a random value that changes every day, and remembers the result until the end of that day so you
> aren't counted twice. That result is never saved to our database, and the IP address isn't kept with usage counts.
> When the day ends the random value is thrown away, so nothing can be traced back to you or matched across days.

**What we don't collect, add:**

> Usage counts never include your photos, file names, the names you give layouts, your email address or your account.

**Who processes data for us, change the Railway bullet to:**

> **Railway** runs our server and database, which hold your account, saved layouts and usage counts.

**How long we keep data, change the last sentence to:**

> Layout counts and usage counts are kept because they aren't linked to anyone.

**Your choices and rights, add a line under the bullets:**

> Usage counts aren't linked to anyone, so we can't find, copy or delete one person's share of them. Deleting your
> account doesn't change them.

**Also:** change "Last updated". The "Technical logs" row stays, and already covers what hosting providers see. `support.html`
makes no claim about this and doesn't need to change. If decision 5 goes the other way, the rights section gets the switch.

**The notice.** The Changes section promises a notice in the app, so this needs one. Show a plain line on the pick screen
for 30 days, with a link to `/privacy`: "We've updated our privacy policy. We now count how the app is used, anonymously."
It ends on a fixed date in code, so it stores nothing on the device. It should ship at the same time as the policy.

### App Store Connect

The repo has no record of the current answers. The move-to-Expo plan lists privacy labels as a step still to do, so
compare these with what's in App Store Connect. Changes under App Privacy, for both the staging and production apps:

| Data type | Used for | Linked to the user? | Used for tracking? |
|---|---|---|---|
| **Add:** Usage Data → Product Interaction | Analytics | No | No |
| **Add:** Diagnostics → Other Diagnostic Data (the error codes) | Analytics | No | No |
| **Check:** Usage Data → Product Interaction also lists App Functionality, for the per-layout count that ranks layouts | App Functionality | No | No |

**Everything else stays the same.** The account answers don't change, photos stay undeclared, and nothing is added under
Identifiers or Location, because no ID is stored and the IP isn't used for location. The tracking answer stays **No**,
so no App Tracking Transparency prompt is needed: Apple's definition of tracking is linking data with other companies'
data for advertising, or passing it to data brokers.

"Not linked" rests on Apple's rule that data is linked by default unless identifiers are stripped and it can't be
re-linked. Our design meets that, but the answers are your statement to Apple, so have the policy reviewer read these
along with the text above. Change the labels **before** turning the flag on for a production build. EAS Update can flip
it without App Review, so nothing would stop the order going wrong by accident.

**Android, later.** The Play Console's Data safety form needs the matching answers: App activity → App interactions and
App info and performance → Diagnostics, collected, not shared.

## 9. Rollout

Each row is one PR, and each must pass `pnpm check` and `pnpm qa`. Nothing user-visible happens before PR 7.

| PR | What | Done when |
|---|---|---|
| 1 | `packages/shared/src/usage.ts`: registry, request schema, registry rule test | Rule test fails on a `z.string()` property |
| 2 | API: `usage_daily`, `POST /usage/events`, visitor hash, limits, off by default | API tests cover old and unknown events, abuse limits and the stored columns |
| 3 | `packages/client/src/usage.ts`: tracker | Fake-timer tests cover batching, backoff, drops, and a throwing `fetch` that never reaches the caller |
| 4 | `apps/app`: flag, `platform/usage.*`, `usage.ts`, `screen_viewed`, deploy inputs | With the flag off, no requests. With it on locally, screen events arrive on web and on the simulator |
| 5 | Events and controls: `App.tsx`, `Editor.tsx`, `Accounts.tsx`, `ui/Button.tsx`, `ui/Choice.tsx` | Playwright checks every request body against the rules. Simulator check per `CLAUDE.md`, because shared screens change |
| 6 | `pnpm usage:report` | Prints correct tables from seeded local data |
| 7 | Policy text, notice, "They're never uploaded" copy, criteria edits | Policy reviewed, and copy matches in both apps |
| | **You:** update App Store labels, set `USAGE_INGEST_ENABLED=true` on staging | |
| | **Staging on:** set the flag in `ci.yml` and the staging `eas.json` profiles | A week of numbers on staging looks right against known test activity |
| 8 | **Production on,** at or after the web cutover: set the flag in `release.yml` and the production `eas.json` profile | You run `USAGE_INGEST_ENABLED=true` on production first, then `/release`. Check the first report by hand |
| Later | `/admin` (B5) | `AC-ADMIN-03` to `05` |

**Off-ramp.** At any point, setting `USAGE_INGEST_ENABLED=false` stops all writes with no client release. Dropping the
flag from a build stops the requests. Old apps then get a 204 and carry on.

**Timing.** PRs 1 to 6 add no user-facing behavior while off, so they fit the "no new features before the cutover" rule.
PR 7 and the production flag are the parts that wait.

### What depends on PRs 47 to 53

- **`docs/acceptance-criteria.md`** changes in 47, 48, 49, 51 and 53. Every PR here edits it too.
- **`apps/app/src/Editor.tsx`** changes in 47, 49 and 50, and **`App.tsx`** in 48 and 50, which PRs 4 and 5 touch.
  **`Accounts.tsx`** changes in 48 and 51, which PR 5 touches.
- **`apps/app/src/platform/exportImage.*`** changes in 49 and 50. The share behavior in this plan is what's at the top of
  the stack.
- **`packages/client/src/api.ts`** changes in 48. This plan adds a new file instead, so there's no conflict.
- **`.env.example`, `PROJECT_SETUP.md`** change in several, and **`privacy.html`** only exists from 51.

The simplest path is to start PR 1 after the stack merges. None of the seven needs to change for this plan.

## 10. Acceptance criteria

`pnpm qa` defaults to `apps/web`, and only proves a criterion with the graded app's tests. `packages/*` and `apps/api`
tests count for every target, so rows they prove can be `auto` right away. Rows that need the Expo app's wiring stay
`planned` until production's default target becomes `apps/app`. Their Playwright tests carry the ID and run only with
`E2E_TARGET=app`, so `pnpm qa --target=app` still exercises them.

**New rows:**

| ID | Criterion | Check | Proved by |
|---|---|---|---|
| AC-USAGE-01 | With the usage flag off or no API URL, the app sends no usage requests and starts no timers. | auto | `packages/client` |
| AC-USAGE-02 | Every event comes from the shared registry, and every property is a fixed list, a true/false value or a bounded number, so free text can't be sent. | auto | `packages/shared` |
| AC-USAGE-03 | Tracking can't slow or break the app: `track` returns at once and never throws, and a failed, slow or offline send changes nothing the user sees. The queue holds at most 100 events. | auto | `packages/client` |
| AC-USAGE-04 | Events go out in batches of up to 50, at 20 queued, every 30 seconds or on going to the background. Network and server failures retry with growing waits, and refused batches are dropped. | auto | `packages/client` |
| AC-USAGE-05 | The API accepts events from every supported app version, skips unknown events without losing the rest of the batch, and counts what it skipped. | auto | `apps/api` |
| AC-USAGE-06 | The API refuses oversized bodies and other web origins, limits batches per visitor, and writes nothing while `USAGE_INGEST_ENABLED` is off. | auto | `apps/api` |
| AC-USAGE-07 | Page views use fixed screen names, cover the pick, editor, layout editor and account screens, and never send a path or query string. `/bot-check` isn't counted. | planned | Playwright, `E2E_TARGET=app` |
| AC-USAGE-08 | With tracking on, the iOS app sends usage events to a local API, and the whole core flow still works with the API unreachable. | manual | Simulator. `apps/app/maestro/core` needs no API, so it can't prove delivery |
| AC-USAGE-09 | The privacy policy and App Store answers match what's tracked, and the app shows the policy notice for 30 days after the change. | manual | By hand before turning it on |

**Edited rows:**

| ID | Change |
|---|---|
| AC-ADMIN-01 | Keep it, adding screen views and tagged button presses to the list. Stays `planned` until the cutover, since the Expo app proves it. |
| AC-ADMIN-02 | New text: "Events and stored counts never contain image data, file names, layout names, emails, IP addresses, user agents or any account or device ID. Daily visitors are counted with a hash held in memory that changes daily and is never stored." Becomes `auto` in PR 2, with a column test like the one in `AC-RANK-05`. |
| AC-PRIV-01 | New text: "Photos never leave the device: nothing is uploaded from page load through export. In builds with no API, no request goes to another origin." The "No analytics" sentence goes in PR 7. Its test already runs on the all-off `dist-e2e` build. |
| AC-PRIV-02 | Text unchanged. Its tests look for "nothing is uploaded", so the wording in decision 6 changes `sources.spec.ts` and `apps/web/src/App.test.tsx`. |
| AC-RANK-05, AC-API-03 | No change. Their tests watch `/layouts/` and an all-off build. Keep usage off in the `dist-e2e` build and on only in `dist-e2e-accounts`. |

`docs/product-brief.md` should change in PR 7 too: the v2 "Admin analytics" section needs the new event list and a note
that only daily counts are stored.

## What this plan hasn't checked

- Nothing is prototyped. The effort figures are estimates.
- How far off the visitor count is on iOS is unknown until there's data.
- `text/plain` with `keepalive` needs checking in real Safari during PR 4, as the simulator and emulation can't show
  what happens when a page closes.
- Whether a backgrounded iOS app finishes its send can only be checked on a real phone, and only roughly.
- Events lost to the memory-only queue can't be measured, because they never arrive.
- This isn't legal advice. Decision 5, the policy text and the App Store answers should go through the policy review
  that's already on the `PROJECT_SETUP.md` checklist.

## Sources

- [Apple: App privacy details](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple: User privacy and data use](https://developer.apple.com/app-store/user-privacy-and-data-use/)
- [Aptabase docs](https://aptabase.com/docs)
- [PostHog pricing](https://posthog.com/pricing.md)
- [PostHog free plan listing](https://costbench.com/software/product-analytics/posthog/free-plan/)
- [Plausible pricing listing](https://toolradar.com/tools/plausible)
