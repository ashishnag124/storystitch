import { Button } from "../ui/Button";
import type { PickedPhoto } from "./photos.native";

// Stage 3: the native photo picker. Until then, debug builds can open the editor with placeholder photos.
export function PhotoSources({ onPicked }: { onPicked: (photos: PickedPhoto[]) => void }) {
  return __DEV__ ? <Button label="Use sample photos" primary onPress={() => onPicked([1600, 1200, 900])} /> : null;
}
