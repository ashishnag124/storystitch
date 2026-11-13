import type { Scene } from "@storystitch/client";
import { useEffect, useRef, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { Diagram } from "./platform/Diagram";
import { colors, fontFamily } from "./theme";
import { Choice } from "./ui/Choice";

interface Props {
  options: Scene[];
  current: Scene;
  onSelect: (option: Scene) => void;
  /** Ids of the user's own saved layouts among the options, marked "Yours". */
  mine?: Set<string>;
  /** Shown first in the strip, pinned while the layouts scroll, as tall as they are (Shuffle). */
  leading?: ReactNode;
}

/** Each layout option drawn as a plain diagram of its cells. With `leading`, the chosen one scrolls into view. */
export function LayoutStrip({ options, current, onSelect, mine, leading }: Props) {
  const scroll = useRef<ScrollViewInstance>(null);
  const view = useRef({ x: 0, width: 0 });
  const thumbs = useRef(new Map<string, { x: number; width: number }>());
  // Shuffle can choose a layout scrolled out of sight.
  const follow = Boolean(leading);
  useEffect(() => {
    const thumb = thumbs.current.get(current.layout.id);
    const { x, width } = view.current;
    if (!follow || !thumb || !width) return;
    if (thumb.x < x) scroll.current?.scrollTo({ x: thumb.x, animated: true });
    else if (thumb.x + thumb.width > x + width) scroll.current?.scrollTo({ x: thumb.x + thumb.width - width, animated: true });
  }, [current.layout.id, follow]);

  const strip = (
    <ScrollView
      ref={scroll}
      horizontal
      showsHorizontalScrollIndicator={false}
      scrollEventThrottle={32}
      onScroll={(e) => (view.current.x = e.nativeEvent.contentOffset.x)}
      onLayout={(e) => (view.current.width = e.nativeEvent.layout.width)}
    >
      <View role="radiogroup" aria-label="Layouts" style={styles.strip}>
        {options.map((option) => {
          const checked = option.layout.id === current.layout.id;
          const yours = mine?.has(option.layout.id);
          return (
            <Choice
              key={option.layout.id}
              role="radio"
              aria-checked={checked}
              aria-label={yours ? `${option.layout.name} (yours)` : option.layout.name}
              onPress={() => onSelect(option)}
              onLayout={(e) => thumbs.current.set(option.layout.id, { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width })}
              style={[styles.thumb, checked && styles.checked]}
            >
              <Diagram option={option} checked={checked} />
              {yours && (
                <Text aria-hidden style={styles.yours}>
                  Yours
                </Text>
              )}
            </Choice>
          );
        })}
      </View>
    </ScrollView>
  );
  if (!leading) return strip;
  return (
    <View style={styles.row}>
      {leading}
      <View style={styles.fill}>{strip}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  /** `leading` stretches to the strip's height. */
  row: { flexDirection: "row" },
  fill: { flex: 1, minWidth: 0 },
  strip: { flexDirection: "row", gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  thumb: { padding: 3, borderWidth: 2, borderColor: "transparent", borderRadius: 10 },
  checked: { borderColor: colors.accent, transform: [{ scale: 1.04 }] },
  yours: { position: "absolute", top: -2, alignSelf: "center", paddingHorizontal: 6, borderRadius: 999, overflow: "hidden", backgroundColor: colors.accent, color: colors.accentText, fontFamily, fontSize: 11, fontWeight: "800" },
});
