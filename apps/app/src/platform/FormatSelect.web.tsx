import type { ExportFormat } from "./exportImage";
import "./format.css";

export function FormatSelect({ value, onChange }: { value: ExportFormat; onChange: (format: ExportFormat) => void }) {
  return (
    <label className="format">
      Format
      <select value={value} onChange={(e) => onChange(e.target.value as ExportFormat)}>
        <option value="image/jpeg">JPEG</option>
        <option value="image/png">PNG</option>
      </select>
    </label>
  );
}
