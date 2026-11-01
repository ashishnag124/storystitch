import { useEffect, useRef } from "react";
import type { Photo } from "./photos";
import { drawScene, previewOf } from "./render";
import type { Scene } from "./scene";

const THUMB = { width: 135, height: 240 };

interface Props {
  options: Scene[];
  current: Scene;
  photos: Photo[];
  onSelect: (option: Scene) => void;
}

/** Each layout option previewed with the user's own photos, as it would open. */
export function LayoutStrip({ options, current, photos, onSelect }: Props) {
  return (
    <div className="strip" role="radiogroup" aria-label="Layouts">
      {options.map((option) => (
        <Thumb
          key={option.layout.id}
          option={option}
          photos={photos}
          checked={option.layout.id === current.layout.id}
          onSelect={() => onSelect(option)}
        />
      ))}
    </div>
  );
}

function Thumb(props: { option: Scene; photos: Photo[]; checked: boolean; onSelect: () => void }) {
  const { option, photos, checked, onSelect } = props;
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (ctx) drawScene(ctx, THUMB, option, (i) => previewOf(photos[i]!));
  }, [option, photos]);

  return (
    <button type="button" role="radio" aria-checked={checked} aria-label={option.layout.name} className="thumb" onClick={onSelect}>
      <canvas ref={ref} width={THUMB.width} height={THUMB.height} aria-hidden="true" />
    </button>
  );
}
