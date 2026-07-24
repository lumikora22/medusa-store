import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "../context/interface-settings";

export function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { minTarget, textBoost } = useInterfaceSettings();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.base, { height: minTarget - 4 }, selected && styles.selected, pressed && styles.pressed]}>
    <Text numberOfLines={1} style={[styles.label, { fontSize: typography.small + textBoost }, selected && styles.selectedLabel]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  base: { alignSelf: "center", minWidth: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary }, pressed: { opacity: 0.76 },
  label: { color: colors.textSecondary, fontSize: typography.small, fontWeight: "800" }, selectedLabel: { color: colors.onPrimary },
});
