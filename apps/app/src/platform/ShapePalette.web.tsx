// The shape palette of a blank canvas: tap a shape to add it in the middle, or drag it onto the canvas. Tidy is at the end.
import { type KeyboardEvent, type PointerEvent } from "react";
import { Button } from "../ui/Button";
import { ShapeGlyph } from "../ui/ShapeGlyph";
import type { Palette } from "../useLayoutEditor";

export function ShapePalette({ palette }: { palette: Palette }) {
  return (
    <div className="builder-palette" role="group" aria-label="Shapes">
      {palette.shapes.map(({ shape, label }) => (
        <button
          key={shape}
          type="button"
          data-testid="palette-shape"
          className="builder-shape"
          aria-label={label}
          aria-disabled={palette.disabled}
          disabled={palette.disabled}
          onPointerDown={(e: PointerEvent) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            palette.grab(shape, e.clientX, e.clientY);
          }}
          onPointerMove={(e: PointerEvent) => palette.move(e.clientX, e.clientY)}
          onPointerUp={palette.drop}
          onPointerCancel={palette.cancel}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            palette.tap(shape);
          }}
        >
          <ShapeGlyph shape={shape} />
        </button>
      ))}
      <Button label="Tidy" quiet disabled={palette.tidy.disabled} onPress={palette.tidy.onPress} />
      {palette.ghost && (
        <div className="builder-ghost shape" style={{ left: palette.ghost.x - 28, top: palette.ghost.y - 28 }}>
          <ShapeGlyph shape={palette.ghost.shape} />
        </div>
      )}
    </div>
  );
}
