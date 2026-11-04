import { STORY_CANVAS } from "@storystitch/shared";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

// Stage 3: Skia. Until then, an empty 9:16 frame so the shared screens can be checked around it.
export function Stage() {
  return (
    <View style={styles.stage}>
      <View style={styles.frame} />
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: "center", justifyContent: "center", padding: 12 },
  frame: { height: "100%", aspectRatio: STORY_CANVAS.width / STORY_CANVAS.height, borderRadius: 12, backgroundColor: colors.surface },
});
