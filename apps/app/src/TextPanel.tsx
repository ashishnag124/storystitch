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
import { useEffect } from "react";
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

/**
 * The Text tool: add up to three captions, and change the chosen one's text, font, color and size. Nothing here is
 * gold-filled: the collage is what's being worked on, and Share stays the one primary action on screen.
 */
export function TextPanel({ captions, selected, onChange, onSelect }: Props) {
  // The fonts load the first time the tool opens, so a new caption draws in its own font straight away.
  useEffect(() => void loadCaptionFonts().catch(console.error), []);
  const caption = selected === null ? undefined : captions[selected];
  const full = captions.length >= MAX_CAPTIONS;
  const set = (patch: Partial<Caption>) => onChange(updateCaption(captions, selected!, patch));

  return (
    <View style={styles.tool}>
      {caption ? (
        <>
          <TextInput
            aria-label="Caption text"
            value={caption.text}
            onChangeText={(text) => set({ text })}
            multiline
            maxLength={MAX_CAPTION_CHARS}
            style={styles.input}
          />
          <View role="radiogroup" aria-label="Font" style={styles.row}>
            {CAPTION_FONTS.map((font) => {
              const checked = caption.font === font;
              return (
                <Choice key={font} role="radio" aria-checked={checked} aria-label={CAPTION_FONT_NAMES[font]} onPress={() => set({ font })} style={[styles.font, checked && styles.fontChecked]}>
                  {/* Each label in its own font (loaded by loadCaptionFonts under this name on web and iOS). */}
                  <Text numberOfLines={1} style={[styles.fontLabel, { fontFamily: `StoryStitch ${CAPTION_FONT_NAMES[font]}` }, checked && styles.fontLabelChecked]}>
                    {CAPTION_FONT_NAMES[font]}
                  </Text>
                </Choice>
              );
            })}
          </View>
          {/* Seven dots fit across 375 px; narrower screens scroll them. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} role="group" aria-label="Text color" contentContainerStyle={styles.colors}>
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
                  style={[styles.swatch, { backgroundColor: c.color }, pressed && styles.swatchPressed]}
                />
              );
            })}
          </ScrollView>
          <Slider
            label="Size"
            min={CAPTION_SIZE.min}
            max={CAPTION_SIZE.max}
            step={0.005}
            value={caption.size}
            display={String(Math.round(caption.size * STORY_CANVAS.width))}
            onChange={(size) => set({ size })}
          />
        </>
      ) : (
        <Text style={type.hint}>{captions.length ? "Tap a caption to change it, or drag it to move it." : "Add a caption, a date or a place."}</Text>
      )}
      <View style={styles.actions}>
        <View>
          <Button
            label="Add text"
            disabled={full}
            onPress={() => {
              onChange(addCaption(captions));
              onSelect(captions.length);
            }}
          />
        </View>
        {caption && (
          <Button
            label="Remove"
            quiet
            onPress={() => {
              onChange(removeCaption(captions, selected!));
              onSelect(null);
            }}
          />
        )}
      </View>
      {full && <Text style={type.hint}>Up to {MAX_CAPTIONS} captions. Remove one to add another.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  tool: { gap: 6, paddingVertical: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  input: {
    minHeight: MIN_TARGET,
    maxHeight: 72,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily,
    fontSize: 16,
  },
  font: { flex: 1, minHeight: MIN_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, borderWidth: 1, borderColor: colors.border, borderRadius: 999 },
  fontChecked: { borderColor: colors.accent },
  fontLabel: { fontSize: 16, color: colors.text },
  fontLabelChecked: { color: colors.accent },
  swatch: { width: MIN_TARGET, height: MIN_TARGET, borderWidth: 1, borderColor: colors.border, borderRadius: 22 },
  swatchPressed: { boxShadow: `0 0 0 2px ${colors.surface}, 0 0 0 4px ${colors.accent}` },
  colors: { flexDirection: "row", gap: 6, padding: 4 },
  // "Add text" on the left, Remove on the right.
  actions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
});
