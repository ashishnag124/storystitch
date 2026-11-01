import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { layouts } from "@storystitch/shared";
import { renderLayout } from "./render";

const layout = layouts.find((l) => l.cells.length === 2)!;

function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<ImageBitmap[]>([]);
  const ready = images.length === layout.cells.length;

  useEffect(() => {
    if (ready && canvasRef.current) renderLayout(canvasRef.current, layout, images);
  }, [ready, images]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, layout.cells.length);
    // "from-image" applies the photo's EXIF orientation.
    setImages(await Promise.all(files.map((f) => createImageBitmap(f, { imageOrientation: "from-image" }))));
  }

  function onExport() {
    canvasRef.current?.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "storystitch.jpg";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url));
      },
      "image/jpeg",
      0.9,
    );
  }

  return (
    <main>
      <h1>StoryStitch</h1>
      <p>Your photos stay on this device. Nothing is uploaded.</p>
      <label>
        Choose 2 photos <input type="file" accept="image/*" multiple onChange={onPick} />
      </label>
      <canvas ref={canvasRef} hidden={!ready} aria-label="Story preview" />
      <button type="button" disabled={!ready} onClick={onExport}>
        Export JPEG
      </button>
    </main>
  );
}

export default App;
