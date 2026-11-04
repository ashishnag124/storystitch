import { Platform } from "react-native";

/** Golden hour: plum, with marigold for what to tap and coral and pink from the logo. */
export const colors = {
  bg: "#2b1340",
  text: "#fff4e8",
  muted: "#cbb7d9",
  accent: "#ffc24b",
  accentText: "#2b1340",
  surface: "#3d1f57",
  border: "#5a3577",
  coral: "#ff7a59",
  pink: "#ff4f8b",
  warnBg: "#fef3c7",
  warnText: "#78350f",
  okBg: "#dcfce7",
  okText: "#14532d",
  danger: "#ff8f8f",
} as const;

/** The variable font on web (public/index.html); iOS gets it in Stage 3 and uses the system font until then. */
export const fontFamily = Platform.select({
  web: '"Bricolage Grotesque Variable", system-ui, -apple-system, "Segoe UI", sans-serif',
  default: undefined,
});

export const type = {
  title: { fontFamily, fontSize: 20, fontWeight: "700", color: colors.text },
  body: { fontFamily, fontSize: 16, color: colors.text },
  hint: { fontFamily, fontSize: 14, color: colors.muted },
} as const;

/** Tap targets never go below this (AC-A11Y-03). */
export const MIN_TARGET = 44;

export const shadows = {
  soft: { boxShadow: "0 4px 14px rgb(0 0 0 / 0.25)" },
  raised: { boxShadow: "0 6px 20px rgb(0 0 0 / 0.3)" },
  lifted: { boxShadow: "0 6px 24px rgb(0 0 0 / 0.4)" },
} as const;
