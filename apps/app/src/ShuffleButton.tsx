import { shuffle, usageLayout, type Scene } from "@storystitch/client";
import { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Photo } from "./platform/photos";
import { haptic } from "./platform/motion";
import { colors, fontFamily } from "./theme";
import { track } from "./usage";

interface Props {
  /** The strip's scenes, in its order. */
  options: Scene[];
  scene: Scene;
  photos: Photo[];
  /** Ids of the user's own layouts among the options. */
  yours: Set<string>;
  onShuffle: (next: Scene) => void;
}

/** Two crossing arrows, drawn with views like the tab icons. */
function ShuffleGlyph() {
  return (
    <View aria-hidden style={glyph.box}>
      {[-1, 1].map((dir) => (
        <View key={dir} style={[glyph.path, { transform: [{ rotate: `${dir * 28}deg` }] }]}>
          <View style={glyph.line} />
          <View style={glyph.head} />
        </View>
      ))}
    </View>
  );
}

/**
 * "Shuffle", first in the layout strip and as tall as its layouts: another layout that fits well, chosen at random
 * (see `shuffle`). Outlined, not filled: "Edit this layout" stays the one gold action.
 */
export function ShuffleButton({ options, scene, photos, yours, onShuffle }: Props) {
  const history = useRef<string[]>([]);
  return (
    <Pressable
      role="button"
      aria-label="Shuffle layout"
      onPress={() => {
        const next = shuffle(options, scene, history.current, photos, Math.random, yours);
        if (!next) return;
        history.current = next.history;
        haptic(10);
        track("layout_chosen", { layout: usageLayout(next.scene.layout.id) });
        onShuffle(next.scene);
      }}
      style={styles.button}
    >
      <ShuffleGlyph />
      <Text style={styles.label}>Shuffle</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Lines up with the thumbnails: the strip's padding outside, their rounding, about 1.2× their width.
  button: { width: 76, marginVertical: 4, marginLeft: 2, marginRight: 8, alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: colors.accent, borderRadius: 10, backgroundColor: "transparent" },
  label: { fontFamily, fontSize: 13, fontWeight: "700", color: colors.accent },
});

const glyph = StyleSheet.create({
  box: { width: 24, height: 20, justifyContent: "center" },
  path: { position: "absolute", left: 0, right: 0, height: 8, justifyContent: "center" },
  line: { height: 2, marginRight: 2, borderRadius: 1, backgroundColor: colors.accent },
  head: { position: "absolute", right: 1, width: 7, height: 7, borderTopWidth: 2, borderRightWidth: 2, borderColor: colors.accent, transform: [{ rotate: "45deg" }] },
});
