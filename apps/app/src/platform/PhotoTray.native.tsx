// The photo tray of a blank canvas: thumbnails that drag onto a shape, or tap to be picked up and then a shape taps to take them.
import { Canvas, Image as SkiaImage } from "@shopify/react-native-skia";
import { useEffect, useMemo, useRef } from "react";
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../theme";
import type { Tray, TrayPhoto } from "../useLayoutEditor";
import type { Photo } from "./photos.native";

/** Edge of a thumbnail, in points. */
export const THUMB = 56;
/** How far a finger must go up or down, more than sideways, before it carries the photo instead of scrolling the tray. */
const LIFT = 6;

export function Thumb({ photo }: { photo: Photo }) {
  return (
    <Canvas pointerEvents="none" style={{ width: THUMB, height: THUMB }}>
      <SkiaImage image={photo.preview} x={0} y={0} width={THUMB} height={THUMB} fit="cover" />
    </Canvas>
  );
}

function TrayThumb({ photo, item, tray }: { photo: Photo; item: TrayPhoto; tray: Tray }) {
  const latest = useRef(tray);
  useEffect(() => {
    latest.current = tray;
  });
  const pan = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- these run on touch events, never during render.
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > LIFT && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_e, g) => latest.current.grab(item.index, g.x0, g.y0),
        onPanResponderMove: (_e, g) => latest.current.move(g.moveX, g.moveY),
        onPanResponderRelease: () => latest.current.drop(),
        onPanResponderTerminate: () => latest.current.cancel(),
      }),
    [item.index],
  );
  return (
    <View {...pan.panHandlers}>
      <Pressable
        role="button"
        aria-label={item.label}
        aria-selected={item.picked}
        onPress={() => tray.tap(item.index)}
        style={[styles.thumb, item.picked && styles.picked]}
      >
        <Thumb photo={photo} />
        {item.placed && (
          <>
            <View pointerEvents="none" style={styles.dim} />
            <View style={styles.check}>
              <Text style={styles.checkMark}>✓</Text>
            </View>
          </>
        )}
      </Pressable>
    </View>
  );
}

export function PhotoTray({ photos, tray }: { photos: Photo[]; tray: Tray }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} aria-label="Your photos" contentContainerStyle={styles.row} style={styles.scroll}>
      {tray.photos.map((t) => (
        <TrayThumb key={t.index} photo={photos[t.index]!} item={t} tray={tray} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: { gap: 8, padding: 2 },
  thumb: { width: THUMB, height: THUMB, overflow: "hidden", borderRadius: 12, borderWidth: 2, borderColor: "transparent" },
  picked: { borderColor: colors.accent },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(58, 31, 86, 0.65)" },
  check: { position: "absolute", right: 3, bottom: 3, width: 20, height: 20, alignItems: "center", justifyContent: "center", borderRadius: 10, backgroundColor: colors.accent },
  checkMark: { color: colors.bg, fontSize: 12, fontWeight: "800" },
});
