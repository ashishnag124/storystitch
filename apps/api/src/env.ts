import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.coerce.number().int().positive().default(3000),
  /** Comma-separated web origins allowed to call the API, e.g. "https://storystitch.ashishnag.com". */
  CORS_ORIGIN: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((o) => o.trim()))
    .pipe(z.array(z.url())),
  /** Set by Railway on each deploy. */
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

/** Parses and checks the environment; throws (so the server refuses to start) if anything is missing or malformed. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}
