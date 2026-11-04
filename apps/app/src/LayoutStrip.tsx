import type { Scene } from "@storystitch/client";
import { ScrollView, StyleSheet, View } from "react-native";
import { Diagram } from "./platform/Diagram";
import { colors } from "./theme";
import { Choice } from "./ui/Choice";

interface Props {
  options: Scene[];
  current: Scene;
  onSelect: (option: Scene) => void;
}

/** Each layout option drawn as a plain diagram of its cells. */
export function LayoutStrip({ options, current, onSelect }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View role="radiogroup" aria-label="Layouts" style={styles.strip}>
        {options.map((option) => {
          const checked = option.layout.id === current.layout.id;
          return (
            <Choice
              key={option.layout.id}
              role="radio"
              aria-checked={checked}
              aria-label={option.layout.name}
              onPress={() => onSelect(option)}
              style={[styles.thumb, checked && styles.checked]}
            >
              <Diagram option={option} checked={checked} />
            </Choice>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  thumb: { padding: 3, borderWidth: 2, borderColor: "transparent", borderRadius: 10 },
  checked: { borderColor: colors.accent, transform: [{ scale: 1.04 }] },
});
