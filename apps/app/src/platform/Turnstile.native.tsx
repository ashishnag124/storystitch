import { Text } from "react-native";
import { type } from "../theme";

// Stage 3: a hosted Turnstile page in a WebView. Until then sign-in can't complete on iOS.
export const Turnstile = () => (
  <Text style={type.hint}>Sign-in isn't available in this build yet.</Text>
);
