import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

// Stage 3: drawn with Skia.
export const Diagram = () => <View style={styles.diagram} />;

const styles = StyleSheet.create({ diagram: { width: 54, height: 96, borderRadius: 6, backgroundColor: colors.border } });
