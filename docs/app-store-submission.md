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

App Store Connect needs at least one set at the 6.9-inch size, 1320 × 2868 from an iPhone 18 Pro Max simulator, and 3 to 10 images. Smaller iPhone sizes can reuse that set. The app is iPhone only, so no iPad set is needed.

Use photos you have the right to use, such as your own. Suggested order:

1. A finished collage in the editor, with the layout strip showing
2. The layout strip with several layouts for the same photos
3. A Polaroid or scattered layout
4. Editing a layout
5. The Style tool

Don't show Instagram's logo or app screens in them.
