import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { captcha } from "better-auth/plugins";
import type { Db } from "./db/client";
import * as schema from "./db/schema";
import { linkEmail, type Mailer } from "./email";

export interface AuthOptions {
  db: Db["db"];
  /** Signs session cookies and tokens; at least 32 random characters. */
  secret: string;
  /** Where this API is reachable, e.g. https://api.storystitch.ashishnag.com. */
  baseURL: string;
  /** The web app's origins: allowed for CORS, redirects in emailed links, and cross-site request checks. */
  webOrigins: string[];
  mailer: Mailer;
  turnstileSecret: string;
  /** Off only for end-to-end tests, whose requests all come from one address (the limits have their own tests). */
  rateLimit?: boolean;
}

/** Limits on top of Better Auth's default (100 requests per 10 s per IP and path). */
export const AUTH_RATE_LIMITS = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-up/email": { window: 60 * 60, max: 10 },
  "/request-password-reset": { window: 60 * 60, max: 5 },
  "/send-verification-email": { window: 60 * 60, max: 5 },
} as const;

/**
 * Optional email-and-password accounts. Users verify their email before they can sign in, reset passwords by
 * email, and can delete their account (with their password). Sign-up, sign-in and reset require a Turnstile token.
 */
export function createAuth({ db, secret, baseURL, webOrigins, mailer, turnstileSecret, rateLimit = true }: AuthOptions) {
  return betterAuth({
    appName: "StoryStitch",
    secret,
    baseURL,
    trustedOrigins: webOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      // Don't await: response time must not reveal whether an account exists.
      sendResetPassword: async ({ user, url }) =>
        void mailer
          .send(
            linkEmail(
              user.email,
              "Reset your StoryStitch password",
              "Someone asked to reset the password for your StoryStitch account.",
              "Choose a new password",
              url,
            ),
          )
          .catch((err) => console.error("Password reset email failed", err)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        void mailer
          .send(
            linkEmail(
              user.email,
              "Confirm your email for StoryStitch",
              "Welcome to StoryStitch! Confirm this is your email address to finish creating your account.",
              "Confirm email",
              url,
            ),
          )
          .catch((err) => console.error("Verification email failed", err)),
    },
    user: { deleteUser: { enabled: true } },
    rateLimit: { enabled: rateLimit, storage: "database", customRules: AUTH_RATE_LIMITS },
    // Refuse requests that change data unless they come from our web origins. Set explicitly: Better Auth turns
    // this check off by default when NODE_ENV=test, and tests must see production behavior.
    advanced: { disableOriginCheck: false, disableCSRFCheck: false },
    plugins: [captcha({ provider: "cloudflare-turnstile", secretKey: turnstileSecret })],
  });
}

export type Auth = ReturnType<typeof createAuth>;
