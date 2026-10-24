import { Text as RNText, type TextProps } from "react-native";
import { colors, type as typography } from "@/theme";

type Variant = keyof typeof typography;
type Tone = "ink" | "mid" | "soft" | "faint" | "accent" | "success" | "danger" | "warn" | "white";

const tones: Record<Tone, string> = {
  ink: colors.ink,
  mid: colors.inkMid,
  soft: colors.inkSoft,
  faint: colors.inkFaint,
  accent: colors.accent,
  success: colors.success,
  danger: colors.danger,
  warn: colors.warn,
  white: colors.white,
};

export function Text({
  variant = "body",
  tone = "ink",
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone }) {
  return <RNText {...props} style={[typography[variant], { color: tones[tone] }, style]} />;
}
