import { describeSubjects, screenFor } from "@storystitch/client";
import { Suspense, useEffect, useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { fetchPopularity } from "./api";
import { Editor } from "./Editor";
import { PickScreen } from "./PickScreen";
import { PERF_READOUT } from "./config";
import { PerfReadout } from "./PerfReadout";
import { Accounts } from "./platform/lazyScreens";
import { ACCOUNT_PATHS, useLocation } from "./platform/route";
import { UnsupportedPhotoError, analyzePhoto, closePhoto, loadPhoto, type PickedPhoto, type Photo } from "./platform/photos";
import { Screen } from "./ui/Screen";
import { track } from "./usage";

const MAX_PHOTOS = 8;
const PRIVACY = "Your photos stay on this device. Nothing is uploaded.";

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const [popularity, setPopularity] = useState<Record<string, number>>({});

  async function openPhotos(picked: PickedPhoto[]) {
    const notes: string[] = [];
    // Fetched alongside preparing the photos; ranking waits for it only as long as that takes, or its short timeout.
    const popular = fetchPopularity();
    if (picked.length > MAX_PHOTOS) notes.push(`StoryStitch uses up to ${MAX_PHOTOS} photos, so it took the first ${MAX_PHOTOS}.`);
    const files = picked.slice(0, MAX_PHOTOS);
    const loaded: Photo[] = [];
    setProgress({ step: "Preparing photos", done: 0, total: files.length });
    for (const [i, file] of files.entries()) {
      try {
        loaded.push(await loadPhoto(file));
      } catch (err) {
        if (!(err instanceof UnsupportedPhotoError)) console.error(err);
        notes.push(`Couldn't open ${file.name}. Try a JPEG, PNG, WebP or HEIC photo.`);
        track("error_shown", { code: "photo_unreadable" });
      }
      setProgress({ step: "Preparing photos", done: i + 1, total: files.length });
    }
    for (const [i, photo] of loaded.entries()) {
      setProgress({ step: "Finding subjects", done: i, total: loaded.length });
      photo.detections = await analyzePhoto(photo);
    }
    setPopularity(await popular);
    setProgress(null);
    setNotices(notes);
    setSummary(describeSubjects(loaded.map((p) => p.detections)));
    setPhotos(loaded);
    if (loaded.length) track("photos_picked", { count: loaded.length });
  }

  function startOver() {
    photos.forEach(closePhoto);
    setPhotos([]);
    setNotices([]);
  }

  // VoiceOver stays on an open account screen, which covers this one. The bot check's page also holds only the check.
  const { pathname } = useLocation();
  const covered = Boolean(Accounts) && (pathname === "/bot-check" || ACCOUNT_PATHS.some((p) => p === pathname));

  const screen = screenFor(pathname, photos.length > 0);
  useEffect(() => track("screen_viewed", { screen }), [screen]);

  return (
    <SafeAreaProvider>
      <Screen>
        <View aria-hidden={covered} collapsable={false} style={{ flex: 1 }}>
          {photos.length ? (
            <Editor photos={photos} summary={summary} notices={notices} privacy={PRIVACY} popularity={popularity} onStartOver={startOver} />
          ) : (
            <PickScreen privacy={PRIVACY} progress={progress} notices={notices} onPicked={(p) => void openPhotos(p)} />
          )}
        </View>
        {Accounts && (
          <Suspense fallback={null}>
            <Accounts />
          </Suspense>
        )}
        {PERF_READOUT && <PerfReadout />}
      </Screen>
    </SafeAreaProvider>
  );
}
