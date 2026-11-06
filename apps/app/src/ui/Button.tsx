import type { UsageControl } from "@storystitch/shared";
import { Pressable, StyleSheet, Text } from "react-native";
import { MIN_TARGET, colors, fontFamily } from "../theme";
import { track } from "../usage";

export interface ButtonProps {
  label: string;
  /** Said instead of the label, when the label is only a symbol. */
  name?: string;
  onPress: () => void;
  /** Gold, for the one thing to tap. */
  primary?: boolean;
  /** Text only, in smaller type. See Actions.tsx for which to use. */
  quiet?: boolean;
  /** Reads as destructive: filled when primary, red text when quiet. */
  danger?: boolean;
  big?: boolean;
  disabled?: boolean;
  /** Counts presses in usage reports, under this name. Never the label: labels can hold what the user typed. */
  trackAs?: UsageControl;
}

export function Button({ label, name, onPress, primary, quiet, danger, big, disabled, trackAs }: ButtonProps) {
  return (
    <Pressable
      role="button"
      aria-label={name ?? label}
      disabled={disabled}
      onPress={() => {
        if (trackAs) track("control_pressed", { control: trackAs });
        onPress();
      }}
      style={[styles.button, primary && styles.primary, danger && styles.danger, quiet && quietStyles.button, big && styles.big, disabled && styles.disabled]}
    >
      <Text style={[styles.label, name !== undefined && styles.symbol, primary && styles.primaryLabel, quiet && quietStyles.label, quiet && danger && styles.dangerLabel, big && styles.bigLabel]}>{label}</Text>
    </Pressable>
  );
}

/** Shared with links, which look the same as quiet buttons. */
export const quietStyles = StyleSheet.create({
  button: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 10, borderColor: "transparent", backgroundColor: "transparent" },
  label: { fontFamily, fontSize: 14, fontWeight: "600", color: colors.text },
});

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
  danger: { borderColor: colors.danger, backgroundColor: colors.danger },
  big: { minHeight: 56, paddingHorizontal: 32 },
  disabled: { opacity: 0.55 },
  label: { fontFamily, fontSize: 16, fontWeight: "700", color: colors.text },
  symbol: { fontSize: 34 },
  primaryLabel: { color: colors.accentText },
  dangerLabel: { color: colors.danger },
  bigLabel: { fontSize: 18, fontWeight: "800" },
});
