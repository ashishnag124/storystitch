import { useEffect, useState } from "react";

/** Account screens live at these paths; everything else is the collage editor. */
export const ACCOUNT_PATHS = ["/account", "/sign-up", "/reset-password"] as const;

const listeners = new Set<() => void>();

/** Client-side navigation (Cloudflare Pages serves index.html for every path, see public/_redirects). */
export function navigate(to: string) {
  history.pushState(null, "", to);
  listeners.forEach((l) => l());
}

/** The current URL, re-rendering on navigate() and the back button. */
export function useLocation() {
  const [location, setLocation] = useState(() => new URL(window.location.href));
  useEffect(() => {
    const update = () => setLocation(new URL(window.location.href));
    listeners.add(update);
    window.addEventListener("popstate", update);
    return () => {
      listeners.delete(update);
      window.removeEventListener("popstate", update);
    };
  }, []);
  return location;
}
