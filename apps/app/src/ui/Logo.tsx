import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

/** The logo: a 9:16 Story frame split into cells, like a collage. */
export function Logo() {
  return (
    <View aria-hidden style={styles.logo}>
      <View style={styles.top} />
      <View style={styles.corner} />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 16, height: 28, margin: 1, borderRadius: 3, backgroundColor: colors.coral, overflow: "hidden" },
  top: { height: 13, borderRadius: 3, backgroundColor: colors.accent },
  corner: { position: "absolute", right: 1, bottom: 1, width: 6.5, height: 12.5, borderRadius: 2, backgroundColor: colors.pink },
});
