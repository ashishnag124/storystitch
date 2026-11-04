import type { Detection } from "@storystitch/layout-engine";
import { requireNativeModule } from "expo";

interface StoryVision {
  /** Finds faces, people and pets in the photo at `uri`, on the device. Falls back to what stands out. */
  detect(uri: string): Promise<Detection[]>;
}

export default requireNativeModule<StoryVision>("StoryVision");
