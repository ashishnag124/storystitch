import { LOOKS, type LookId } from "@storystitch/client";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LookThumb } from "./platform/LookThumb";
import type { Photo } from "./platform/photos";
import { colors, fontFamily, type } from "./theme";

/** Thumbnails are small portrait rectangles, 3:4, wide enough (with their 2px outline) to be a 44 px tap target. */
const THUMB = { width: 42, height: 56 } as const;

/** The Style tool's first row: every look, shown on the user's first photo. One tap applies it. */
export function LookRow({ photo, look, onChange }: { photo: Photo; look: LookId; onChange: (look: LookId) => void }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>Look</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View role="group" aria-label="Look" style={styles.looks}>
          {LOOKS.map((l) => {
            const pressed = l.id === look;
            return (
              <Pressable
                key={l.id}
                role="button"
                aria-label={l.name}
                aria-pressed={pressed}
                accessibilityState={{ selected: pressed }}
                onPress={() => onChange(l.id)}
                style={styles.look}
              >
                <View style={[styles.thumb, pressed && styles.thumbPressed]}>
                  <LookThumb photo={photo} look={l.id} width={THUMB.width} height={THUMB.height} />
                </View>
                <Text aria-hidden numberOfLines={1} style={[type.hint, styles.name, pressed && styles.namePressed]}>
                  {l.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 2 },
  label: { fontFamily, fontSize: 12, fontWeight: "600", color: colors.muted, paddingLeft: 2 },
  looks: { flexDirection: "row", gap: 10, paddingVertical: 2, paddingHorizontal: 2 },
  look: { alignItems: "center", gap: 2 },
  // The outline sits on a 2px transparent border, so choosing a look doesn't move anything.
  thumb: { borderRadius: 8, borderWidth: 2, borderColor: "transparent", overflow: "hidden" },
  thumbPressed: { borderColor: colors.accent },
  name: { fontSize: 12 },
  namePressed: { color: colors.accent, fontWeight: "700" },
});
