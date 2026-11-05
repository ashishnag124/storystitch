import { nativeApplicationVersion } from "expo-application";
import { AppState, Platform } from "react-native";

/** What usage counts need from the phone. */
export const usagePlatform = {
  platform: Platform.OS as "ios" | "android",
  appVersion: nativeApplicationVersion ?? undefined,
  enabled: true,
  /** Reports whether the app is on screen, now and on every change. */
  onAppState(change: (active: boolean) => void) {
    // "inactive" is a passing moment, like a system dialog: sending then would interrupt what the user is doing.
    const update = (state: string | null | undefined) => {
      if (state !== "inactive") change(state !== "background");
    };
    AppState.addEventListener("change", update);
    update(AppState.currentState);
  },
};
