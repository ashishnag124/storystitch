import { createApi } from "@storystitch/client";
import { ACCOUNTS_ENABLED, API_URL } from "./config";
import { sessionHeaders } from "./platform/session";

export const { fetchPopularity, recordExport, listSaved, saveLayout, deleteSaved } = createApi({
  apiUrl: API_URL,
  popularity: ACCOUNTS_ENABLED && !!API_URL,
  sessionHeaders,
});
