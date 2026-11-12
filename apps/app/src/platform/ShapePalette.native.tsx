// The shape palette of a blank canvas: tap a shape to add it in the middle, or drag it onto the canvas. Tidy is at the end.
import type { PaletteShape } from "@storystitch/layout-engine";
import { useEffect, useMemo, useRef } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { colors } from "../theme";
import { Button } from "../ui/Button";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import type { Palette } from "../useLayoutEditor";

/** Edge of a palette button, in points. */
export const SHAPE_BUTTON = 48;
/** How far a finger must go up or down, more than sideways, before it carries the shape instead of scrolling the row. */
const LIFT = 6;

function PaletteShapeButton({ shape, label, palette }: { shape: PaletteShape; label: string; palette: Palette }) {
  const latest = useRef(palette);
  useEffect(() => {
    latest.current = palette;
  });
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- these run on touch events, never during render.
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => !latest.current.disabled && Math.abs(g.dy) > LIFT && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, g) => latest.current.grab(shape, g.x0, g.y0),
        onPanResponderMove: (_e, g) => latest.current.move(g.moveX, g.moveY),
        onPanResponderRelease: () => latest.current.drop(),
        onPanResponderTerminate: () => latest.current.cancel(),
      }),
    [shape],
  );
  return (
    <View {...pan.panHandlers}>
      <Pressable role="button" aria-label={label} disabled={palette.disabled} onPress={() => palette.tap(shape)} style={[styles.button, palette.disabled && styles.disabled]}>
        <ShapeGlyph shape={shape} />
      </Pressable>
    </View>
  );
}

export function ShapePalette({ palette }: { palette: Palette }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} aria-label="Shapes" contentContainerStyle={styles.row} style={styles.scroll}>
      {palette.shapes.map(({ shape, label }) => (
        <PaletteShapeButton key={shape} shape={shape} label={label} palette={palette} />
      ))}
      <Button label="Tidy" quiet disabled={palette.tidy.disabled} onPress={palette.tidy.onPress} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, padding: 2, alignItems: "center" },
  button: { width: SHAPE_BUTTON, height: SHAPE_BUTTON, alignItems: "center", justifyContent: "center", borderRadius: 12, borderWidth: 1, borderColor: colors.border },
  disabled: { opacity: 0.4 },
});
