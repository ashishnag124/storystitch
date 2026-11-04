import type { ReactNode } from "react";

/** Web is always the latest version, so it never asks. */
export function UpdateGate({ children }: { children: ReactNode }) {
  return children;
}
