import { NATIVE_APP_HEADER } from "@storystitch/shared";
import { authClient } from "./auth.native";

/** The stored session, plus the header that tells the API this request comes from the app rather than a web page. */
export const sessionHeaders = async () => ({ Cookie: await authClient.getCookie(), [NATIVE_APP_HEADER]: "ios" });
