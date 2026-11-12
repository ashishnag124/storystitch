import type { Draft } from "@storystitch/client";
// Not from the package's index: the web build bundles everything the index exports, and the prompt is iOS only.
import { countProblem, describePrompt, layoutFromSpec } from "@storystitch/client/describe";
import { LayoutSpecSchema } from "@storystitch/shared";
import StoryAI from "../../modules/story-ai";

/** Whether the iPhone's on-device model can make a layout now. Anything unexpected counts as unsupported. */
export async function describeAvailability(): Promise<"available" | "unsupported" | "notReady"> {
  try {
    return await StoryAI.availability();
  } catch {
    return "unsupported";
  }
}

/** `adjusted`: the model got the number of photos wrong twice, so photos were added or taken away to fit. */
export type DescribeResult = { ok: true; draft: Draft; adjusted: boolean } | { ok: false; reason: "unavailable" | "refused" | "no_layout" };

/**
 * Asks the on-device model for a layout with one cell per photo. Only the typed description and the photo count go to
 * the model. An answer that isn't usable, or has the wrong number of photos, is tried once more with what was wrong. If
 * the count is still off, the layout is put right rather than failing.
 */
export async function describeLayout(description: string, photoCount: number): Promise<DescribeResult> {
  let problem: string | undefined;
  let fallback: Extract<DescribeResult, { ok: true }> | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    let answer: string;
    try {
      answer = await StoryAI.generate(describePrompt(description, photoCount, problem));
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "refused") return { ok: false, reason: "refused" };
      if (code === "unavailable") return { ok: false, reason: "unavailable" };
      problem = "The answer could not be read.";
      continue;
    }
    let spec: unknown;
    try {
      spec = JSON.parse(answer);
    } catch {
      problem = "The answer was not valid JSON.";
      continue;
    }
    const parsed = LayoutSpecSchema.safeParse(spec);
    if (!parsed.success) {
      problem = "The answer did not have the shape of a layout.";
      continue;
    }
    const result = layoutFromSpec(parsed.data, photoCount);
    if (!result.ok) {
      problem = result.problem;
      continue;
    }
    if (!result.adjusted) return result;
    fallback = result;
    problem = countProblem(parsed.data, photoCount) ?? undefined;
  }
  return fallback ?? { ok: false, reason: "no_layout" };
}
