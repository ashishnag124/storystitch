import { useMemo, useState } from "react";
import { createWorkerDetector, describeSubjects, type Detector } from "./detect/detector";
import { AccountLink } from "./account/AccountLink";
import { Editor } from "./Editor";
import { PhotoSources, Tray } from "./PhotoSources";
import { ANALYSIS_LONG_SIDE, MAX_PHOTOS, UnsupportedPhotoError, downscale, loadPhoto, type Photo } from "./photos";
import { detectPlatform } from "./platform";

const PRIVACY = "Your photos stay on this device. Nothing is uploaded.";

// Created on first use, so the detection models only download after photos are picked.
let detector: Detector | undefined;

function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  /** Camera shots (and anything added after them) waiting for "Make collage". */
  const [tray, setTray] = useState<File[]>([]);
  const platform = useMemo(() => detectPlatform(navigator), []);
  const tooMany = `StoryStitch uses up to ${MAX_PHOTOS} photos, so it took the first ${MAX_PHOTOS}.`;

  function onFiles(files: File[], fromCamera: boolean) {
    if (!fromCamera && !tray.length) return void openPhotos(files);
    addToTray(files);
  }

  function addToTray(files: File[]) {
    const next = [...tray, ...files];
    setNotices(next.length > MAX_PHOTOS ? [tooMany] : []);
    setTray(next.slice(0, MAX_PHOTOS));
  }

  async function openPhotos(picked: File[]) {
    const notes: string[] = [];
    if (picked.length > MAX_PHOTOS) notes.push(tooMany);
    const files = picked.slice(0, MAX_PHOTOS);
    const loaded: Photo[] = [];
    setProgress({ step: "Preparing photos", done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      try {
        loaded.push(await loadPhoto(file));
      } catch (err) {
        if (!(err instanceof UnsupportedPhotoError)) console.error(err);
        notes.push(`Couldn't open ${file.name}. Try a JPEG, PNG, WebP or HEIC photo.`);
      }
      setProgress({ step: "Preparing photos", done: i + 1, total: files.length });
    }
    detector ??= createWorkerDetector();
    for (const [i, photo] of loaded.entries()) {
      setProgress({ step: "Finding subjects", done: i, total: loaded.length });
      photo.detections = await detector.detect(await downscale(photo.preview, ANALYSIS_LONG_SIDE));
    }
    setProgress(null);
    setNotices(notes);
    setSummary(describeSubjects(loaded.map((p) => p.detections)));
    setPhotos(loaded);
    setTray([]);
  }

  function startOver() {
    photos.forEach((p) => p.preview.close());
    setPhotos([]);
    setNotices([]);
  }

  if (photos.length) {
    return <Editor photos={photos} summary={summary} notices={notices} privacy={PRIVACY} onStartOver={startOver} />;
  }

  return (
    <main className="pick">
      <h1>StoryStitch</h1>
      <AccountLink />
      <p className="lede">Turn 1–8 photos into an Instagram Story collage.</p>
      {tray.length ? (
        <Tray
          files={tray}
          platform={platform}
          disabled={!!progress}
          onAdd={addToTray}
          onRemove={(i) => setTray(tray.filter((_, j) => j !== i))}
          onDone={() => void openPhotos(tray)}
        />
      ) : (
        <PhotoSources platform={platform} disabled={!!progress} onFiles={onFiles} />
      )}
      {progress && (
        <p role="status">
          {progress.step} {Math.min(progress.done + 1, progress.total)} of {progress.total}…
        </p>
      )}
      {notices.map((n) => (
        <p key={n} className="notice" role="alert">
          {n}
        </p>
      ))}
      <p className="privacy">{PRIVACY}</p>
    </main>
  );
}

export default App;
