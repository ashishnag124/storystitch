import { Linking, Pressable, Text } from "react-native";
import { navigate } from "../platform/route";
import { quietStyles } from "./Button";

const QuietLink = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <Pressable role="link" onPress={onPress} style={quietStyles.button}>
    <Text style={quietStyles.label}>{label}</Text>
  </Pressable>
);

/** A quiet link to another screen in the app. */
export const NavLink = ({ to, label }: { to: string; label: string }) => <QuietLink label={label} onPress={() => navigate(to)} />;

/** A quiet link that leaves the app, to a page in the browser. */
export const ExternalLink = ({ url, label }: { url: string; label: string }) => <QuietLink label={label} onPress={() => void Linking.openURL(url)} />;
