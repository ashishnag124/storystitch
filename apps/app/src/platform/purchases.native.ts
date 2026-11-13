import Purchases, { type PurchasesPackage } from "react-native-purchases";
import { REVENUECAT_IOS_KEY } from "../config";

/**
 * Buying StoryStitch Plus on iOS: Apple's in-app purchase (a non-consumable, `plus_lifetime`) through RevenueCat.
 * Apple doesn't let an app make sign-up a condition of buying a perk like this (Guideline 5.1.1), so a signed-out
 * purchase goes on the device's anonymous RevenueCat ID, and `logIn` moves it to the account at sign-in. Whether it
 * went through is for the API to say: the app asks it afterwards, never trusting this result alone.
 */

export const BUY_SIGNED_OUT = true;
export const CAN_RESTORE = true;

let configured = false;

/** RevenueCat set up for this buyer: the account when signed in, the device's anonymous ID when not. */
async function ready(userId: string | null): Promise<void> {
  if (!configured) {
    Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: userId });
    configured = true;
    return;
  }
  const anonymous = await Purchases.isAnonymous();
  if (userId && (anonymous || (await Purchases.getAppUserID()) !== userId)) await Purchases.logIn(userId);
  else if (!userId && !anonymous) await Purchases.logOut();
}

async function plusPackage(): Promise<PurchasesPackage> {
  const pkg = (await Purchases.getOfferings()).current?.availablePackages[0];
  if (!pkg) throw new Error("RevenueCat has no current offering with a package");
  return pkg;
}

/** Plus's price from the App Store, in the buyer's currency, or null when it can't be bought right now. */
export async function plusPrice(userId: string | null): Promise<string | null> {
  if (!REVENUECAT_IOS_KEY) return null;
  try {
    await ready(userId);
    return (await plusPackage()).product.priceString;
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** Opens Apple's purchase sheet. "cancelled" when the buyer closes it; throws on any other failure. */
export async function buyPlus(userId: string | null): Promise<"bought" | "cancelled"> {
  await ready(userId);
  try {
    await Purchases.purchasePackage(await plusPackage());
    return "bought";
  } catch (err) {
    if ((err as { userCancelled?: boolean }).userCancelled) return "cancelled";
    throw err;
  }
}

/** Asks Apple for this Apple Account's purchases again (a new phone, or the app reinstalled). */
export async function restorePlus(): Promise<void> {
  await Purchases.restorePurchases();
}

/**
 * The device's anonymous RevenueCat ID, so the API can check a signed-out purchase. Null when there's no key, or when
 * RevenueCat is already on an account: this never changes who RevenueCat thinks the buyer is.
 */
export async function deviceBuyerId(): Promise<string | null> {
  if (!REVENUECAT_IOS_KEY) return null;
  if (!configured) await ready(null);
  return (await Purchases.isAnonymous()) ? Purchases.getAppUserID() : null;
}

/** At sign-in and sign-out: moves a signed-out purchase to the account, or starts a new anonymous ID. */
export async function linkBuyer(userId: string | null): Promise<void> {
  if (REVENUECAT_IOS_KEY) await ready(userId);
}
