import { NATIVE_APP_HEADER, UsageBatchSchema, layouts, parseUsageEvent } from "@storystitch/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUsage, screenFor, usageLayout } from "./usage";

const options = { apiUrl: "https://api.example", enabled: true, platform: "ios", appVersion: "1.2.0" } as const;
const ok = () => new Response(null, { status: 204 });

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
const batches = () => fetchMock.mock.calls.map(([, init]) => UsageBatchSchema.parse(JSON.parse(init!.body as string)));
const sentNames = (n: number) => (batches()[n]!.events as { name: string }[]).map((e) => e.name);
const settle = () => vi.advanceTimersByTimeAsync(0);

/** A tracker past its first send, with nothing waiting. */
async function running(extra: Partial<Parameters<typeof createUsage>[0]> = {}) {
  const usage = createUsage({ ...options, ...extra });
  usage.foreground();
  await vi.advanceTimersByTimeAsync(5_000);
  fetchMock.mockClear();
  return usage;
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn<typeof fetch>(async () => ok());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AC-USAGE-01 switched off", () => {
  it.each([
    ["the flag off", { enabled: false }],
    ["no API URL", { apiUrl: undefined }],
  ])("AC-USAGE-01 sends nothing and starts no timers with %s", async (_, extra) => {
    const usage = createUsage({ ...options, ...extra });
    usage.foreground();
    usage.track("signed_up");
    usage.background();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AC-USAGE-03 can't slow or break the app", () => {
  it("AC-USAGE-03 sends nothing from inside track, or in the first 5 seconds", async () => {
    const usage = createUsage(options);
    usage.foreground();
    for (let i = 0; i < 30; i++) usage.track("signed_up");
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4_001);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("AC-USAGE-03 never lets a failed send reach the caller", async () => {
    for (const failure of [
      () => {
        throw new Error("thrown");
      },
      () => Promise.reject(new Error("rejected")),
    ]) {
      fetchMock.mockImplementation(async () => ok());
      const usage = await running();
      fetchMock.mockImplementation(failure);
      expect(usage.track("signed_up")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock).toHaveBeenCalled();
      usage.background();
      await settle();
    }
  });

  it("AC-USAGE-03 gives up on a send that hangs, and tries again later", async () => {
    const usage = await running();
    fetchMock.mockImplementation(
      (_, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock.mock.calls.at(-1)![1]!.signal!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock.mock.calls.at(-1)![1]!.signal!.aborted).toBe(true);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => ok());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sentNames(0)).toEqual(["signed_up"]);
  });

  it("AC-USAGE-03 holds at most 100 events, dropping the oldest", async () => {
    const usage = await running();
    usage.background();
    await settle();
    fetchMock.mockClear();
    for (let i = 1; i <= 150; i++) usage.track("photos_picked", { count: (i % 8) + 1 });
    usage.track("signed_up");
    usage.foreground();
    await vi.advanceTimersByTimeAsync(5_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches().flatMap((b) => b.events)).toHaveLength(100);
    expect(sentNames(1).at(-1)).toBe("signed_up");
  });
});

describe("AC-USAGE-04 batches and failures", () => {
  it("AC-USAGE-04 sends every 30 seconds, and doesn't send an empty batch", async () => {
    const usage = await running();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).not.toHaveBeenCalled();
    usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(29_999);
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(sentNames(0)).toEqual(["signed_up"]);
  });

  it("AC-USAGE-04 sends soon after 20 events are waiting", async () => {
    const usage = await running();
    for (let i = 0; i < 19; i++) usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).not.toHaveBeenCalled();
    usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("AC-USAGE-04 sends what's waiting on going to the background, then stops", async () => {
    const usage = await running();
    usage.track("signed_up");
    usage.background();
    await settle();
    expect(sentNames(0)).toEqual(["signed_up"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("AC-USAGE-04 sends up to 50 events at a time, one send at a time", async () => {
    let finish!: (res: Response) => void;
    const usage = await running();
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)));
    for (let i = 0; i < 70; i++) usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(1_000);
    expect(batches()[0]!.events).toHaveLength(50);
    usage.background();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    finish(ok());
    usage.foreground();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(batches()[1]!.events).toHaveLength(20);
  });

  it("AC-USAGE-04 keeps a batch after a network or server failure, waiting twice as long each time, up to 5 minutes", async () => {
    const usage = await running();
    fetchMock.mockImplementation(async () => new Response(null, { status: 503 }));
    usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    for (const [gap, tries] of [
      [60_000, 2],
      [120_000, 3],
      [240_000, 4],
      [300_000, 5],
      [300_000, 6],
    ] as const) {
      await vi.advanceTimersByTimeAsync(gap - 1);
      expect(fetchMock).toHaveBeenCalledTimes(tries - 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(tries);
    }
    fetchMock.mockImplementation(async () => ok());
    await vi.advanceTimersByTimeAsync(300_000);
    expect(sentNames(6)).toEqual(["signed_up"]);
    // Working again: back to the normal timer, and nothing sent twice.
    fetchMock.mockClear();
    usage.track("layout_saved");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(sentNames(0)).toEqual(["layout_saved"]);
  });

  it.each([400, 403, 413, 429])("AC-USAGE-04 drops a batch refused with %i and never retries it", async (status) => {
    const usage = await running();
    fetchMock.mockImplementation(async () => new Response(null, { status }));
    usage.track("signed_up");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe("what a batch looks like", () => {
  const request = () => fetchMock.mock.calls[0]!;

  it("sends no cookies or session, and text/plain so a browser needs no preflight", async () => {
    const usage = await running({ platform: "web", appVersion: undefined });
    usage.track("signed_up");
    usage.background();
    await settle();
    const [url, init] = request();
    expect(url).toBe("https://api.example/usage/events");
    expect(init).toMatchObject({ method: "POST", credentials: "omit", keepalive: true });
    expect(init!.headers).toEqual({ "Content-Type": "text/plain" });
    expect(batches()[0]).toEqual({ platform: "web", events: [{ name: "signed_up" }] });
  });

  it("names the native app in place of an Origin", async () => {
    const usage = await running();
    usage.track("signed_up");
    usage.background();
    await settle();
    expect(request()[1]!.headers).toEqual({ "Content-Type": "text/plain", [NATIVE_APP_HEADER]: "1" });
    expect(batches()[0]).toMatchObject({ platform: "ios", appVersion: "1.2.0" });
  });

  it("sends events the API will accept", async () => {
    const usage = await running();
    usage.track("screen_viewed", { screen: "editor" });
    usage.track("collage_shared", { layout: "custom", method: "share" });
    usage.track("layout_saved");
    usage.background();
    await settle();
    expect(batches()[0]!.events.map(parseUsageEvent)).not.toContain(null);
  });

  it("checks names and properties at compile time", () => {
    const usage = createUsage({ ...options, enabled: false });
    // @ts-expect-error not an event
    usage.track("not_an_event");
    // @ts-expect-error free text isn't a property
    usage.track("screen_viewed", { screen: "editor", path: "/account" });
    // @ts-expect-error the tracker adds `first` itself
    usage.track("collage_shared", { layout: "custom", method: "share", first: true });
  });
});

describe("AC-USAGE-07 screen names", () => {
  it.each([
    ["/", false, "pick"],
    ["/", true, "editor"],
    ["/account", true, "account"],
    ["/sign-up", false, "sign_up"],
    ["/reset-password", false, "reset_password"],
    ["/bot-check", false, "other"],
    ["/anything/else", false, "other"],
  ])("AC-USAGE-07 calls %s, with photos %s, %s", (pathname, hasPhotos, screen) => {
    expect(screenFor(pathname, hasPhotos)).toBe(screen);
  });
});

describe("AC-USAGE-02 layout names", () => {
  it("AC-USAGE-02 keeps a built-in layout's id, and never sends a saved layout's", () => {
    expect(usageLayout(layouts[0]!.id)).toBe(layouts[0]!.id);
    expect(usageLayout("custom-1234")).toBe("custom");
  });
});

describe("visits", () => {
  const visits = () => batches().flatMap((b) => (b.events as { name: string }[]).filter((e) => e.name === "visit_started"));
  const sendAll = async (usage: ReturnType<typeof createUsage>) => {
    usage.background();
    await settle();
  };

  it("starts one when the app opens", async () => {
    const usage = createUsage(options);
    usage.foreground();
    usage.foreground();
    await sendAll(usage);
    expect(visits()).toHaveLength(1);
  });

  it("starts another only after 30 minutes away", async () => {
    const usage = createUsage(options);
    usage.foreground();
    await sendAll(usage);
    await vi.advanceTimersByTimeAsync(29 * 60_000);
    usage.foreground();
    await sendAll(usage);
    expect(visits()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    usage.foreground();
    await sendAll(usage);
    expect(visits()).toHaveLength(2);
  });
});

describe("funnel", () => {
  it("marks the first export and share of each set of photos", async () => {
    const usage = await running();
    const props = () => ({ layout: "custom", format: "jpeg" }) as const;
    const share = () => ({ layout: "custom", method: "share" }) as const;
    usage.track("photos_picked", { count: 2 });
    usage.track("collage_exported", props());
    usage.track("collage_exported", props());
    usage.track("collage_shared", share());
    usage.track("collage_shared", share());
    usage.track("photos_picked", { count: 3 });
    usage.track("collage_exported", props());
    usage.track("collage_shared", share());
    usage.background();
    await settle();
    const firsts = (name: string) =>
      (batches()[0]!.events as { name: string; props: { first: boolean } }[]).filter((e) => e.name === name).map((e) => e.props.first);
    expect(firsts("collage_exported")).toEqual([true, false, true]);
    expect(firsts("collage_shared")).toEqual([true, false, true]);
  });
});
