import type { CaptionFont } from "@storystitch/client";
import { CAPTION_FAMILIES } from "./captionRender.web";

/**
 * The caption fonts' files, which scripts/prepare-assets.mjs copies into public/fonts/captions from the same
 * packages the iOS app bundles (captionFonts.native.ts), so both draw with the same fonts.
 */
export const CAPTION_FONT_FILES: Record<CaptionFont, string> = {
  clean: "Inter_700Bold.ttf",
  serif: "PlayfairDisplay_600SemiBold.ttf",
  hand: "Caveat_700Bold.ttf",
  type: "CourierPrime_700Bold.ttf",
};

let loading: Promise<void> | undefined;

/** Loads the caption fonts once, the first time captions are used. A failed load is tried again next time. */
export function loadCaptionFonts(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(CAPTION_FONT_FILES) as CaptionFont[]).map(async (font) => {
      const face = new FontFace(CAPTION_FAMILIES[font], `url(/fonts/captions/${CAPTION_FONT_FILES[font]})`);
      document.fonts.add(await face.load());
    }),
  ).then(
    () => undefined,
    (err: unknown) => {
      loading = undefined;
      throw err;
    },
  );
  return loading;
}
