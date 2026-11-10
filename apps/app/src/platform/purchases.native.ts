/**
 * Buying StoryStitch Plus on iOS. Not built yet (Apple's in-app purchase through RevenueCat comes in its own change),
 * so nothing can be bought here and the mark stays on unless the API says the account has Plus. Same calls as
 * purchases.web.ts.
 */

export const BUY_SIGNED_OUT = false;
export const CAN_RESTORE = false;

export async function plusPrice(): Promise<string | null> {
  return null;
}

export async function buyPlus(): Promise<"bought" | "cancelled"> {
  throw new Error("Buying Plus on iOS isn't built yet");
}

export async function restorePlus(): Promise<void> {}

export async function deviceBuyerId(): Promise<string | null> {
  return null;
}
