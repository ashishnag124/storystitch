import { UIImagePickerPreferredAssetRepresentationMode, launchImageLibraryAsync } from "expo-image-picker";
import { useState } from "react";
import { Text } from "react-native";
import { type } from "../theme";
import { Button } from "../ui/Button";
import type { PickedPhoto } from "./photos.native";

/** The system photo picker, which needs no permission: the app only ever sees the photos you choose. */
export function PhotoSources({ disabled, onPicked }: { disabled: boolean; onPicked: (photos: PickedPhoto[]) => void }) {
  // After Done, iOS can take seconds to hand the photos over (iCloud downloads, HEIC to JPEG). The picker covers this
  // text while it's open, so it shows from the moment the picker closes.
  const [fetching, setFetching] = useState(false);
  async function choose() {
    setFetching(true);
    try {
      const { canceled, assets } = await launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        orderedSelection: true,
        quality: 1,
        // Skia can't decode HEIC, the iPhone camera's default format, so iOS hands over a JPEG copy instead.
        preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!canceled) onPicked(assets.map((a, i) => ({ name: a.fileName ?? `Photo ${i + 1}`, uri: a.uri })));
    } finally {
      setFetching(false);
    }
  }
  return (
    <>
      <Button label="Choose photos" primary big disabled={disabled || fetching} onPress={() => void choose()} />
      {fetching && (
        <Text role="status" style={type.body}>
          Getting your photos…
        </Text>
      )}
    </>
  );
}
