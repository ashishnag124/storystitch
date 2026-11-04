/// <reference types="vite/client" />

/** Accounts ship dark: on only in builds with VITE_FEATURE_ACCOUNTS=true (local and staging for now). */
export const ACCOUNTS_ENABLED = import.meta.env.VITE_FEATURE_ACCOUNTS === "true";
/** The API's origin, e.g. https://api.storystitch.ashishnag.com. */
export const API_URL: string = import.meta.env.VITE_API_URL ?? "";
/** Cloudflare Turnstile site key (public); the bot check before sign-up, sign-in and password reset. */
export const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";
/** The layout editor saves to accounts, so it needs them too. On in staging; production waits for the go-ahead. */
export const LAYOUT_EDITOR_ENABLED = ACCOUNTS_ENABLED && import.meta.env.VITE_FEATURE_LAYOUT_EDITOR === "true";
