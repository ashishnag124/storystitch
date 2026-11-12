import { beforeEach, describe, expect, it, vi } from "vitest";
import StoryAI from "../../modules/story-ai";
import { describeAvailability, describeLayout } from "./describeLayout.native";

vi.mock("../../modules/story-ai", () => ({ default: { availability: vi.fn(), generate: vi.fn() } }));

const generate = vi.mocked(StoryAI.generate);
/** The model's answer: photos per band, stacked in rows. */
const spec = (...photos: number[]) => JSON.stringify({ direction: "rows", bands: photos.map((n) => ({ photos: n, size: 1 })) });
const failure = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => vi.resetAllMocks());

describe("AC-AI-02 a bad answer is tried once more", () => {
  it("opens a layout when the first answer is good, with only the description and count in the prompt", async () => {
    generate.mockResolvedValueOnce(spec(2, 1));
    const result = await describeLayout("three photos", 3);
    expect(result.ok && result.draft.layout.cells).toHaveLength(3);
    expect(result.ok && result.adjusted).toBe(false);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0]![0]).toContain('"three photos"');
    expect(generate.mock.calls[0]![0]).toContain("exactly 3 photos");
  });

  it("retries once with the reason when the first answer has the wrong count, then uses the second", async () => {
    generate.mockResolvedValueOnce(spec(1, 1)).mockResolvedValueOnce(spec(2, 2));
    const result = await describeLayout("four", 4);
    expect(result.ok && result.draft.layout.cells).toHaveLength(4);
    expect(result.ok && result.adjusted).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]![0]).not.toContain("not usable");
    expect(generate.mock.calls[1]![0]).toContain("The layout has 2 photos but must have exactly 4.");
  });

  it("puts the count right, and says so, when the second answer is still off", async () => {
    generate.mockResolvedValue(spec(1, 2));
    const result = await describeLayout("four", 4);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(result.ok && result.draft.layout.cells).toHaveLength(4);
    expect(result.ok && result.adjusted).toBe(true);
  });

  it("retries after an answer that is not JSON or not a layout, then uses a good one", async () => {
    generate.mockResolvedValueOnce("not json").mockResolvedValueOnce(spec(1));
    const result = await describeLayout("one", 1);
    expect(result.ok && result.adjusted).toBe(false);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1]![0]).toContain("The answer was not valid JSON.");
  });

  it("shows no layout after two answers that cannot be used", async () => {
    generate.mockResolvedValueOnce("not json").mockResolvedValueOnce(JSON.stringify({ direction: "rows", bands: [] }));
    expect(await describeLayout("one", 1)).toEqual({ ok: false, reason: "no_layout" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("keeps an adjusted first answer when the second cannot be used", async () => {
    generate.mockResolvedValueOnce(spec(1, 2)).mockResolvedValueOnce("not json");
    const result = await describeLayout("four", 4);
    expect(result.ok && result.draft.layout.cells).toHaveLength(4);
    expect(result.ok && result.adjusted).toBe(true);
  });

  it("reports a refusal or an unready model at once, without retrying", async () => {
    generate.mockRejectedValueOnce(failure("refused"));
    expect(await describeLayout("x", 2)).toEqual({ ok: false, reason: "refused" });
    generate.mockRejectedValueOnce(failure("unavailable"));
    expect(await describeLayout("x", 2)).toEqual({ ok: false, reason: "unavailable" });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("retries once after a failure, then says no layout", async () => {
    generate.mockRejectedValue(failure("failed"));
    expect(await describeLayout("x", 2)).toEqual({ ok: false, reason: "no_layout" });
    expect(generate).toHaveBeenCalledTimes(2);
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
