import { newScene } from "@storystitch/client";
import { layouts } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { upscaleWarnings } from "./exportImage";
import type { Photo } from "./photos";

const photo = (name: string, width: number, height: number) => ({ name, width, height, detections: [] }) as unknown as Photo;

describe("AC-EXPORT-04 upscaleWarnings", () => {
  it("flags only photos enlarged more than 1.5× in the export", () => {
    const photos = [photo("big.jpg", 4000, 3000), photo("tiny.jpg", 400, 300)];
    const warnings = upscaleWarnings(newScene(layouts.find((l) => l.id === "two-stack")!, photos), photos);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ photo: 1, name: "tiny.jpg" });
    expect(warnings[0]!.factor).toBeGreaterThan(1.5);
  });
});
