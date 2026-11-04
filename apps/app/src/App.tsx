import { describeSubjects } from "@storystitch/client";
import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PickScreen } from "./PickScreen";
import { UnsupportedPhotoError, analyzePhoto, closePhoto, loadPhoto, type PickedPhoto, type Photo } from "./platform/photos";
import { type } from "./theme";
import { Button } from "./ui/Button";
import { Screen } from "./ui/Screen";

const MAX_PHOTOS = 8;
const PRIVACY = "Your photos stay on this device. Nothing is uploaded.";

export default function App() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [progress, setProgress] = useState<{ step: string; done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [notices, setNotices] = useState<string[]>([]);

  async function openPhotos(picked: PickedPhoto[]) {
    const notes: string[] = [];
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
      }
      setProgress({ step: "Preparing photos", done: i + 1, total: files.length });
    }
    for (const [i, photo] of loaded.entries()) {
      setProgress({ step: "Finding subjects", done: i, total: loaded.length });
      photo.detections = await analyzePhoto(photo);
    }
    setProgress(null);
    setNotices(notes);
    setSummary(describeSubjects(loaded.map((p) => p.detections)));
    setPhotos(loaded);
  }

  function startOver() {
    photos.forEach(closePhoto);
    setPhotos([]);
    setNotices([]);
  }

  return (
    <SafeAreaProvider>
      <Screen>
        {photos.length ? (
          // The editor arrives in the next step.
          <View role="main">
            <Text style={type.body}>{`${photos.length} photos ready. ${summary ?? ""}`}</Text>
            <Button label="Start over" onPress={startOver} />
          </View>
        ) : (
          <PickScreen privacy={PRIVACY} progress={progress} notices={notices} onPicked={(p) => void openPhotos(p)} />
        )}
      </Screen>
    </SafeAreaProvider>
  );
}
