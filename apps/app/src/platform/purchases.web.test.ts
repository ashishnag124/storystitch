import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => {
  class PurchasesError extends Error {
    constructor(readonly errorCode: number) {
      super(`error ${errorCode}`);
    }
  }
  const pkg = { product: { currentPrice: { formattedPrice: "$4.99" } } };
  const instance = {
    appUserId: "",
    getAppUserId: () => instance.appUserId,
    changeUser: vi.fn(async (id: string) => void (instance.appUserId = id)),
    getOfferings: vi.fn(async () => ({ current: { availablePackages: [pkg] } })),
    purchase: vi.fn(async (params: unknown) => params && {}),
  };
  let configured = false;
  const Purchases = {
    isConfigured: () => configured,
    configure: vi.fn(({ appUserId }: { appUserId: string }) => {
      configured = true;
      instance.appUserId = appUserId;
      return instance;
    }),
    getSharedInstance: () => instance,
  };
  return { Purchases, PurchasesError, ErrorCode: { UserCancelledError: 1 }, instance, pkg };
});
vi.mock("@revenuecat/purchases-js", () => sdk);
vi.mock("../config", () => ({ REVENUECAT_WEB_KEY: "rcb_test" }));

const { buyPlus, plusPrice } = await import("./purchases.web");

beforeEach(() => vi.clearAllMocks());

describe("AC-PLUS-06 buying Plus on the web", () => {
  it("needs an account, and buys under the account's ID", async () => {
    expect(await plusPrice(null)).toBeNull();
    await expect(buyPlus(null)).rejects.toThrow(/account/);
    expect(await plusPrice("user-1")).toBe("$4.99");
    expect(sdk.Purchases.configure).toHaveBeenCalledWith({ apiKey: "rcb_test", appUserId: "user-1" });
    expect(await buyPlus("user-2")).toBe("bought");
    expect(sdk.instance.changeUser).toHaveBeenCalledWith("user-2");
    expect(sdk.instance.purchase).toHaveBeenCalledWith({ rcPackage: sdk.pkg });
  });

  it("tells a closed checkout from a failure", async () => {
    sdk.instance.purchase.mockRejectedValueOnce(new sdk.PurchasesError(1));
    expect(await buyPlus("user-1")).toBe("cancelled");
    sdk.instance.purchase.mockRejectedValueOnce(new sdk.PurchasesError(7));
    await expect(buyPlus("user-1")).rejects.toThrow();
  });
});
