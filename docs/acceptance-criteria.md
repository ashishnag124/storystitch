# Acceptance criteria

What StoryStitch must do, derived from `docs/product-brief.md`. Every release to production runs `pnpm qa`, which
runs the whole test suite and checks each criterion here:

- **auto** criteria pass only when at least one test names their ID in its title (or a `describe` around it),
  every such test passes, and at least one of them actually ran (not skipped in every browser). `pnpm qa` grades the
  Expo app. `pnpm qa --target=web` grades `apps/web`, and leaves out criteria only the Expo app can prove.
- **ios** criteria are graded only by `pnpm qa --target=ios`, which runs the Maestro flows in `apps/app/maestro/core` on a
  simulator. A flow proves a criterion by starting its `name:` with the ID. The other targets leave them out.
- **manual** criteria are checked by hand on staging before running `/release`. `pnpm qa` lists them as reminders.
- **planned** criteria belong to features that haven't shipped yet (the v2 sections at the end). `pnpm qa` lists them
  without failing; when the feature ships, switch each row to `auto` or `manual` in the same PR as its tests.

`pnpm qa` also fails if a test names an ID that isn't listed here. Results land in `qa-results/report.md`.

**Keeping this up to date:** a change to user-facing behavior adds or edits a row here and tags a test with its ID,
e.g. `it("AC-CROP-02 never cuts through a face", …)`. Retire an ID by deleting its row and its tags together; don't
reuse IDs.

## Picking photos

| ID | Criterion | Check |
|---|---|---|
| AC-PICK-01 | The picker accepts JPEG, PNG, WebP and HEIC and allows choosing several photos at once. | auto |
| AC-PICK-02 | Picking 1 to 8 photos from the library opens the editor with a preview and a strip of layout options. | auto |
| AC-PICK-03 | Picking more than 8 photos uses the first 8 and says so. | auto |
| AC-PICK-04 | A file that can't be opened is skipped with a message naming it; the other photos still load. | auto |
| AC-PICK-05 | HEIC photos open, natively or through the bundled decoder. | auto |
| AC-PICK-06 | Progress is shown while photos are prepared and analyzed. | auto |
| AC-PICK-07 | HEIC photos straight from an iPhone camera roll open on iPhone Safari. | manual |
| AC-PICK-09 | Each device gets one-tap sources and no camera button: Android "Photo library" and "Files"; iPhone one "Choose photos" (Safari routes library and files through one Apple menu); desktop "Upload photos" and a drag-and-drop area. | auto |
| AC-PICK-10 | On desktop, dropping photos onto the drop area opens them like uploading. | auto |
| AC-PICK-11 | On a real Android phone, "Photo library" and "Files" open the photo picker and the file browser directly. | manual |

## Subject detection

| ID | Criterion | Check |
|---|---|---|
| AC-DETECT-01 | Detection models download only after photos are picked, never on page load. | auto |
| AC-DETECT-02 | The real on-device models find faces and objects in the CC0 fixture photos. | auto |
| AC-DETECT-03 | When the models can't load, a saliency heuristic finds the subject and the app still exports. | auto |
| AC-DETECT-04 | When the detection worker can't start, photos use center crops and the app still exports. | auto |
| AC-DETECT-05 | The subject box covers what matters: faces weigh most and are padded to whole heads; minor detections are ignored. | auto |
| AC-DETECT-06 | The editor summarizes what was found (e.g. "Found 2 faces and a dog."), and says nothing for heuristic guesses. | auto |

## Cropping

| ID | Criterion | Check |
|---|---|---|
| AC-CROP-01 | The whole subject box stays inside the crop, centered, whenever it geometrically fits; crops are deterministic. | auto |
| AC-CROP-02 | A face is never cut through: each face is fully in or fully out, and the most important face is always in. | auto |
| AC-CROP-03 | Where a cell overlaps Instagram's overlay bands (top 14%, bottom 18%, sides 6%), the subject moves clear of them when possible. | auto |
| AC-CROP-04 | A photo with no detected subject gets a center crop. | auto |
| AC-CROP-05 | When no crop avoids cutting a face, the photo zooms out (showing background) instead. | auto |
| AC-CROP-06 | Manual crops stay in bounds: panning follows the finger, zoom stays between 0.5× and 4×, and at 1× or more the photo covers its cell. | auto |

## Assignment and ranking

| ID | Criterion | Check |
|---|---|---|
| AC-ASSIGN-01 | Photo-to-cell assignment is optimal (matches brute force on small cases). | auto |
| AC-ASSIGN-02 | Placement cost rises with lost subject, subject under overlays, aspect mismatch, hidden area, upscaling and zoom-out. | auto |
| AC-ASSIGN-03 | Photos go to the cells that fit their shape, and faces stay out of cells under the overlay bands when another photo can go there. | auto |
| AC-RANK-01 | Layouts are ranked best fit first for the picked photos. | auto |
| AC-RANK-02 | Ranking is deterministic and doesn't depend on the order layouts are listed in. | auto |
| AC-RANK-03 | The strip offers every layout for the photo count, each with every photo placed exactly once. | auto |
| AC-RANK-04 | Among layouts that fit about equally well, the more often exported ones come first; popularity never lifts a clearly worse fit over a better one, and a handful of exports barely moves the order. | auto |
| AC-RANK-05 | In builds with accounts on, each Share or Download sends only the exported layout's id (no photo, account, cookie or body) and the API keeps just a running count per layout, which the app reads to rank. Builds with accounts off send nothing. | auto |

## Layout library

| ID | Criterion | Check |
|---|---|---|
| AC-LAYOUT-01 | Every layout's cells stay inside the canvas, overlap only where declared, keep enough area outside the overlay bands, and are well formed: polygons convex, arches tall enough for their curved top. | auto |
| AC-LAYOUT-02 | There are at least 2 layouts for 1 photo and at least 4 for each count from 2 to 8. | auto |
| AC-LAYOUT-03 | The library covers every family: grids, feature, mosaic, diagonal, scattered prints, filmstrip, circles, negative space, shapes (arches, capsules, hearts, stars, hexagons, waves) and Polaroids. | auto |
| AC-LAYOUT-04 | Layouts are data with unique ids, validated against the schema. | auto |
| AC-LAYOUT-05 | Cell geometry is right: gaps inset every edge evenly (concave outlines too, and stacked waves stay a full gap apart), rotated cells, circles, arches, capsules, hearts and stars hit-test correctly, taps go to the topmost cell, and a Polaroid's photo sits in its card's window with the deeper margin below. | auto |

## Editing

| ID | Criterion | Check |
|---|---|---|
| AC-EDIT-01 | A plain drag repositions the photo within its cell and never swaps. | auto |
| AC-EDIT-02 | Pressing and holding a photo, then dragging it onto another cell, swaps the two. | auto |
| AC-EDIT-03 | Tapping one photo, then another, swaps them. | auto |
| AC-EDIT-04 | A two-finger pinch zooms the photo under the fingers. | auto |
| AC-EDIT-05 | Ctrl+scroll (trackpad pinch) zooms the photo under the pointer on desktop. | auto |
| AC-EDIT-06 | A selected photo shows a zoom slider. | auto |
| AC-EDIT-07 | Tapping a layout in the strip opens it in the preview. | auto |
| AC-EDIT-08 | New and swapped photos get fresh smart crops for their cells. | auto |
| AC-EDIT-09 | Pinch, press-and-hold swap and dragging feel right one-handed on a real iPhone and Android phone. | manual |
| AC-EDIT-10 | A selected photo gets a floating tooltip over the preview with Fit (back to the automatic crop) and Done; the tool panel shows its zoom. | auto |
| AC-EDIT-11 | Double-tapping a photo zooms in around the tap, and double-tapping again goes back to fit. | auto |
| AC-EDIT-12 | On a real phone the motion feels natural: a held photo lifts and follows the finger, swapped photos glide into place, a flicked photo keeps gliding, layouts crossfade, and Android vibrates briefly on lift and drop. With "reduce motion" on, changes are instant. | manual |
| AC-EDIT-13 | The Layouts tool shows each layout as a plain diagram of its cells (one shape per photo, no photos drawn on it), with the current one highlighted. | auto |
| AC-EDIT-14 | Tapping another layout during a crossfade replaces it, so quick taps never pile up crossfades that slow the preview. | auto |

## Style

| ID | Criterion | Check |
|---|---|---|
| AC-STYLE-01 | The Style tool offers labeled controls for color (presets, custom color, blurred photo), spacing, margin, corners, border width and color, and a reset; chips pick which one shows. | auto |
| AC-STYLE-02 | Defaults come from the layout until changed: white borders where photos overlap (scattered prints, insets), white Polaroid cards on a blurred photo, blur for "Framed on blur", white elsewhere. | auto |
| AC-STYLE-03 | Style changes appear in the exported image. | auto |
| AC-STYLE-04 | Changing the style keeps manual crops. | auto |
| AC-STYLE-05 | Full-bleed layouts have no spacing, corners or border. | auto |
| AC-STYLE-06 | Spacing and margin are even: neighbours are a full gap apart, every edge cell is one margin from the canvas edge, and both scale with the canvas. | auto |

## Export and sharing

| ID | Criterion | Check |
|---|---|---|
| AC-EXPORT-01 | Export produces a 1080×1920 JPEG by default. | auto |
| AC-EXPORT-02 | PNG export produces a 1080×1920 PNG. | auto |
| AC-EXPORT-03 | EXIF orientation is applied: a rotated phone photo exports upright. | auto |
| AC-EXPORT-04 | The editor warns when a photo is enlarged more than 1.5× in its cell. | auto |
| AC-EXPORT-05 | Where the browser can share files, Share opens the share sheet with the 1080×1920 image. | auto |
| AC-EXPORT-06 | Where it can't, the image downloads instead. | auto |
| AC-EXPORT-07 | The export is rendered from the original photos, not the downscaled previews. | auto |
| AC-EXPORT-08 | Sharing to Instagram on a real phone opens a Story with the image, and no face sits under Instagram's overlays. | manual |

## Performance

| ID | Criterion | Check |
|---|---|---|
| AC-PERF-01 | Analyzing 8 photos takes under 3 s once the models are loaded (CI, Chromium). | auto |
| AC-PERF-02 | Switching layouts updates the preview in under 100 ms (CI, Chromium: every layout's median of 5 back-to-back switches). | auto |
| AC-PERF-03 | Exporting 8 × 12 MP photos takes under 2 s. | auto |
| AC-PERF-04 | The three targets above hold on a recent iPhone. | manual |

## Privacy

| ID | Criterion | Check |
|---|---|---|
| AC-PRIV-01 | Photos never leave the device: no request goes to another origin and nothing is uploaded, from page load through export. No analytics. | auto |
| AC-PRIV-02 | The UI says photos stay on the device. | auto |
| AC-PRIV-03 | The privacy policy and support pages are public at /privacy and /support, with no account needed, and the Account screen links to both. | auto |

## Accessibility and mobile

| ID | Criterion | Check |
|---|---|---|
| AC-A11Y-01 | An axe scan of the pick screen and the editor (style panel open) finds no violations: labels, roles and contrast. | auto |
| AC-A11Y-02 | The editor works from the keyboard (pick, move, zoom, swap), and a status line announces each action. | auto |
| AC-A11Y-03 | Every control is at least 44 × 44 CSS pixels. | auto |
| AC-MOBILE-01 | Nothing scrolls sideways at phone width, on the pick screen or in the editor. | auto |
| AC-MOBILE-04 | On phones the editor is one screen with no page scrolling: top bar with Share, the preview, the current tool and the tab bar all fit, in every tool and with a photo selected. | auto |
| AC-MOBILE-02 | The full flow passes in emulated iPhone Safari (WebKit) and Android Chrome (Chromium). | auto |
| AC-MOBILE-03 | Staging is checked by hand on a real iPhone (Safari) and Android phone (Chrome) before each release. | manual |

# v2 (planned)

From the v2 section of `docs/product-brief.md`. Rows marked `auto` or `manual` have shipped (B1: the API; B2: accounts, behind the `VITE_FEATURE_ACCOUNTS` flag). The rest ship behind a feature flag too; while it's off, the v1 criteria above
describe the app exactly. When saving ships, AC-SAVE-02 and AC-SAVE-07 replace AC-PRIV-01 and AC-PRIV-02.

## Platform

| ID | Criterion | Check |
|---|---|---|
| AC-API-01 | Browsers may call the API only from StoryStitch's own web origins (CORS), with credentials; every other origin gets no access. | auto |
| AC-API-02 | Database migrations are backward compatible: the previous API version still works against the new schema. A migration that isn't purely additive fails until each risky statement is marked as reviewed. | auto |
| AC-API-03 | With the accounts flag off, the app behaves exactly as v1: no account features and no requests to the API. | auto |
| AC-API-04 | `GET /health` reports the deployed version and whether the database is up, with status 503 when it isn't. | auto |
| AC-API-05 | Account requests that change data are refused unless they come from StoryStitch's own web origins or its native app, which names its URL scheme (cross-site request forgery). Emailed links return only to those two, and a browser on another site can't pass as the app. | auto |
| AC-API-06 | `GET /app/minimum-version` is public and reports the oldest iOS app version still supported. | auto |
| AC-UPDATE-01 | The iOS app compares its version with the API's minimum number by number (1.10.0 is newer than 1.9.0), and only an older version needs updating. A check that fails, is slow or can't be read never gets in the way: the app carries on. | auto |
| AC-UPDATE-02 | Web never asks for the minimum version and never shows the "please update" screen. | auto |
| AC-UPDATE-03 | An iOS app older than the minimum shows a "please update" screen with no way past it, on a real build of the app. | manual |

## iOS app

Maestro reads the accessibility tree, so `ios` rows prove what a person can reach and do, not how a collage looks: Skia's drawing isn't visible to it.

| ID | Criterion | Check |
|---|---|---|
| AC-IOS-01 | The app opens on the pick screen with its headline and privacy line, with or without the API. | ios |
| AC-IOS-02 | Picking photos, including a HEIC, in the iOS picker opens the editor with a preview naming its layout and photo count, and a strip of layouts. | ios |
| AC-IOS-03 | Tapping a layout in the strip switches the preview to it. | ios |
| AC-IOS-04 | The Style tool offers colors, and tells VoiceOver which one is chosen, and a spacing slider that changes the value. | ios |
| AC-IOS-05 | Tapping a photo offers a zoom slider, Fit undoes the zoom, and Done closes the photo's tools. | ios |
| AC-IOS-06 | Share opens the iOS share sheet with the export as a JPEG, or a PNG when that's the chosen format. It stays available while the image is being made: tapped then, the sheet opens as soon as the image is ready. | ios |
| AC-IOS-07 | Start over returns to the pick screen. | ios |
| AC-IOS-08 | Save Image in the share sheet adds a 1080×1920 image to Photos without asking for access to the whole library. | manual |
| AC-IOS-09 | With an account signed in on a simulator, `apps/app/maestro/local` passes: every layout editor tool for grids and free cells works and can be undone, and VoiceOver can't reach the screen behind the editor. Lines and handles report where they are. | manual |
| AC-IOS-10 | On a real iPhone, a double-tap zooms a photo in and back out, and a flicked photo keeps gliding, and Fit undoes a full zoom on a Polaroid. The simulator's tools can't tap fast enough to count as a double-tap, and Maestro's tap on Fit has no effect there though a direct tap works. | manual |
| AC-IOS-11 | On a simulator with the local API: sign-up, confirming the email, a wrong password, resetting a password, the save error messages and deleting an account (it needs the password, and removes the user, sessions and saved layouts) all work, and VoiceOver can't reach the screen behind an account screen. | manual |
| AC-IOS-13 | On a real iPhone with VoiceOver on (the simulator doesn't have it), the layout editor's lines and handles move by swiping up and down, corners and the chosen photo in a free layout move with the Move actions, the preview's swipes still choose a photo, and each step is spoken. | manual |
| AC-IOS-12 | Every layout draws the same with the iOS and web drawing code, from the same photos and crops, in several styles. | auto |
| AC-IOS-14 | On a real iPhone with VoiceOver on (the simulator doesn't have it), swiping up or down on a slider, such as Spacing or a photo's zoom, changes its value and says the new one. | manual |

## Accounts

| ID | Criterion | Check |
|---|---|---|
| AC-AUTH-01 | Picking, editing, exporting and sharing work without an account; sign-in is asked for only when saving (collages, or layouts made in the layout editor). | auto |
| AC-AUTH-04 | Sign-up, sign-in and password reset require the bot check to pass, and attempts are limited per IP address. | auto |
| AC-AUTH-05 | Users register and sign in with email and password, must verify their email first, and reset a forgotten password by email (which signs out their other sessions). | auto |
| AC-AUTH-06 | Signed-in sessions persist across reloads in iPhone Safari (WebKit) and Android Chrome. | auto |
| AC-AUTH-07 | Users can sign out, and sign out of every device. | auto |
| AC-AUTH-08 | Deleting an account needs the account's password and removes the user and their sessions, saved layouts (and, once saving ships, their saved collages and files). | auto |
| AC-AUTH-10 | On staging, a real verification email and password-reset email arrive, and sign-up and sign-in work on iPhone Safari and Android Chrome. | manual |
| AC-AUTH-11 | When StoryStitch can't be reached, account forms say so and can be tried again, instead of waiting forever. | auto |
| AC-AUTH-12 | The Expo web app's /bot-check page holds only the bot check and passes its token to the iOS app that shows it. | auto |

## Layout editor

Behind `VITE_FEATURE_LAYOUT_EDITOR` (needs accounts): on in staging and production.

| ID | Criterion | Check |
|---|---|---|
| AC-CUSTOM-01 | The Layouts tool offers "Edit this layout", highlighted in gold. A signed-out user is asked to create an account or sign in, and the editor opens by itself once they're signed in, with their collage still there. Grids are edited by their lines, slanted layouts by their corners and lines, and everything else by moving whole cells. | auto |
| AC-CUSTOM-02 | Grids: dragging a line resizes the cells on both sides and snaps to halves, thirds and other lines; a cell can be split across or down, reshaped (rectangle, arch, capsule) or removed; no cell gets smaller than the minimum; each photo stays with its cell. | auto |
| AC-CUSTOM-03 | Slanted layouts: dragging a shared corner or a line moves it for every cell that shares it; canvas corners stay put, corners on an edge slide along it, and no cell folds, leaves the frame or stops being convex. | auto |
| AC-CUSTOM-04 | Circles, hearts, stars, prints and Polaroids: cells move by dragging, resize by pinching, a handle or Bigger/Smaller, and prints turn; cells that mustn't overlap can't be pushed into each other; a cell can be copied or removed. | auto |
| AC-CUSTOM-05 | The editor fills the screen; every line and handle has a touch target of at least 44 px (48 px drawn), buttons are at least 44 px tall, and Undo reverses the last change. | auto |
| AC-CUSTOM-06 | Done only proceeds once there's one cell per photo, and says what's missing; cells overlapping or past the edge are outlined and explained, and such a layout isn't saved. Photos can go anywhere on the canvas, and the editor draws nothing over them. | auto |
| AC-CUSTOM-07 | Layouts save to the account with a name (up to 20, with a clear message when full), come first in the Layouts tool marked "Yours" for their photo count, and can be edited (replacing the saved one) and deleted. The API accepts only valid layouts, only from StoryStitch's own web origins or its native app (whose header a browser can't use to get past this), and only touches the signed-in user's own layouts. | auto |
| AC-CUSTOM-09 | A saved layout this app version can't read is left out of the Layouts tool, and the user's other saved layouts still appear. | auto |
| AC-CUSTOM-10 | On iOS, VoiceOver can do without dragging what a finger does to lines and handles: swipe up or down on a line, slanted line, resize handle or turn handle to step it, use the Move up, down, left and right actions on a corner (only the ways it can go) or on the Move photo element over the chosen photo in a free layout, and swipe on the preview to choose a photo. Each step says where it ended up or why it can't go further, and Undo reverses it. | auto |
| AC-CUSTOM-08 | The layout editor feels right one-handed on a real iPhone and Android phone: lines, corners and photos are easy to grab and drag without precise aim. | manual |

## Saved collages

| ID | Criterion | Check |
|---|---|---|
| AC-SAVE-01 | A signed-in user can save the exported collage; a signed-out user who taps Save is asked to sign in, then the collage saves. | planned |
| AC-SAVE-02 | Only the finished collage and its thumbnail are uploaded; original photos never leave the device. | planned |
| AC-SAVE-03 | Saved images carry no EXIF or location metadata. | planned |
| AC-SAVE-04 | "My stories" lists saved collages newest first; each can be opened full size, shared or downloaded again, and deleted. | planned |
| AC-SAVE-05 | Users can reach only their own collages, through signed links that expire. | planned |
| AC-SAVE-06 | An account holds up to 200 saved collages and says clearly when it's full. | planned |
| AC-SAVE-07 | The UI says original photos stay on the device and saved collages are stored privately in the account. | planned |

## Usage tracking

| ID | Criterion | Check |
|---|---|---|
| AC-USAGE-01 | With the usage flag off or no API URL, the app sends no usage requests and starts no timers. | auto |
| AC-USAGE-02 | Every event comes from the shared registry, and every property is a fixed list, a true/false value or a bounded number, so free text can't be sent. | auto |
| AC-USAGE-03 | Tracking can't slow or break the app: `track` returns at once and never throws, and a failed, slow or offline send changes nothing the user sees. The queue holds at most 100 events. | auto |
| AC-USAGE-04 | Events go out in batches of up to 50, one send at a time: at 20 queued, every 30 seconds or on going to the background. Going to the background sends everything waiting, including what was tracked during a send already in progress. Network and server failures retry with growing waits, and refused batches are dropped. | auto |
| AC-USAGE-05 | The API accepts events from every supported app version, skips unknown events without losing the rest of the batch, and counts what it skipped. | auto |
| AC-USAGE-06 | The API refuses oversized bodies and other web origins, limits batches per visitor, and writes nothing while `USAGE_INGEST_ENABLED` is off. | auto |
| AC-USAGE-07 | Page views use fixed screen names, cover the pick, editor, layout editor and account screens, and never send a path or query string. `/bot-check` isn't counted. | auto |
| AC-USAGE-08 | With tracking on, the iOS app sends usage events to a local API, and the whole core flow still works with the API unreachable. | manual |

## Admin analytics

| ID | Criterion | Check |
|---|---|---|
| AC-ADMIN-01 | The app records first-party events: visit, screen views, tagged button presses, photos picked (count), layout chosen, export, share, save, sign-up and error. | auto |
| AC-ADMIN-02 | Events and stored counts never contain image data, file names, layout names, emails, IP addresses, user agents or any account or device ID. Daily visitors are counted with a hash held in memory that changes daily and is never stored. | auto |
| AC-ADMIN-03 | `/admin` opens only for admin accounts signed in with email, password and an authenticator code; everyone else is refused. | planned |
| AC-ADMIN-04 | The dashboard shows daily totals, the picked → exported → saved funnel, most-used layouts and errors. | planned |
| AC-ADMIN-05 | At phone width, `/admin` says to open it on a desktop. | planned |
