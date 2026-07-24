import React, { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { LocationSummary } from "../../domain/models";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { formatMoney, locationTypeIcon, locationTypeLabel, precisionLabel } from "../../utils/format";

function LocationCardView({ location, onPress }: { location: LocationSummary; onPress: (id: number) => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${location.name}, ${location.itemCount} prendas`} onPress={() => onPress(location.id)} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
    <View style={styles.icon}><MaterialCommunityIcons name={location.favorite ? "star" : locationTypeIcon(location.type)} size={25} color={location.favorite ? colors.primarySoft : colors.primary} /></View>
    <View style={styles.copy}><View style={styles.titleRow}><Text selectable numberOfLines={1} style={styles.title}>{location.name}</Text><Text style={styles.count}>{location.itemCount}</Text></View><Text style={styles.meta}>{location.code} · {locationTypeLabel(location.type)} · {precisionLabel(location.precisionMode)}</Text><Text style={styles.value}>{formatMoney(location.totalValue)}</Text></View>
    <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} />
  </Pressable>;
}

export const LocationCard = memo(LocationCardView);

const styles = StyleSheet.create({ card: { minHeight: 92, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, pressed: { opacity: 0.76 }, icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.tint }, copy: { flex: 1, gap: 3 }, titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, title: { flex: 1, color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, count: { color: colors.primary, fontSize: typography.title, fontWeight: "900", fontVariant: ["tabular-nums"] }, meta: { color: colors.textMuted, fontSize: typography.tiny, fontWeight: "700" }, value: { color: colors.success, fontSize: typography.small, fontWeight: "900" } });
