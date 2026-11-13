import { applyLook, lookMatrix, type LookId } from "@storystitch/client";
import { useEffect, useRef } from "react";
import type { Photo } from "./photos.web";

/** Canvas pixels per shown pixel, for sharp thumbnails on high-density screens. */
const DENSITY = 2;

/** A small piece of the photo, center-cropped to the thumbnail's shape, with the look applied. */
export function LookThumb({ photo, look, width, height }: { photo: Photo; look: LookId; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    const { preview } = photo;
    const [w, h] = [width * DENSITY, height * DENSITY];
    const k = Math.min(preview.width / w, preview.height / h);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(preview, (preview.width - w * k) / 2, (preview.height - h * k) / 2, w * k, h * k, 0, 0, w, h);
    if (look === "original") return;
    const data = ctx.getImageData(0, 0, w, h);
    applyLook(data.data, lookMatrix(look));
    ctx.putImageData(data, 0, 0);
  }, [photo, look, width, height]);
  return <canvas ref={ref} width={width * DENSITY} height={height * DENSITY} aria-hidden style={{ width, height, display: "block" }} />;
}
