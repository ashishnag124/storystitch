// Not from the package's index: the web build bundles everything the index exports, and the prompt is iOS only.
import { MAX_CANDIDATES, describePrompt, layoutFromSpec, rankCandidates, type Candidate } from "@storystitch/client/describe";
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

/**
 * The temperature of each request to the model. The first is low, for the model's best answer; the rest are higher, so
 * that the answers differ. Asking stops early once there are three different layouts.
 */
export const TEMPERATURES = [0.2, 0.7, 0.7, 0.7];

export type DescribeResult = { ok: true; candidates: Candidate[] } | { ok: false; reason: "unavailable" | "refused" | "no_layout" };

interface Options {
  temperatures?: number[];
  /** Called with the layouts found so far, after each answer that made one. */
  onProgress?: (candidates: Candidate[]) => void;
  /** Checked before each request: when it returns true no more are made. */
  cancelled?: () => boolean;
}

/**
 * Asks the on-device model several times for a layout with one cell per photo, and returns up to three different ones,
 * the ones it made most often first. Only the typed description and the photo count go to the model. An answer that
 * can't be read or made into a layout is skipped; one with the wrong number of photos is adjusted to fit (`adjusted`).
 */
export async function describeLayouts(description: string, photoCount: number, { temperatures = TEMPERATURES, onProgress, cancelled }: Options = {}): Promise<DescribeResult> {
  const prompt = describePrompt(description, photoCount);
  const answers: Parameters<typeof rankCandidates>[0] = [];
  let candidates: Candidate[] = [];
  for (const temperature of temperatures) {
    if (cancelled?.()) break;
    let answer: string;
    try {
      answer = await StoryAI.generate(prompt, temperature);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (answers.length === 0 && code === "refused") return { ok: false, reason: "refused" };
      if (answers.length === 0 && code === "unavailable") return { ok: false, reason: "unavailable" };
      continue;
    }
    const made = layoutOf(answer, photoCount);
    if (!made) continue;
    answers.push(made);
    candidates = rankCandidates(answers);
    onProgress?.(candidates);
    if (candidates.length >= MAX_CANDIDATES) break;
  }
  return candidates.length > 0 ? { ok: true, candidates } : { ok: false, reason: "no_layout" };
}

/** The layout an answer describes, or null when it can't be read or made into one. */
function layoutOf(answer: string, photoCount: number) {
  let spec: unknown;
  try {
    spec = JSON.parse(answer);
  } catch {
    return null;
  }
  const parsed = LayoutSpecSchema.safeParse(spec);
  if (!parsed.success) return null;
  const result = layoutFromSpec(parsed.data, photoCount);
  return result.ok ? result : null;
}
