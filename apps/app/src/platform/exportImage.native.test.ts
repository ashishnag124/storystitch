import { describe, expect, it, vi } from "vitest";
import { deleteAsync, writeAsStringAsync } from "expo-file-system/legacy";
import { shareAsync } from "expo-sharing";
import { shareOrDownload } from "./exportImage.native";

vi.mock("@shopify/react-native-skia", () => ({}));
vi.mock("./photos.native", () => ({}));
vi.mock("./render.native", () => ({}));
vi.mock("expo-file-system/legacy", () => ({
  EncodingType: { Base64: "base64" },
  cacheDirectory: "file:///cache/",
  deleteAsync: vi.fn(),
  makeDirectoryAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
}));
vi.mock("expo-sharing", () => ({ isAvailableAsync: vi.fn(async () => true), shareAsync: vi.fn() }));

describe("AC-IOS-17 shareOrDownload", () => {
  it("shares each export from a new path with the same name, and removes the last one", async () => {
    vi.spyOn(Date, "now").mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    await shareOrDownload("first", "storystitch.jpg");
    await shareOrDownload("second", "storystitch.jpg");

    const [first, second] = vi.mocked(shareAsync).mock.calls.map(([uri]) => uri);
    expect(first).toMatch(/^file:\/\/\/cache\/.+\/storystitch\.jpg$/);
    expect(second).toMatch(/^file:\/\/\/cache\/.+\/storystitch\.jpg$/);
    expect(second).not.toBe(first);
    expect(vi.mocked(writeAsStringAsync).mock.calls.map(([uri, data]) => [uri, data])).toEqual([
      [first, "first"],
      [second, "second"],
    ]);
    expect(vi.mocked(deleteAsync)).toHaveBeenCalledExactlyOnceWith(first!.replace(/storystitch\.jpg$/, ""), { idempotent: true });
  });
});
