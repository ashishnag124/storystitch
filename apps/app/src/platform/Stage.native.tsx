import { DOUBLE_TAP_MS, DOUBLE_TAP_ZOOM, LONG_PRESS_MS, MOTION, TAP_SLOP_PX, autoCrop, cellShapes, lerp, lerpBox, moveCaption, swapCells, type Box, type Scene } from "@storystitch/client";
import { Canvas, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { MAX_ZOOM, MIN_ZOOM, clampCrop, panCrop, sourceRect, type Crop } from "@storystitch/layout-engine";
import { STORY_CANVAS, hitTest, type Frame, type Point } from "@storystitch/shared";
import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from "react";
import { PanResponder, Pressable, StyleSheet, Text, View, type GestureResponderEvent, type PanResponderGestureState } from "react-native";
import { colors, fontFamily } from "../theme";
import { loadCaptionFonts } from "./captionFonts.native";
import { drawCaptions, hitCaption, layoutCaption } from "./captionRender.native";
import { haptic, prefersReducedMotion, tween } from "./motion.native";
import type { Photo } from "./photos.native";
import { blurredImage, drawCellAt, drawFaded, drawMark, drawScene, hasBlurredBackground, outlineBounds, previewOf, type Marks } from "./render.native";

/** How long the gesture hint shows if nobody touches the preview first. */
const COACH_MS = 8000;

/** What the fingers on the preview are doing. Positions are canvas pixels. */
type Gesture =
  | { kind: "press"; cell: number; at: Point; timer: ReturnType<typeof setTimeout> } // could still be a tap
  | { kind: "pan"; cell: number; x: number; y: number; t: number; vx: number; vy: number }
  | { kind: "lift"; from: number; over: number; at: Point; grab: Point; start: number }
  | { kind: "pinch"; cell: number; distance: number; zoom: number; mid: Point }
  | { kind: "caption"; index: number; grab: Point } // dragging a caption, grabbed this far from its center
  | { kind: "ended" };

interface Flight {
  scene: Scene;
  cell: number;
  from: Box;
  to: Box;
  t: number;
}

interface Overlay {
  flights?: Flight[];
  hidden?: number[];
  fade?: { scene: Scene; t: number };
}

export interface StageHandle {
  /** Crossfades from what's on screen now. Call just before changing the scene to another layout. */
  crossfade(): void;
}

interface Props {
  ref?: Ref<StageHandle>;
  scene: Scene;
  photos: Photo[];
  selected: number | null;
  onSelect: (cell: number | null) => void;
  onScene: (next: (scene: Scene) => Scene) => void;
  onStatus: (text: string) => void;
  /** Shows the "Made with StoryStitch" mark, as the export will have it. */
  mark: boolean;
  /** The chosen caption, outlined; tapping or dragging a caption chooses it. */
  caption?: number | null;
  onCaption?: (index: number | null) => void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The preview: drawn with Skia, with the same gestures as the web preview. */
export function Stage({ ref, scene, photos, selected, onSelect, onScene, onStatus, mark, caption = null, onCaption }: Props) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [lifted, setLifted] = useState<{ from: number; over: number } | null>(null);
  const [coach, setCoach] = useState(true);
  const [frame, setFrame] = useState(0);
  const redraw = useCallback(() => setFrame((f) => f + 1), []);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ cell: number; time: number } | null>(null);
  const stopMotion = useRef<() => void>(() => {});
  const stopCrossfade = useRef<() => void>(() => {});
  const overlay = useRef<Overlay>({});
  const latest = useRef({ scene, selected });
  useEffect(() => {
    latest.current = { scene, selected };
  });

  const width = Math.floor(Math.min(area.width, (area.height * STORY_CANVAS.width) / STORY_CANVAS.height));
  const height = Math.floor((width * STORY_CANVAS.height) / STORY_CANVAS.width);
  const k = width / STORY_CANVAS.width;
  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);
  const first = scene.order[0]!;
  const blur = hasBlurredBackground(scene);
  const blurred = useMemo(() => (blur ? blurredImage(STORY_CANVAS, imageFor(first)) : null), [blur, first, imageFor]);

  useEffect(() => {
    const timer = setTimeout(() => setCoach(false), COACH_MS);
    return () => clearTimeout(timer);
  }, []);
  // Captions' fonts load the first time there are captions; draw them again once they have.
  const hasCaptions = Boolean(scene.captions?.length);
  useEffect(() => void (hasCaptions && loadCaptionFonts().then(redraw, console.error)), [hasCaptions, redraw]);

  // `frame` changes while something is animating.
  const picture = useMemo(() => {
    void frame;
    return createPicture((canvas) => {
      const o = overlay.current;
      const g = gesture.current;
      const marks: Marks = lifted
        ? { dim: lifted.from, target: lifted.over === lifted.from ? undefined : lifted.over, hidden: o.hidden }
        : { selected: selected ?? undefined, hidden: o.hidden };
      canvas.scale(k, k);
      drawScene(canvas, STORY_CANVAS, scene, imageFor, blurred, marks);
      if (scene.captions?.length) drawCaptions(canvas, STORY_CANVAS, scene.captions, caption);
      if (mark) drawMark(canvas, STORY_CANVAS);
      if (o.fade) drawFaded(canvas, STORY_CANVAS, o.fade.scene, imageFor, null, 1 - o.fade.t, lerp(1, 1.03, o.fade.t));
      for (const f of o.flights ?? []) drawCellAt(canvas, STORY_CANVAS, f.scene, f.cell, imageFor, lerpBox(f.from, f.to, f.t), { shadow: 40 * (1 - f.t) });
      if (g?.kind === "lift") {
        const box = outlineBounds(cellShapes(scene.layout, scene.style, STORY_CANVAS)[g.from]!.outline);
        const t = prefersReducedMotion() ? 1 : Math.min(1, (performance.now() - g.start) / MOTION.lift);
        const scale = lerp(1, MOTION.liftScale, t);
        const [w, h] = [box.w * scale, box.h * scale];
        const to = { x: g.at.x - g.grab.x - w / 2, y: g.at.y - g.grab.y - h / 2, w, h };
        drawCellAt(canvas, STORY_CANVAS, scene, g.from, imageFor, to, { turn: 2 * t, shadow: 48 * t });
      }
    }, Skia.XYWHRect(0, 0, width || 1, height || 1));
  }, [k, width, height, scene, imageFor, blurred, selected, lifted, mark, caption, frame]);

  /** Applies `edit` to the crop of `cell`, then fits it to the cell's frame. */
  const editCrop = useCallback(
    (cell: number, edit: (crop: Crop, frame: Frame, photo: Photo) => Crop) =>
      onScene((s) => {
        const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
        const photo = photos[s.order[cell]!]!;
        return { ...s, crops: s.crops.map((c, i) => (i === cell ? clampCrop(photo, frame, edit(c, frame, photo)) : c)) };
      }),
    [photos, onScene],
  );
  const pan = (cell: number, dx: number, dy: number) => editCrop(cell, (crop, frame, photo) => panCrop(photo, frame, crop, dx, dy));

  function animateCrop(cell: number, to: Crop) {
    stopMotion.current();
    const from = latest.current.scene.crops[cell]!;
    stopMotion.current = tween(MOTION.crop, (t) => editCrop(cell, () => ({ cx: lerp(from.cx, to.cx, t), cy: lerp(from.cy, to.cy, t), zoom: lerp(from.zoom, to.zoom, t) })));
  }
  /** Back to the automatic, subject-aware crop. */
  function fit(cell: number) {
    const s = latest.current.scene;
    animateCrop(cell, autoCrop(s.layout, s.style, photos[s.order[cell]!]!, cell));
  }

  /** Crossfades from what's on screen now to whatever is drawn next. */
  function crossfade() {
    if (prefersReducedMotion()) return;
    const fade = { scene: latest.current.scene, t: 0 };
    overlay.current.fade = fade;
    // A tap during a crossfade replaces it: left running, the old one ends the new one early.
    stopCrossfade.current();
    stopCrossfade.current = tween(
      MOTION.crossfade,
      (t) => {
        fade.t = t;
        redraw();
      },
      () => {
        overlay.current.fade = undefined;
        redraw();
      },
    );
  }
  useImperativeHandle(ref, () => ({ crossfade }));

  /** Swaps two photos; they glide to each other's cells (from `fromBox` for a photo dropped off the finger). */
  function swap(a: number, b: number, fromBox?: Box) {
    const before = latest.current.scene;
    const after = swapCells(before, a, b, photos);
    const old = cellShapes(before.layout, before.style, STORY_CANVAS);
    const shapes = cellShapes(after.layout, after.style, STORY_CANVAS);
    const flights: Flight[] = [
      { scene: before, cell: a, from: fromBox ?? outlineBounds(old[a]!.outline), to: outlineBounds(shapes[b]!.outline), t: 0 },
      { scene: before, cell: b, from: outlineBounds(old[b]!.outline), to: outlineBounds(shapes[a]!.outline), t: 0 },
    ];
    overlay.current = { ...overlay.current, hidden: [a, b], flights };
    onScene(() => after);
    onStatus(`Swapped photos ${a + 1} and ${b + 1}.`);
    haptic();
    tween(
      MOTION.flight,
      (t) => {
        flights.forEach((f) => (f.t = t));
        redraw();
      },
      () => {
        overlay.current = {};
        redraw();
      },
    );
  }

  /** A tap: select a photo, tap it again to deselect, or tap another to swap the two. */
  function pick(cell: number) {
    const { selected } = latest.current;
    if (selected === null) {
      onSelect(cell);
      onStatus(`Photo ${cell + 1} selected.`);
    } else if (selected === cell) {
      onSelect(null);
      onStatus("Done.");
    } else {
      swap(selected, cell);
      onSelect(null);
    }
  }

  /** Double-tap: zoom in around the tapped point, or back to fit if already zoomed in. */
  function doubleTap(cell: number, at: Point) {
    const s = latest.current.scene;
    const crop = s.crops[cell]!;
    if (crop.zoom >= DOUBLE_TAP_ZOOM * 0.9) return fit(cell);
    const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
    const photo = photos[s.order[cell]!]!;
    const src = sourceRect(photo, frame, crop);
    const left = frame.cx - frame.width / 2;
    const top = frame.cy - frame.height / 2;
    animateCrop(
      cell,
      clampCrop(photo, frame, {
        cx: (src.x + ((at.x - left) / frame.width) * src.width) / photo.width,
        cy: (src.y + ((at.y - top) / frame.height) * src.height) / photo.height,
        zoom: DOUBLE_TAP_ZOOM,
      }),
    );
  }

  /** Keeps a flicked photo gliding, slowing down until it stops (or reaches its edge). */
  function momentum(cell: number, vx: number, vy: number) {
    if (prefersReducedMotion() || Math.hypot(vx, vy) < MOTION.minSpeed * 4) return;
    let [x, y] = [vx, vy];
    let last = performance.now();
    let id = requestAnimationFrame(function step(now) {
      const dt = Math.min(48, now - last);
      last = now;
      pan(cell, x * dt, y * dt);
      const decay = MOTION.friction ** (dt / 16);
      [x, y] = [x * decay, y * decay];
      if (Math.hypot(x, y) > MOTION.minSpeed) id = requestAnimationFrame(step);
    });
    stopMotion.current = () => cancelAnimationFrame(id);
  }

  const point = (e: GestureResponderEvent) => ({ x: e.nativeEvent.locationX / k, y: e.nativeEvent.locationY / k });
  const start = useRef<Point>({ x: 0, y: 0 });

  function onDown(e: GestureResponderEvent) {
    stopMotion.current();
    setCoach(false);
    const at = point(e);
    start.current = at;
    const s = latest.current.scene;
    // A caption sits over the photos, so a touch on one moves the caption.
    const hit = s.captions?.length ? hitCaption(STORY_CANVAS, s.captions, at) : -1;
    const box = hit >= 0 ? layoutCaption(s.captions![hit]!, STORY_CANVAS)?.box : undefined;
    if (box) {
      gesture.current = { kind: "caption", index: hit, grab: { x: at.x - (box.x + box.w / 2), y: at.y - (box.y + box.h / 2) } };
      onCaption?.(hit);
      onStatus(`Caption ${hit + 1} selected.`);
      return;
    }
    const cell = hitTest(s.layout.cells, at);
    if (cell < 0) {
      gesture.current = { kind: "ended" };
      return;
    }
    const timer = setTimeout(() => {
      // Held still: lift the photo so it can be dropped on another cell.
      const box = outlineBounds(cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!.outline);
      const center = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
      gesture.current = { kind: "lift", from: cell, over: cell, at, grab: { x: at.x - center.x, y: at.y - center.y }, start: performance.now() };
      overlay.current.hidden = [cell];
      setLifted({ from: cell, over: cell });
      onSelect(null);
      haptic();
      const rise = () => {
        redraw();
        if (gesture.current?.kind === "lift" && performance.now() - gesture.current.start < MOTION.lift) requestAnimationFrame(rise);
      };
      rise();
    }, LONG_PRESS_MS);
    gesture.current = { kind: "press", cell, at, timer };
  }

  function onMove(e: GestureResponderEvent, state: PanResponderGestureState) {
    const g = gesture.current;
    if (!g) return;
    const touches = e.nativeEvent.touches;
    if (touches.length === 2 && g.kind !== "pinch" && g.kind !== "lift" && g.kind !== "ended" && g.kind !== "caption") {
      if (g.kind === "press") clearTimeout(g.timer);
      const [a, b] = touches as [(typeof touches)[0], (typeof touches)[0]];
      gesture.current = {
        kind: "pinch",
        cell: g.cell,
        distance: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
        zoom: latest.current.scene.crops[g.cell]!.zoom,
        mid: { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 },
      };
      return;
    }
    const at = { x: start.current.x + state.dx / k, y: start.current.y + state.dy / k };
    if (g.kind === "caption") {
      const c = latest.current.scene.captions?.[g.index];
      const box = c && layoutCaption(c, STORY_CANVAS)?.box;
      if (box) onScene((s) => ({ ...s, captions: moveCaption(s.captions ?? [], g.index, { x: at.x - g.grab.x, y: at.y - g.grab.y }, box, STORY_CANVAS) }));
      return;
    }
    if (g.kind === "press") {
      if (Math.hypot(state.dx, state.dy) < TAP_SLOP_PX) return;
      clearTimeout(g.timer);
      gesture.current = { kind: "pan", cell: g.cell, x: g.at.x, y: g.at.y, t: performance.now(), vx: 0, vy: 0 };
    }
    const cur = gesture.current!;
    if (cur.kind === "pan") {
      const [dx, dy] = [at.x - cur.x, at.y - cur.y];
      pan(cur.cell, dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - cur.t);
      // Smoothed velocity (canvas px/ms) for momentum when the finger lets go.
      cur.vx = lerp(cur.vx, dx / dt, 0.5);
      cur.vy = lerp(cur.vy, dy / dt, 0.5);
      [cur.x, cur.y, cur.t] = [at.x, at.y, now];
    } else if (cur.kind === "lift") {
      cur.at = at;
      const over = hitTest(latest.current.scene.layout.cells, at);
      if (over !== cur.over && over >= 0 && over !== cur.from) haptic();
      cur.over = over;
      setLifted({ from: cur.from, over });
      redraw();
    } else if (cur.kind === "pinch" && touches.length === 2) {
      const [a, b] = touches as [(typeof touches)[0], (typeof touches)[0]];
      const mid = { x: (a.pageX + b.pageX) / 2, y: (a.pageY + b.pageY) / 2 };
      const zoom = clamp((cur.zoom * Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)) / cur.distance, MIN_ZOOM, MAX_ZOOM);
      const [dx, dy] = [(mid.x - cur.mid.x) / k, (mid.y - cur.mid.y) / k];
      editCrop(cur.cell, (crop, frame, photo) => panCrop(photo, frame, { ...crop, zoom }, dx, dy));
      cur.mid = mid;
    }
  }

  function onEnd(cancelled: boolean) {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === "press") {
      clearTimeout(g.timer);
      const now = performance.now();
      const prev = lastTap.current;
      if (!cancelled && prev && prev.cell === g.cell && now - prev.time < DOUBLE_TAP_MS) {
        lastTap.current = null;
        if (latest.current.selected !== g.cell) onSelect(g.cell);
        doubleTap(g.cell, g.at);
      } else if (!cancelled) {
        lastTap.current = { cell: g.cell, time: now };
        pick(g.cell);
      }
    } else if (g?.kind === "pan") {
      if (!cancelled && performance.now() - g.t < 60) momentum(g.cell, g.vx, g.vy);
    } else if (g?.kind === "lift") {
      setLifted(null);
      const s = latest.current.scene;
      const box = outlineBounds(cellShapes(s.layout, s.style, STORY_CANVAS)[g.from]!.outline);
      const [w, h] = [box.w * MOTION.liftScale, box.h * MOTION.liftScale];
      const dropBox = { x: g.at.x - g.grab.x - w / 2, y: g.at.y - g.grab.y - h / 2, w, h };
      if (!cancelled && g.over >= 0 && g.over !== g.from) swap(g.from, g.over, dropBox);
      else {
        // Not dropped on another photo: it settles back into its own cell.
        const flight = { scene: s, cell: g.from, from: dropBox, to: box, t: 0 };
        overlay.current = { hidden: [g.from], flights: [flight] };
        tween(
          MOTION.settle,
          (t) => {
            flight.t = t;
            redraw();
          },
          () => {
            overlay.current = {};
            redraw();
          },
        );
      }
    }
  }

  // The handlers read the latest props through refs, so one responder lasts the life of the stage.
  const handlers = useRef({ onDown, onMove, onEnd });
  useEffect(() => {
    handlers.current = { onDown, onMove, onEnd };
  });
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => handlers.current.onDown(e),
        onPanResponderMove: (e, s) => handlers.current.onMove(e, s),
        onPanResponderRelease: () => handlers.current.onEnd(false),
        onPanResponderTerminate: () => handlers.current.onEnd(true),
      }),
    [],
  );

  // The floating tooltip sits just above the selected photo (below it when the photo is near the top).
  const tip = (() => {
    if (selected === null || !width) return null;
    const shape = cellShapes(scene.layout, scene.style, STORY_CANVAS)[selected];
    if (!shape) return null;
    const b = outlineBounds(shape.outline);
    const above = b.y * k > 56;
    return { left: clamp((b.x + b.w / 2) * k - 70, 0, width - 140), top: above ? b.y * k - 52 : (b.y + b.h) * k + 8 };
  })();

  return (
    <View style={styles.stage} onLayout={(e) => setArea(e.nativeEvent.layout)}>
      {width > 0 && (
        <View style={{ width, height }}>
          <View aria-label={`Story preview: ${scene.layout.name}, ${scene.layout.cells.length} photos`} style={styles.frame} {...responder.panHandlers}>
            <Canvas pointerEvents="none" style={{ width, height }}>
              <Picture picture={picture} />
            </Canvas>
          </View>
          {/* The captions, for VoiceOver: choosing one opens it in the Text tool. */}
          {scene.captions?.map((c, i) => {
            const box = layoutCaption(c, STORY_CANVAS)?.box;
            return (
              box && (
                <View
                  key={i}
                  accessible
                  role="button"
                  aria-label={`Caption ${i + 1}: ${c.text}`}
                  aria-selected={caption === i}
                  onAccessibilityTap={() => onCaption?.(i)}
                  pointerEvents="none"
                  style={{ position: "absolute", left: box.x * k, top: box.y * k, width: box.w * k, height: box.h * k }}
                />
              )
            );
          })}
          {tip && selected !== null && (
            <View role="toolbar" aria-label={`Photo ${selected + 1}`} style={[styles.tip, tip]}>
              <Pressable role="button" onPress={() => fit(selected)} style={styles.tipButton}>
                <Text style={styles.tipLabel}>Fit</Text>
              </Pressable>
              <View style={styles.tipLine} />
              <Pressable
                role="button"
                onPress={() => {
                  onSelect(null);
                  onStatus("Done.");
                }}
                style={styles.tipButton}
              >
                <Text style={styles.tipLabel}>Done</Text>
              </Pressable>
            </View>
          )}
          {coach && (
            <View pointerEvents="none" style={styles.coach}>
              <Text style={styles.coachText}>Drag to move · Pinch to zoom · Hold to swap</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4, paddingHorizontal: 12 },
  frame: { borderRadius: 12, overflow: "hidden", backgroundColor: colors.surface },
  tip: { position: "absolute", flexDirection: "row", alignItems: "center", borderRadius: 999, backgroundColor: "rgba(28, 25, 23, 0.92)" },
  tipButton: { minWidth: 56, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  tipLabel: { fontFamily, fontWeight: "600", color: "#fff" },
  tipLine: { width: 1, height: 20, backgroundColor: "rgba(255, 255, 255, 0.3)" },
  coach: { position: "absolute", bottom: 12, alignSelf: "center", paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(28, 25, 23, 0.75)" },
  coachText: { fontFamily, fontSize: 13, color: "#fff" },
});
