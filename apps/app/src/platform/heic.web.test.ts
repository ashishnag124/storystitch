import { describe, expect, it } from "vitest";
import { isHeic } from "./heic.web";

const header = (brand: string) => new Blob([new Uint8Array([0, 0, 0, 24]), "ftyp" + brand, "rest of file"]);

describe("AC-PICK-05 isHeic", () => {
  it("recognises HEIC and HEIF brands", async () => {
    expect(await isHeic(header("heic"))).toBe(true);
    expect(await isHeic(header("mif1"))).toBe(true);
  });

  it("rejects other files", async () => {
    expect(await isHeic(header("avif"))).toBe(false);
    expect(await isHeic(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])]))).toBe(false); // JPEG
  });
});
