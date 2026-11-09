# App Store submission: version 1.0.0

Everything to enter in App Store Connect for the production app, `com.ashishnag.storystitch`. Do this after production has moved to the Expo app, because the review team will open the privacy and support URLs and may sign in.

## App information

| Field | Value |
|---|---|
| Name | StoryStitch |
| Subtitle | Story collages from photos |
| Primary category | Photo & Video |
| Secondary category | Lifestyle |
| Bundle ID | `com.ashishnag.storystitch` |
| SKU | `storystitch` |
| Price | Free |
| Copyright | 2026 Ashish Nag |
| Support URL | https://storystitch.ashishnag.com/support |
| Marketing URL | https://storystitch.ashishnag.com |
| Privacy policy URL | https://storystitch.ashishnag.com/privacy |

If the name StoryStitch is taken, App Store Connect says so when you create the app. The name on the store can differ from the one under the icon, which is set by `name` in `apps/app/app.config.ts`.

## Version 1.0.0 text

### Promotional text

```text
Turn up to 8 photos into a Story-ready collage in seconds. Your photos stay on your phone.
```

### Keywords

```text
collage,story,stories,photo,layout,grid,polaroid,maker,editor,montage,picture,frame,template,stitch
```

No competitor or brand names: Apple can reject those.

### Description

```text
StoryStitch turns your photos into a collage made for a 9:16 Story.

Pick up to 8 photos, and StoryStitch finds the faces and subjects in them, suggests layouts that suit your photos, and crops each one so the important part stays in frame. Your collage is ready in seconds, and you can change as much or as little as you like.

MADE FOR STORIES
• Layouts for 1 to 8 photos: grids, mosaics, diagonal splits, filmstrips, scattered prints, Polaroids, arches, circles, hearts and stars
• Smart cropping that keeps faces and subjects in view
• Every collage exports at full Story size, 1080 × 1920
• Share straight from your phone, or save to Photos

MAKE IT YOURS
• Drag to swap photos, and pinch to zoom
• Choose colors, spacing and rounded corners
• Edit any layout: move lines, split cells, reshape them or move photos freely

YOUR PHOTOS STAY ON YOUR PHONE
Finding subjects and making your collage all happen on your device. Your photos are never uploaded.

NO ACCOUNT NEEDED
You can make, edit and share collages without signing up. A free account is optional, and only keeps your own layouts for next time.
```

### What's new

```text
First release.
```

## App Review information

Create the demo account on production first, and confirm its email. Put its address and password in App Store Connect only, never in this repo.

| Field | Value |
|---|---|
| Sign-in required | Off: the app works without an account |
| Demo account | Create one on production, for the optional saving feature |
| Contact | Your name, phone and email |

### Notes for the reviewer

```text
StoryStitch works without an account. To try it, tap Choose photos, pick a few photos and the app builds a collage. Use Share to send it or save it to Photos.

An account is optional. It only saves custom layouts. To try that, tap Edit this layout, then Done, then Sign in, and use the demo account above. Account deletion is in Account, then Delete account.

Photos are processed on the device and are never uploaded. There's no third-party sign-in, so Sign in with Apple doesn't apply. The camera and microphone descriptions are in the app only because the system photo picker library refers to them. The app never asks for either.
```

## App Privacy

Answer **Yes** to "Do you or your third-party partners collect data from this app?"

| Data type | Used for | Linked to the user | Used for tracking |
|---|---|---|---|
| Contact Info → Email Address | App Functionality | Yes | No |
| User Content → Other User Content (saved layouts and their names) | App Functionality | Yes | No |
| Identifiers → User ID (the account's ID) | App Functionality | Yes | No |
| Usage Data → Product Interaction | Analytics, App Functionality | No | No |
| Diagnostics → Other Diagnostic Data (error types) | Analytics | No | No |

- **Tracking:** No. The app has no advertising and shares nothing with data brokers, so it shows no App Tracking Transparency prompt.
- **Photos:** don't declare them. They stay on the device.
- **These answers are your statement to Apple.** "Not linked" rests on usage counts holding no ID, as the privacy policy describes.

## Age rating

Answer **None** or **No** to every question: no violence, sexual content, profanity, gambling, medical content or similar. There's no unrestricted web browsing, and no way for users to message each other or publish to other users. That should give the lowest rating.

## Other questions

| Question | Answer |
|---|---|
| Export compliance | Already answered in the app with `usesNonExemptEncryption: false` |
| Content rights | No third-party content, other than the user's own photos |
| Advertising identifier | No |
| Availability | All countries, unless you want to limit it |
| Release | Manually release this version, so you control the launch day |

## Screenshots

The set is in `docs/app-store/screenshots/`, and every photo in it is CC0. Its `README.md` lists each photo's source and how to retake each image.

Final order, 9 images:

1. The home screen
2. Five Polaroids, with the layout strip
3. Mosaic of eight
4. Eight circles, with the same 8 photos
5. Heart and two, on Blush
6. Two arches on Sage, zooming one photo
7. The layout editor, with a corner dragged
8. The Style tool, turning the circles Navy
9. The share sheet, on the edited collage

Upload them in that order to the iPhone set. App Store Connect takes 1 to 10 images per size, as PNG or JPEG, with no alpha channel. These are 1320 × 2868 from an iPhone 18 Pro Max simulator, an accepted size for the large Dynamic Island class. Apple's page names the medium class as the required one, so if App Store Connect asks for it, make a 1206 × 2622 set with the command in the README. The app is iPhone only, so no iPad set is needed.

Also upload a 6.5-inch set, for link previews. When someone shares the App Store link in Messages, the card shows the first screenshot of the first set on Messages' list: the 6.5-inch set and older iPhone sizes come first, then iPad, and the 6.9-inch set isn't on the list. With only the 6.9-inch set, the card is a tall copy of the home screen. Put `docs/app-store/screenshots-6.5/01-collages.png` first in the 6.5-inch set, a landscape image of three real collages, so the card is short and shows collages. Then add images 2 to 9, resized with the command in the screenshots README. Devices with a 6.5-inch screen show this set in the App Store.

From April 2027, Apple also requires iPhone Duo screenshots for apps built with the iOS 27.1 SDK or later.

Don't show Instagram's logo or app screens in them. The home screen's own text does name Instagram: "Turn 1–8 photos into an Instagram Story collage."
