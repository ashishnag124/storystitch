import { lazy } from "react";

// Checked inline (not via config.ts) so the bundler can drop these screens and the auth client entirely from builds
// with accounts switched off, and loaded on first use so they stay out of the first download.
const accounts = process.env.EXPO_PUBLIC_FEATURE_ACCOUNTS === "true";

export const Accounts = accounts ? lazy(() => import("../Accounts")) : null;
export const LayoutEditor = accounts && process.env.EXPO_PUBLIC_FEATURE_LAYOUT_EDITOR === "true" ? lazy(() => import("./LayoutEditor")) : null;
