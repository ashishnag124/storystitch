// Drizzle table definitions. The four auth tables and rateLimit are Better Auth's (v1.7 core schema: keys and
// fields must match its model and field names); columns use snake_case in SQL.
import { bigint, boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/** Better Auth's attempt counters, kept in the database so limits survive restarts and deploys. */
export const rateLimit = pgTable("rate_limit", {
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  count: integer("count").notNull(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});

/**
 * How many times each layout has been exported, so popular layouts can go first among equally good fits.
 * Only a running count: nothing about who exported, when, or from where.
 */
export const layoutExports = pgTable("layout_exports", {
  layoutId: text("layout_id").primaryKey(),
  count: integer("count").notNull().default(0),
  updatedAt: updatedAt(),
});

/** Layouts people made or edited, saved in their account (up to SAVED_LAYOUT_LIMIT). Deleted with the account. */
export const savedLayout = pgTable(
  "saved_layout",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** The layout's cells and flags, as in layouts.json (without id and name). */
    layout: jsonb("layout").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("saved_layout_user_id_idx").on(t.userId)],
);

/**
 * Daily usage counts. Each event adds 1 to its total (empty prop_key) and 1 to a row per property, so properties can be
 * counted alone but not against each other. Nothing here says who did anything, so rows are kept like layout_exports.
 */
export const usageDaily = pgTable(
  "usage_daily",
  {
    /** The UTC day the API received the event. */
    day: date("day").notNull(),
    event: text("event").notNull(),
    platform: text("platform").notNull(),
    appVersion: text("app_version").notNull().default(""),
    propKey: text("prop_key").notNull().default(""),
    propValue: text("prop_value").notNull().default(""),
    count: bigint("count", { mode: "number" }).notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.event, t.platform, t.appVersion, t.propKey, t.propValue] }),
    index("usage_daily_event_day_idx").on(t.event, t.day),
  ],
);
