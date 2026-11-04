/** Expo inlines EXPO_PUBLIC_* values at build time. */
declare const process: { env: Record<string, string | undefined> };

/** Plain stylesheets, imported by *.web.tsx files. */
declare module "*.css";

/** True in debug builds. */
declare const __DEV__: boolean;
