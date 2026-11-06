/** What a link from a StoryStitch email asks for. The app only reads its path, as the API makes these links. */
export type EmailLink = { kind: "verify-email" | "reset-password"; token: string };

/** The action in a link from a confirmation or password reset email, or null for any other link. */
export function parseEmailLink(url: string): EmailLink | null {
  const { pathname, searchParams } = new URL(url);
  const token = searchParams.get("token");
  if (pathname === "/api/auth/verify-email") return token ? { kind: "verify-email", token } : null;
  const reset = /^\/api\/auth\/reset-password\/([^/]+)$/.exec(pathname);
  return reset ? { kind: "reset-password", token: reset[1]! } : null;
}
