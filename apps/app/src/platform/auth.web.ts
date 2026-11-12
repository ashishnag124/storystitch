import { authFetch } from "@storystitch/client";
import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { API_URL } from "../config";

/** Talks to the API's /api/auth endpoints; the session lives in an HTTP-only cookie on the API's domain. */
export const authClient = createAuthClient({ baseURL: API_URL, fetchOptions: { credentials: "include", customFetchImpl: authFetch }, plugins: [twoFactorClient()] });
