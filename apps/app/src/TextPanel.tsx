import {
  CAPTION_COLORS,
  CAPTION_FONTS,
  CAPTION_FONT_NAMES,
  CAPTION_SIZE,
  MAX_CAPTIONS,
  MAX_CAPTION_CHARS,
  addCaption,
  removeCaption,
  updateCaption,
  type Caption,
} from "@storystitch/client";
import { STORY_CANVAS } from "@storystitch/shared";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { loadCaptionFonts } from "./platform/captionFonts";
import { Slider } from "./platform/Slider";
import { MIN_TARGET, colors, fontFamily, type } from "./theme";
import { Button } from "./ui/Button";
import { Choice } from "./ui/Choice";

interface Props {
  captions: Caption[];
  /** The caption being edited. */
  selected: number | null;
  onChange: (captions: Caption[]) => void;
  onSelect: (index: number | null) => void;
}

const LIMIT_HINT = `Up to ${MAX_CAPTIONS} captions. Remove one to add another.`;

/** A square tool button with a drawn icon and a spoken name. */
function IconButton({ name, onPress, children }: { name: string; onPress: () => void; children: ReactNode }) {
  return (
    <Pressable role="button" aria-label={name} onPress={onPress} style={styles.icon}>
      {children}
    </Pressable>
  );
}

/**
 * The Text tool, in three rows so the preview stays large: the chosen caption's text with add and remove, its font,
 * then its color and size. Nothing here is gold-filled: Share stays the one primary action on screen.
 */
export function TextPanel({ captions, selected, onChange, onSelect }: Props) {
  // The fonts load the first time the tool opens, so a new caption draws in its own font straight away.
  useEffect(() => void loadCaptionFonts().catch(console.error), []);
  const [limitHint, setLimitHint] = useState(false);
  const caption = selected === null ? undefined : captions[selected];
  const set = (patch: Partial<Caption>) => onChange(updateCaption(captions, selected!, patch));
  const add = () => {
    // At the limit, "+" explains itself instead of doing nothing.
    if (captions.length >= MAX_CAPTIONS) return setLimitHint(true);
    onChange(addCaption(captions));
    onSelect(captions.length);
  };

  if (!caption) {
    return (
      <View style={styles.tool}>
        <Text style={type.hint}>{captions.length ? "Tap a caption to change it, or drag it to move it." : "Add a caption, a date or a place."}</Text>
        <Button label="Add text" onPress={add} />
        {limitHint && captions.length >= MAX_CAPTIONS && <Text style={type.hint}>{LIMIT_HINT}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.tool}>
      <View style={styles.row}>
        <TextInput aria-label="Caption text" value={caption.text} onChangeText={(text) => set({ text })} multiline maxLength={MAX_CAPTION_CHARS} style={styles.input} />
        <IconButton name="Add text" onPress={add}>
          <View style={[styles.plusBar, styles.plusAcross]} />
          <View style={[styles.plusBar, styles.plusDown]} />
        </IconButton>
        <IconButton
          name="Remove text"
          onPress={() => {
            onChange(removeCaption(captions, selected!));
            onSelect(null);
            setLimitHint(false);
          }}
        >
          <View style={styles.lid} />
          <View style={styles.can} />
        </IconButton>
      </View>
      {limitHint && captions.length >= MAX_CAPTIONS && <Text style={type.hint}>{LIMIT_HINT}</Text>}
      <View role="radiogroup" aria-label="Font" style={styles.row}>
        {CAPTION_FONTS.map((font) => {
          const checked = caption.font === font;
          return (
            <Choice key={font} role="radio" aria-checked={checked} aria-label={CAPTION_FONT_NAMES[font]} onPress={() => set({ font })} style={styles.fontTarget}>
              <View style={[styles.font, checked && styles.fontChecked]}>
                {/* Each label in its own font (loaded by loadCaptionFonts under this name on web and iOS). */}
                <Text numberOfLines={1} style={[styles.fontLabel, { fontFamily: `StoryStitch ${CAPTION_FONT_NAMES[font]}` }, checked && styles.fontLabelChecked]}>
                  {CAPTION_FONT_NAMES[font]}
                </Text>
              </View>
            </Choice>
          );
        })}
      </View>
      <View style={styles.row}>
        {/* The dots scroll sideways when they don't all fit beside the slider. */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} role="group" aria-label="Text color" style={styles.colorScroll} contentContainerStyle={styles.colors}>
          {CAPTION_COLORS.map((c) => {
            const pressed = caption.color === c.color;
            return (
              <Pressable
                key={c.color}
                role="button"
                aria-label={c.name}
                aria-pressed={pressed}
                accessibilityState={{ selected: pressed }}
                onPress={() => set({ color: c.color })}
                style={styles.swatchTarget}
              >
                <View style={[styles.swatch, { backgroundColor: c.color }, pressed && styles.swatchPressed]} />
              </Pressable>
            );
          })}
        </ScrollView>
        <Slider
          label="Size"
          bare
          min={CAPTION_SIZE.min}
          max={CAPTION_SIZE.max}
          step={0.005}
          value={caption.size}
          display={String(Math.round(caption.size * STORY_CANVAS.width))}
          onChange={(size) => set({ size })}
        />
      </View>
    </View>
  );
}

const SWATCH = 28;

const styles = StyleSheet.create({
  tool: { gap: 4, paddingVertical: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  input: {
    flex: 1,
    minHeight: MIN_TARGET,
    maxHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily,
    fontSize: 16,
  },
  icon: { width: MIN_TARGET, height: MIN_TARGET, alignItems: "center", justifyContent: "center" },
  plusBar: { position: "absolute", borderRadius: 1, backgroundColor: colors.text },
  plusAcross: { width: 18, height: 2.5 },
  plusDown: { width: 2.5, height: 18 },
  // A bin: a lid, then a can that narrows a little.
  lid: { width: 16, height: 2.5, marginBottom: 1.5, borderRadius: 1, backgroundColor: colors.text },
  can: { width: 12, height: 13, borderWidth: 2, borderTopWidth: 0, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, borderColor: colors.text },
  // A 44 pt target around a shorter pill.
  fontTarget: { flex: 1, minHeight: MIN_TARGET, justifyContent: "center" },
  font: { height: 36, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  fontChecked: { borderColor: colors.accent },
  fontLabel: { fontSize: 15, color: colors.text },
  fontLabelChecked: { color: colors.accent },
  colorScroll: { flexGrow: 0, flexShrink: 1, maxWidth: "62%" },
  colors: { flexDirection: "row", alignItems: "center" },
  // Each dot keeps a 44 pt target; neighbouring targets touch.
  swatchTarget: { width: MIN_TARGET, height: MIN_TARGET, alignItems: "center", justifyContent: "center" },
  swatch: { width: SWATCH, height: SWATCH, borderWidth: 1, borderColor: colors.border, borderRadius: SWATCH / 2 },
  swatchPressed: { boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 4px ${colors.accent}` },
});
