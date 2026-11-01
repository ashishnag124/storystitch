import type { Layout } from "@storystitch/shared";
import { useState } from "react";
import { DEFAULT_BACKGROUND, DEFAULT_STYLE, backgroundOf, borderOf, type Style } from "./scene";

const SWATCHES = [
  { name: "Cream", color: "#f4efe6" },
  { name: "White", color: "#ffffff" },
  { name: "Black", color: "#111111" },
  { name: "Sage", color: "#d9e4d3" },
  { name: "Blush", color: "#f6d9d5" },
  { name: "Navy", color: "#1e3a5f" },
] as const;

/** Slider ranges, in pixels of the 1080-wide export. */
const RANGES = { gap: 48, margin: 96, radius: 60, border: 40 } as const;

const PROPERTIES = [
  { id: "background", label: "Color" },
  { id: "gap", label: "Spacing" },
  { id: "margin", label: "Margin" },
  { id: "radius", label: "Corners" },
  { id: "border", label: "Border" },
] as const;
type Property = (typeof PROPERTIES)[number]["id"];

interface Props {
  layout: Layout;
  style: Style;
  onChange: (style: Style) => void;
}

/**
 * Style as a compact tool, like a photo app's "Adjust": chips pick the property, and one control for it shows
 * below. The defaults should look good without touching anything.
 */
export function StylePanel({ layout, style, onChange }: Props) {
  const [property, setProperty] = useState<Property>("background");
  const background = backgroundOf(layout, style);
  const isPreset = background.kind === "color" && SWATCHES.some((s) => s.color === background.color);
  const set = (patch: Partial<Style>) => onChange({ ...style, ...patch });

  const slider = (key: keyof typeof RANGES, label: string, value: number) => (
    <label className="tool-slider">
      <span>{label}</span>
      <input
        type="range"
        min={0}
        max={RANGES[key]}
        step={1}
        value={value}
        disabled={layout.bleed}
        onChange={(e) => set({ [key]: Number(e.target.value) })}
      />
      <span className="tool-value" aria-hidden="true">
        {value}
      </span>
    </label>
  );

  return (
    <div className="style-tool">
      <div className="chips" role="radiogroup" aria-label="Style property">
        {PROPERTIES.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={property === p.id}
            className="chip"
            onClick={() => setProperty(p.id)}
          >
            {p.label}
          </button>
        ))}
        <button type="button" className="chip" onClick={() => onChange(DEFAULT_STYLE)}>
          Reset style
        </button>
      </div>

      <div className="style-control" key={property}>
        {property === "background" && (
          <div className="swatches" role="group" aria-label="Color">
            {SWATCHES.map((s) => (
              <button
                key={s.color}
                type="button"
                className="swatch"
                style={{ background: s.color }}
                aria-label={s.name}
                aria-pressed={background.kind === "color" && background.color === s.color}
                onClick={() => set({ background: { kind: "color", color: s.color } })}
              />
            ))}
            <button
              type="button"
              className="swatch blur"
              aria-label="Blurred photo"
              aria-pressed={background.kind === "blur"}
              onClick={() => set({ background: { kind: "blur" } })}
            />
            <label className={`swatch custom${background.kind === "color" && !isPreset ? " checked" : ""}`}>
              <span className="visually-hidden">Custom background color</span>
              <input
                type="color"
                value={background.kind === "color" ? background.color : DEFAULT_BACKGROUND.color}
                onChange={(e) => set({ background: { kind: "color", color: e.target.value } })}
              />
            </label>
          </div>
        )}
        {property !== "background" && layout.bleed && (
          <p className="hint">This layout runs to the edges, so it has no spacing or border.</p>
        )}
        {property === "gap" && slider("gap", "Spacing", style.gap)}
        {property === "margin" && slider("margin", "Margin", style.margin)}
        {property === "radius" && slider("radius", "Corners", style.radius)}
        {property === "border" && (
          <div className="border-row">
            {slider("border", "Border", borderOf(layout, style))}
            <label className="color-input">
              <span className="visually-hidden">Border color</span>
              <input
                type="color"
                value={style.borderColor}
                disabled={layout.bleed}
                onChange={(e) => set({ borderColor: e.target.value })}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
