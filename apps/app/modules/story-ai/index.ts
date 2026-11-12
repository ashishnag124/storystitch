import { requireNativeModule } from "expo";

interface StoryAI {
  /** Whether the on-device language model can run: not on an older iOS or an iPhone without Apple Intelligence, or not yet (turned off, or still downloading). */
  availability(): Promise<"available" | "unsupported" | "notReady">;
  /** Asks the model for a layout spec as JSON text. Rejects with code `unavailable`, `refused` or `failed`. */
  generate(prompt: string): Promise<string>;
}

export default requireNativeModule<StoryAI>("StoryAI");
