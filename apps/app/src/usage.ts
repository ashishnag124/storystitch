import { createUsage } from "@storystitch/client";
import { API_URL, USAGE_ENABLED } from "./config";
import { usagePlatform } from "./platform/usage";

const enabled = USAGE_ENABLED && usagePlatform.enabled;
const usage = createUsage({ apiUrl: API_URL, enabled, platform: usagePlatform.platform, appVersion: usagePlatform.appVersion });

if (enabled) usagePlatform.onAppState((active) => (active ? usage.foreground() : usage.background()));

/** Records a usage event. The list of events is in packages/shared/src/usage.ts. */
export const { track } = usage;
