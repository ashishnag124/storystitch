import { DEFAULT_BACKGROUND, DEFAULT_STYLE, backgroundOf, borderOf, type Style } from "@storystitch/client";
import type { Layout } from "@storystitch/shared";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurFace, BorderColor, CustomSwatch } from "./platform/ColorInputs";
import { Slider } from "./platform/Slider";
import { MIN_TARGET, colors, fontFamily, type } from "./theme";
import { Choice } from "./ui/Choice";

const SWATCHES = [
  { name: "Cream", color: "#f4efe6" },
  { name: "White", color: "#ffffff" },
  { name: "Black", color: "#111111" },
  { name: "Sage", color: "#d9e4d3" },
  { name: "Blush", color: "#f6d9d5" },
  { name: "Navy", color: "#1e3a5f" },
] as const;

/** Slider ranges, in pixels of the 1080-wide export. */
const RANGES = { gap: 48, margin: 96, radius: 60, border: 40 } as const;

const PROPERTIES = [
  { id: "background", label: "Color" },
  { id: "gap", label: "Spacing" },
  { id: "margin", label: "Margin" },
  { id: "radius", label: "Corners" },
  { id: "border", label: "Border" },
] as const;
type Property = (typeof PROPERTIES)[number]["id"];

interface Props {
  layout: Layout;
  style: Style;
  onChange: (style: Style) => void;
}

/**
 * Style as a compact tool, like a photo app's "Adjust": chips pick the property, and one control for it shows
 * below. The defaults should look good without touching anything.
 */
export function StylePanel({ layout, style, onChange }: Props) {
  const [property, setProperty] = useState<Property>("background");
  const background = backgroundOf(layout, style);
  const isPreset = background.kind === "color" && SWATCHES.some((s) => s.color === background.color);
  const set = (patch: Partial<Style>) => onChange({ ...style, ...patch });

  const slider = (key: keyof typeof RANGES, label: string, value: number) => (
    <Slider
      label={label}
      min={0}
      max={RANGES[key]}
      step={1}
      value={value}
      display={String(value)}
      disabled={layout.bleed}
      onChange={(v) => set({ [key]: v })}
    />
  );

  return (
    <View style={styles.tool}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <View role="radiogroup" aria-label="Style property" style={styles.chips}>
          {PROPERTIES.map((p) => {
            const checked = property === p.id;
            return (
              <Choice key={p.id} role="radio" aria-checked={checked} aria-label={p.label} onPress={() => setProperty(p.id)} style={[styles.chip, checked && styles.chipChecked]}>
                <Text style={[styles.chipLabel, checked && styles.chipLabelChecked]}>{p.label}</Text>
              </Choice>
            );
          })}
        </View>
        <Pressable role="button" aria-label="Reset style" onPress={() => onChange(DEFAULT_STYLE)} style={styles.chip}>
          <Text style={styles.chipLabel}>Reset style</Text>
        </Pressable>
      </ScrollView>

      {property === "background" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View role="group" aria-label="Color" style={styles.swatches}>
            {SWATCHES.map((s) => {
              const pressed = background.kind === "color" && background.color === s.color;
              return (
                <Pressable
                  key={s.color}
                  role="button"
                  aria-label={s.name}
                  aria-pressed={pressed}
                  accessibilityState={{ selected: pressed }}
                  onPress={() => set({ background: { kind: "color", color: s.color } })}
                  style={[styles.swatch, { backgroundColor: s.color }, pressed && styles.swatchPressed]}
                />
              );
            })}
            <Pressable
              role="button"
              aria-label="Blurred photo"
              aria-pressed={background.kind === "blur"}
              accessibilityState={{ selected: background.kind === "blur" }}
              onPress={() => set({ background: { kind: "blur" } })}
              style={[styles.swatch, background.kind === "blur" && styles.swatchPressed]}
            >
              <BlurFace />
            </Pressable>
            <CustomSwatch
              value={background.kind === "color" ? background.color : DEFAULT_BACKGROUND.color}
              checked={background.kind === "color" && !isPreset}
              onChange={(color) => set({ background: { kind: "color", color } })}
            />
          </View>
        </ScrollView>
      )}
      {property !== "background" && layout.bleed && <Text style={type.hint}>This layout runs to the edges, so it has no spacing or border.</Text>}
      {property === "gap" && slider("gap", "Spacing", style.gap)}
      {property === "margin" && slider("margin", "Margin", style.margin)}
      {property === "radius" && slider("radius", "Corners", style.radius)}
      {property === "border" && (
        <View style={styles.borderRow}>
          <View style={styles.borderSlider}>{slider("border", "Border", borderOf(layout, style))}</View>
          <BorderColor value={style.borderColor} disabled={layout.bleed} onChange={(borderColor) => set({ borderColor })} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tool: { gap: 6 },
  chips: { flexDirection: "row", gap: 6 },
  chip: { minHeight: MIN_TARGET, justifyContent: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  chipChecked: { borderColor: colors.accent, backgroundColor: colors.accent },
  chipLabel: { fontFamily, fontSize: 14, color: colors.text },
  chipLabelChecked: { fontWeight: "800", color: colors.accentText },
  swatches: { flexDirection: "row", gap: 8, paddingVertical: 4, paddingLeft: 2, paddingRight: 4 },
  swatch: { width: MIN_TARGET, height: MIN_TARGET, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  swatchPressed: { boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 4px ${colors.accent}` },
  borderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  borderSlider: { flex: 1 },
});
