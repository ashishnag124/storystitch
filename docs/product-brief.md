# StoryStitch — product brief

## What it is
A mobile-first web app. The user picks 1–8 photos; the app proposes Instagram Story collage layouts for that photo count, places and crops each photo so its subject stays in frame, and exports a 1080×1920 image ready to post.

Difference from Fotor's photo stitch (which only stitches photos in a horizontal or vertical line, with the user dragging photos into place by hand): more interesting layouts, built for the 9:16 Story format, and automatic subject-aware placement and cropping.

## Core flow
1. On a phone, tap "Choose photos" and pick 1–8 from the camera roll. Accept JPEG, PNG, WebP and HEIC.
2. The app analyzes the photos on the device (show progress), then shows a strip of layout options for that photo count. Each option is previewed with the user's own photos, best fit first.
3. Tap a layout to open a full preview. Photos are already assigned to cells and cropped around their subjects.
4. Optional adjustments: drag to swap photos between cells; pinch or drag inside a cell to re-crop; adjust the style.
5. Export. Where `navigator.canShare({ files })` is supported, open the native share sheet (the user picks Instagram → Story); otherwise download. Web apps can't open Instagram's Story composer directly (that deep link only works from native apps), so the share sheet is the intended path.

## Layouts
- Layouts are data, not code. Each is a JSON object of cells in normalized 0–1 coordinates on a 9:16 canvas. Cells can be rectangles, rotated rectangles, polygons (for diagonal splits and hexagons), circles, arches, capsules, hearts, stars or rectangles with wavy edges, with a z-order for overlaps. Adding a layout means adding a JSON entry plus a test.
- At least 4 distinct layouts for each count from 2 to 8, and 2 for a single photo (full bleed; framed on a blurred copy of the photo).
- Families to cover:
  - grids and stacks
  - one large photo with supporting smaller ones
  - masonry/mosaic with mixed cell sizes
  - diagonal and angled splits
  - an overlapping "scattered prints" collage with slight rotations
  - a filmstrip
  - circles and rounded shapes
  - layouts with deliberate empty space for Instagram text and stickers
  - shapes: arches, capsules, hearts, stars, hexagons and wave splits
  - Polaroid prints: each photo in a white card with a deeper bottom margin
- Story safe zones: no subject or face sits under Instagram's interface overlays. Defaults are top 14%, bottom 18% and sides 6%. Make them named constants so they're easy to adjust.

## Smart placement (the core feature)
- **Subject detection, in the browser:** detect faces, people and salient objects with an on-device model (MediaPipe Tasks for Web or equivalent). Check the current docs and pick what runs well on iOS Safari and Android Chrome. When nothing is detected, fall back to a saliency or center-weighted heuristic. Run detection in a Web Worker and load models only after photos are picked.
- **Subject box:** for each photo, compute a weighted box covering what matters. Faces weigh most and must never be cut through.
- **Crop:** for a given photo and cell, find the crop matching the cell's aspect ratio that keeps the whole subject box inside with a margin, centered, zooming only as much as needed. If the subject can't fit, keep faces whole and cut the least important area. If a cell overlaps a safe-zone band, shift the crop so the subject sits outside the band where possible.
- **Assignment:** decide which photo goes in which cell by minimizing total subject loss. Use an optimal assignment, e.g. the Hungarian algorithm over a photo × cell cost matrix. Cost combines subject coverage, how much upscaling is needed and aspect mismatch.
- **Ranking:** score each layout for this specific photo set by its best assignment cost and show the best first. Keep the weights named and explainable in code. Among layouts that fit about equally well, the ones exported more often go first: each export sends only its layout's id to the API, which keeps a running count per layout (builds with accounts on only).
- **Structure:** implement all of this as pure functions in its own package (e.g. `packages/layout-engine`) with unit tests. The UI only calls them.

## Style controls
Spacing between cells, outer margin, corner radius, background (preset palette, custom color, or a blurred copy of a photo), and border width and color. The defaults must look good without touching anything.

## Export
- 1080×1920 JPEG at quality ~0.9 by default; PNG as an option.
- Render from the original images, not the preview copies, and apply EXIF orientation correctly.
- Warn if any photo has to be upscaled more than 1.5× in its cell.

## Non-functional requirements
- **Privacy:** images are never uploaded, and the UI says so. No analytics in v1.
- **Mobile-first:** usable one-handed on iPhone Safari and Android Chrome, with touch gestures. Desktop works too.
- **Performance:** analyzing 8 photos takes under 3 s on a recent iPhone once models are loaded. Switching layouts updates the preview in under 100 ms. Export takes under 2 s. Use downscaled working copies for analysis and previews.
- **Accessibility:** keyboard-operable on desktop, labeled controls, sufficient contrast.
- **Cost:** static hosting on Cloudflare Pages only; $0 to run.

## Out of scope for v1
Accounts, saved projects, text/stickers/filters, video, posting through Instagram's API, and server-side AI. These are candidates for later via /add-app.

## Acceptance
- **Unit tests:**
  - layout JSON validation: cells stay inside the canvas, overlap only where declared, and respect the safe zones
  - crop: the subject is fully inside whenever geometrically possible, and faces are never cut through
  - assignment: optimal on small cases
  - ranking: deterministic
- **Detection tests:** detection sits behind an interface so most tests use fixed subject boxes. One integration test runs the real model on 2–3 CC0 fixture photos.
- **End-to-end (Playwright):** upload 1, 4 and 8 fixture images → layout options appear → export produces a 1080×1920 image.
- **Before any release:** checked by hand on staging on a real phone.

---

# v2: accounts, saved collages, admin analytics

Decided 2026-10-31; amended the same day to defer text-message sign-in (email and password only for now) and payments (see "Later"). Everything above is the v1 brief, kept as written; this section adds to it and, where it says so,
replaces parts of it. Build order and status: see "Backend milestones" in `PROJECT_SETUP.md`.

## What changes from v1

- **Privacy.** v1: "images are never uploaded, and the UI says so." v2: original photos still never leave the device,
  and all analysis and rendering stays in the browser. The only image that is ever uploaded is a finished collage the
  signed-in user chooses to save. The UI says: "Your photos stay on this device. Collages you save are stored privately
  in your account."
- **Out of scope.** Accounts and saved images move into scope (finished collages only, not editable projects).
- **Analytics.** v1: "No analytics." v2: first-party, aggregate analytics only (below). Still no third-party trackers and
  no tracking cookies.
- **Cost.** v1: Cloudflare Pages only, $0. v2 adds a Railway API and Postgres (about $5–10/month).
- **Domain.** `storystitch.ashishnag.com` (production) and `staging.storystitch.ashishnag.com`, with the API at
  `api.storystitch.ashishnag.com` and `api-staging.storystitch.ashishnag.com`. One parent domain, so sign-in cookies
  work in iPhone Safari.
- **Fuller collages** (decided 2026-11-08). Collages fill the Story: layouts the photos fill rank first, the default
  spacing is 8px with a 12px margin, and sparse shapes (hearts, circles, hexagons, prints, Polaroids, photo booths) are
  drawn larger, overlapping slightly where that fills much more. Layouts with empty space for text and stickers stay,
  but each has a filled alternative with the same arrangement, and the editor never opens on one.

## Accounts

- The core flow still works without an account; sign-in is asked for only when saving.
- **Email and password**, optional: register, verify the email address, sign in, and reset a forgotten password by
  email.
- Not for now: text-message sign-in (deferred to keep this release simple), Google and Apple sign-in.
- Protection against abuse from day one: a bot check (Cloudflare Turnstile) on sign-up, sign-in and password reset,
  and limits on attempts per account and per IP address.
- Users can sign out of all devices and delete their account, which deletes their saved collages and data.

## Saved collages

- A Save button next to Share on the export step. It uploads the exported image and a small thumbnail, both made in
  the browser. Exports are re-encoded by the canvas, so they carry no EXIF or location data.
- "My stories": a grid of saved collages, newest first. Open one to view it full size, share or download it again, or
  delete it.
- Storage is private; images are served only through short-lived signed links.
- Limits: 200 saved collages per account, with a clear message when full.

## Layout editor

- "Edit this layout" in the Layouts tool, highlighted in gold, starts from the layout on screen. (Making a layout
  from a blank frame is set aside for now.) Layouts are saved to the account (up to 20), so a signed-out user is
  asked to create an account or sign in, and comes straight back to the editor.
- Full screen on the phone, with large touch targets, snapping, Undo, and buttons (Bigger, Smaller, Turn) for small
  adjustments without precise dragging. The preview shows the user's own photos.
- How a layout is edited depends on what it's made of: grids by dragging the lines between cells and splitting,
  reshaping or removing cells; slanted layouts by dragging shared corners and lines; circles, shapes, prints and
  Polaroids by moving, resizing and turning cells.
- Saved layouts are checked like the built-in ones, show first in the Layouts tool as "Yours", and can be edited and
  deleted. They're never counted toward popularity.

## Admin analytics

- First-party events: visits, screen views, tagged button presses, photos picked (count only), layout chosen, export,
  share, save, sign-up and error codes. Our own database keeps only daily counts, with no event log. Never image
  content, file names, layout names, emails, IP addresses or account or device IDs; visitors are counted with a hash
  that changes every day and is held in memory only.
- A `/admin` dashboard: daily totals, the picked → exported → saved funnel, most-used layouts, and errors.
- Only accounts marked as admin can open it, signing in with email, password and an authenticator-app code. It's
  built for desktop; on a phone it says to open it on a desktop.

## Later (decided, not in this round)

- **Payments: a Supporter pass.** A pay-what-you-want, one-time purchase ($3 minimum) through Lemon Squeezy as
  merchant of record, offered in a dismissible card after export or share. It must deliver a real product, because
  Lemon Squeezy prohibits donations with no product: e.g. a higher saved-collage limit and a supporter badge.
- **Text-message sign-in** (phone number + 6-digit code, e.g. Twilio Verify with fraud protection).
- **Google and Apple sign-in.**

## Acceptance

- Each feature above gets rows in `docs/acceptance-criteria.md` (listed there as `planned` until it ships) and tests
  that `pnpm qa` runs before every release.
- Everything ships hidden behind a feature flag until it's switched on, so `main` stays releasable.
