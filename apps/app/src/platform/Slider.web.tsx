import "./slider.css";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown beside the slider. */
  display: string;
  disabled?: boolean;
  /** Just the track: the label is only spoken, and no value is shown. For a row with other controls. */
  bare?: boolean;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step, display, disabled, bare, onChange }: Props) {
  if (bare)
    return (
      <input className="bare-slider" type="range" aria-label={label} min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
    );
  return (
    <label className="tool-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="tool-value" aria-hidden="true">
        {display}
      </span>
    </label>
  );
}
