import { ScrollView, StyleSheet, Text, View } from "react-native";
import { AccountLink } from "./AccountLink";
import { POLICY_NOTICE_UNTIL, PRIVACY_URL, USAGE_ENABLED } from "./config";
import { Hero } from "./platform/Hero";
import { PhotoSources } from "./platform/PhotoSources";
import type { PickedPhoto } from "./platform/photos";
import { colors, fontFamily, type } from "./theme";
import { Logo } from "./ui/Logo";
import { ExternalLink } from "./ui/NavLink";

const POLICY_NOTICE = USAGE_ENABLED && Date.now() < Date.parse(POLICY_NOTICE_UNTIL);

interface Props {
  privacy: string;
  progress: { step: string; done: number; total: number } | null;
  notices: string[];
  onPicked: (photos: PickedPhoto[]) => void;
}

export function PickScreen({ privacy, progress, notices, onPicked }: Props) {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View role="main" style={styles.main}>
        <View style={styles.brand}>
          <Logo />
          <Text role="heading" aria-level={1} style={styles.name}>
            StoryStitch
          </Text>
        </View>
        <View style={styles.account}>
          <AccountLink />
        </View>
        <Hero />
        <Text style={styles.headline}>
          Up to 8 photos.{"\n"}
          <Text style={styles.accent}>One story.</Text>
        </Text>
        <Text style={styles.lede}>Turn 1–8 photos into an Instagram Story collage.</Text>
        <PhotoSources disabled={!!progress} onPicked={onPicked} />
        {progress && (
          <Text role="status" style={type.body}>
            {progress.step} {Math.min(progress.done + 1, progress.total)} of {progress.total}…
          </Text>
        )}
        {notices.map((n) => (
          <Text key={n} role="alert" style={styles.notice}>
            {n}
          </Text>
        ))}
        <Text style={styles.privacy}>{privacy}</Text>
        {POLICY_NOTICE && (
          <>
            <Text style={styles.privacy}>We've updated our privacy policy. We now count how the app is used, anonymously.</Text>
            <ExternalLink url={PRIVACY_URL} label="Read the privacy policy" />
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1 },
  main: { flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 16, paddingVertical: 24, paddingHorizontal: 16 },
  brand: { position: "absolute", top: 16, left: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  account: { position: "absolute", top: 12, right: 16 },
  name: { fontFamily, fontSize: 22, fontWeight: "800", letterSpacing: -0.44, color: colors.text },
  headline: { fontFamily, fontSize: 36, fontWeight: "800", lineHeight: 36, letterSpacing: -0.72, color: colors.text, textAlign: "center" },
  accent: { color: colors.accent },
  lede: { ...type.body, maxWidth: 280, color: colors.muted, textAlign: "center" },
  notice: { ...type.body, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.warnBg, color: colors.warnText },
  privacy: { ...type.hint, textAlign: "center" },
});
