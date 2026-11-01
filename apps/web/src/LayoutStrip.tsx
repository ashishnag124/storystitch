import { drawOrder } from "@storystitch/shared";
import { cellShapes, type Scene } from "./scene";

const THUMB = { width: 135, height: 240 };

interface Props {
  options: Scene[];
  current: Scene;
  onSelect: (option: Scene) => void;
}

/** Each layout option drawn as a plain diagram of its cells, so the shape of the layout is easy to read. */
export function LayoutStrip({ options, current, onSelect }: Props) {
  return (
    <div className="strip" role="radiogroup" aria-label="Layouts">
      {options.map((option) => (
        <button
          key={option.layout.id}
          type="button"
          role="radio"
          aria-checked={option.layout.id === current.layout.id}
          aria-label={option.layout.name}
          className="thumb"
          onClick={() => onSelect(option)}
        >
          <Diagram option={option} />
        </button>
      ))}
    </div>
  );
}

function Diagram({ option }: { option: Scene }) {
  const shapes = cellShapes(option.layout, option.style, THUMB);
  return (
    <svg viewBox={`0 0 ${THUMB.width} ${THUMB.height}`} aria-hidden="true">
      <rect className="diagram-frame" width={THUMB.width} height={THUMB.height} />
      {drawOrder(option.layout.cells).map((i) => {
        const { outline } = shapes[i]!;
        return outline.kind === "circle" ? (
          <circle key={i} className="diagram-cell" cx={outline.cx} cy={outline.cy} r={outline.r} />
        ) : (
          <polygon key={i} className="diagram-cell" points={outline.points.map((p) => `${p.x},${p.y}`).join(" ")} />
        );
      })}
    </svg>
  );
}
