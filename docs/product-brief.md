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
- Layouts are data, not code. Each is a JSON object of cells in normalized 0–1 coordinates on a 9:16 canvas. Cells can be rectangles, rotated rectangles, polygons (for diagonal splits) or circles, with a z-order for overlaps. Adding a layout means adding a JSON entry plus a test.
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
- Story safe zones: no subject or face sits under Instagram's interface overlays. Defaults are top 14%, bottom 18% and sides 6%. Make them named constants so they're easy to adjust.

## Smart placement (the core feature)
- **Subject detection, in the browser:** detect faces, people and salient objects with an on-device model (MediaPipe Tasks for Web or equivalent). Check the current docs and pick what runs well on iOS Safari and Android Chrome. When nothing is detected, fall back to a saliency or center-weighted heuristic. Run detection in a Web Worker and load models only after photos are picked.
- **Subject box:** for each photo, compute a weighted box covering what matters. Faces weigh most and must never be cut through.
- **Crop:** for a given photo and cell, find the crop matching the cell's aspect ratio that keeps the whole subject box inside with a margin, centered, zooming only as much as needed. If the subject can't fit, keep faces whole and cut the least important area. If a cell overlaps a safe-zone band, shift the crop so the subject sits outside the band where possible.
- **Assignment:** decide which photo goes in which cell by minimizing total subject loss. Use an optimal assignment, e.g. the Hungarian algorithm over a photo × cell cost matrix. Cost combines subject coverage, how much upscaling is needed and aspect mismatch.
- **Ranking:** score each layout for this specific photo set by its best assignment cost and show the best first. Keep the weights named and explainable in code.
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
