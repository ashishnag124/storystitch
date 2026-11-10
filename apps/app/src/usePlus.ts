import { useCallback, useEffect, useState } from "react";
import { checkDevicePlus, fetchPlus, refreshPlus } from "./api";
import { PLUS_ENABLED } from "./config";
import { deviceBuyerId } from "./platform/purchases";

export interface PlusState {
  /** The mark has to stay: Plus is switched on and the API hasn't said this account (or device) has it. */
  locked: boolean;
  /**
   * Asks the API again after a purchase or restore, straight from RevenueCat: for the account when `userId` is given,
   * otherwise for the device's purchases (iOS, signed out). True if Plus is now on.
   */
  recheck: (userId: string | null) => Promise<boolean>;
}

/** Signed out on iOS, a purchase lives on the device's anonymous ID until sign-in. */
async function devicePlus(): Promise<boolean> {
  const device = await deviceBuyerId();
  return device ? checkDevicePlus(device) : false;
}

/**
 * Asks the API each time `asking` turns true (the Export tool opening), so signing in or buying elsewhere shows up.
 * It asks only the API's own entitlement routes, never the account ones, so making a collage stays free of sign-in.
 */
function usePlusFromApi(asking: boolean): PlusState {
  // Locked until the API answers, and whenever it can't be reached.
  const [plus, setPlus] = useState(false);

  useEffect(() => {
    if (!asking) return;
    let live = true;
    fetchPlus()
      .then((p) => p || devicePlus())
      .catch(() => false)
      .then((p) => live && setPlus(p));
    return () => {
      live = false;
    };
  }, [asking]);

  const recheck = useCallback(async (userId: string | null) => {
    const p = userId ? await refreshPlus() : await devicePlus();
    setPlus(p);
    return p;
  }, []);

  return { locked: !plus, recheck };
}

const off: PlusState = { locked: false, recheck: async () => false };
const usePlusOff = (): PlusState => off;

/** StoryStitch Plus for the editor. With EXPO_PUBLIC_FEATURE_PLUS off, nothing is locked and the API isn't asked. */
export const usePlus = PLUS_ENABLED ? usePlusFromApi : usePlusOff;
