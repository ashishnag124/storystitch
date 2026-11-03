import { useEffect, useRef } from "react";
import { TURNSTILE_SITE_KEY } from "../config";

interface TurnstileApi {
  render(el: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | undefined;

function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile missing")));
    script.onerror = () => reject(new Error("Couldn't load the bot check"));
    document.head.append(script);
  });
  return loading;
}

/**
 * Cloudflare's bot check. Calls onToken with a fresh single-use token, or null when it expires; bump `resetKey`
 * after each submit to get a new one. Loaded only on account screens.
 */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const el = useRef<HTMLDivElement>(null);
  const id = useRef<string | null>(null);
  const callback = useRef(onToken);
  useEffect(() => {
    callback.current = onToken;
  });

  useEffect(() => {
    let cancelled = false;
    loadTurnstile()
      .then((api) => {
        if (cancelled || !el.current) return;
        id.current = api.render(el.current, {
          sitekey: TURNSTILE_SITE_KEY,
          size: "flexible",
          theme: "dark",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(null),
          "error-callback": () => callback.current(null),
        });
      })
      .catch(() => callback.current(null));
    return () => {
      cancelled = true;
      if (id.current) window.turnstile?.remove(id.current);
    };
  }, []);

  useEffect(() => {
    if (resetKey && id.current) {
      callback.current(null);
      window.turnstile?.reset(id.current);
    }
  }, [resetKey]);

  return <div ref={el} className="turnstile" />;
}
