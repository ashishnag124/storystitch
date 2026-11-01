import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import type { Platform } from "./platform";
import { ACCEPT, MAX_PHOTOS } from "./photos";

/** A button that opens a file input. `capture` opens the camera directly on phones. */
function FileButton(props: {
  label: string;
  accept?: string;
  capture?: boolean;
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
        capture={props.capture ? "environment" : undefined}
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
  /** `fromCamera` shots go to the tray; anything else opens the editor directly (unless the tray has photos). */
  onFiles: (files: File[], fromCamera: boolean) => void;
}

/** How to get photos in: per-platform buttons, plus drag and drop on desktop. */
export function PhotoSources({ platform, disabled, onFiles }: SourcesProps) {
  const [dragging, setDragging] = useState(false);
  const library = (className: string) => (
    <FileButton
      label={libraryLabel(platform)}
      accept={ACCEPT}
      multiple
      className={className}
      disabled={disabled}
      onFiles={(f) => onFiles(f, false)}
    />
  );

  if (platform === "desktop") {
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length && !disabled) onFiles(files, false);
    };
    return (
      <div
        className={`dropzone${dragging ? " dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
      >
        <p className="dropzone-title">Drag and drop photos here</p>
        <p className="hint">or</p>
        {library("primary big")}
      </div>
    );
  }

  return (
    <div className="sources">
      <FileButton
        label="Take photo"
        accept="image/*"
        capture
        className="primary big"
        disabled={disabled}
        onFiles={(f) => onFiles(f, true)}
      />
      {library("big")}
      {platform === "android" && (
        // No `accept` filter, so Android opens its file browser rather than the photo picker.
        <FileButton label="Files" multiple className="big" disabled={disabled} onFiles={(f) => onFiles(f, false)} />
      )}
    </div>
  );
}

/** Thumbnails of the camera shots so far, with "Take another", "add more" and "Make collage". */
export function Tray(props: {
  files: File[];
  platform: Platform;
  disabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (index: number) => void;
  onDone: () => void;
}) {
  const { files, platform, disabled } = props;
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  const full = files.length >= MAX_PHOTOS;

  return (
    <section className="tray" aria-label="Photos for your collage">
      <p className="tray-count" role="status">
        {files.length} of {MAX_PHOTOS} photos
      </p>
      <ul className="tray-thumbs">
        {files.map((_, i) => (
          <li key={urls[i]}>
            <img src={urls[i]} alt={`Photo ${i + 1}`} />
            <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => props.onRemove(i)}>
              ×
            </button>
          </li>
        ))}
      </ul>
      {!full && (
        <div className="sources">
          <FileButton label="Take another" accept="image/*" capture disabled={disabled} onFiles={props.onAdd} />
          <FileButton
            label={platform === "ios" ? "Add photos" : "Add from library"}
            accept={ACCEPT}
            multiple
            disabled={disabled}
            onFiles={props.onAdd}
          />
        </div>
      )}
      <button type="button" className="button primary big" disabled={disabled || !files.length} onClick={props.onDone}>
        Make collage
      </button>
    </section>
  );
}
