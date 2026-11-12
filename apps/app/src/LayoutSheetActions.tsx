// What the layout editor's sheets offer once a layout is done. Shared so web and iOS can't drift apart.
import { StyleSheet, Text, View } from "react-native";
import { navigate } from "./platform/route";
import { Actions, QuietActions } from "./ui/Actions";
import { Button } from "./ui/Button";
import { Choice } from "./ui/Choice";
import { colors, fontFamily, MIN_TARGET } from "./theme";
import type { BlankKind, useLayoutEditor } from "./useLayoutEditor";

interface Props {
  editor: ReturnType<typeof useLayoutEditor>;
}

/** Signed in: name it and save it, or use it just this once. */
export function SaveActions({ editor }: Props) {
  const busy = editor.saving?.busy;
  return (
    <Actions>
      <Button label={busy ? "Saving…" : editor.saveLabel} primary disabled={busy} onPress={() => void editor.save()} />
      <Button label="Use without saving" onPress={editor.use} />
      <QuietActions>
        <Button label="Keep editing" quiet onPress={() => editor.setSaving(null)} />
      </QuietActions>
    </Actions>
  );
}

/** Signed out: an account only keeps the layout for later, so using it comes first and needs none. */
export function UseActions({ editor }: Props) {
  return (
    <Actions>
      <Button label="Use this layout" primary onPress={editor.use} />
      <Button label="Create account to save" onPress={() => navigate("/sign-up")} />
      <QuietActions>
        <Button label="Sign in" quiet onPress={() => navigate("/account")} />
        <Button label="Keep editing" quiet onPress={() => editor.setSaving(null)} />
      </QuietActions>
    </Actions>
  );
}

const KINDS: { kind: BlankKind; label: string }[] = [
  { kind: "grid", label: "Grid" },
  { kind: "shapes", label: "Shapes" },
];

/** How a blank frame starts, until the first edit: one cell to split into a grid, or shapes to add and move. */
export function BlankChoice({ editor }: Props) {
  return (
    <View role="radiogroup" aria-label="Start with" style={styles.row}>
      {KINDS.map(({ kind, label }) => {
        const checked = editor.blankKind === kind;
        return (
          <Choice key={kind} role="radio" aria-checked={checked} aria-label={label} onPress={() => editor.chooseBlank(kind)} style={[styles.choice, checked && styles.checked]}>
            <Text style={[styles.label, checked && styles.checkedLabel]}>{label}</Text>
          </Choice>
        );
      })}
    </View>
  );
}

/** The dashed outline of the cell being drawn. `box` is in px from the preview's top left. */
export function DrawOutline({ box }: { box: { left: number; top: number; width: number; height: number } }) {
  return <View pointerEvents="none" style={[styles.outline, box]} />;
}

const styles = StyleSheet.create({
  outline: { position: "absolute", borderWidth: 3, borderStyle: "dashed", borderColor: colors.accent },
  row: { flexDirection: "row", gap: 8 },
  choice: { flex: 1, minHeight: MIN_TARGET, alignItems: "center", justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  checked: { borderColor: colors.accent, backgroundColor: colors.accent },
  label: { fontFamily, fontSize: 15, fontWeight: "700", color: colors.text },
  checkedLabel: { color: colors.accentText },
});
