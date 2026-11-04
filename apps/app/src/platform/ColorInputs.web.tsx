import "./color-inputs.css";

/** The round swatch that opens the system color picker. */
export function CustomSwatch({ value, checked, onChange }: { value: string; checked: boolean; onChange: (color: string) => void }) {
  return (
    <label className={`custom-swatch${checked ? " checked" : ""}`}>
      <span className="visually-hidden">Custom background color</span>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function BorderColor({ value, disabled, onChange }: { value: string; disabled: boolean; onChange: (color: string) => void }) {
  return (
    <label className="color-input">
      <span className="visually-hidden">Border color</span>
      <input type="color" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** A soft blurry circle, standing for the blurred photo. */
export const BlurFace = () => <span className="blur-face" />;
