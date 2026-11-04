import { cellShapes, type Outline, type Scene } from "@storystitch/client";
import { drawOrder } from "@storystitch/shared";
import { colors } from "../theme";

const THUMB = { width: 135, height: 240 };

/** A layout option drawn as a plain diagram of its cells, so the shape of the layout is easy to read. */
export function Diagram({ option, checked }: { option: Scene; checked: boolean }) {
  const shapes = cellShapes(option.layout, option.style, THUMB);
  const cell = checked ? colors.coral : colors.border;
  return (
    <svg viewBox={`0 0 ${THUMB.width} ${THUMB.height}`} width={54} height={96} aria-hidden="true" style={{ display: "block", borderRadius: 6 }}>
      <rect width={THUMB.width} height={THUMB.height} fill={colors.bg} stroke={colors.border} strokeWidth={2} />
      {drawOrder(option.layout.cells).map((i) => {
        const { outline, photo } = shapes[i]!;
        return (
          <g key={i}>
            <Shape outline={outline} testId={photo ? "diagram-card" : "diagram-cell"} fill={photo ? colors.muted : cell} />
            {photo && <Shape outline={photo} testId="diagram-cell" fill={cell} />}
          </g>
        );
      })}
    </svg>
  );
}

function Shape({ outline, testId, fill }: { outline: Outline; testId: string; fill: string }) {
  const paint = { fill, stroke: colors.bg, strokeWidth: 2, strokeLinejoin: "round" as const, "data-testid": testId };
  return outline.kind === "circle" ? (
    <circle {...paint} cx={outline.cx} cy={outline.cy} r={outline.r} />
  ) : (
    <polygon {...paint} points={outline.points.map((p) => `${p.x},${p.y}`).join(" ")} />
  );
}
