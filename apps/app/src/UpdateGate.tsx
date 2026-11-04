import { createApi, isOlderVersion } from "@storystitch/client";
import { nativeApplicationVersion } from "expo-application";
import { useEffect, useState, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { API_URL } from "./config";

const { fetchMinimumVersion } = createApi({ apiUrl: API_URL, popularity: false });

/**
 * iOS users can stay on an old version for months, so the API says which is the oldest it supports. The app opens
 * straight away and is replaced only once the API has said this version is too old: a failed check changes nothing.
 */
export function UpdateGate({ children }: { children: ReactNode }) {
  const [tooOld, setTooOld] = useState(false);

  useEffect(() => {
    void fetchMinimumVersion().then((minimum) => {
      if (minimum && nativeApplicationVersion && isOlderVersion(nativeApplicationVersion, minimum.ios)) setTooOld(true);
    });
  }, []);

  if (!tooOld) return children;
  return (
    <View style={styles.page} role="main">
      <Text role="heading" aria-level={1} style={styles.title}>
        Please update StoryStitch
      </Text>
      <Text style={styles.body}>This version is no longer supported. Update to the latest version to keep making stories.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 32, backgroundColor: "#2b1340" },
  title: { fontSize: 28, fontWeight: "700", color: "#fff", textAlign: "center" },
  body: { fontSize: 17, color: "#fff", textAlign: "center" },
});
