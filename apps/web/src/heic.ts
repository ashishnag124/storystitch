// HEIC/HEIF major brands from the ISO base media file header ("ftyp" box).
const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);

/** Whether the file is HEIC/HEIF, from its header rather than its (often missing) MIME type. */
export async function isHeic(file: Blob): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  return ascii(4, 8) === "ftyp" && HEIC_BRANDS.has(ascii(8, 12));
}

/**
 * Converts HEIC to a high-quality JPEG with a WebAssembly decoder, for browsers that can't
 * decode HEIC natively (everything but Safari). The decoder downloads only when first needed.
 */
export async function heicToJpeg(file: Blob): Promise<Blob> {
  const { heicTo } = await import("heic-to");
  return heicTo({ blob: file, type: "image/jpeg", quality: 0.95 });
}
