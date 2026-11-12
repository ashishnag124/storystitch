import { beforeEach, describe, expect, it, vi } from "vitest";
import StoryAI from "../../modules/story-ai";
import { TEMPERATURES, describeAvailability, describeLayouts } from "./describeLayout.native";

vi.mock("../../modules/story-ai", () => ({ default: { availability: vi.fn(), generate: vi.fn() } }));

const generate = vi.mocked(StoryAI.generate);
/** The model's answer: photos per band, stacked in rows or side by side in columns. */
const spec = (direction: "rows" | "columns", ...photos: number[]) => JSON.stringify({ direction, bands: photos.map((n) => ({ photos: n, size: 5 })) });
const failure = (code: string) => Object.assign(new Error(code), { code });
const keys = (result: Awaited<ReturnType<typeof describeLayouts>>) => (result.ok ? result.candidates.map((c) => c.key) : result.reason);

beforeEach(() => vi.resetAllMocks());

describe("AC-AI-05 several different layouts to pick from", () => {
  it("asks at the temperatures in order, with only the description and the photo count in the prompt", async () => {
    generate.mockResolvedValue(spec("rows", 2, 1));
    await describeLayouts("three photos", 3, { temperatures: [0.2, 0.7] });
    expect(generate.mock.calls.map(([, t]) => t)).toEqual([0.2, 0.7]);
    expect(generate.mock.calls[0]![0]).toContain('"three photos"');
    expect(generate.mock.calls[0]![0]).toContain("exactly 3 photos");
    expect(TEMPERATURES[0]).toBeLessThan(TEMPERATURES[1]!);
  });

  it("counts the same grid once, however it was described, and puts the one made most often first", async () => {
    generate
      .mockResolvedValueOnce(spec("rows", 1, 2)) // B
      .mockResolvedValueOnce(spec("rows", 2, 1)) // A
      .mockResolvedValueOnce(spec("rows", 2, 1)) // A again
      .mockResolvedValueOnce(spec("columns", 1, 2));
    const result = await describeLayouts("three photos", 3);
    expect(keys(result)).toEqual(["rows 2+1", "rows 1+2", "columns 1+2"]);
    expect(result.ok && result.candidates.map((c) => c.count)).toEqual([2, 1, 1]);
  });

  it("keeps ties in the order they were first made, and stops asking at three different layouts", async () => {
    generate.mockResolvedValueOnce(spec("rows", 1, 2)).mockResolvedValueOnce(spec("rows", 2, 1)).mockResolvedValueOnce(spec("columns", 1, 2)).mockResolvedValue(spec("columns", 2, 1));
    expect(keys(await describeLayouts("three photos", 3))).toEqual(["rows 1+2", "rows 2+1", "columns 1+2"]);
    expect(generate).toHaveBeenCalledTimes(3);
  });

  it("describes the same grid two ways as one layout", async () => {
    generate.mockResolvedValueOnce(spec("rows", 2, 2)).mockResolvedValueOnce(spec("columns", 2, 2)).mockResolvedValueOnce(spec("rows", 1, 3));
    const result = await describeLayouts("four photos", 4, { temperatures: [0.2, 0.7, 0.7] });
    expect(keys(result)).toEqual(["grid 2x2", "rows 1+3"]);
  });

  it("offers one layout when every answer is the same", async () => {
    generate.mockResolvedValue(spec("rows", 2, 1));
    const result = await describeLayouts("three photos", 3);
    expect(result.ok && result.candidates).toHaveLength(1);
    expect(generate).toHaveBeenCalledTimes(TEMPERATURES.length);
  });

  it("reports progress after each layout, and stops asking when cancelled", async () => {
    generate.mockResolvedValue(spec("rows", 2, 1));
    const progress = vi.fn();
    let stop = false;
    await describeLayouts("three photos", 3, {
      onProgress: (found) => {
        progress(found.length);
        stop = true;
      },
      cancelled: () => stop,
    });
    expect(progress.mock.calls).toEqual([[1]]);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe("AC-AI-02 answers that can't be used", () => {
  it("skips answers that can't be read or made into a layout, and adjusts a wrong photo count", async () => {
    generate
      .mockResolvedValueOnce("not json")
      .mockResolvedValueOnce(JSON.stringify({ direction: "rows", bands: [] }))
      .mockRejectedValueOnce(failure("failed"))
      .mockResolvedValueOnce(spec("rows", 1, 1)); // 2 photos where there are 3
    const result = await describeLayouts("three photos", 3);
    expect(result.ok && result.candidates.map((c) => [c.key, c.adjusted])).toEqual([["rows 1+2", true]]);
  });

  it("prefers an answer that needed no adjusting over one that did, for the same layout", async () => {
    generate.mockResolvedValueOnce(spec("rows", 1, 1)).mockResolvedValueOnce(spec("rows", 1, 2));
    const result = await describeLayouts("three photos", 3, { temperatures: [0.2, 0.7] });
    expect(result.ok && result.candidates.map((c) => [c.key, c.count, c.adjusted])).toEqual([["rows 1+2", 2, false]]);
  });

  it("has no layout when no answer can be used", async () => {
    generate.mockResolvedValue("not json");
    expect(await describeLayouts("three photos", 3)).toEqual({ ok: false, reason: "no_layout" });
  });

  it("reports a refusal or an unready model at once, but keeps what it has if that comes later", async () => {
    generate.mockRejectedValueOnce(failure("refused"));
    expect(await describeLayouts("x", 2)).toEqual({ ok: false, reason: "refused" });
    generate.mockRejectedValueOnce(failure("unavailable"));
    expect(await describeLayouts("x", 2)).toEqual({ ok: false, reason: "unavailable" });
    generate.mockReset();
    generate.mockResolvedValueOnce(spec("rows", 1, 1)).mockRejectedValueOnce(failure("refused")).mockResolvedValue(spec("columns", 1, 1));
    expect(keys(await describeLayouts("x", 2))).toEqual(["grid 1x2", "grid 2x1"]); // made twice against once
  });

});

describe("AC-AI-03 the action shows only when the model is available", () => {
  it("passes on what the module says, and treats an error as unsupported", async () => {
    for (const state of ["available", "unsupported", "notReady"] as const) {
      vi.mocked(StoryAI.availability).mockResolvedValueOnce(state);
      expect(await describeAvailability()).toBe(state);
    }
    vi.mocked(StoryAI.availability).mockRejectedValueOnce(new Error("no module"));
    expect(await describeAvailability()).toBe("unsupported");
  });

  it("is never available on the web", async () => {
    const web = await import("./describeLayout.web");
    expect(await web.describeAvailability()).toBe("unsupported");
    expect(Object.keys(web)).toEqual(["describeAvailability"]);
  });
});
