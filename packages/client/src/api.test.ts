import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "./api";

const api = createApi({ apiUrl: "https://api.example", popularity: true });

const twoStack = {
  family: "grid",
  cells: [
    { shape: "rect", x: 0, y: 0, w: 1, h: 0.5 },
    { shape: "rect", x: 0, y: 0.5, w: 1, h: 0.5 },
  ],
};
const saved = (id: string, layout: object = twoStack) => ({
  id,
  name: id,
  layout: { ...layout, id, name: id },
  updatedAt: "2026-11-04T00:00:00.000Z",
});
const respondWith = (body: unknown, status = 200) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("session on iOS", () => {
  const sent = () => vi.mocked(fetch).mock.calls[0]![1]!;

  it("sends the app's own cookie header and leaves cookie handling off", async () => {
    respondWith({ layouts: [], limit: 20 });
    await createApi({ apiUrl: "https://api.example", popularity: true, sessionHeaders: async () => ({ Cookie: "a=b" }) }).listSaved();
    expect(sent()).toMatchObject({ credentials: "omit", headers: { Cookie: "a=b" } });
  });

  it("uses the browser's cookies on web", async () => {
    respondWith({ layouts: [], limit: 20 });
    await api.listSaved();
    expect(sent()).toMatchObject({ credentials: "include" });
  });
});

describe("AC-CUSTOM-09 saved layouts from a newer app version", () => {
  it("lists every layout it can read", async () => {
    respondWith({ layouts: [saved("a"), saved("b")], limit: 20 });
    expect(await api.listSaved()).toMatchObject([{ id: "a" }, { id: "b" }]);
  });

  it("skips a layout with a cell shape it doesn't know and keeps the rest, in order", async () => {
    const newShape = { ...twoStack, cells: [{ shape: "cloud", cx: 0.5, cy: 0.5, r: 0.2 }] };
    respondWith({ layouts: [saved("a"), saved("new", newShape), saved("b")], limit: 20 });
    expect(await api.listSaved()).toMatchObject([{ id: "a" }, { id: "b" }]);
  });

  it("skips a layout from a family it doesn't know, and an entry that isn't a layout at all", async () => {
    respondWith({ layouts: [saved("new", { ...twoStack, family: "ribbon" }), null, saved("a")], limit: 20 });
    expect(await api.listSaved()).toMatchObject([{ id: "a" }]);
  });

  it("gives an empty list when it can read none of them", async () => {
    respondWith({ layouts: [saved("new", { ...twoStack, family: "ribbon" })], limit: 20 });
    expect(await api.listSaved()).toEqual([]);
  });

  it("still fails on a response that isn't a list of saved layouts", async () => {
    respondWith({ error: "nope" });
    await expect(api.listSaved()).rejects.toThrow();
  });

  it("still reports signed out and server errors as before", async () => {
    respondWith({ error: "SIGNED_OUT" }, 401);
    expect(await api.listSaved()).toBe("signed-out");
    respondWith({}, 500);
    await expect(api.listSaved()).rejects.toThrow("500");
  });
});

describe("AC-UPDATE-01 asking the API for the minimum app version", () => {
  it("gives the version the API reports", async () => {
    respondWith({ ios: "1.2.3" });
    expect(await api.fetchMinimumVersion()).toEqual({ ios: "1.2.3" });
  });

  it("carries on when the API can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("Network request failed"))));
    expect(await api.fetchMinimumVersion()).toBeNull();
  });

  it("carries on when the API answers with an error or something unreadable", async () => {
    respondWith({}, 500);
    expect(await api.fetchMinimumVersion()).toBeNull();
    respondWith({ ios: "latest" });
    expect(await api.fetchMinimumVersion()).toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>")));
    expect(await api.fetchMinimumVersion()).toBeNull();
  });

  it("gives up on a slow API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, { signal }: RequestInit) => new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason)))),
    );
    expect(await api.fetchMinimumVersion()).toBeNull();
  });
});
