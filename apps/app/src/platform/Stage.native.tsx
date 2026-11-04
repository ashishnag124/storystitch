import { swapCells, type Scene } from "@storystitch/client";
import { Canvas, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { STORY_CANVAS, hitTest } from "@storystitch/shared";
import { useCallback, useImperativeHandle, useMemo, useState, type Ref } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { Photo } from "./photos.native";
import { blurredImage, drawScene, hasBlurredBackground, previewOf } from "./render.native";

export interface StageHandle {
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
}

/** The preview. Tapping selects and swaps; drag, pinch and motion come with the gesture step of Stage 3. */
export function Stage({ ref, scene, photos, selected, onSelect, onScene, onStatus }: Props) {
  const [area, setArea] = useState({ width: 0, height: 0 });
  useImperativeHandle(ref, () => ({ crossfade() {} }));
  const width = Math.floor(Math.min(area.width, (area.height * STORY_CANVAS.width) / STORY_CANVAS.height));
  const height = Math.floor((width * STORY_CANVAS.height) / STORY_CANVAS.width);
  const k = width / STORY_CANVAS.width;
  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);
  const first = scene.order[0]!;
  const blur = hasBlurredBackground(scene);
  const blurred = useMemo(() => (blur ? blurredImage(STORY_CANVAS, imageFor(first)) : null), [blur, first, imageFor]);
  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        canvas.scale(k, k);
        drawScene(canvas, STORY_CANVAS, scene, imageFor, blurred, { selected: selected ?? undefined });
      }, Skia.XYWHRect(0, 0, width || 1, height || 1)),
    [k, width, height, scene, imageFor, blurred, selected],
  );

  function pick(x: number, y: number) {
    const cell = hitTest(scene.layout.cells, { x: x / k, y: y / k });
    if (cell < 0) return;
    if (selected === null) {
      onSelect(cell);
      onStatus(`Photo ${cell + 1} selected.`);
    } else if (selected === cell) {
      onSelect(null);
      onStatus("Done.");
    } else {
      onScene((s) => swapCells(s, selected, cell, photos));
      onSelect(null);
      onStatus(`Swapped photos ${selected + 1} and ${cell + 1}.`);
    }
  }

  return (
    <View style={styles.stage} onLayout={(e) => setArea(e.nativeEvent.layout)}>
      {width > 0 && (
        <Pressable aria-label={`Story preview: ${scene.layout.name}, ${scene.layout.cells.length} photos`} onPress={(e) => pick(e.nativeEvent.locationX, e.nativeEvent.locationY)}>
          <Canvas style={{ width, height, borderRadius: 12 }}>
            <Picture picture={picture} />
          </Canvas>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 4, paddingHorizontal: 12 },
});
