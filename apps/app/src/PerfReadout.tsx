// Timing numbers on screen, for checking speed on a real phone. Only in builds with EXPO_PUBLIC_PERF_READOUT=true.
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { PERF_READOUT } from "./config";

const WINDOW_MS = 5000;

/** The last times measured by the app, in ms. */
export const perfTimes = { exportMs: 0, switchMs: 0 };

/** Records how long a layout switch held the app up: from the tap until the next frames are drawn. */
export function timeLayoutSwitch() {
  if (!PERF_READOUT) return;
  const start = performance.now();
  requestAnimationFrame(() => requestAnimationFrame(() => (perfTimes.switchMs = performance.now() - start)));
}

/** A frame that takes long means the app couldn't respond to touches for that long. */
export function PerfReadout() {
  const [text, setText] = useState("");
  useEffect(() => {
    let last = performance.now();
    let worst = 0;
    let windowStart = last;
    let id = requestAnimationFrame(function step(now) {
      worst = Math.max(worst, now - last);
      last = now;
      if (now - windowStart >= WINDOW_MS) {
        setText(`Worst freeze ${Math.round(worst)} ms · Export ${Math.round(perfTimes.exportMs)} ms · Switch ${Math.round(perfTimes.switchMs)} ms`);
        worst = 0;
        windowStart = now;
      }
      id = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <Text aria-hidden pointerEvents="none" style={styles.readout}>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  readout: { position: "absolute", top: 4, left: 0, right: 0, textAlign: "center", fontSize: 11, color: "#fff", backgroundColor: "rgba(0, 0, 0, 0.6)" },
});
