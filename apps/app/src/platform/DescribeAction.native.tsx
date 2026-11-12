import type { Draft } from "@storystitch/client";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TextInput, View } from "react-native";
import { colors, fontFamily, type as typography } from "../theme";
import { Actions, QuietActions } from "../ui/Actions";
import { Button } from "../ui/Button";
import { describeAvailability, describeLayout } from "./describeLayout.native";

const MAX_LENGTH = 200;

const MESSAGES = {
  refused: "That description can't be used. Try describing where the photos go.",
  no_layout: "Couldn't make a layout from that. Try saying how many rows and how many photos in each.",
  unavailable: "Apple Intelligence isn't ready on this iPhone.",
} as const;

interface Props {
  photoCount: number;
  /** Called with the layout the model made, to open in the layout editor. */
  onLayout: (draft: Draft, adjusted: boolean) => void;
}

/** "Describe a layout": a quiet action and the sheet it opens. Nothing shows unless the iPhone's on-device model is ready. */
export function DescribeAction({ photoCount, onLayout }: Props) {
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  /** Which request is the current one; a cancelled request's answer is ignored. */
  const request = useRef(0);

  useEffect(() => {
    let current = true;
    void describeAvailability().then((state) => current && setAvailable(state === "available"));
    return () => {
      current = false;
    };
  }, []);

  if (!available) return null;

  async function make() {
    const id = ++request.current;
    setBusy(true);
    setMessage(null);
    const result = await describeLayout(text, photoCount);
    if (id !== request.current) return;
    setBusy(false);
    if (result.ok) {
      setOpen(false);
      onLayout(result.draft, result.adjusted);
    } else {
      setMessage(MESSAGES[result.reason]);
    }
  }

  function close() {
    request.current++;
    setBusy(false);
    setMessage(null);
    setOpen(false);
  }

  return (
    <>
      <Button label="Describe a layout" quiet trackAs="describe_layout" onPress={() => setOpen(true)} />
      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
          <View role="dialog" aria-label="Describe a layout" style={styles.sheet}>
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
              <Button label={busy ? "Making your layout…" : "Make layout"} primary disabled={busy || text.trim() === ""} onPress={() => void make()} />
              <QuietActions>
                <Button label={busy ? "Cancel" : "Close"} quiet onPress={close} />
              </QuietActions>
            </Actions>
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
});
