import { Canvas, Circle, RadialGradient, SweepGradient, vec } from "@shopify/react-native-skia";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TARGET, colors, type } from "../theme";
import { Button } from "../ui/Button";
import { prefersReducedMotion } from "./motion.native";
import { Slider } from "./Slider.native";

/** A color as `#rrggbb`, from hue (0–360), saturation and lightness (0–100). */
function hslToHex(h: number, s: number, l: number) {
  const [sat, light] = [s / 100, l / 100];
  const a = sat * Math.min(light, 1 - light);
  const part = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, "0");
  };
  return `#${part(0)}${part(8)}${part(4)}`;
}

function ColorSheet({ title, onChoose, onClose }: { title: string; onChoose: (color: string) => void; onClose: () => void }) {
  const [hsl, setHsl] = useState({ h: 200, s: 60, l: 50 });
  const set = (patch: Partial<typeof hsl>) => {
    const next = { ...hsl, ...patch };
    setHsl(next);
    onChoose(hslToHex(next.h, next.s, next.l));
  };
  return (
    <Modal transparent animationType={prefersReducedMotion() ? "none" : "slide"} onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View role="dialog" aria-modal aria-label={title} style={styles.sheet}>
          <View style={styles.heading}>
            <Text role="heading" aria-level={2} style={type.title}>
              {title}
            </Text>
            <View style={[styles.preview, { backgroundColor: hslToHex(hsl.h, hsl.s, hsl.l) }]} />
          </View>
          <Slider label="Hue" min={0} max={360} step={1} value={hsl.h} display={String(hsl.h)} onChange={(h) => set({ h })} />
          <Slider label="Strength" min={0} max={100} step={1} value={hsl.s} display={String(hsl.s)} onChange={(s) => set({ s })} />
          <Slider label="Light" min={0} max={100} step={1} value={hsl.l} display={String(hsl.l)} onChange={(l) => set({ l })} />
          <Button label="Done" primary onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const RAINBOW = ["#f87171", "#facc15", "#4ade80", "#60a5fa", "#c084fc", "#f87171"];
const R = MIN_TARGET / 2;

/** The round swatch that opens the color sheet. */
export function CustomSwatch({ checked, onChange }: { value: string; checked: boolean; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable role="button" aria-label="Custom background color" aria-pressed={checked} accessibilityState={{ selected: checked }} onPress={() => setOpen(true)} style={[styles.swatch, checked && styles.checked]}>
        <Canvas style={styles.face}>
          <Circle cx={R} cy={R} r={R}>
            <SweepGradient c={vec(R, R)} colors={RAINBOW} />
          </Circle>
        </Canvas>
      </Pressable>
      {open && <ColorSheet title="Background color" onChoose={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

export function BorderColor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable role="button" aria-label="Border color" disabled={disabled} onPress={() => setOpen(true)} style={[styles.border, { backgroundColor: value }]} />
      {open && <ColorSheet title="Border color" onChoose={onChange} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A soft blurry circle, standing for the blurred photo. */
export const BlurFace = () => (
  <Canvas style={styles.face}>
    <Circle cx={R} cy={R} r={R}>
      <RadialGradient c={vec(R * 0.7, R * 0.7)} r={R * 1.6} colors={["#f2c6a0", "#7aa0c4", "#6b8f5e"]} />
    </Circle>
  </Canvas>
);

const styles = StyleSheet.create({
  swatch: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: R, overflow: "hidden" },
  checked: { boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 4px ${colors.accent}` },
  face: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: R },
  border: { width: MIN_TARGET, height: MIN_TARGET, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.5)" },
  sheet: { gap: 12, padding: 20, paddingBottom: 36, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  preview: { width: MIN_TARGET, height: MIN_TARGET, borderRadius: R },
});
