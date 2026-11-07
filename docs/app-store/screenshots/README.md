# App Store screenshots: version 1.0.0

Nine real captures from a Release build on an iPhone 18 Pro Max simulator: 1320 × 2868, PNG, no alpha. There are no captions, frames or edits.

| File | Shows | Photos | Layout | Style |
|---|---|---|---|---|
| `01-home.png` | The home screen, before any photos are chosen | 0 | | |
| `02-polaroids.png` | A finished collage, with the layout strip | 5 | Five Polaroids | Default blurred photo |
| `03-mosaic.png` | The app's limit of 8 photos | 8 | Mosaic of eight | Default |
| `04-circles.png` | The same 8 photos, one tap later | 8 | Eight circles | Default |
| `05-heart.png` | A shape layout | 3 | Heart and two | Blush |
| `06-arches-zoom.png` | Zooming one photo | 2 | Two arches | Sage |
| `07-layout-editor.png` | The layout editor, with a corner dragged | 4 | Pinwheel, edited | Default |
| `08-style.png` | The Style tool, recoloring 04 | 8 | Eight circles | Navy |
| `09-share.png` | The system share sheet, on the collage from 07 | 4 | Pinwheel, edited | Default |

`01-home.png` shows the app's real text, "Turn 1–8 photos into an Instagram Story collage." To drop the name, change the line in `apps/app/src/PickScreen.tsx`, ship that build and retake the shot.

## Where the photos came from

Every photo is from Wikimedia Commons, marked CC0 by the person who took it. Each file page has `{{own}}` as its source and `{{self|cc-zero}}` as its license, and none has a license-review or personality-rights tag (checked November 2026). CC0 asks for no credit and allows commercial use. We credit the photographers here anyway.

| Photo | Photographer (Commons user) | Used in |
|---|---|---|
| [Labrador](https://commons.wikimedia.org/wiki/File:Portrait_of_a_labrador_retriever.jpg) | Dktue | 02, 03, 04, 07, 08, 09 |
| [Tabby cat](https://commons.wikimedia.org/wiki/File:Young_tabby_cat_keeping_watch.jpg) | W.carter | 02, 03, 04, 05, 08 |
| [Red tulips](https://commons.wikimedia.org/wiki/File:Big_red_tulips_with_small_hoverfly.jpg) | W.carter | 02, 03, 04, 07, 08, 09 |
| [Sunset with boats](https://commons.wikimedia.org/wiki/File:Juan_Griego_Sunset.jpg) | Wilfredor | 02, 03, 04, 06, 07, 08, 09 |
| [Mountain lake](https://commons.wikimedia.org/wiki/File:Bear_Lake,_August_2024.jpg) | AutumnNY | 03, 04, 06, 07, 08, 09 |
| [Coffee](https://commons.wikimedia.org/wiki/File:Cup_of_coffee_in_Caf%C3%A9_Butter_-_Prenzlauer_Berg,_Berlin.jpg) | Edward | 03, 04, 05, 08 |
| [Autumn leaves](https://commons.wikimedia.org/wiki/File:Autumn_leaves_on_the_ground_in_Quebec_City.jpg) | Wilfredor | 03, 04, 05, 08 |
| [Hot air balloon](https://commons.wikimedia.org/wiki/File:Winthrop_Hot_Air_Balloon_Roundup.jpg), cropped | Guywelch2000 | 02, 03, 04, 08 |

- **The balloon:** the original has a crowd below it, so it's cropped to the top 78%. A few tiny figures remain at the bottom of the crop, too small to recognize. They're kept out of 07 and 09, where this layout would have enlarged them.
- **The labrador:** the blurred shapes behind it include someone's lower legs, with nothing identifiable.
- **Commons' own warning:** CC0 covers the photographer's copyright. It doesn't cover other rights, such as a person's likeness or a trademark, so these photos were also checked by eye for people, logos and readable text.

Don't use the photos already in the simulator or `apps/web/e2e/fixtures`. Three of the simulator's waterfalls credit a photographer in their metadata, with no license. The others have no license information, or show a person who hasn't signed a release.

## Recreate the set

1. Build for Release, as in `.github/workflows/ios.yml`. From `apps/app`, with the environment values from that file:

   ```bash
   APP_VARIANT=staging pnpm run prebuild:ios
   ```

   Then build `ios/StoryStitchStaging.xcworkspace`, scheme `StoryStitchStaging`, with `-configuration Release`.

2. Clone the simulator, so the photos don't change the order that the Maestro flows pick from. Keep the UDID this prints for the next steps:

   ```bash
   xcrun simctl clone "iPhone 18 Pro Max" "StoryStitch Screenshots"
   ```

3. Boot it, install the app and add each photo with `addmedia`:

   ```bash
   xcrun simctl boot <udid>
   ```

   ```bash
   xcrun simctl install <udid> path/to/StoryStitchStaging.app
   ```

   ```bash
   xcrun simctl addmedia <udid> photo.jpg
   ```

4. Set the status bar. `discharging` at 100% hides the charging bolt:

   ```bash
   xcrun simctl status_bar <udid> override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --operatorName "" --batteryState discharging --batteryLevel 100
   ```

5. Compile the flattener once. `simctl` writes an alpha channel, and App Store Connect rejects those:

   ```bash
   swiftc -O docs/app-store/screenshots/flatten.swift -o /tmp/flatten
   ```

6. For each shot, take a capture and flatten it:

   ```bash
   xcrun simctl io <udid> screenshot --type=png /tmp/raw.png
   ```

   ```bash
   /tmp/flatten /tmp/raw.png docs/app-store/screenshots/01-home.png
   ```

7. Check every file. It must print 1320, 2868 and `hasAlpha: no`:

   ```bash
   sips -g pixelWidth -g pixelHeight -g hasAlpha docs/app-store/screenshots/0*.png
   ```

8. Delete the clone:

   ```bash
   xcrun simctl delete <udid>
   ```

### Steps for each shot

Start over between sets, then Choose photos. The strip's order depends on the photos, so scroll it if a layout isn't where it's listed here.

1. **01:** capture straight after launch.
2. **03:** pick all 8, tap Mosaic of eight, the second layout in the strip.
3. **04:** tap Eight circles, the fourth.
4. **08:** with those 8, open Style and tap Navy.
5. **02:** pick the labrador, balloon, tulips, sunset and cat, in that order. Tap Five Polaroids, the second layout.
6. **05:** pick the cat, leaves and coffee. Tap Heart and two, set Blush in Style, then go back to Layouts.
7. **06:** pick the lake and sunset. Tap Two arches near the end of the strip, set Sage in Style, tap the lake, and drag Zoom to about 1.6×.
8. **07:** pick the labrador, tulips, sunset and lake. Tap Pinwheel near the end of the strip, tap Edit this layout, and drag the center point about 70 points right and 60 down.
9. **09:** in that editor tap Done, then Use this layout, then Share.

Before each capture, wait for the "Drag to move" hint to fade (about 6 seconds), and don't shoot straight after a tap, because the screen lags.

### Keep out of the shots

- **The photo picker:** it shows the staging app's name, and the whole test library.
- **"Yours":** an edited layout gets this badge in the strip. 09's share sheet covers it.

## Sizes

As of November 2026, [Apple's specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/) accept 1320 × 2868 for the large Dynamic Island class, which includes iPhone 18 Pro Max. The same page names the medium class as the required one, and doesn't say outright that the large set covers it. If App Store Connect asks for that size, this makes it from a finished set, with the same order and no alpha:

```bash
mkdir -p /tmp/medium && for f in docs/app-store/screenshots/0*.png; do sips -z 2622 1206 "$f" --out "/tmp/medium/$(basename "$f")"; done
```
