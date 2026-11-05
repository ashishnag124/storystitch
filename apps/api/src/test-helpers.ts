// Test-only: an API wired to the local database, with emails captured in memory and Cloudflare's Turnstile test keys.
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { createDb } from "./db/client";
import { memoryMailer } from "./email";

export const WEB = "https://storystitch.ashishnag.com";
export const API = "https://api.storystitch.ashishnag.com";
/** The native app's URL scheme. */
export const APP = "storystitch://";
export const MINIMUM_IOS_VERSION = "1.2.3";
/** Cloudflare's documented test secrets: one accepts every token, the other rejects every token. */
export const TURNSTILE_PASS = "1x0000000000000000000000000000000AA";
export const TURNSTILE_FAIL = "2x0000000000000000000000000000000AA";
export const CAPTCHA = { "x-captcha-response": "XXXX.DUMMY.TOKEN.XXXX" };

/**
 * A local stand-in for Cloudflare's siteverify endpoint with the same behavior as its test secrets: TURNSTILE_PASS
 * accepts any token, anything else rejects it. Keeps the API tests off the network.
 */
const turnstileVerifyUrl = await new Promise<string>((resolve) => {
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => {
      const { secret, response } = JSON.parse(body || "{}") as { secret?: string; response?: string };
      const success = secret === TURNSTILE_PASS && !!response;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success, "error-codes": success ? [] : ["invalid-input-response"] }));
    });
  });
  server.unref();
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    resolve(`http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}/siteverify`);
  });
});

export function testApi({ turnstileSecret = TURNSTILE_PASS, usageIngestEnabled = false } = {}) {
  const { pool, db } = createDb(process.env.DATABASE_URL!);
  const mailer = memoryMailer();
  const auth = createAuth({
    db,
    secret: "test-secret-test-secret-test-secret-0123",
    baseURL: API,
    webOrigins: [WEB],
    appScheme: APP,
    mailer,
    turnstileSecret,
    turnstileVerifyUrl,
  });
  const app = createApp({
    pool,
    auth,
    corsOrigins: [WEB],
    version: "test-sha",
    minimumIosVersion: MINIMUM_IOS_VERSION,
    usageIngestEnabled,
    testEmails: mailer.sent,
  });
  /** A browser-like client with its own IP address (so rate limits don't leak between tests) and cookies. */
  function client() {
    const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
    const jar = new Map<string, string>();
    /** `native` sends what the iOS app sends: no Origin, unlike a browser. */
    async function call(path: string, init: { method?: string; body?: unknown; headers?: Record<string, string>; native?: boolean } = {}) {
      const res = await app.request(new URL(path, API).toString(), {
        method: init.method ?? (init.body ? "POST" : "GET"),
        headers: {
          ...(init.native ? {} : { Origin: WEB }),
          "x-real-ip": ip,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; ") } : {}),
          ...init.headers,
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
        redirect: "manual",
      });
      for (const c of res.headers.getSetCookie()) {
        const [pair] = c.split(";");
        const [k, v] = pair!.split("=");
        if (v) jar.set(k!, v);
        else jar.delete(k!);
      }
      return res;
    }
    return { call, jar };
  }

  /** The most recent email sent to `to`, and the first link in it. */
  function lastEmail(to: string) {
    const email = mailer.sent.findLast((e) => e.to === to);
    if (!email) throw new Error(`No email to ${to}`);
    return { ...email, link: email.text.match(/https?:\/\/\S+/)![0] };
  }

  const email = () => `test-${randomUUID()}@example.com`;
  return { app, pool, auth, client, lastEmail, email, close: () => pool.end() };
}

/** Signs up, follows the verification link and returns the signed-in client. */
export async function verifiedUser(api: ReturnType<typeof testApi>, password = "correct horse battery") {
  const email = api.email();
  const c = api.client();
  await c.call("/api/auth/sign-up/email", { body: { email, password, name: "Test" }, headers: CAPTCHA });
  await c.call(api.lastEmail(email).link);
  return { email, password, c };
}
