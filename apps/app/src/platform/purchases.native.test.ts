import { beforeEach, describe, expect, it, vi } from "vitest";

const rc = vi.hoisted(() => {
  const state = { id: "", anonymous: true };
  const anon = "$RCAnonymousID:0123456789abcdef0123456789abcdef";
  const pkg = { product: { priceString: "$4.99" } };
  const Purchases = {
    configure: vi.fn(({ appUserID }: { appUserID: string | null }) => Object.assign(state, { id: appUserID ?? anon, anonymous: !appUserID })),
    isAnonymous: vi.fn(async () => state.anonymous),
    getAppUserID: vi.fn(async () => state.id),
    logIn: vi.fn(async (id: string) => Object.assign(state, { id, anonymous: false })),
    logOut: vi.fn(async () => Object.assign(state, { id: anon, anonymous: true })),
    getOfferings: vi.fn(async () => ({ current: { availablePackages: [pkg] } })),
    purchasePackage: vi.fn(async (p: unknown) => p && {}),
    restorePurchases: vi.fn(async () => ({})),
  };
  return { Purchases, anon, pkg };
});
vi.mock("react-native-purchases", () => ({ default: rc.Purchases }));
vi.mock("../config", () => ({ REVENUECAT_IOS_KEY: "appl_test" }));

const { buyPlus, deviceBuyerId, linkBuyer, plusPrice } = await import("./purchases.native");

beforeEach(() => vi.clearAllMocks());

describe("AC-PLUS-06 buying Plus on iOS", () => {
  it("buys signed out on the device's anonymous ID, and moves it to the account at sign-in", async () => {
    expect(await deviceBuyerId()).toBe(rc.anon);
    expect(rc.Purchases.configure).toHaveBeenCalledWith({ apiKey: "appl_test", appUserID: null });
    expect(await buyPlus(null)).toBe("bought");
    expect(rc.Purchases.purchasePackage).toHaveBeenCalledWith(rc.pkg);
    await linkBuyer("user-1");
    expect(rc.Purchases.logIn).toHaveBeenCalledWith("user-1");
  });

  it("never logs a signed-in buyer out just to look for a device purchase", async () => {
    await linkBuyer("user-1");
    expect(await deviceBuyerId()).toBeNull();
    expect(rc.Purchases.logOut).not.toHaveBeenCalled();
    expect(await plusPrice("user-1")).toBe("$4.99");
    expect(rc.Purchases.logIn).not.toHaveBeenCalled();
  });

  it("starts a new anonymous buyer at sign-out, and tells a closed sheet from a failure", async () => {
    await linkBuyer(null);
    expect(rc.Purchases.logOut).toHaveBeenCalled();
    rc.Purchases.purchasePackage.mockRejectedValueOnce(Object.assign(new Error("cancelled"), { userCancelled: true }));
    expect(await buyPlus(null)).toBe("cancelled");
    rc.Purchases.purchasePackage.mockRejectedValueOnce(new Error("network"));
    await expect(buyPlus(null)).rejects.toThrow("network");
  });
});
