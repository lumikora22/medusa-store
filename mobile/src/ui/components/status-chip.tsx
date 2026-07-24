import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { ItemStatus } from "../../domain/models";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { itemStatusLabel } from "../../utils/format";

export function StatusChip({ status }: { status: ItemStatus }) {
  return <View accessibilityLabel={`Estado: ${itemStatusLabel(status)}`} style={[styles.base, status === "sold" && styles.sold, status === "archived" && styles.archived]}><Text style={[styles.label, status !== "active" && styles.light]}>{itemStatusLabel(status)}</Text></View>;
}

const styles = StyleSheet.create({ base: { alignSelf: "flex-start", paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.tint }, sold: { backgroundColor: colors.primaryDark }, archived: { backgroundColor: colors.textMuted }, label: { color: colors.success, fontSize: typography.tiny, fontWeight: "900" }, light: { color: colors.onPrimary } });
