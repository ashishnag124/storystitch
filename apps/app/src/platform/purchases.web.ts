import type { Package, Purchases } from "@revenuecat/purchases-js";
import { REVENUECAT_WEB_KEY } from "../config";

/**
 * Buying StoryStitch Plus on the web: RevenueCat's Web SDK, with Paddle's checkout. The purchase is made under the
 * account's ID, so buying needs an account here (on iOS it doesn't). Whether it went through is for the API to say:
 * after a purchase the app asks it to refresh, never trusting this result alone. The SDK loads only when the upsell
 * opens, so the editor doesn't carry it.
 */

/** The web can't buy signed out: the purchase has to land on an account. */
export const BUY_SIGNED_OUT = false;
/** Web purchases are already on the account, so there's nothing to restore. */
export const CAN_RESTORE = false;

const sdk = () => import("@revenuecat/purchases-js");

async function forUser(userId: string): Promise<Purchases> {
  const { Purchases } = await sdk();
  if (!Purchases.isConfigured()) return Purchases.configure({ apiKey: REVENUECAT_WEB_KEY, appUserId: userId });
  const purchases = Purchases.getSharedInstance();
  if (purchases.getAppUserId() !== userId) await purchases.changeUser(userId);
  return purchases;
}

async function plusPackage(purchases: Purchases): Promise<Package> {
  const pkg = (await purchases.getOfferings()).current?.availablePackages[0];
  if (!pkg) throw new Error("RevenueCat has no current offering with a package");
  return pkg;
}

/** Plus's price in the buyer's currency, e.g. "$4.99", or null when it can't be bought here (signed out, no key, an error). */
export async function plusPrice(userId: string | null): Promise<string | null> {
  if (!userId || !REVENUECAT_WEB_KEY) return null;
  try {
    return (await plusPackage(await forUser(userId))).product.currentPrice.formattedPrice;
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** Opens Paddle's checkout. "cancelled" when the buyer closes it; throws on any other failure. */
export async function buyPlus(userId: string | null): Promise<"bought" | "cancelled"> {
  if (!userId) throw new Error("Buying Plus on the web needs an account");
  const { ErrorCode, PurchasesError } = await sdk();
  const purchases = await forUser(userId);
  try {
    await purchases.purchase({ rcPackage: await plusPackage(purchases) });
    return "bought";
  } catch (err) {
    if (err instanceof PurchasesError && err.errorCode === ErrorCode.UserCancelledError) return "cancelled";
    throw err;
  }
}

/** Not on the web (see CAN_RESTORE). */
export async function restorePlus(): Promise<void> {}

/** The device's anonymous buyer ID: none on the web. */
export async function deviceBuyerId(): Promise<string | null> {
  return null;
}
