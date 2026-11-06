import { parseEmailLink } from "@storystitch/client";
import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { errorMessage } from "../authClient";
import { ACCOUNTS_ENABLED } from "../config";
import type { ToastMessage } from "../ui/Toast";
import { authClient } from "./auth";
import { navigate } from "./route";

/**
 * Handles the links from emails that iOS hands to the app (Universal Links; see the API's apple-app-site-association).
 * Confirming an email signs the user in and takes them back to where they were, under any screen they left open.
 */
export function useEmailLinks(onDone: (result: ToastMessage | null) => void) {
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!ACCOUNTS_ENABLED) return;
    async function open(url?: string | null) {
      const link = url && parseEmailLink(url);
      if (!link) return;
      done.current(null);
      if (link.kind === "reset-password") return navigate(`/reset-password?token=${encodeURIComponent(link.token)}`);
      const { error } = await authClient.verifyEmail({ query: { token: link.token } });
      if (error) {
        navigate("/account");
        return done.current({ text: errorMessage(error), alert: true });
      }
      // An email that was already confirmed succeeds too, but signs no one in.
      const { data: session } = await authClient.getSession();
      navigate(session ? "/" : "/account");
      done.current({ text: session ? "Your email is confirmed, and you're signed in." : "Your email is confirmed. You can sign in now.", alert: false });
    }
    void Linking.getInitialURL().then(open);
    const subscription = Linking.addEventListener("url", ({ url }) => void open(url));
    return () => subscription.remove();
  }, []);
}
