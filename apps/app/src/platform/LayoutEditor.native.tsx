// The layout editor on iOS: a full-screen view for making a layout or changing one, saved to the user's account.
// useLayoutEditor does the work; this draws it with Skia and feeds it touches.
import { Canvas, Fill, LinearGradient, Picture, createPicture, vec, type SkImage } from "@shopify/react-native-skia";
import type { Point, SavedLayout } from "@storystitch/shared";
import { STORY_CANVAS } from "@storystitch/shared";
import type { Start, Style } from "@storystitch/client";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, KeyboardAvoidingView, PanResponder, StyleSheet, Text, TextInput, View, type AccessibilityActionEvent, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fontFamily, type as typography } from "../theme";
import { Button } from "../ui/Button";
import { useLayoutEditor, type Handle, type Move } from "../useLayoutEditor";
import type { Photo } from "./photos.native";
import { blurredImage, drawDraft, hasBlurredBackground, previewOf } from "./render.native";

interface Props {
  photos: Photo[];
  style: Style;
  start: Start;
  onCancel: () => void;
  onSaved: (saved: SavedLayout, order: number[]) => void;
}

/** One dark stripe and one light, 16 points across, at 45°. Keep in step with `.builder-band` in builder.css. */
const STRIPE_END = vec(16 * Math.SQRT1_2, 16 * Math.SQRT1_2);
const STRIPE_COLORS = ["rgba(43, 19, 64, 0.28)", "rgba(43, 19, 64, 0.28)", "rgba(43, 19, 64, 0.12)", "rgba(43, 19, 64, 0.12)"];
const STRIPE_STOPS = [0, 0.5, 0.5, 1];

/** Fills a band with diagonal stripes. It never changes, so dragging a handle doesn't redraw it. */
const BandStripes = memo(function BandStripes() {
  return (
    <Canvas pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Fill>
        <LinearGradient start={vec(0, 0)} end={STRIPE_END} mode="repeat" colors={STRIPE_COLORS} positions={STRIPE_STOPS} />
      </Fill>
    </Canvas>
  );
});

/** Calls the latest `on` for every touch, whichever render the responder was made in. */
function useFingers(on: { down: (e: GestureResponderEvent) => void; move: (e: GestureResponderEvent) => void; up: () => void }) {
  const latest = useRef(on);
  useEffect(() => {
    latest.current = on;
  });
  return useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- these run on touch events, never during render.
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => latest.current.down(e),
        onPanResponderMove: (e) => latest.current.move(e),
        onPanResponderRelease: () => latest.current.up(),
        onPanResponderTerminate: () => latest.current.up(),
      }),
    [],
  );
}

const fingersOf = (e: GestureResponderEvent): Point[] => e.nativeEvent.touches.map((t) => ({ x: t.pageX, y: t.pageY }));

/** Lets VoiceOver move something that a finger would drag, and says where it ended up. */
function useVoiceOverMoves(moves: Move[], value: string) {
  const moved = useRef(false);
  useEffect(() => {
    if (moved.current) AccessibilityInfo.announceForAccessibility(value);
    moved.current = false;
  }, [value]);
  // Swipes need the adjustable trait, which only accessibilityRole sets, and aren't listed as actions too.
  const adjustable = moves[0]?.name === "increment";
  return {
    accessible: true,
    accessibilityRole: adjustable ? ("adjustable" as const) : undefined,
    accessibilityValue: { text: value },
    accessibilityActions: adjustable ? undefined : moves.map(({ name }) => ({ name })),
    onAccessibilityAction: (e: AccessibilityActionEvent) => {
      const refusal = moves.find((m) => m.name === e.nativeEvent.actionName)?.run();
      if (refusal) AccessibilityInfo.announceForAccessibility(refusal);
      else moved.current = true;
    },
  };
}

function Grip({ handle }: { handle: Handle }) {
  if (handle.kind === "across") return <View style={[styles.grip, { width: 44, height: 14 }]} />;
  if (handle.kind === "down") return <View style={[styles.grip, { width: 14, height: 44 }]} />;
  if (handle.kind === "line") return <View style={[styles.grip, { width: 30, height: 30 }]} />;
  return <View style={[styles.grip, { width: 24, height: 24 }, handle.kind === "rotate" && { backgroundColor: colors.coral }]} />;
}

interface HandleProps {
  handle: Handle;
  onGrab: (handle: Handle, e: GestureResponderEvent) => void;
  onMove: (x: number, y: number) => void;
  onEnd: () => void;
}

function LineOrHandle({ handle, onGrab, onMove, onEnd }: HandleProps) {
  const fingers = useFingers({
    down: (e) => onGrab(handle, e),
    move: (e) => onMove(e.nativeEvent.pageX, e.nativeEvent.pageY),
    up: onEnd,
  });
  const voiceOver = useVoiceOverMoves(handle.moves, handle.value);
  return (
    <View testID="builder-handle" aria-label={handle.label} pointerEvents="box-only" style={[styles.handle, handle.box]} {...voiceOver} {...fingers.panHandlers}>
      <Grip handle={handle} />
    </View>
  );
}

export default function LayoutEditor({ photos, style, start, onCancel, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const origin = useRef<Point>({ x: 0, y: 0 });
  const editor = useLayoutEditor({ photos, style, start, onSaved, frameOrigin: () => origin.current });
  const { layout, order, crops, selected, problems, view, fit, handles, tools, finishDrag, countText, saving, setSaving } = editor;
  const [fingerCount, setFingerCount] = useState(0);

  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);
  const first = order.find((o) => o >= 0) ?? 0;
  const scene = useMemo(() => ({ layout, style, order: order.map((o) => (o >= 0 ? o : first)), crops: [] }), [layout, style, order, first]);
  const blur = hasBlurredBackground(scene);
  const blurred: SkImage | null = useMemo(() => (blur ? blurredImage(STORY_CANVAS, imageFor(first)) : null), [blur, first, imageFor]);

  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        canvas.scale(view.width / STORY_CANVAS.width, view.width / STORY_CANVAS.width);
        drawDraft(canvas, STORY_CANVAS, scene, crops, order, imageFor, blurred, selected, problems.flatMap((p) => p.cells));
      }),
    [view.width, scene, crops, order, imageFor, blurred, selected, problems],
  );

  /** Where the preview is on screen, from a touch on something `at` this far into it. Its size changes with the tools. */
  function findOrigin(e: GestureResponderEvent, at: Point) {
    const { pageX, pageY, locationX, locationY } = e.nativeEvent;
    origin.current = { x: pageX - locationX - at.x, y: pageY - locationY - at.y };
  }
  function grabHandle(handle: Handle, e: GestureResponderEvent) {
    findOrigin(e, { x: handle.box.left, y: handle.box.top });
    editor.grabHandle(handle, e.nativeEvent.pageX, e.nativeEvent.pageY);
  }

  const preview = useFingers({
    down: (e) => {
      findOrigin(e, { x: 0, y: 0 });
      setFingerCount(1);
      editor.pressPreview(fingersOf(e));
    },
    move: (e) => {
      const fingers = fingersOf(e);
      if (fingers.length > fingerCount) {
        setFingerCount(fingers.length);
        editor.pressPreview(fingers);
      } else editor.movePreview(fingers);
    },
    up: () => {
      setFingerCount(0);
      finishDrag();
    },
  });

  const picking = useVoiceOverMoves(editor.pickMoves, editor.pickValue);

  return (
    <View role="dialog" aria-modal aria-label="Layout editor" style={[StyleSheet.absoluteFill, styles.editor]}>
      <View style={styles.bar}>
        <Button label="Cancel" onPress={onCancel} />
        <Text role="heading" aria-level={2} style={styles.count}>
          {countText}
        </Text>
        <Button label="Undo" onPress={editor.undo} disabled={!editor.canUndo} />
        <Button label="Done" primary onPress={editor.done} />
      </View>

      <View style={styles.stage} onLayout={(e) => fit(e.nativeEvent.layout.width, e.nativeEvent.layout.height)}>
        <View style={{ width: view.width, height: view.height }}>
          <View aria-label={`Layout being edited: ${countText}`} style={styles.preview} {...picking} {...preview.panHandlers}>
            <Canvas pointerEvents="none" style={{ width: view.width, height: view.height }}>
              <Picture picture={picture} />
            </Canvas>
          </View>
          <View pointerEvents="none" style={[styles.band, styles.bandTop, { height: "14%" }]}>
            <BandStripes />
            <Text style={styles.bandLabel}>Instagram's buttons</Text>
          </View>
          <View pointerEvents="none" style={[styles.band, styles.bandBottom, { height: "18%" }]}>
            <BandStripes />
          </View>
          {handles.map((h) => (
            <LineOrHandle key={h.key} handle={h} onGrab={grabHandle} onMove={editor.moveHandle} onEnd={finishDrag} />
          ))}
        </View>
      </View>

      <View aria-label="Layout tools" style={styles.tools}>
        <Text role="status" style={styles.status}>
          {editor.status}
        </Text>
        {tools.length > 0 && (
          <View style={styles.actions}>
            {tools.map((t) => (
              <Button key={t.label} label={t.label} name={t.name} onPress={t.onPress} />
            ))}
          </View>
        )}
      </View>

      {saving && (
        // The editor starts below the status bar, so the keyboard needs that much more room.
        <KeyboardAvoidingView behavior="padding" keyboardVerticalOffset={insets.top} style={styles.backdrop}>
          <View aria-label="Save layout" style={styles.sheet}>
            <View style={{ gap: 4 }}>
              <Text style={typography.hint}>Name</Text>
              <TextInput
                aria-label="Name"
                value={saving.name}
                maxLength={40}
                autoFocus
                onChangeText={(name) => setSaving({ ...saving, name, error: "" })}
                style={styles.input}
              />
            </View>
            {saving.error !== "" && (
              <Text role="alert" style={styles.notice}>
                {saving.error}
              </Text>
            )}
            <View style={styles.actions}>
              <Button label="Keep editing" onPress={() => setSaving(null)} />
              <Button label={saving.busy ? "Saving…" : editor.saveLabel} primary disabled={saving.busy} onPress={() => void editor.save()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { backgroundColor: colors.bg },
  bar: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6, paddingHorizontal: 8 },
  count: { flex: 1, fontFamily, fontSize: 16, fontWeight: "700", color: colors.text, textAlign: "center" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  preview: { borderRadius: 10, overflow: "hidden" },
  band: { position: "absolute", left: 0, right: 0, overflow: "hidden" },
  bandTop: { top: 0, borderTopLeftRadius: 10, borderTopRightRadius: 10 },
  bandBottom: { bottom: 0, borderBottomLeftRadius: 10, borderBottomRightRadius: 10 },
  bandLabel: { position: "absolute", top: 6, left: 8, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, overflow: "hidden", backgroundColor: "rgba(43, 19, 64, 0.7)", color: colors.text, fontFamily, fontSize: 11 },
  handle: { position: "absolute", alignItems: "center", justifyContent: "center" },
  grip: { borderWidth: 3, borderColor: colors.bg, borderRadius: 999, backgroundColor: colors.accent },
  tools: { minHeight: 128, justifyContent: "center", gap: 8, paddingTop: 10, paddingBottom: 14, paddingHorizontal: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  status: { fontFamily, fontSize: 15, color: colors.muted, textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  backdrop: { ...StyleSheet.absoluteFill, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.5)" },
  sheet: { gap: 12, paddingTop: 20, paddingBottom: 28, paddingHorizontal: 16, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  input: { minHeight: 44, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.bg, color: colors.text, fontSize: 16 },
  notice: { padding: 10, borderRadius: 10, overflow: "hidden", backgroundColor: colors.warnBg, color: colors.warnText },
});
