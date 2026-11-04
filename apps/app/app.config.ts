import type { ConfigContext, ExpoConfig } from "expo/config";

// PLACEHOLDER until the EAS project exists: see "iOS delivery checklist" in PROJECT_SETUP.md. Both variants share it.
const EAS_PROJECT_ID = "REPLACE_WITH_EAS_PROJECT_ID";

// Two app IDs so both can sit on one phone. The schemes must match the API's APP_SCHEME for that environment.
const variants = {
  production: { name: "StoryStitch", bundleIdentifier: "com.ashishnag.storystitch", scheme: "storystitch" },
  staging: { name: "StoryStitch Staging", bundleIdentifier: "com.ashishnag.storystitch.staging", scheme: "storystitch-staging" },
};

const selected = process.env.APP_VARIANT ?? "production";
if (selected !== "production" && selected !== "staging") throw new Error(`Unknown APP_VARIANT: ${selected}`);

export default ({ config }: ConfigContext): ExpoConfig => {
  const { name, bundleIdentifier, scheme } = variants[selected];
  return {
    ...config,
    name,
    slug: "storystitch",
    scheme,
    ios: { ...config.ios, bundleIdentifier },
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    extra: { ...config.extra, eas: { projectId: EAS_PROJECT_ID } },
  };
};
