import { Text } from "react-native";
import { type } from "../theme";

// Stage 3: a native slider.
export const Slider = ({ label, display }: { label: string; display: string }) => <Text style={type.hint}>{`${label} ${display}`}</Text>;
