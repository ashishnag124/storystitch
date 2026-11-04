import { UIImagePickerPreferredAssetRepresentationMode, launchImageLibraryAsync } from "expo-image-picker";
import { Button } from "../ui/Button";
import type { PickedPhoto } from "./photos.native";

/** The system photo picker, which needs no permission: the app only ever sees the photos you choose. */
export function PhotoSources({ disabled, onPicked }: { disabled: boolean; onPicked: (photos: PickedPhoto[]) => void }) {
  async function choose() {
    const { canceled, assets } = await launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      orderedSelection: true,
      quality: 1,
      // Skia can't decode HEIC, the iPhone camera's default format, so iOS hands over a JPEG copy instead.
      preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (!canceled) onPicked(assets.map((a, i) => ({ name: a.fileName ?? `Photo ${i + 1}`, uri: a.uri })));
  }
  return <Button label="Choose photos" primary big disabled={disabled} onPress={() => void choose()} />;
}
