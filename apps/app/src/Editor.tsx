import { cellShapes, newScene, rankedScenes, withCrop, withStyle, type Scene } from "@storystitch/client";
import { MAX_ZOOM, MIN_ZOOM, clampCrop } from "@storystitch/layout-engine";
import { STORY_CANVAS } from "@storystitch/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { recordExport } from "./api";
import { LayoutStrip } from "./LayoutStrip";
import { canShareFiles, renderExport, shareOrDownload, type ExportFormat } from "./platform/exportImage";
import { FormatSelect } from "./platform/FormatSelect";
import type { Photo } from "./platform/photos";
import { Slider } from "./platform/Slider";
import { Stage, type StageHandle } from "./platform/Stage";
import { StylePanel } from "./StylePanel";
import { MIN_TARGET, colors, fontFamily, shadows, type as typography } from "./theme";
import { Button } from "./ui/Button";
import { Choice } from "./ui/Choice";
import { upscaleWarnings } from "./upscale";

/** How long the preview must be still before the export is rendered in the background. */
const EXPORT_DEBOUNCE_MS = 400;

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
  privacy: string;
  /** Exports per layout id, for ordering near-equal fits. */
  popularity: Record<string, number>;
  onStartOver: () => void;
}

export function Editor({ photos, summary, notices, privacy, popularity, onStartOver }: Props) {
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
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [exported, setExported] = useState<{ scene: Scene; format: ExportFormat; blob: Blob } | null>(null);
  const [exportError, setExportError] = useState(false);
  const stage = useRef<StageHandle>(null);
  const shareable = useMemo(() => canShareFiles(), []);
  const warnings = useMemo(() => upscaleWarnings(scene, photos), [scene, photos]);
  const onScene = useCallback((next: (s: Scene) => Scene) => setScene(next), []);
  const styledOptions = useMemo(() => options.map((o) => ({ ...o, style: scene.style })), [options, scene.style]);

  // Render the export ahead of time so Share can open the share sheet within the tap.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      renderExport(scene, photos, format)
        .then((blob) => current && (setExported({ scene, format, blob }), setExportError(false)))
        .catch((err) => {
          console.error(err);
          if (current) setExportError(true);
        });
    }, EXPORT_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [scene, photos, format]);
  const ready = exported && exported.scene === scene && exported.format === format ? exported.blob : null;
  const extension = format === "image/png" ? "png" : "jpg";

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
        <Button
          label={ready ? (shareable ? "Share" : "Download") : "Preparing…"}
          primary
          disabled={!ready}
          onPress={async () => {
            if (ready && (await shareOrDownload(ready, `storystitch.${extension}`))) recordExport(scene.layout.id);
          }}
        />
      </View>

      <View style={styles.stage}>
        <Stage ref={stage} scene={scene} photos={photos} selected={selected} onSelect={setSelected} onScene={onScene} onStatus={setStatus} />
        <View aria-live="polite" style={styles.toasts} pointerEvents="box-none">
          {toasts.map((t) => (
            <Toast key={t.text} {...t} onClose={() => setToasts((all) => all.filter((x) => x.text !== t.text))} />
          ))}
          {exportError && (
            <Text role="alert" style={styles.exportError}>
              Couldn't prepare the image. Try another layout or start over.
            </Text>
          )}
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
        ) : tool === "style" ? (
          <StylePanel layout={scene.layout} style={scene.style} onChange={(style) => setScene((s) => withStyle(s, style, photos))} />
        ) : (
          <ScrollView contentContainerStyle={styles.exportTool}>
            <FormatSelect value={format} onChange={setFormat} />
            {warnings.length > 0 && (
              <View role="list" style={styles.warnings}>
                {warnings.map((w) => (
                  <Text key={w.photo} role="listitem" style={styles.warning}>
                    {w.name} is enlarged {w.factor.toFixed(1)}× and may look soft.
                  </Text>
                ))}
              </View>
            )}
            <Text style={typography.hint}>{privacy}</Text>
          </ScrollView>
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
              {t.id === "export" && warnings.length > 0 && <View role="img" aria-label="(has warnings)" style={styles.badge} />}
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
  badge: { position: "absolute", top: 10, right: "30%", width: 8, height: 8, borderRadius: 4, backgroundColor: "#d97706" },
  exportTool: { gap: 8 },
  exportError: { fontFamily, padding: 12, borderRadius: 14, fontSize: 14, backgroundColor: colors.warnBg, color: colors.warnText },
  warnings: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.warnBg },
  warning: { fontFamily, fontSize: 13, color: colors.warnText },
});
