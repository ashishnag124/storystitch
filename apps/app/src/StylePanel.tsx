import { DEFAULT_BACKGROUND, DEFAULT_STYLE, backgroundOf, borderOf, pickedBackground, type Style } from "@storystitch/client";
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

/** A small drawing of what each tool changes, so the row reads as tools and not as labels. */
function Glyph({ property, ink, fill }: { property: Property; ink: string; fill: string }) {
  switch (property) {
    case "background":
      return <View aria-hidden style={[glyphs.box, glyphs.dot, { backgroundColor: fill, borderColor: ink }]} />;
    case "gap":
      return (
        <View aria-hidden style={[glyphs.box, glyphs.split]}>
          <View style={[glyphs.bar, { backgroundColor: ink }]} />
          <View style={[glyphs.bar, { backgroundColor: ink }]} />
        </View>
      );
    case "margin":
      return (
        <View aria-hidden style={[glyphs.box, glyphs.frame, { borderColor: ink }]}>
          <View style={[glyphs.inner, { backgroundColor: ink }]} />
        </View>
      );
    case "radius":
      return <View aria-hidden style={[glyphs.box, glyphs.corner, { borderColor: ink }]} />;
    case "border":
      return <View aria-hidden style={[glyphs.box, glyphs.thick, { borderColor: ink }]} />;
  }
}

interface Props {
  layout: Layout;
  style: Style;
  onChange: (style: Style) => void;
}

/**
 * Style as a compact tool, like a photo app's "Adjust": a row of tool buttons picks the property, and one control
 * for it shows below. The defaults should look good without touching anything.
 */
export function StylePanel({ layout, style, onChange }: Props) {
  const [property, setProperty] = useState<Property>("background");
  const picked = pickedBackground(layout, style);
  const background = backgroundOf(layout, style);
  const isPreset = picked.kind === "color" && SWATCHES.some((s) => s.color === picked.color);
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
      {/* Every tool fits on one row, even on an SE, so none hides off the edge. */}
      <View style={styles.tools}>
        <View role="radiogroup" aria-label="Style property" style={styles.properties}>
          {PROPERTIES.map((p) => {
            const checked = property === p.id;
            const ink = checked ? colors.accentText : colors.text;
            return (
              <Choice key={p.id} role="radio" aria-checked={checked} aria-label={p.label} onPress={() => setProperty(p.id)} style={[styles.toolButton, checked && styles.toolChecked]}>
                <Glyph property={p.id} ink={ink} fill={background.kind === "color" ? background.color : colors.muted} />
                <Text numberOfLines={1} style={[styles.toolLabel, { color: ink }, checked && styles.toolLabelChecked]}>
                  {p.label}
                </Text>
              </Choice>
            );
          })}
        </View>
        <Pressable role="button" aria-label="Reset style" onPress={() => onChange({ ...DEFAULT_STYLE, auto: style.auto })} style={[styles.toolButton, styles.reset]}>
          <Text aria-hidden style={styles.resetGlyph}>
            ↺
          </Text>
          <Text numberOfLines={1} style={[styles.toolLabel, { color: colors.muted }]}>
            Reset
          </Text>
        </Pressable>
      </View>

      {property === "background" && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View role="group" aria-label="Color" style={styles.swatches}>
            <Pressable
              role="button"
              aria-label="Auto"
              aria-pressed={picked.kind === "auto"}
              accessibilityState={{ selected: picked.kind === "auto" }}
              onPress={() => set({ background: { kind: "auto" } })}
              style={[styles.swatch, styles.auto, { backgroundColor: style.auto }, picked.kind === "auto" && styles.swatchPressed]}
            >
              <Text style={styles.autoLabel}>Auto</Text>
            </Pressable>
            {SWATCHES.map((s) => {
              const pressed = picked.kind === "color" && picked.color === s.color;
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
              aria-pressed={picked.kind === "blur"}
              accessibilityState={{ selected: picked.kind === "blur" }}
              onPress={() => set({ background: { kind: "blur" } })}
              style={[styles.swatch, picked.kind === "blur" && styles.swatchPressed]}
            >
              <BlurFace />
            </Pressable>
            <CustomSwatch
              value={background.kind === "color" ? background.color : DEFAULT_BACKGROUND.color}
              checked={picked.kind === "color" && !isPreset}
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
  tools: { flexDirection: "row", gap: 4 },
  // Five tools and Reset, each about the same width.
  properties: { flex: 5, flexDirection: "row", gap: 4 },
  toolButton: { flex: 1, minHeight: 52, alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 2, borderRadius: 12, backgroundColor: "rgba(255, 244, 232, 0.08)" },
  toolChecked: { backgroundColor: colors.accent },
  toolLabel: { fontFamily, fontSize: 12, fontWeight: "600" },
  toolLabelChecked: { fontWeight: "800" },
  // Reset is an action, not a tool: quiet, with no fill.
  reset: { flex: 0.8, backgroundColor: "transparent" },
  resetGlyph: { fontFamily, fontSize: 18, lineHeight: 20, color: colors.muted },
  swatches: { flexDirection: "row", gap: 8, paddingVertical: 4, paddingLeft: 2, paddingRight: 4 },
  swatch: { width: MIN_TARGET, height: MIN_TARGET, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  auto: { alignItems: "center", justifyContent: "center" },
  // Auto is always pale, so its label is always dark.
  autoLabel: { fontFamily, fontSize: 11, fontWeight: "700", color: "#3d3a36" },
  swatchPressed: { boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 4px ${colors.accent}` },
  borderRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  borderSlider: { flex: 1 },
});

const glyphs = StyleSheet.create({
  box: { width: 20, height: 20 },
  dot: { borderRadius: 10, borderWidth: 1.5 },
  split: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 1 },
  bar: { width: 7, height: 20, borderRadius: 2 },
  frame: { alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderRadius: 3 },
  inner: { width: 10, height: 10, borderRadius: 1 },
  corner: { borderTopWidth: 2.5, borderLeftWidth: 2.5, borderTopLeftRadius: 12 },
  thick: { borderWidth: 4, borderRadius: 4 },
});
