import type { Draft } from "@storystitch/client";
import { rectsOf, structureLabel, type Candidate } from "@storystitch/client/describe";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fontFamily, type as typography } from "../theme";
import { Actions, QuietActions } from "../ui/Actions";
import { Button } from "../ui/Button";
import { describeAvailability, describeLayouts } from "./describeLayout.native";

const MAX_LENGTH = 200;

const MESSAGES = {
  refused: "That description can't be used. Try describing where the photos go.",
  no_layout: "Couldn't make a layout from that. Try saying how many rows and how many photos in each.",
  unavailable: "Apple Intelligence isn't ready on this iPhone.",
} as const;

const THUMB = { width: 81, height: 144 };

interface Props {
  photoCount: number;
  /** Called with the layout the person picked (or the only one the model made), to open in the layout editor. */
  onLayout: (draft: Draft, adjusted: boolean) => void;
}

/** A layout drawn as its cells, tappable. */
function Option({ candidate, number, photoCount, onPick }: { candidate: Candidate; number: number; photoCount: number; onPick: () => void }) {
  const { layout } = candidate.draft;
  const adjusted = candidate.adjusted ? `. Adjusted to fit your ${photoCount === 1 ? "photo" : `${photoCount} photos`}` : "";
  return (
    <Pressable role="button" aria-label={`Option ${number}: ${structureLabel(layout)}${adjusted}`} onPress={onPick} style={styles.option}>
      <View style={[styles.thumb, THUMB]}>
        {rectsOf(layout).map((c, i) => (
          <View key={i} style={[styles.cell, { left: c.x * THUMB.width + 1.5, top: c.y * THUMB.height + 1.5, width: c.w * THUMB.width - 3, height: c.h * THUMB.height - 3 }]} />
        ))}
      </View>
      <Text aria-hidden style={typography.hint}>
        Option {number}
      </Text>
      {candidate.adjusted && (
        <Text aria-hidden style={styles.adjusted}>
          Adjusted to fit
        </Text>
      )}
    </Pressable>
  );
}

/** "Describe a layout": a quiet action and the sheet it opens. Nothing shows unless the iPhone's on-device model is ready. */
export function DescribeAction({ photoCount, onLayout }: Props) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** The layouts found so far, to pick from. */
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  /** Which request is the current one; a cancelled request's answers are ignored and it stops asking the model. */
  const request = useRef(0);

  useEffect(() => {
    let current = true;
    void describeAvailability().then((state) => current && setAvailable(state === "available"));
    return () => {
      current = false;
    };
  }, []);

  if (!available) return null;

  function choose(candidate: Candidate) {
    request.current++;
    setBusy(false);
    setOpen(false);
    setCandidates([]);
    onLayout(candidate.draft, candidate.adjusted);
  }

  async function make() {
    const id = ++request.current;
    setBusy(true);
    setMessage(null);
    setCandidates([]);
    const result = await describeLayouts(text, photoCount, {
      onProgress: (found) => id === request.current && setCandidates(found),
      cancelled: () => id !== request.current,
    });
    if (id !== request.current) return;
    setBusy(false);
    if (!result.ok) {
      setCandidates([]);
      setMessage(MESSAGES[result.reason]);
    } else if (result.candidates.length === 1) {
      choose(result.candidates[0]!);
    } else {
      setCandidates(result.candidates);
    }
  }

  function close() {
    request.current++;
    setBusy(false);
    setMessage(null);
    setCandidates([]);
    setOpen(false);
  }

  const picking = candidates.length > 0;
  return (
    <>
      <Button label="Describe a layout" quiet trackAs="describe_layout" onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <View role="dialog" aria-label="Describe a layout" style={styles.sheet}>
            {picking ? (
              <>
                <Text role="heading" style={typography.title}>
                  Pick a layout
                </Text>
                <View style={styles.options}>
                  {candidates.map((candidate, i) => (
                    <Option key={candidate.key} candidate={candidate} number={i + 1} photoCount={photoCount} onPick={() => choose(candidate)} />
                  ))}
                </View>
                <Text style={typography.hint}>{busy ? "Looking for more options…" : "Tap the one you want. You can adjust it next."}</Text>
                <Actions>
                  {!busy && <Button label="Try again" onPress={() => void make()} />}
                  <QuietActions>
                    {!busy && <Button label="Change description" quiet onPress={() => setCandidates([])} />}
                    <Button label={busy ? "Cancel" : "Close"} quiet onPress={close} />
                  </QuietActions>
                </Actions>
              </>
            ) : (
              <>
                <Text role="heading" style={typography.title}>
                  Describe a layout
                </Text>
                <TextInput
                  aria-label="Describe your layout"
                  value={text}
                  onChangeText={setText}
                  editable={!busy}
                  multiline
                  maxLength={MAX_LENGTH}
                  placeholder="One big photo on top, three small ones below"
                  placeholderTextColor={colors.muted}
                  style={styles.input}
                />
                <Text style={typography.hint}>
                  Made on this iPhone. Your description and photos never leave it. {photoCount === 1 ? "1 photo" : `${photoCount} photos`}.
                </Text>
                {message && (
                  <Text role="alert" style={typography.body}>
                    {message}
                  </Text>
                )}
                <Actions>
                  <Button label={busy ? "Making your layouts…" : "Make layouts"} primary disabled={busy || text.trim() === ""} onPress={() => void make()} />
                  <QuietActions>
                    <Button label={busy ? "Cancel" : "Close"} quiet onPress={close} />
                  </QuietActions>
                </Actions>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.5)" },
  sheet: { gap: 12, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  input: { minHeight: 96, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.bg, color: colors.text, fontFamily, fontSize: 16, textAlignVertical: "top" },
  options: { flexDirection: "row", justifyContent: "center", gap: 16 },
  option: { alignItems: "center", gap: 4, minWidth: 44, minHeight: 44 },
  thumb: { overflow: "hidden", borderRadius: 8, backgroundColor: colors.bg },
  cell: { position: "absolute", borderRadius: 3, backgroundColor: colors.coral },
  adjusted: { fontFamily, fontSize: 11, color: colors.muted },
});
