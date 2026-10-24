import { Feather } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { colors } from "@/theme";

export type IconName = ComponentProps<typeof Feather>["name"];

export function Icon({ name, size = 22, color = colors.ink }: { name: IconName | string; size?: number; color?: string }) {
  return <Feather name={name as IconName} size={size} color={color} />;
}
