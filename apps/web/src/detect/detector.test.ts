import { describe, expect, it } from "vitest";
import type { Detection } from "@storystitch/layout-engine";
import { describeSubjects } from "./detector";

const d = (kind: Detection["kind"], label?: string): Detection => ({ kind, label, score: 0.9, box: { x: 0, y: 0, w: 0.1, h: 0.1 } });

describe("describeSubjects", () => {
  it("lists faces and labelled objects", () => {
    expect(describeSubjects([[d("face"), d("face")], [d("object", "dog"), d("person", "person")]])).toBe("Found 2 faces and a dog.");
    expect(describeSubjects([[d("face")]])).toBe("Found 1 face.");
  });

  it("says nothing when only the heuristic found something", () => {
    expect(describeSubjects([[d("salient")], []])).toBeNull();
  });
});
