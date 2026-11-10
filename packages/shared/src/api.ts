import { z } from "zod";
import { LayoutSchema } from "./layout";

/** `GET /health`: whether the API and its database are up. 503 when the database isn't. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  /** The deployed commit (Railway sets it), or "dev" locally. */
  version: z.string(),
  database: z.enum(["up", "down"]),
});

export type Health = z.infer<typeof HealthSchema>;

/** `GET /layouts/popularity`: how many times each layout has been exported (layouts never exported are left out). */
export const LayoutPopularitySchema = z.object({
  exports: z.record(z.string(), z.number().int().nonnegative()),
});

export type LayoutPopularity = z.infer<typeof LayoutPopularitySchema>;

/** An app version as the App Store shows it: major.minor.patch. */
export const AppVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

/** `GET /app/minimum-version`: the oldest app version the API still supports. Anything older asks the user to update. */
export const MinimumVersionSchema = z.object({ ios: AppVersionSchema });

export type MinimumVersion = z.infer<typeof MinimumVersionSchema>;

/**
 * Sent by the native app when it changes saved layouts. The app sends no Origin, so this stands in for one. CORS must
 * never allow this header: that's what stops a web page on another site from sending it.
 */
export const NATIVE_APP_HEADER = "x-storystitch-app";

/** Most layouts one account can save. */
export const SAVED_LAYOUT_LIMIT = 20;

/** `POST /layouts/mine` and `PUT /layouts/mine/:id`: a layout the user made, with the name they gave it. */
export const SaveLayoutSchema = z.object({
  name: z.string().trim().min(1).max(40),
  layout: LayoutSchema.omit({ id: true, name: true }),
});

/** A layout saved in the user's account. Its `layout.id` and `layout.name` are the saved id and name. */
export const SavedLayoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  layout: LayoutSchema,
  updatedAt: z.string(),
});

/** `GET /layouts/mine`: the signed-in user's saved layouts, newest first. 401 when signed out. */
export const SavedLayoutsSchema = z.object({
  layouts: z.array(SavedLayoutSchema),
  limit: z.number().int(),
});

/** `GET /layouts/mine` as an app reads it: a newer version may have saved shapes this one can't, so each layout is checked alone. */
export const SavedLayoutsEnvelopeSchema = SavedLayoutsSchema.extend({
  layouts: z.array(z.unknown()),
});

export type SaveLayout = z.infer<typeof SaveLayoutSchema>;
export type SavedLayout = z.infer<typeof SavedLayoutSchema>;
export type SavedLayouts = z.infer<typeof SavedLayoutsSchema>;

/** The one paid entitlement, StoryStitch Plus (turns off the export's mark), under its RevenueCat identifier. */
export const PLUS_ENTITLEMENT = "plus";

/**
 * `GET /me/entitlements`, `POST /me/entitlements/refresh` and `POST /entitlements/check`: what the API says the
 * account (or a signed-out iOS buyer) has. Signed out on `/me/*` means `plus: false`. The apps never decide this
 * themselves: they show the mark unless the API says `plus: true`.
 */
export const EntitlementsSchema = z.object({ plus: z.boolean() });

/** The ID RevenueCat gives a device before sign-in: `$RCAnonymousID:` and 32 lowercase hex digits. */
export const AnonymousBuyerIdSchema = z
  .string()
  .regex(/^\$RCAnonymousID:[0-9a-f]{32}$/);

/** `POST /entitlements/check`: a signed-out iOS buyer asks about the purchases on their device's anonymous ID. */
export const EntitlementCheckSchema = z.object({
  appUserId: AnonymousBuyerIdSchema,
});

export type Entitlements = z.infer<typeof EntitlementsSchema>;
export type EntitlementCheck = z.infer<typeof EntitlementCheckSchema>;
