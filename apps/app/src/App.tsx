import { StyleSheet, Text, View } from "react-native";

/** The Expo app replacing apps/web: screens arrive here as they're ported. */
export default function App() {
  return (
    <View style={styles.page} role="main">
      <Text role="heading" aria-level={1} style={styles.title}>
        StoryStitch
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#2b1340" },
  title: { fontSize: 32, fontWeight: "700", color: "#fff" },
});
