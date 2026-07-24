import React, { type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "../../theme/tokens";

export function ScreenState({ title, body, loading = false, action }: { title: string; body?: string; loading?: boolean; action?: ReactNode }) {
  return <View style={styles.container}>{loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}<Text accessibilityRole="header" style={styles.title}>{title}</Text>{body ? <Text selectable style={styles.body}>{body}</Text> : null}{action}</View>;
}

const styles = StyleSheet.create({ container: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, backgroundColor: colors.canvas }, title: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", textAlign: "center" }, body: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22, textAlign: "center" } });
