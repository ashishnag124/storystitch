// What the layout editor's sheets offer once a layout is done. Shared so web and iOS can't drift apart.
import { navigate } from "./platform/route";
import { Actions, QuietActions } from "./ui/Actions";
import { Button } from "./ui/Button";
import type { useLayoutEditor } from "./useLayoutEditor";

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
