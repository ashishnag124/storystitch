import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { WEB_URL } from "../config";

/**
 * Cloudflare's bot check doesn't run natively, so the app shows the web app's /bot-check page in a WebView, on the
 * domain the Turnstile widget allows. The page sends back a single-use token, or an empty message when it expires.
 */
export function Turnstile({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  return <WebView key={resetKey} source={{ uri: `${WEB_URL}/bot-check` }} style={styles.check} scrollEnabled={false} originWhitelist={["*"]} onMessage={(e) => onToken(e.nativeEvent.data || null)} />;
}

const styles = StyleSheet.create({
  check: { height: 72, backgroundColor: "transparent" },
});
