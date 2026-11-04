import { LayoutPopularitySchema } from "@storystitch/shared";
import { ACCOUNTS_ENABLED, API_URL } from "./config";

/** Popularity lives in the API, so it's on wherever the API is (builds with accounts on); elsewhere ranking is by fit alone. */
const ENABLED = ACCOUNTS_ENABLED && !!API_URL;

/** How long to wait for the counts before ranking by fit alone. */
const FETCH_TIMEOUT_MS = 2000;

/** Exports per layout id, from the API. Empty when popularity is off or the API doesn't answer in time. */
export async function fetchPopularity(): Promise<Record<string, number>> {
  if (!ENABLED) return {};
  try {
    const res = await fetch(`${API_URL}/layouts/popularity`, { credentials: "omit", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    return res.ok ? LayoutPopularitySchema.parse(await res.json()).exports : {};
  } catch {
    return {};
  }
}

/** Counts one export of a layout. Sends only the layout's id; a failure never reaches the user. */
export function recordExport(layoutId: string) {
  if (!ENABLED) return;
  fetch(`${API_URL}/layouts/${encodeURIComponent(layoutId)}/exports`, { method: "POST", credentials: "omit", keepalive: true }).catch(
    () => {},
  );
}
