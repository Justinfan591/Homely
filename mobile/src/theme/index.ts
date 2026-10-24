import { Platform } from "react-native";

export const colors = {
  bg: "#FFFFFF",
  ink: "#0A0A0A",
  inkSoft: "#5C5C5C",
  inkFaint: "#9A9A9A",
  line: "#ECECEA",
  fill: "#F5F5F3",
  fillPressed: "#EBEBE8",
  accent: "#2F6BFF",
  accentSoft: "#EAF0FF",
  success: "#12805C",
  successSoft: "#E6F4EE",
  warn: "#9A6700",
  warnSoft: "#FFF4DB",
  danger: "#C73A3A",
  dangerSoft: "#FDECEC",
  scrim: "rgba(10,10,10,0.4)",
  white: "#FFFFFF",
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

export const gutter = 24;

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
};

export const type = {
  display: { fontFamily: fonts.semibold, fontSize: 36, lineHeight: 40, letterSpacing: -1 },
  title: { fontFamily: fonts.semibold, fontSize: 28, lineHeight: 33, letterSpacing: -0.6 },
  heading: { fontFamily: fonts.semibold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3 },
  body: { fontFamily: fonts.regular, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  bodyStrong: { fontFamily: fonts.medium, fontSize: 17, lineHeight: 24, letterSpacing: -0.2 },
  label: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  caption: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 19, letterSpacing: -0.05 },
} as const;

export const shadow = Platform.select({
  ios: { shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 6 },
  default: { boxShadow: "0 8px 24px rgba(0,0,0,0.08)" },
});
