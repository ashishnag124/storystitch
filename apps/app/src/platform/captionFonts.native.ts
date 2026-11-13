import { CAPTION_FONT_NAMES, type CaptionFont } from "@storystitch/client";
import { Skia } from "@shopify/react-native-skia";
import { loadAsync } from "expo-font";
import { Image } from "react-native";
import { setCaptionTypeface } from "./captionRender.native";

/* eslint-disable @typescript-eslint/no-require-imports -- Metro bundles these as assets; their bytes load only when asked for. */
/** The same font files the web app serves (captionFonts.web.ts), bundled as assets rather than installed in the app. */
const FILES: Record<CaptionFont, number> = {
  clean: require("@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf"),
  serif: require("@expo-google-fonts/playfair-display/600SemiBold/PlayfairDisplay_600SemiBold.ttf"),
  hand: require("@expo-google-fonts/caveat/700Bold/Caveat_700Bold.ttf"),
  type: require("@expo-google-fonts/courier-prime/700Bold/CourierPrime_700Bold.ttf"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

let loading: Promise<void> | undefined;

/** Loads the caption fonts once (for drawing on Skia, and for the app's own text), the first time captions are used. A failed load is tried again next time. */
export function loadCaptionFonts(): Promise<void> {
  loading ??= Promise.all(
    (Object.keys(FILES) as CaptionFont[]).map(async (font) => {
      const data = await Skia.Data.fromURI(Image.resolveAssetSource(FILES[font])!.uri);
      const typeface = Skia.Typeface.MakeFreeTypeFaceFromData(data);
      if (!typeface) throw new Error(`Couldn't load the ${font} caption font`);
      setCaptionTypeface(font, typeface);
      // The same file, for the Text tool's font chips, which are set in their own fonts as on web.
      await loadAsync({ [`StoryStitch ${CAPTION_FONT_NAMES[font]}`]: FILES[font] });
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
