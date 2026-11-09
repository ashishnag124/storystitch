import { DEFAULT_STYLE, assignedScene, autoColor, cellShapes, newScene, rankedScenes, usageLayout, withCrop, withStyle, type Scene, type Start } from "@storystitch/client";
import { MAX_ZOOM, MIN_ZOOM, clampCrop } from "@storystitch/layout-engine";
import { STORY_CANVAS, type Layout, type SavedLayout } from "@storystitch/shared";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { AccountLink } from "./AccountLink";
import { deleteSaved, listSaved, recordExport } from "./api";
import { LAYOUT_EDITOR_ENABLED } from "./config";
import { LayoutStrip } from "./LayoutStrip";
import { perfTimes, resetPerfPeak, timeLayoutSwitch } from "./PerfReadout";
import { EXPORT_PAUSE_MS, canShareFiles, canWaitToShare, renderExport, shareOrDownload, type ExportFormat } from "./platform/exportImage";
import { FormatSelect } from "./platform/FormatSelect";
import { LayoutEditor } from "./platform/lazyScreens";
import type { Photo } from "./platform/photos";
import { ACCOUNT_PATHS, useLocation } from "./platform/route";
import { Slider } from "./platform/Slider";
import { Stage, type StageHandle } from "./platform/Stage";
import { StylePanel } from "./StylePanel";
import { colors, fontFamily, type as typography } from "./theme";
import { Button } from "./ui/Button";
import { Choice } from "./ui/Choice";
import { Toast } from "./ui/Toast";
import { upscaleWarnings } from "./upscale";
import { track } from "./usage";

type Tool = "layouts" | "style" | "export";
/** The id of a layout edited and used without saving. No saved or built-in layout has it. */
const UNSAVED_LAYOUT_ID = "edited";

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
  const options = useMemo(
    () => rankedScenes(photos, { ...DEFAULT_STYLE, auto: autoColor(photos.map((p) => p.pixels)) }, popularity),
    [photos, popularity],
  );
  const [scene, setScene] = useState<Scene>(() => options[0]!);
  // The user's saved layouts (layout editor): a list, "signed-out", or null until known (or when the API is down).
  const [saved, setSaved] = useState<SavedLayout[] | "signed-out" | null>(null);
  const [building, setBuilding] = useState<Start | null>(null);
  /** A layout edited and used without saving. It stays in the strip for as long as these photos are open. */
  const [unsaved, setUnsaved] = useState<{ layout: Layout; order: number[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const location = useLocation();
  const onAccountScreen = (ACCOUNT_PATHS as readonly string[]).includes(location.pathname);
  const [selected, setSelected] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [tool, setTool] = useState<Tool>("layouts");
  // Notices (alerts) stay until closed; the detection summary fades on its own.
  const [toasts, setToasts] = useState(() => [
    ...notices.map((text) => ({ text, alert: true })),
    ...(summary ? [{ text: summary, alert: false }] : []),
  ]);
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  /** Whether the export carries the "Made with StoryStitch" mark. */
  const [mark, setMark] = useState(true);
  const [exported, setExported] = useState<{ scene: Scene; format: ExportFormat; mark: boolean; blob: Blob } | null>(null);
  const [exportError, setExportError] = useState(false);
  /** Share was tapped before the image was ready, and opens once it is. */
  const [shareWaiting, setShareWaiting] = useState(false);
  const stage = useRef<StageHandle>(null);
  /** Starts the waiting export straight away. */
  const startExport = useRef(() => {});
  const shareable = useMemo(() => canShareFiles(), []);
  const warnings = useMemo(() => upscaleWarnings(scene, photos), [scene, photos]);
  const onScene = useCallback((next: (s: Scene) => Scene) => setScene(next), []);
  // The user's own layouts for this many photos go first, marked "Yours".
  const mine = useMemo(() => (Array.isArray(saved) ? saved.filter((s) => s.layout.cells.length === photos.length) : []), [saved, photos.length]);
  const mineIds = useMemo(() => new Set(mine.map((s) => s.id)), [mine]);
  const yours = useMemo(() => new Set([...mineIds, UNSAVED_LAYOUT_ID]), [mineIds]);
  const styledOptions = useMemo(
    () => [
      ...(unsaved ? [newScene(unsaved.layout, photos, scene.style, unsaved.order)] : []),
      ...mine.map((s) => assignedScene(s.layout, photos, scene.style)),
      ...options.map((o) => ({ ...o, style: scene.style })),
    ],
    [unsaved, mine, options, photos, scene.style],
  );

  useEffect(resetPerfPeak, []);

  // Render the export ahead of time so Share can open the share sheet within the tap.
  useEffect(() => {
    const job = { cancelled: false };
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      clearTimeout(timer);
      // An earlier failure says nothing about this export, and would end a wait for it.
      setExportError(false);
      const start = performance.now();
      renderExport(scene, photos, format, mark, job)
        .then((blob) => {
          if (!blob || job.cancelled) return;
          perfTimes.exportMs = performance.now() - start;
          setExported({ scene, format, mark, blob });
          setExportError(false);
        })
        .catch((err) => {
          console.error(err);
          if (job.cancelled) return;
          setExportError(true);
          track("error_shown", { code: "export_failed" });
        });
    };
    const timer = setTimeout(run, EXPORT_PAUSE_MS);
    startExport.current = run;
    return () => {
      job.cancelled = true;
      clearTimeout(timer);
    };
  }, [scene, photos, format, mark]);
  const ready = exported && exported.scene === scene && exported.format === format && exported.mark === mark ? exported.blob : null;
  const extension = format === "image/png" ? "png" : "jpg";

  async function share(file: NonNullable<typeof ready>) {
    if (!(await shareOrDownload(file, `storystitch.${extension}`))) return;
    track("collage_shared", { layout: usageLayout(scene.layout.id), method: shareable ? "share" : "download" });
    // Only built-in layouts are counted: edited and saved layouts are the user's own.
    if (usageLayout(scene.layout.id) !== "custom") recordExport(scene.layout.id);
  }

  useEffect(() => {
    if (!shareWaiting || (!ready && !exportError)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the wait ends when the export finishes, which is outside React.
    setShareWaiting(false);
    if (ready) void share(ready);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the wait ends, not whenever `share` changes.
  }, [shareWaiting, ready, exportError]);

  function chooseLayout(option: Scene) {
    timeLayoutSwitch();
    stage.current?.crossfade();
    setScene(newScene(option.layout, photos, scene.style, option.order));
    setSelected(null);
    setConfirmDelete(false);
  }

  // --- Layout editor: edit the current layout. Anyone can use the result; saving it needs an account.

  function openEditor() {
    setConfirmDelete(false);
    setSelected(null);
    setBuilding({ layout: scene.layout, order: scene.order, saved: mine.find((s) => s.id === scene.layout.id) });
    track("screen_viewed", { screen: "layout_editor" });
  }

  // Load saved layouts, and again after any navigation or, mid-edit, on coming back from another tab: they may have
  // signed in, or confirmed their email.
  const editing = building !== null;
  useEffect(() => {
    if (!LAYOUT_EDITOR_ENABLED || onAccountScreen) return;
    let current = true;
    const load = () =>
      listSaved()
        .then((list) => current && setSaved(list))
        .catch(() => current && setSaved(null));
    void load();
    const subscription = AppState.addEventListener("change", (state) => state === "active" && editing && void load());
    return () => {
      current = false;
      subscription.remove();
    };
  }, [onAccountScreen, editing, location]);

  function onLayoutUsed(layout: Layout, order: number[]) {
    const edited = { ...layout, id: UNSAVED_LAYOUT_ID, name: "Edited layout" };
    setUnsaved({ layout: edited, order });
    setBuilding(null);
    setScene(newScene(edited, photos, scene.style, order));
    setStatus("Your edited layout is in your collage.");
  }

  function onLayoutSaved(layout: SavedLayout, order: number[]) {
    setSaved((list) => [layout, ...(Array.isArray(list) ? list.filter((s) => s.id !== layout.id) : [])]);
    setUnsaved(null);
    setBuilding(null);
    setScene(newScene(layout.layout, photos, scene.style, order));
    setStatus(`Saved ${layout.name}.`);
    track("layout_saved");
  }

  async function deleteCurrent() {
    const id = scene.layout.id;
    try {
      await deleteSaved(id);
    } catch {
      setStatus("Couldn't delete that layout. Please try again.");
      track("error_shown", { code: "layout_delete_failed" });
      return;
    }
    setSaved((list) => (Array.isArray(list) ? list.filter((s) => s.id !== id) : list));
    chooseLayout({ ...options[0]!, style: scene.style });
    setStatus("Layout deleted.");
  }

  function setZoom(cell: number, zoom: number) {
    setScene((s) => {
      const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
      return withCrop(s, cell, clampCrop(photos[s.order[cell]!]!, frame, { ...s.crops[cell]!, zoom }));
    });
  }

  const showActions = LAYOUT_EDITOR_ENABLED && selected === null && tool === "layouts";
  const panelTitle = selected !== null ? `Photo ${selected + 1}` : TOOLS.find((t) => t.id === tool)!.label;

  // VoiceOver stays inside an open dialog.
  const covered = Boolean(building && LayoutEditor);

  return (
    <View role="main" style={styles.editor}>
      <View aria-hidden={covered} style={styles.bar}>
        <Text role="heading" aria-level={1} style={styles.hidden}>
          StoryStitch editor
        </Text>
        <Button label="Start over" quiet trackAs="start_over" onPress={onStartOver} />
        <View style={styles.barActions}>
          <AccountLink />
          <Button
            label={(canWaitToShare ? !shareWaiting : ready) ? (shareable ? "Share" : "Download") : "Preparing…"}
            primary
            disabled={canWaitToShare ? shareWaiting : !ready}
            trackAs="share"
            onPress={() => {
              track("collage_exported", { layout: usageLayout(scene.layout.id), format: extension === "png" ? "png" : "jpeg" });
              if (ready) return void share(ready);
              setShareWaiting(true);
              startExport.current();
            }}
          />
        </View>
      </View>

      <View aria-hidden={covered} style={styles.stage}>
        <Stage ref={stage} scene={scene} photos={photos} selected={selected} onSelect={setSelected} onScene={onScene} onStatus={setStatus} mark={mark} />
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

      <View aria-hidden={covered} role="region" aria-label={panelTitle} style={[styles.panel, showActions && styles.panelActions]}>
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
          <View style={styles.layoutsTool}>
            <LayoutStrip
              options={styledOptions}
              current={scene}
              onSelect={(option) => {
                track("layout_chosen", { layout: usageLayout(option.layout.id) });
                chooseLayout(option);
              }}
              mine={yours}
            />
            {LAYOUT_EDITOR_ENABLED && (
              <View style={styles.layoutActions}>
                {confirmDelete ? (
                  <>
                    <Text numberOfLines={1} style={[typography.body, styles.layoutAction]}>
                      Delete {scene.layout.name}?
                    </Text>
                    <Button label="Keep" quiet onPress={() => setConfirmDelete(false)} />
                    <Button label="Delete" primary danger onPress={() => void deleteCurrent()} />
                  </>
                ) : (
                  <>
                    <View style={styles.layoutAction}>
                      <Button label="Edit this layout" primary trackAs="edit_layout" onPress={openEditor} />
                    </View>
                    {mineIds.has(scene.layout.id) && <Button label="Delete" quiet danger onPress={() => setConfirmDelete(true)} />}
                  </>
                )}
              </View>
            )}
          </View>
        ) : tool === "style" ? (
          <StylePanel layout={scene.layout} style={scene.style} onChange={(style) => setScene((s) => withStyle(s, style, photos))} />
        ) : (
          <ScrollView contentContainerStyle={styles.exportTool}>
            <FormatSelect value={format} onChange={setFormat} />
            <View style={styles.markRow}>
              <Text style={typography.hint}>Made with StoryStitch</Text>
              <Switch
                aria-label="Made with StoryStitch"
                value={mark}
                onValueChange={setMark}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.text}
                ios_backgroundColor={colors.border}
                // React Native Web colors the thumb of a switch that's on with its own prop.
                {...{ activeThumbColor: colors.text }}
              />
            </View>
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

      <View aria-hidden={covered} role="tablist" aria-label="Tools" style={styles.tabbar}>
        {TOOLS.map((t) => {
          const current = selected === null && tool === t.id;
          return (
            <Choice
              key={t.id}
              role="tab"
              aria-selected={current}
              trackAs={`tool_${t.id}`}
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

      {building && LayoutEditor && (
        <Suspense fallback={null}>
          <LayoutEditor
            photos={photos}
            style={scene.style}
            start={building}
            signedIn={Array.isArray(saved)}
            onCancel={() => setBuilding(null)}
            onUse={onLayoutUsed}
            onSaved={onLayoutSaved}
          />
        </Suspense>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  editor: { flex: 1, width: "100%", maxWidth: 560, alignSelf: "center", overflow: "hidden" },
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, paddingVertical: 6, paddingHorizontal: 12 },
  barActions: { flexDirection: "row", gap: 8 },
  panelActions: { height: "auto", minHeight: 132, paddingVertical: 8 },
  layoutsTool: { gap: 6 },
  layoutActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  layoutAction: { flex: 1 },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, justifyContent: "flex-end", backgroundColor: "rgba(0, 0, 0, 0.5)" },
  sheet: { gap: 12, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  sheetActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0 },
  stage: { flex: 1, minHeight: 0 },
  toasts: { position: "absolute", top: 8, left: 12, right: 12, zIndex: 3, alignItems: "center", gap: 6 },
  panel: { height: 132, flexShrink: 0, justifyContent: "center", paddingHorizontal: 12, borderTopLeftRadius: 20, borderTopRightRadius: 20, backgroundColor: colors.surface },
  photoTool: { gap: 4 },
  tabbar: { flexDirection: "row", flexShrink: 0, backgroundColor: colors.surface },
  tab: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center" },
  tabLabel: { fontFamily, fontSize: 16, fontWeight: "600", color: colors.muted },
  tabCurrent: { fontWeight: "800", color: colors.accent },
  badge: { position: "absolute", top: 10, right: "30%", width: 8, height: 8, borderRadius: 4, backgroundColor: "#d97706" },
  exportTool: { flexGrow: 1, justifyContent: "center", gap: 8 },
  markRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  exportError: { fontFamily, padding: 12, borderRadius: 14, fontSize: 14, backgroundColor: colors.warnBg, color: colors.warnText },
  warnings: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.warnBg },
  warning: { fontFamily, fontSize: 13, color: colors.warnText },
});
