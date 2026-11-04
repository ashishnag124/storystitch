import { cellShapes, type Scene } from "@storystitch/client";
import { Canvas, Path } from "@shopify/react-native-skia";
import { drawOrder } from "@storystitch/shared";
import { useMemo } from "react";
import { colors } from "../theme";
import { outlinePath } from "./render.native";

const SIZE = { width: 54, height: 96 };

/** A layout option drawn as a plain diagram of its cells, so the shape of the layout is easy to read. */
export function Diagram({ option, checked }: { option: Scene; checked: boolean }) {
  const shapes = useMemo(() => cellShapes(option.layout, option.style, SIZE), [option]);
  const cell = checked ? colors.coral : colors.border;
  return (
    <Canvas style={{ ...SIZE, borderRadius: 6, backgroundColor: colors.bg }}>
      {drawOrder(option.layout.cells).flatMap((i) => {
        const { outline, photo } = shapes[i]!;
        return [
          <Path key={i} path={outlinePath(outline, 0)} color={photo ? colors.muted : cell} />,
          ...(photo ? [<Path key={`${i}-photo`} path={outlinePath(photo, 0)} color={cell} />] : []),
        ];
      })}
    </Canvas>
  );
}
