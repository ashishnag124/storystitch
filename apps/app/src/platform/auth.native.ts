import { expoClient } from "@better-auth/expo/client";
import { authFetch } from "@storystitch/client";
import { createAuthClient } from "better-auth/react";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "../config";

/** Talks to the API's /api/auth endpoints. There are no browser cookies here, so the session is kept in the keychain. */
export const authClient = createAuthClient({
  baseURL: API_URL,
  fetchOptions: { customFetchImpl: authFetch },
  plugins: [expoClient({ scheme: Constants.expoConfig?.scheme as string, storagePrefix: "storystitch", storage: SecureStore })],
});
