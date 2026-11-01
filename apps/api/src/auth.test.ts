import { afterAll, describe, expect, it } from "vitest";
import { CAPTCHA, TURNSTILE_FAIL, WEB, testApi, verifiedUser } from "./test-helpers";

const api = testApi();
afterAll(() => api.close());

const session = async (c: ReturnType<typeof api.client>) => (await (await c.call("/api/auth/get-session")).json()) as { user?: { email: string } } | null;
const signIn = (c: ReturnType<typeof api.client>, email: string, password: string) =>
  c.call("/api/auth/sign-in/email", { body: { email, password }, headers: CAPTCHA });

describe("AC-AUTH-05 email and password", () => {
  it("signs up, requires the emailed confirmation, then signs in", async () => {
    const email = api.email();
    const c = api.client();
    const signUp = await c.call("/api/auth/sign-up/email", {
      body: { email, password: "correct horse battery", name: "Test", callbackURL: `${WEB}/account` },
      headers: CAPTCHA,
    });
    expect(signUp.status).toBe(200);
    expect(await session(c)).toBeNull(); // no session until the email is confirmed

    expect((await signIn(api.client(), email, "correct horse battery")).status).toBe(403);

    const confirm = api.lastEmail(email);
    expect(confirm.subject).toBe("Confirm your email for StoryStitch");
    const followed = await c.call(confirm.link);
    expect(followed.status).toBe(302);
    expect(followed.headers.get("location")).toBe(`${WEB}/account`);
    expect((await session(c))?.user?.email).toBe(email); // confirming signs you in

    expect((await signIn(api.client(), email, "correct horse battery")).status).toBe(200);
    expect((await signIn(api.client(), email, "wrong password")).status).toBe(401);
  });

  it("resets a forgotten password by email and signs out old sessions", async () => {
    const { email, c: oldDevice } = await verifiedUser(api);
    const c = api.client();
    const request = await c.call("/api/auth/request-password-reset", {
      body: { email, redirectTo: `${WEB}/reset-password` },
      headers: CAPTCHA,
    });
    expect(request.status).toBe(200);

    const reset = api.lastEmail(email);
    expect(reset.subject).toBe("Reset your StoryStitch password");
    const landing = new URL((await c.call(reset.link)).headers.get("location")!);
    expect(landing.origin + landing.pathname).toBe(`${WEB}/reset-password`);
    const token = landing.searchParams.get("token")!;

    expect((await c.call("/api/auth/reset-password", { body: { token, newPassword: "a brand new password" } })).status).toBe(200);
    expect((await signIn(api.client(), email, "correct horse battery")).status).toBe(401);
    expect((await signIn(api.client(), email, "a brand new password")).status).toBe(200);
    expect(await session(oldDevice)).toBeNull();
  });

  it("answers a reset request the same way whether or not the account exists", async () => {
    const res = await api.client().call("/api/auth/request-password-reset", {
      body: { email: api.email(), redirectTo: `${WEB}/reset-password` },
      headers: CAPTCHA,
    });
    expect(res.status).toBe(200);
  });
});

describe("AC-AUTH-04 abuse protection", () => {
  it("refuses sign-up, sign-in and reset without a bot-check token", async () => {
    const c = api.client();
    const body = { email: api.email(), password: "correct horse battery", name: "Test" };
    expect((await c.call("/api/auth/sign-up/email", { body })).status).toBe(400);
    expect((await c.call("/api/auth/sign-in/email", { body })).status).toBe(400);
    expect((await c.call("/api/auth/request-password-reset", { body: { email: body.email } })).status).toBe(400);
  });

  it("refuses a token the bot check rejects", async () => {
    const strict = testApi({ turnstileSecret: TURNSTILE_FAIL });
    const res = await strict.client().call("/api/auth/sign-up/email", {
      body: { email: strict.email(), password: "correct horse battery", name: "Test" },
      headers: CAPTCHA,
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await strict.close();
  });

  it("limits sign-in attempts from one IP address", async () => {
    const c = api.client();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await signIn(c, api.email(), "wrong password")).status);
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("AC-AUTH-07 signing out", () => {
  it("signs out this device", async () => {
    const { c } = await verifiedUser(api);
    expect((await c.call("/api/auth/sign-out", { body: {} })).status).toBe(200);
    expect(await session(c)).toBeNull();
  });

  it("signs out every device", async () => {
    const { email, password, c } = await verifiedUser(api);
    const other = api.client();
    await signIn(other, email, password);
    expect((await c.call("/api/auth/revoke-sessions", { body: {} })).status).toBe(200);
    expect(await session(other)).toBeNull();
    expect(await session(c)).toBeNull();
  });
});

describe("AC-AUTH-08 deleting an account", () => {
  it("needs the password, then removes the user and their sessions", async () => {
    const { email, password, c } = await verifiedUser(api);
    expect((await c.call("/api/auth/delete-user", { body: { password: "wrong password" } })).status).toBeGreaterThanOrEqual(400);
    expect((await c.call("/api/auth/delete-user", { body: { password } })).status).toBe(200);
    const { rows } = await api.pool.query("select 1 from \"user\" where email = $1", [email]);
    expect(rows).toEqual([]);
    expect(await session(c)).toBeNull();
    expect((await signIn(api.client(), email, password)).status).toBe(401);
  });
});

describe("AC-API-05 cross-site requests", () => {
  it("refuses account requests from another site", async () => {
    const { c } = await verifiedUser(api);
    const res = await c.call("/api/auth/sign-out", { body: {}, headers: { Origin: "https://evil.example" } });
    expect(res.status).toBe(403);
    expect(await session(c)).not.toBeNull();
  });
});
