import { AppVersionSchema } from "@storystitch/shared";
import { z } from "zod";

const flag = z.enum(["true", "false"]).default("false").transform((v) => v === "true");

const EnvSchema = z
  .object({
    DATABASE_URL: z.url(),
    PORT: z.coerce.number().int().positive().default(3000),
    /** Comma-separated web origins allowed to call the API, e.g. "https://storystitch.ashishnag.com". */
    CORS_ORIGIN: z
      .string()
      .min(1)
      .transform((s) => s.split(",").map((o) => o.trim()))
      .pipe(z.array(z.url())),
    /** The app's URL scheme, trusted for sign-in. No wildcards. Staging's build has its own, to sit beside production's on one phone. */
    APP_SCHEME: z
      .string()
      .regex(/^[a-z][a-z0-9+.-]*:\/\/$/)
      .default("storystitch://"),
    /** The oldest iOS app version still supported. Raising it asks everyone on an older version to update. */
    MIN_IOS_APP_VERSION: AppVersionSchema.default("1.0.0"),
    /** Counts usage events. Also the emergency off switch: turning it off stops every write, with no app release. */
    USAGE_INGEST_ENABLED: flag,
    /** Set by Railway on each deploy. */
    RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
    /** Where this API is reachable from browsers; emailed links point here first. */
    BETTER_AUTH_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    /** resend: real email (staging, production); console: print it (local); memory: keep it for tests. */
    EMAIL_TRANSPORT: z.enum(["resend", "console", "memory"]).default("console"),
    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().default("StoryStitch <no-reply@storystitch.ashishnag.com>"),
    TURNSTILE_SECRET_KEY: z.string().min(1),
    /** Adds /test/* routes (read captured emails). Never set in staging or production. */
    ENABLE_TEST_ROUTES: flag,
    /** Turns off sign-in attempt limits; end-to-end tests only, so allowed only with ENABLE_TEST_ROUTES. */
    DISABLE_RATE_LIMIT: flag,
  })
  .refine((e) => !e.DISABLE_RATE_LIMIT || e.ENABLE_TEST_ROUTES, {
    message: "DISABLE_RATE_LIMIT is for tests only and needs ENABLE_TEST_ROUTES",
    path: ["DISABLE_RATE_LIMIT"],
  })
  .refine((e) => e.EMAIL_TRANSPORT !== "resend" || !!e.RESEND_API_KEY, {
    message: "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend",
    path: ["RESEND_API_KEY"],
  });

export type Env = z.infer<typeof EnvSchema>;

/** Parses and checks the environment; throws (so the server refuses to start) if anything is missing or malformed. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}
