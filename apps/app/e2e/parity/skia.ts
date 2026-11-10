// Stands in for "@shopify/react-native-skia" so render.native.ts can run in a browser, on CanvasKit (Skia for the web).
import { JsiSkApi } from "@shopify/react-native-skia/lib/module/skia/web/JsiSkia";

export * from "@shopify/react-native-skia/lib/module/skia/types/index";

export let Skia: ReturnType<typeof JsiSkApi>;

export function loadCanvasKit(canvasKit: Parameters<typeof JsiSkApi>[0]) {
  Skia = JsiSkApi(canvasKit);
}

/** render.native.ts's mark looks up an installed font, which CanvasKit doesn't have. The parity test doesn't draw the mark. */
export function matchFont(): never {
  throw new Error("No installed fonts on CanvasKit");
}
