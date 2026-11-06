import { useEffect, useState } from "react";

// The app keeps its own location in memory, with the same shape as the web router. emailLinks.native.ts handles links in.
export const ACCOUNT_PATHS = ["/account", "/sign-up", "/reset-password"] as const;

let current = "/";
const listeners = new Set<() => void>();
const here = () => new URL(current, "storystitch://app");

export function navigate(to: string) {
  current = to;
  listeners.forEach((l) => l());
}

export function useLocation() {
  const [location, setLocation] = useState(here);
  useEffect(() => {
    const update = () => setLocation(here());
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return location;
}
