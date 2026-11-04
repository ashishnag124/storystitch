import { StyleSheet, Text, View } from "react-native";
import { MIN_TARGET, colors, fontFamily, type } from "../theme";
import { Choice } from "../ui/Choice";
import type { ExportFormat } from "./exportImage.native";

const FORMATS: { value: ExportFormat; label: string }[] = [
  { value: "image/jpeg", label: "JPEG" },
  { value: "image/png", label: "PNG" },
];

export function FormatSelect({ value, onChange }: { value: ExportFormat; onChange: (format: ExportFormat) => void }) {
  return (
    <View role="radiogroup" aria-label="Format" style={styles.row}>
      <Text style={type.hint}>Format</Text>
      {FORMATS.map((f) => (
        <Choice key={f.value} role="radio" aria-checked={value === f.value} aria-label={f.label} onPress={() => onChange(f.value)} style={[styles.chip, value === f.value && styles.checked]}>
          <Text style={[styles.label, value === f.value && styles.checkedLabel]}>{f.label}</Text>
        </Choice>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  chip: { minHeight: MIN_TARGET, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  checked: { borderColor: colors.accent, backgroundColor: colors.accent },
  label: { fontFamily, fontSize: 14, color: colors.text },
  checkedLabel: { fontWeight: "800", color: colors.accentText },
});
