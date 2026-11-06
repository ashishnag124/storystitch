import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MIN_TARGET, colors, fontFamily, shadows } from "../theme";

/** How long an informational toast stays up. */
const TOAST_MS = 6000;

export interface ToastMessage {
  text: string;
  alert: boolean;
}

/** A message over the screen. Informational ones fade on their own; alerts stay until closed. */
export function Toast({ text, alert, onClose }: ToastMessage & { onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (alert) return;
    const timer = setTimeout(() => close.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [alert]);
  return (
    <View role={alert ? "alert" : undefined} style={[styles.toast, alert && styles.notice]}>
      <Text style={[styles.toastText, alert && styles.noticeText]}>{text}</Text>
      <Pressable role="button" aria-label="Dismiss" onPress={onClose} style={styles.toastClose}>
        <Text style={[styles.toastClosing, alert && styles.noticeText]}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingLeft: 14,
    paddingVertical: 4,
    paddingRight: 4,
    borderRadius: 14,
    backgroundColor: "rgba(28, 25, 23, 0.88)",
    ...shadows.soft,
  },
  notice: { backgroundColor: colors.warnBg },
  toastText: { fontFamily, flexShrink: 1, fontSize: 14, color: "#fff" },
  noticeText: { color: colors.warnText },
  toastClose: { width: MIN_TARGET, height: MIN_TARGET, alignItems: "center", justifyContent: "center" },
  toastClosing: { fontFamily, fontSize: 20, color: "#fff" },
});
