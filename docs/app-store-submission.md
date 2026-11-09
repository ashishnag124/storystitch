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

## Review history

| Date | Build | Result |
|---|---|---|
| November 7, 2026 | 1.0.0 (2), from v1.0.1 | Submitted, with manual release |
| By November 7, 2026 | 1.0.0 (2) | Rejected under Guideline 2.1, Information Needed. Apple asked for a screen recording, plus the notes below. Nothing was wrong with the app itself |

To resubmit after 2.1, Apple wants all of the following in App Review Information:

1. **A screen recording made on a real iPhone running the latest iOS.** It starts by opening the app and shows the usual flow: choosing photos, the suggested layouts, swapping or re-cropping, Share, and editing a layout with "Use without saving". Then it shows account sign-up (including the confirmation email), sign out, sign in and **Delete account**. Attach it under Attachment, or link to it in the notes.
2. **The notes below**, with the blanks filled in. They answer Apple's points 2 to 6: purpose and audience, how to use it, external services, regions, and regulated content.
3. **A demo account on production** with its email already confirmed. Tick **Sign-in required** and enter the account there, even though the main features work without one, because Apple's 2.1 message asks for demo credentials. Never put the password in this repo.

## App Review information

| Field | Value |
|---|---|
| Sign-in required | On, with the demo account, which Apple asked for after the 2.1 rejection |
| Demo account | Create one on production and confirm its email |
| Contact | Your name, phone and email |
| Attachment | The screen recording |

### Notes for the reviewer

Under 4,000 characters, which is App Store Connect's limit. Fill in the blanks.

```text
SCREEN RECORDING
[Attached under App Review Information > Attachment, or link: ________]. Recorded on an iPhone ____ running iOS ____. It starts at launch and shows: choosing photos, the suggested layouts, adjusting a collage, sharing it, editing and saving a layout, creating an account, signing in, and deleting the account.

1. PURPOSE AND AUDIENCE
StoryStitch makes photo collages sized for Instagram Stories (1080x1920). Its audience is people aged 13 and up who post Stories. Most collage apps make you choose a layout and drag and crop every photo yourself. StoryStitch finds the faces and subjects in each photo on the device, suggests layouts for the number of photos chosen (best fit first), and places and crops each photo so its subject stays in view and out of the areas Instagram covers with its own controls. Photos and collages are never uploaded.

2. HOW TO USE IT
No account is needed for the main features.
- Tap "Choose photos" and pick 1 to 8 photos from the library.
- The app analyzes them and shows layouts in a strip. Tap one to use it.
- Optional: drag a photo onto another to swap them, or pinch and drag inside a cell to re-crop. The Style tab changes spacing, corners, background and borders.
- Open the Export tab and tap Share. The iOS share sheet opens, where you can pick Instagram, Save Image, or another app.
- Layouts tab > "Edit this layout" opens the layout editor. "Use without saving" works without an account. Saving a layout to reuse later needs an account.

Account (optional): tap Account, then sign in with the demo account below. To create a new account, enter an email and password, pass the bot check, and confirm the email address with the link we send. Account > Delete account permanently deletes the account and its saved layouts after the password is entered. Account also has "Sign out" and "Sign out on every device".

Demo account (already confirmed):
Email: ________
Password: ________

The sign-in, sign-up and password reset forms show a short Cloudflare bot check, which usually passes by itself.

User-generated content: the only things a user can create are collages, which stay on the device, and saved layouts, which are private to their account (cell shapes and a name, no photos). Nothing is shared with or shown to other users, so there is nothing to report or block.

Paid content: none. There are no purchases, subscriptions or ads.

Devices: the app is built for iPhone in portrait. On iPad it runs as an iPhone app.

3. EXTERNAL SERVICES
- Apple Vision framework: subject and face detection, on the device only.
- Railway: hosts our API and Postgres database (accounts, saved layouts, anonymous usage counts).
- Cloudflare: hosts our website (privacy, support and bot check pages) and runs the Turnstile bot check on account forms.
- Resend: sends email confirmation and password reset emails.
- Expo (EAS Update): delivers app updates that contain only JavaScript changes.
Sign-in uses Better Auth, an open-source library that runs on our own server, not a third-party sign-in service. The app uses no AI services, no payment processor, no advertising SDKs and no third-party analytics. Sharing to Instagram goes through the standard iOS share sheet. We don't use Instagram's API and aren't affiliated with Instagram or Meta.

4. REGIONS
The app works the same in every region. All features and content are identical everywhere, and the interface is in English.

5. REGULATED INDUSTRY OR THIRD-PARTY MATERIAL
Not applicable. The app isn't in a regulated industry and contains no licensed third-party content. Users only work with their own photos.

Privacy policy: https://storystitch.ashishnag.com/privacy
Support: https://storystitch.ashishnag.com/support
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

From April 2027, Apple also requires iPhone Duo screenshots for apps built with the iOS 27.1 SDK or later.

Don't show Instagram's logo or app screens in them. The home screen's own text does name Instagram: "Turn 1–8 photos into an Instagram Story collage."
