import { Linking, Pressable, StyleSheet, Text } from "react-native";
import { navigate } from "../platform/route";
import { MIN_TARGET, colors, fontFamily } from "../theme";

/** A button-shaped in-app link. */
export function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Pressable role="link" aria-label={label} onPress={() => navigate(to)} style={styles.link}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

/** A link inside a sentence. */
export const TextLink = ({ to, children }: { to: string; children: string }) => (
  <Text role="link" {...{ tabIndex: 0 }} onPress={() => navigate(to)} style={styles.inline}>
    {children}
  </Text>
);

/** A link inside a sentence that leaves the app, to a page in the browser. */
export const ExternalLink = ({ url, children }: { url: string; children: string }) => (
  <Text role="link" {...{ tabIndex: 0 }} onPress={() => void Linking.openURL(url)} style={styles.inline}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  link: { minHeight: MIN_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 18, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  label: { fontFamily, fontSize: 16, fontWeight: "700", color: colors.text },
  inline: { color: colors.accent, textDecorationLine: "underline" },
});
