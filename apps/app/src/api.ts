import { createApi } from "@storystitch/client";
import { ACCOUNTS_ENABLED, API_URL } from "./config";

export const { fetchPopularity } = createApi({ apiUrl: API_URL, popularity: ACCOUNTS_ENABLED && !!API_URL });
