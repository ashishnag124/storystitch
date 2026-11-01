import type { Layout } from "@storystitch/shared";
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

interface Props {
  layout: Layout;
  style: Style;
  onChange: (style: Style) => void;
}

/** Spacing, margin, corners, border and background. Collapsed by default: the defaults should look good. */
export function StylePanel({ layout, style, onChange }: Props) {
  const background = backgroundOf(layout, style);
  const isPreset = background.kind === "color" && SWATCHES.some((s) => s.color === background.color);
  const set = (patch: Partial<Style>) => onChange({ ...style, ...patch });

  const slider = (key: keyof typeof RANGES, label: string, value: number) => (
    <label className="style-slider">
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
    </label>
  );

  return (
    <details className="style-panel">
      <summary>Style</summary>
      <fieldset className="swatches">
        <legend>Background</legend>
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
      </fieldset>

      {layout.bleed && <p className="hint">This layout runs to the edges, so it has no spacing or border.</p>}
      {slider("gap", "Spacing", style.gap)}
      {slider("margin", "Margin", style.margin)}
      {slider("radius", "Corners", style.radius)}
      {slider("border", "Border", borderOf(layout, style))}
      <label className="style-slider">
        <span>Border color</span>
        <input
          type="color"
          value={style.borderColor}
          disabled={layout.bleed}
          onChange={(e) => set({ borderColor: e.target.value })}
        />
      </label>

      <button type="button" className="button" onClick={() => onChange(DEFAULT_STYLE)}>
        Reset style
      </button>
    </details>
  );
}
