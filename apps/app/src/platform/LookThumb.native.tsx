import { lookMatrix, type LookId } from "@storystitch/client";
import { Canvas, FilterMode, MipmapMode, Picture, Skia, createPicture } from "@shopify/react-native-skia";
import { useMemo } from "react";
import type { Photo } from "./photos.native";

/** A small piece of the photo, center-cropped to the thumbnail's shape, with the look applied. */
export function LookThumb({ photo, look, width, height }: { photo: Photo; look: LookId; width: number; height: number }) {
  const picture = useMemo(
    () =>
      createPicture((canvas) => {
        const { preview } = photo;
        const k = Math.min(preview.width() / width, preview.height() / height);
        const paint = Skia.Paint();
        if (look !== "original") paint.setColorFilter(Skia.ColorFilter.MakeMatrix([...lookMatrix(look)]));
        canvas.drawImageRectOptions(
          preview,
          Skia.XYWHRect((preview.width() - width * k) / 2, (preview.height() - height * k) / 2, width * k, height * k),
          Skia.XYWHRect(0, 0, width, height),
          FilterMode.Linear,
          MipmapMode.Linear,
          paint,
        );
      }),
    [photo, look, width, height],
  );
  return (
    <Canvas pointerEvents="none" style={{ width, height }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
