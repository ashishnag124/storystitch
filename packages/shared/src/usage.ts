import { z } from "zod";
import { AppVersionSchema } from "./api";
import { layouts } from "./layout";

// Usage counts: the only list of what the apps may report. Types and the API's validation both come from here.
//
// Rules, enforced by usage.test.ts: a property is a fixed list, a true/false value or a bounded number, so free text
// can't be sent. Nothing about a photo beyond the count, and no identifiers or timestamps.
//
// Old iOS versions stay around for months, so while any supported version can send an event, keep accepting it: never
// rename or narrow one. To rename, add the new event and map both in the report.

export const SCREENS = ["pick", "editor", "layout_editor", "account", "sign_up", "reset_password", "other"] as const;
export const CONTROLS = ["share", "start_over", "edit_layout", "blank_layout", "describe_layout", "tool_layouts", "tool_style", "tool_export", "tool_text", "plus_upsell", "plus_buy", "plus_sign_in", "other"] as const;
export const ERROR_CODES = ["photo_unreadable", "export_failed", "layout_save_failed", "layout_delete_failed", "other"] as const;
export const USAGE_PLATFORMS = ["web", "ios", "android"] as const;

/** A built-in layout's id, "custom" for the user's own, and "other" for anything the API doesn't know. */
const layoutRef = z.enum([...layouts.map((l) => l.id), "custom", "other"]).catch("other");

export const USAGE_EVENTS = {
  visit_started: {},
  screen_viewed: { screen: z.enum(SCREENS).catch("other") },
  control_pressed: { control: z.enum(CONTROLS).catch("other") },
  photos_picked: { count: z.number().int().min(1).max(8) },
  layout_chosen: { layout: layoutRef },
  collage_exported: { layout: layoutRef, format: z.enum(["jpeg", "png"]), first: z.boolean() },
  collage_shared: { layout: layoutRef, method: z.enum(["share", "download"]), first: z.boolean() },
  layout_saved: {},
  signed_up: {},
  error_shown: { code: z.enum(ERROR_CODES).catch("other") },
} as const;

export type UsageEvent = keyof typeof USAGE_EVENTS;
export type UsagePlatform = (typeof USAGE_PLATFORMS)[number];
export type UsageControl = (typeof CONTROLS)[number];

/** An event's properties. `first` is added by the tracker, so the funnel counts each set of photos once. */
export type UsageProps<K extends UsageEvent> = Omit<z.output<z.ZodObject<(typeof USAGE_EVENTS)[K]>>, "first">;

/** The API's most events in one request. */
export const USAGE_BATCH_LIMIT = 50;

/** `POST /usage/events`. Each event is checked alone, by `parseUsageEvent`, so one bad event never loses the batch. */
export const UsageBatchSchema = z.object({
  platform: z.enum(USAGE_PLATFORMS),
  /** Left out on web. */
  appVersion: AppVersionSchema.optional(),
  events: z.array(z.unknown()).max(USAGE_BATCH_LIMIT),
});

export type UsageBatch = z.infer<typeof UsageBatchSchema>;

const EventEnvelopeSchema = z.object({ name: z.string(), props: z.unknown().optional() });

/** An event as the API may count it, or null if it isn't one. Properties the registry doesn't list are left out. */
export function parseUsageEvent(raw: unknown): { name: UsageEvent; props: Record<string, string | number | boolean> } | null {
  const event = EventEnvelopeSchema.safeParse(raw);
  if (!event.success || !Object.hasOwn(USAGE_EVENTS, event.data.name)) return null;
  const name = event.data.name as UsageEvent;
  const props = z.object(USAGE_EVENTS[name]).safeParse(event.data.props ?? {});
  return props.success ? { name, props: props.data } : null;
}
