import type { Layout } from "@storystitch/shared";
import { useEffect, useRef } from "react";
import type { Photo } from "./photos";
import { drawScene, previewOf } from "./render";
import { newScene, type Scene } from "./scene";

const THUMB = { width: 135, height: 240 };

interface Props {
  options: Layout[];
  current: Scene;
  photos: Photo[];
  onSelect: (layout: Layout) => void;
}

/** Each layout option previewed with the user's own photos. */
export function LayoutStrip({ options, current, photos, onSelect }: Props) {
  return (
    <div className="strip" role="radiogroup" aria-label="Layouts">
      {options.map((layout) => (
        <Thumb
          key={layout.id}
          layout={layout}
          order={current.order}
          photos={photos}
          checked={layout.id === current.layout.id}
          onSelect={() => onSelect(layout)}
        />
      ))}
    </div>
  );
}

function Thumb(props: { layout: Layout; order: number[]; photos: Photo[]; checked: boolean; onSelect: () => void }) {
  const { layout, order, photos, checked, onSelect } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawScene(ctx, THUMB, newScene(layout, photos, undefined, order), (i) => previewOf(photos[i]!));
  }, [layout, order, photos]);

  return (
    <button type="button" role="radio" aria-checked={checked} aria-label={layout.name} className="thumb" onClick={onSelect}>
      <canvas ref={ref} width={THUMB.width} height={THUMB.height} aria-hidden="true" />
    </button>
  );
}
