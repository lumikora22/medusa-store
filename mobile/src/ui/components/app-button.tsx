import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "../context/interface-settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

export function AppButton({ label, icon, onPress, tone = "primary", disabled = false, grow = false }: { label: string; icon: IconName; onPress: () => void; tone?: "primary" | "secondary" | "danger" | "quiet"; disabled?: boolean; grow?: boolean }) {
  const { minTarget, textBoost } = useInterfaceSettings();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.base, { minHeight: minTarget }, styles[tone], grow && styles.grow, disabled && styles.disabled, pressed && styles.pressed]}>
    <MaterialCommunityIcons name={icon} size={21} color={tone === "primary" || tone === "danger" ? colors.onPrimary : colors.primary} />
    <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.label, { fontSize: typography.body + textBoost }, tone !== "primary" && tone !== "danger" && styles.labelDark]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  base: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1 },
  primary: { backgroundColor: colors.primary, borderColor: colors.primary }, secondary: { backgroundColor: colors.tint, borderColor: colors.border },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger }, quiet: { backgroundColor: colors.surface, borderColor: colors.border },
  grow: { flex: 1 }, disabled: { opacity: 0.45 }, pressed: { opacity: 0.78 },
  label: { flexShrink: 1, color: colors.onPrimary, fontSize: typography.body, fontWeight: "800" }, labelDark: { color: colors.primary },
});
