# Acceptance criteria

What StoryStitch must do, derived from `docs/product-brief.md`. Every release to production runs `pnpm qa`, which
runs the whole test suite and checks each criterion here:

- **auto** criteria pass only when at least one test names their ID in its title (or a `describe` around it),
  every such test passes, and at least one of them actually ran (not skipped in every browser).
- **manual** criteria are checked by hand on staging before running `/release`. `pnpm qa` lists them as reminders.

`pnpm qa` also fails if a test names an ID that isn't listed here. Results land in `qa-results/report.md`.

**Keeping this up to date:** a change to user-facing behavior adds or edits a row here and tags a test with its ID,
e.g. `it("AC-CROP-02 never cuts through a face", …)`. Retire an ID by deleting its row and its tags together; don't
reuse IDs.

## Picking photos

| ID | Criterion | Check |
|---|---|---|
| AC-PICK-01 | The picker accepts JPEG, PNG, WebP and HEIC and allows choosing several photos at once. | auto |
| AC-PICK-02 | Picking 1 to 8 photos opens the editor with a preview and a strip of layout options. | auto |
| AC-PICK-03 | Picking more than 8 photos uses the first 8 and says so. | auto |
| AC-PICK-04 | A file that can't be opened is skipped with a message naming it; the other photos still load. | auto |
| AC-PICK-05 | HEIC photos open, natively or through the bundled decoder. | auto |
| AC-PICK-06 | Progress is shown while photos are prepared and analyzed. | auto |
| AC-PICK-07 | HEIC photos straight from an iPhone camera roll open on iPhone Safari. | manual |

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
| AC-RANK-03 | The strip offers every layout for the photo count, each previewed with every photo placed exactly once. | auto |

## Layout library

| ID | Criterion | Check |
|---|---|---|
| AC-LAYOUT-01 | Every layout's cells stay inside the canvas, overlap only where declared, are convex, and keep enough area outside the overlay bands. | auto |
| AC-LAYOUT-02 | There are at least 2 layouts for 1 photo and at least 4 for each count from 2 to 8. | auto |
| AC-LAYOUT-03 | The library covers every family: grids, feature, mosaic, diagonal, scattered prints, filmstrip, circles and negative space. | auto |
| AC-LAYOUT-04 | Layouts are data with unique ids, validated against the schema. | auto |
| AC-LAYOUT-05 | Cell geometry is right: gaps inset every edge evenly, rotated cells and circles hit-test correctly, and taps go to the topmost cell. | auto |

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

## Style

| ID | Criterion | Check |
|---|---|---|
| AC-STYLE-01 | The style panel offers labeled controls for background (presets, custom color, blurred photo), spacing, margin, corners, border width and color, and a reset. | auto |
| AC-STYLE-02 | Defaults come from the layout until changed: white borders on scattered prints, blur for "Framed on blur", cream elsewhere. | auto |
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
| AC-PERF-02 | Switching layouts updates the preview in under 100 ms. | auto |
| AC-PERF-03 | Exporting 8 × 12 MP photos takes under 2 s. | auto |
| AC-PERF-04 | The three targets above hold on a recent iPhone. | manual |

## Privacy

| ID | Criterion | Check |
|---|---|---|
| AC-PRIV-01 | Photos never leave the device: no request goes to another origin and nothing is uploaded, from page load through export. No analytics. | auto |
| AC-PRIV-02 | The UI says photos stay on the device. | auto |

## Accessibility and mobile

| ID | Criterion | Check |
|---|---|---|
| AC-A11Y-01 | An axe scan of the pick screen and the editor (style panel open) finds no violations: labels, roles and contrast. | auto |
| AC-A11Y-02 | The editor works from the keyboard (pick, move, zoom, swap), and a status line announces each action. | auto |
| AC-A11Y-03 | Every control is at least 44 × 44 CSS pixels. | auto |
| AC-MOBILE-01 | Nothing scrolls sideways at phone width, on the pick screen or in the editor. | auto |
| AC-MOBILE-02 | The full flow passes in emulated iPhone Safari (WebKit) and Android Chrome (Chromium). | auto |
| AC-MOBILE-03 | Staging is checked by hand on a real iPhone (Safari) and Android phone (Chrome) before each release. | manual |
