import type { ConfigContext, ExpoConfig } from "expo/config";

// Both variants share it.
const EAS_PROJECT_ID = "a20aeea2-ff98-407f-bfb3-40a0dd40d7af";

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
    ios: {
      ...config.ios,
      bundleIdentifier,
      // The app only uses HTTPS and Apple's keychain. This stops App Store Connect asking on every build.
      config: { ...config.ios?.config, usesNonExemptEncryption: false },
      infoPlist: {
        ...config.ios?.infoPlist,
        // Without this, Save Image in the share sheet asks for the whole library.
        NSPhotoLibraryAddUsageDescription: "StoryStitch saves your finished collage to your photo library.",
      },
    },
    plugins: [
      ...(config.plugins ?? []),
      ["expo-font", { fonts: ["./assets/fonts/BricolageGrotesque.ttf"] }],
      // The picker's native code refers to the camera and microphone, so Apple's upload check expects these two keys
      // even though the app never asks for either.
      [
        "expo-image-picker",
        {
          photosPermission: "StoryStitch only uses the photos you choose. They stay on this device.",
          cameraPermission: "StoryStitch doesn't use your camera. It only uses photos you choose from your library.",
          microphonePermission: "StoryStitch doesn't use your microphone.",
        },
      ],
    ],
    updates: { url: `https://u.expo.dev/${EAS_PROJECT_ID}` },
    extra: { ...config.extra, eas: { projectId: EAS_PROJECT_ID } },
  };
};
