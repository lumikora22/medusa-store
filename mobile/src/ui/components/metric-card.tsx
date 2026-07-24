import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, radius, spacing, typography } from "../../theme/tokens";

export function MetricCard({ label, value, icon }: { label: string; value: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }) {
  return <View style={styles.card}><View style={styles.icon}><MaterialCommunityIcons name={icon} size={20} color={colors.primary} /></View><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>;
}

const styles = StyleSheet.create({ card: { flex: 1, minWidth: 145, padding: spacing.md, gap: spacing.sm, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.tint }, label: { color: colors.textMuted, fontSize: typography.small, fontWeight: "700" }, value: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", fontVariant: ["tabular-nums"] } });
