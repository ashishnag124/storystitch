import type { Scene } from "@storystitch/client";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { Diagram } from "./platform/Diagram";
import { colors, fontFamily } from "./theme";
import { Choice } from "./ui/Choice";

interface Props {
  options: Scene[];
  current: Scene;
  onSelect: (option: Scene) => void;
  /** Ids of the user's own saved layouts among the options, marked "Yours". */
  mine?: Set<string>;
}

/** Each layout option drawn as a plain diagram of its cells. */
export function LayoutStrip({ options, current, onSelect, mine }: Props) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
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
}

const styles = StyleSheet.create({
  strip: { flexDirection: "row", gap: 10, paddingVertical: 4, paddingHorizontal: 2 },
  thumb: { padding: 3, borderWidth: 2, borderColor: "transparent", borderRadius: 10 },
  checked: { borderColor: colors.accent, transform: [{ scale: 1.04 }] },
  yours: { position: "absolute", top: -2, alignSelf: "center", paddingHorizontal: 6, borderRadius: 999, overflow: "hidden", backgroundColor: colors.accent, color: colors.accentText, fontFamily, fontSize: 11, fontWeight: "800" },
});
