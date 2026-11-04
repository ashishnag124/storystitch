import { useState, type ChangeEvent, type DragEvent } from "react";
import type { Platform } from "./platform";
import { ACCEPT } from "./photos";

/** A button that opens a file input. */
function FileButton(props: {
  label: string;
  accept?: string;
  multiple?: boolean;
  className?: string;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}) {
  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // so picking the same files again still fires change
    if (files.length) props.onFiles(files);
  }
  return (
    <label className={`button ${props.className ?? ""}${props.disabled ? " disabled" : ""}`}>
      {props.label}
      <input
        className="visually-hidden"
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        onChange={onChange}
      />
    </label>
  );
}

/** The library button: Android's photo picker, or (on iPhone) Apple's menu, or a file dialog on desktop. */
const libraryLabel = (platform: Platform) =>
  platform === "android" ? "Photo library" : platform === "ios" ? "Choose photos" : "Upload photos";

interface SourcesProps {
  platform: Platform;
  disabled: boolean;
  onFiles: (files: File[]) => void;
}

/** How to get photos in: per-platform buttons, plus drag and drop on desktop. */
export function PhotoSources({ platform, disabled, onFiles }: SourcesProps) {
  const [dragging, setDragging] = useState(false);
  const library = (
    <FileButton
      label={libraryLabel(platform)}
      accept={ACCEPT}
      multiple
      className="primary big"
      disabled={disabled}
      onFiles={onFiles}
    />
  );

  if (platform === "desktop") {
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length && !disabled) onFiles(files);
    };
    return (
      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        data-testid="dropzone"
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <p className="dropzone-title">Drag and drop photos here</p>
        <p className="hint">or</p>
        {library}
      </div>
    );
  }

  return (
    <div className="sources">
      {library}
      {platform === "android" && (
        // No `accept` filter, so Android opens its file browser rather than the photo picker.
        <FileButton label="Files" multiple className="big" disabled={disabled} onFiles={onFiles} />
      )}
    </div>
  );
}
