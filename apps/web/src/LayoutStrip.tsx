import { drawOrder } from "@storystitch/shared";
import { cellShapes, type Outline as OutlineShape, type Scene } from "./scene";

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
        const { outline, photo } = shapes[i]!;
        return (
          <g key={i}>
            <Outline outline={outline} className={photo ? "diagram-card" : "diagram-cell"} />
            {photo && <Outline outline={photo} className="diagram-cell" />}
          </g>
        );
      })}
    </svg>
  );
}

function Outline({ outline, className }: { outline: OutlineShape; className: string }) {
  return outline.kind === "circle" ? (
    <circle className={className} cx={outline.cx} cy={outline.cy} r={outline.r} />
  ) : (
    <polygon className={className} points={outline.points.map((p) => `${p.x},${p.y}`).join(" ")} />
  );
}
