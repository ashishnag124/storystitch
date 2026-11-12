import type { PaletteShape } from "@storystitch/layout-engine";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";

/** A shape drawn small, for the palette: the app's own shapes, in one color. */
export function ShapeGlyph({ shape }: { shape: PaletteShape }) {
  if (shape === "heart" || shape === "star") return <Text style={styles.symbol}>{shape === "heart" ? "♥" : "★"}</Text>;
  return <View style={[styles.base, styles[shape]]} />;
}

const styles = StyleSheet.create({
  symbol: { color: colors.text, fontSize: 32, lineHeight: 38, includeFontPadding: false },
  base: { backgroundColor: colors.text },
  rect: { width: 34, height: 22, borderRadius: 4 },
  square: { width: 26, height: 26, borderRadius: 4 },
  circle: { width: 30, height: 30, borderRadius: 15 },
  arch: { width: 24, height: 32, borderTopLeftRadius: 12, borderTopRightRadius: 12, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  pill: { width: 38, height: 18, borderRadius: 9 },
  // The glyphs above stand in for these two.
  heart: {},
  star: {},
});
