import { Platform } from "react-native";

// Tokens from the "Scope app flows" design: warm grey ground, white cards, near-black ink.
export const colors = {
  bg: "#ECEAE5",
  card: "#FFFFFF",
  ink: "#161513",
  inkSoft: "#8A8378",
  inkFaint: "#A39C92",
  /** Body copy that needs a bit more contrast than inkSoft (e.g. the "Is this right?" summary). */
  inkMid: "#5C564D",
  line: "#D9D5CC",
  ring: "#C9C4BA",
  fill: "#FFFFFF",
  fillPressed: "#F4F2EE",
  camera: "#1B1A18",
  star: "#F5C95E",
  accent: "#2F6BFF",
  accentSoft: "#EAF0FF",
  success: "#12805C",
  successSoft: "#E6F4EE",
  warn: "#9A6700",
  warnSoft: "#FFF4DB",
  danger: "#C73A3A",
  dangerSoft: "#FDECEC",
  scrim: "rgba(22,21,19,0.4)",
  white: "#FFFFFF",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const radius = { sm: 12, md: 24, lg: 28, xl: 36, pill: 999 };

export const gutter = 24;

export const fonts = {
  regular: "InterTight_400Regular",
  medium: "InterTight_500Medium",
  semibold: "InterTight_600SemiBold",
};

export const type = {
  /** "What needs fixing?" */
  hero: { fontFamily: fonts.medium, fontSize: 42, lineHeight: 44, letterSpacing: -2.1 },
  /** Screen titles: "Enter the code", "Finding pros near you." */
  display: { fontFamily: fonts.medium, fontSize: 40, lineHeight: 42, letterSpacing: -2 },
  /** In-flow prompts: "Point it at the problem", "Where is the leak?" */
  title: { fontFamily: fonts.medium, fontSize: 28, lineHeight: 31, letterSpacing: -1.1 },
  heading: { fontFamily: fonts.medium, fontSize: 20, lineHeight: 26, letterSpacing: -0.4 },
  /** Option rows and card titles. */
  option: { fontFamily: fonts.medium, fontSize: 18, lineHeight: 23, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 23, letterSpacing: -0.1 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 23, letterSpacing: -0.1 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, letterSpacing: 0 },
  caption: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, letterSpacing: 0 },
} as const;

/** The design's soft card shadow: 0 6px 18px rgba(60,45,30,0.08). */
export const shadow = Platform.select({
  ios: { shadowColor: "#3C2D1E", shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 6 } },
  android: { elevation: 3 },
  default: { boxShadow: "0 6px 18px rgba(60,45,30,0.08)" },
});
