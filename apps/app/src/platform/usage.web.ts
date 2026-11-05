/** What usage counts need from the browser. */
export const usagePlatform = {
  platform: "web" as const,
  appVersion: undefined,
  // The iOS app shows this page for its bot check, so counting it would add a fake web visit to every iOS sign-in.
  enabled: location.pathname !== "/bot-check",
  /** Reports whether the page is on screen, now and on every change. */
  onAppState(change: (active: boolean) => void) {
    const update = () => change(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", update);
    window.addEventListener("pagehide", () => change(false));
    window.addEventListener("pageshow", update);
    update();
  },
};
