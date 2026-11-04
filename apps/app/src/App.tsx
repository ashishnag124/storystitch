import { StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { type } from "./theme";
import { Screen } from "./ui/Screen";

/** The Expo app replacing apps/web: screens arrive here as they're ported. */
export default function App() {
  return (
    <SafeAreaProvider>
      <Screen>
        <View style={styles.page} role="main">
          <Text role="heading" aria-level={1} style={type.title}>
            StoryStitch
          </Text>
        </View>
      </Screen>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center" },
});
