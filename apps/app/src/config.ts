/** Accounts ship dark: on only in builds with EXPO_PUBLIC_FEATURE_ACCOUNTS=true. */
export const ACCOUNTS_ENABLED = process.env.EXPO_PUBLIC_FEATURE_ACCOUNTS === "true";
/** The API's origin, e.g. https://api.storystitch.ashishnag.com. */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL ?? "";
/** The web app's origin: where the iOS app's bot check and emailed links live. */
export const WEB_URL: string = process.env.EXPO_PUBLIC_WEB_URL ?? "";
/** Cloudflare Turnstile site key (public); the bot check before sign-up, sign-in and password reset. */
export const TURNSTILE_SITE_KEY: string = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? "";
/** The layout editor saves to accounts, so it needs them too. */
export const LAYOUT_EDITOR_ENABLED = ACCOUNTS_ENABLED && process.env.EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR === "true";
