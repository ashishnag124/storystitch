import { newScene, rankedScenes, withCrop, type Scene } from "@storystitch/client";
import { MAX_ZOOM, MIN_ZOOM, clampCrop } from "@storystitch/layout-engine";
import { STORY_CANVAS } from "@storystitch/shared";
import { cellShapes } from "@storystitch/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { LayoutStrip } from "./LayoutStrip";
import type { Photo } from "./platform/photos";
import { Slider } from "./platform/Slider";
import { Stage, type StageHandle } from "./platform/Stage";
import { MIN_TARGET, colors, fontFamily, shadows, type as typography } from "./theme";
import { Button } from "./ui/Button";
import { Choice } from "./ui/Choice";

type Tool = "layouts" | "style" | "export";
const TOOLS: { id: Tool; label: string }[] = [
  { id: "layouts", label: "Layouts" },
  { id: "style", label: "Style" },
  { id: "export", label: "Export" },
];

interface Props {
  photos: Photo[];
  /** What subject detection found, e.g. "Found 2 faces and a dog." */
  summary: string | null;
  notices: string[];
  /** Exports per layout id, for ordering near-equal fits. */
  popularity: Record<string, number>;
  onStartOver: () => void;
}

export function Editor({ photos, summary, notices, popularity, onStartOver }: Props) {
  // Every layout with its own best photo assignment, best fit first. Picking one starts from that.
  const options = useMemo(() => rankedScenes(photos, undefined, popularity), [photos, popularity]);
  const [scene, setScene] = useState<Scene>(() => options[0]!);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [tool, setTool] = useState<Tool>("layouts");
  // Notices (alerts) stay until closed; the detection summary fades on its own.
  const [toasts, setToasts] = useState(() => [
    ...notices.map((text) => ({ text, alert: true })),
    ...(summary ? [{ text: summary, alert: false }] : []),
  ]);
  const stage = useRef<StageHandle>(null);
  const onScene = useCallback((next: (s: Scene) => Scene) => setScene(next), []);
  const styledOptions = useMemo(() => options.map((o) => ({ ...o, style: scene.style })), [options, scene.style]);

  function chooseLayout(option: Scene) {
    stage.current?.crossfade();
    setScene(newScene(option.layout, photos, scene.style, option.order));
    setSelected(null);
  }

  function setZoom(cell: number, zoom: number) {
    setScene((s) => {
      const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
      return withCrop(s, cell, clampCrop(photos[s.order[cell]!]!, frame, { ...s.crops[cell]!, zoom }));
    });
  }

  const panelTitle = selected !== null ? `Photo ${selected + 1}` : TOOLS.find((t) => t.id === tool)!.label;

  return (
    <View role="main" style={styles.editor}>
      <View style={styles.bar}>
        <Text role="heading" aria-level={1} style={styles.hidden}>
          StoryStitch editor
        </Text>
        <Button label="Start over" onPress={onStartOver} />
      </View>

      <View style={styles.stage}>
        <Stage ref={stage} scene={scene} photos={photos} selected={selected} onSelect={setSelected} onScene={onScene} onStatus={setStatus} />
        <View aria-live="polite" style={styles.toasts} pointerEvents="box-none">
          {toasts.map((t) => (
            <Toast key={t.text} {...t} onClose={() => setToasts((all) => all.filter((x) => x.text !== t.text))} />
          ))}
        </View>
        <Text role="status" style={styles.hidden}>
          {status}
        </Text>
      </View>

      <View role="region" aria-label={panelTitle} style={styles.panel}>
        {selected !== null ? (
          <View style={styles.photoTool}>
            <Text style={typography.hint}>Tap another photo to swap them. Double-tap to zoom.</Text>
            <Slider
              label="Zoom"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={scene.crops[selected]!.zoom}
              display={`${scene.crops[selected]!.zoom.toFixed(1)}×`}
              onChange={(zoom) => setZoom(selected, zoom)}
            />
          </View>
        ) : tool === "layouts" ? (
          <LayoutStrip options={styledOptions} current={scene} onSelect={chooseLayout} />
        ) : (
          // The style and export tools arrive in the next step.
          <Text style={typography.hint}>Coming next.</Text>
        )}
      </View>

      <View role="tablist" aria-label="Tools" style={styles.tabbar}>
        {TOOLS.map((t) => {
          const current = selected === null && tool === t.id;
          return (
            <Choice
              key={t.id}
              role="tab"
              aria-selected={current}
              onPress={() => {
                setTool(t.id);
                setSelected(null);
              }}
              style={styles.tab}
            >
              <Text style={[styles.tabLabel, current && styles.tabCurrent]}>{t.label}</Text>
            </Choice>
          );
        })}
      </View>
    </View>
  );
}

/** How long an informational toast stays up. */
const TOAST_MS = 6000;

/** A message over the preview. Informational ones fade on their own; alerts stay until closed. */
function Toast({ text, alert, onClose }: { text: string; alert: boolean; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (alert) return;
    const timer = setTimeout(() => close.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [alert]);
  return (
    <View role={alert ? "alert" : undefined} style={[styles.toast, alert && styles.notice]}>
      <Text style={[styles.toastText, alert && styles.noticeText]}>{text}</Text>
      <Pressable role="button" aria-label="Dismiss" onPress={onClose} style={styles.toastClose}>
        <Text style={[styles.toastClosing, alert && styles.noticeText]}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", overflow: "hidden" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 6, paddingHorizontal: 12 },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  stage: { flex: 1, minHeight: 0 },
  toasts: { position: "absolute", top: 8, left: 12, right: 12, zIndex: 3, alignItems: "center", gap: 6 },
  toast: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 14,
    paddingVertical: 4,
    paddingRight: 4,
    borderRadius: 14,
    backgroundColor: "rgba(28, 25, 23, 0.88)",
    ...shadows.soft,
  },
  notice: { backgroundColor: colors.warnBg },
  toastText: { fontFamily, flexShrink: 1, fontSize: 14, color: "#fff" },
  noticeText: { color: colors.warnText },
  toastClose: { width: MIN_TARGET, height: MIN_TARGET, alignItems: "center", justifyContent: "center" },
  toastClosing: { fontFamily, fontSize: 20, color: "#fff" },
  panel: { height: 132, flexShrink: 0, justifyContent: "center", paddingHorizontal: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  photoTool: { gap: 4 },
  tabbar: { flexDirection: "row", flexShrink: 0, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontFamily, fontSize: 16, fontWeight: "600", color: colors.muted },
  tabCurrent: { fontWeight: "800", color: colors.accent },
});
