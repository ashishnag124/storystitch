import "./slider.css";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  /** The value as shown beside the slider. */
  display: string;
  onChange: (value: number) => void;
}

export function Slider({ label, value, min, max, step, display, onChange }: Props) {
  return (
    <label className="tool-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span className="tool-value" aria-hidden="true">
        {display}
      </span>
    </label>
  );
}
