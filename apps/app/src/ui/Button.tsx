import { Pressable, StyleSheet, Text } from "react-native";
import { MIN_TARGET, colors, fontFamily } from "../theme";

interface Props {
  label: string;
  onPress: () => void;
  /** Gold, for the one thing to tap. */
  primary?: boolean;
  big?: boolean;
  disabled?: boolean;
}

export function Button({ label, onPress, primary, big, disabled }: Props) {
  return (
    <Pressable
      role="button"
      aria-label={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, primary && styles.primary, big && styles.big, disabled && styles.disabled]}
    >
      <Text style={[styles.label, primary && styles.primaryLabel, big && styles.bigLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MIN_TARGET,
    minWidth: MIN_TARGET,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
  },
  primary: { borderColor: colors.accent, backgroundColor: colors.accent },
  big: { minHeight: 56, paddingHorizontal: 32 },
  disabled: { opacity: 0.55 },
  label: { fontFamily, fontSize: 16, fontWeight: "700", color: colors.text },
  primaryLabel: { color: colors.accentText },
  bigLabel: { fontSize: 18, fontWeight: "800" },
});
