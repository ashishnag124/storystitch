/** Accounts ship dark: on only in builds with EXPO_PUBLIC_FEATURE_ACCOUNTS=true. */
export const ACCOUNTS_ENABLED = process.env.EXPO_PUBLIC_FEATURE_ACCOUNTS === "true";
/** Timing numbers on screen, for checking speed on a real phone. Never on in hosted builds. */
export const PERF_READOUT = process.env.EXPO_PUBLIC_PERF_READOUT === "true";
/** The API's origin, e.g. https://api.storystitch.ashishnag.com. */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "";
/** The web app's origin: where the iOS app's bot check and emailed links live. */
export const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL ?? "";
/** Cloudflare Turnstile site key (public); the bot check before sign-up, sign-in and password reset. */
export const TURNSTILE_SITE_KEY: string = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "";
/** Usage counts ship dark, and go to the API, so they need one. */
export const USAGE_ENABLED = process.env.EXPO_PUBLIC_FEATURE_USAGE === "true" && API_URL !== "";
/** The /admin dashboard (web only). Needs accounts, and the API's ADMIN_ENABLED. lazyScreens.web.ts checks the same two variables inline. */
export const ADMIN_ENABLED = ACCOUNTS_ENABLED && process.env.EXPO_PUBLIC_FEATURE_ADMIN === "true";
/** Grid layouts move their lines to suit the photos' subjects (see `fittedLayout`). Off unless EXPO_PUBLIC_FEATURE_FIT_LAYOUTS=true. */
export const FIT_LAYOUTS_ENABLED = process.env.EXPO_PUBLIC_FEATURE_FIT_LAYOUTS === "true";
/** The layout editor saves to accounts, so it needs them too. */
export const LAYOUT_EDITOR_ENABLED = ACCOUNTS_ENABLED && process.env.EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR === "true";
/** "Start from blank" in the Layouts tool opens the layout editor on an empty frame. Needs the layout editor; off unless set to true. */
export const BLANK_LAYOUT_ENABLED = LAYOUT_EDITOR_ENABLED && process.env.EXPO_PUBLIC_FEATURE_BLANK_LAYOUT === "true";
/** Where a photo doesn't cover its cell, the rest of the cell shows a blurred copy of the photo. Off unless EXPO_PUBLIC_FEATURE_BLUR_FILL=true. */
export const BLUR_FILL_ENABLED = process.env.EXPO_PUBLIC_FEATURE_BLUR_FILL === "true";
/** Looks: one-tap filters on every photo, in the Style tool. Off unless EXPO_PUBLIC_FEATURE_LOOKS=true. */
export const LOOKS_ENABLED = process.env.EXPO_PUBLIC_FEATURE_LOOKS === "true";
/** "Describe a layout" in the Layouts tool (iOS only, on the iPhone's own model). Needs the layout editor; off unless set to true. */
export const DESCRIBE_LAYOUT_ENABLED = LAYOUT_EDITOR_ENABLED && process.env.EXPO_PUBLIC_FEATURE_DESCRIBE_LAYOUT === "true";
/**
 * StoryStitch Plus: the mark can be turned off only with Plus, which is bought with RevenueCat. Off unless
 * EXPO_PUBLIC_FEATURE_PLUS=true; it needs the API (which says who has Plus) and accounts. With it off, anyone can turn
 * the mark off, as before.
 */
export const PLUS_ENABLED = ACCOUNTS_ENABLED && API_URL !== "" && process.env.EXPO_PUBLIC_FEATURE_PLUS === "true";
/** RevenueCat's public keys (safe in the app): the web app's, which sells through Paddle, and the iOS app's. */
export const REVENUECAT_WEB_KEY: string = process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY ?? "";
export const REVENUECAT_IOS_KEY: string = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? "";
