import { describeSubjects } from "@storystitch/client";
import { useMemo, useState } from "react";
import { fetchPopularity } from "./api";
import { createWorkerDetector, type Detector } from "./detect/detector";
import { AccountLink } from "./account/AccountLink";
import { LayoutHero, Logo } from "./Brand";
import { Editor } from "./Editor";
import { PhotoSources } from "./PhotoSources";
import { ANALYSIS_LONG_SIDE, MAX_PHOTOS, UnsupportedPhotoError, downscale, loadPhoto, type Photo } from "./photos";
import { detectPlatform } from "./platform";

const PRIVACY = "Your photos stay on this device. They're never uploaded.";

// Created on first use, so the detection models only download after photos are picked.
let detector: Detector | undefined;

function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [popularity, setPopularity] = useState<Record<string, number>>({});
  const platform = useMemo(() => detectPlatform(navigator), []);
  const tooMany = `StoryStitch uses up to ${MAX_PHOTOS} photos, so it took the first ${MAX_PHOTOS}.`;

  async function openPhotos(picked: File[]) {
    const notes: string[] = [];
    // Fetched alongside preparing the photos; ranking waits for it only as long as that takes, or its short timeout.
    const popular = fetchPopularity();
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
    setPopularity(await popular);
    setProgress(null);
    setNotices(notes);
    setSummary(describeSubjects(loaded.map((p) => p.detections)));
    setPhotos(loaded);
  }

  function startOver() {
    photos.forEach((p) => p.preview.close());
    setPhotos([]);
    setNotices([]);
  }

  if (photos.length) {
    return <Editor photos={photos} summary={summary} notices={notices} privacy={PRIVACY} popularity={popularity} onStartOver={startOver} />;
  }

  return (
    <main className="pick">
      <header className="brand">
        <Logo />
        <h1>StoryStitch</h1>
      </header>
      <AccountLink />
      <LayoutHero />
      <p className="headline">
        Up to 8 photos.
        <br />
        <span>One story.</span>
      </p>
      <p className="lede">Turn 1–8 photos into an Instagram Story collage.</p>
      <PhotoSources platform={platform} disabled={!!progress} onFiles={(files) => void openPhotos(files)} />
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
