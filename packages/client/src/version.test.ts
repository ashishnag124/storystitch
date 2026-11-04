import { describe, expect, it } from "vitest";
import { isOlderVersion } from "./version";

describe("AC-UPDATE-01 comparing app versions", () => {
  it.each([
    ["1.2.3", "2.0.0"],
    ["1.2.3", "1.3.0"],
    ["1.2.3", "1.2.4"],
    ["1.9.0", "1.10.0"],
    ["9.0.0", "10.0.0"],
    ["1.0", "1.0.1"],
  ])("%s is older than %s", (version, minimum) => {
    expect(isOlderVersion(version, minimum)).toBe(true);
  });

  it.each([
    ["1.2.3", "1.2.3"],
    ["2.0.0", "1.9.9"],
    ["1.3.0", "1.2.9"],
    ["1.2.4", "1.2.3"],
    ["1.10.0", "1.9.0"],
    ["1.0", "1.0.0"],
  ])("%s is not older than %s", (version, minimum) => {
    expect(isOlderVersion(version, minimum)).toBe(false);
  });

  it("never calls a version it can't read older", () => {
    expect(isOlderVersion("unknown", "1.0.0")).toBe(false);
  });
});
