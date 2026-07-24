import React, { memo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import type { Item } from "../../domain/models";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { formatMoney } from "../../utils/format";
import { StatusChip } from "./status-chip";

type Props = { item: Item; mode: "grid" | "list"; selected?: boolean; selectionMode?: boolean; onPress: (id: number) => void; onToggle?: (id: number) => void };

function ItemCardView({ item, mode, selected = false, selectionMode = false, onPress, onToggle }: Props) {
  const [failed, setFailed] = useState(false);
  const photo = item.photos[0];
  const uri = photo?.uri;
  const handlePress = () => selectionMode && onToggle ? onToggle(item.id) : onPress(item.id);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${selectionMode ? selected ? "Quitar selección" : "Seleccionar" : "Abrir"} ${item.code}, ${formatMoney(item.price)}`} accessibilityState={selectionMode ? { selected } : undefined} onPress={handlePress} onLongPress={() => onToggle?.(item.id)} style={({ pressed }) => [mode === "grid" ? styles.grid : styles.list, selected && styles.selected, pressed && styles.pressed]}>
    <View style={mode === "grid" ? styles.gridImage : styles.listImage}>
      {uri && !failed ? <Image source={uri} recyclingKey={item.stableId} contentFit="cover" cachePolicy="memory-disk" transition={120} style={styles.image} onError={() => setFailed(true)} alt={photo.altText || `Foto de ${item.code}`} /> : <View style={styles.placeholder}><MaterialCommunityIcons name="hanger" size={28} color={colors.primaryDark} /><Text style={styles.placeholderText}>Sin foto</Text></View>}
      {selectionMode ? <View style={[styles.check, selected && styles.checkSelected]}><MaterialCommunityIcons name={selected ? "check" : "plus"} size={18} color={selected ? colors.onPrimary : colors.primary} /></View> : null}
    </View>
    <View style={styles.copy}>
      <View style={styles.topLine}><Text selectable numberOfLines={1} style={styles.code}>{item.code}</Text><StatusChip status={item.status} /></View>
      <Text selectable numberOfLines={mode === "grid" ? 2 : 1} style={styles.description}>{item.description || "Sin descripción"}</Text>
      <View style={styles.bottomLine}><Text numberOfLines={1} style={styles.location}>{item.currentLocation?.name ?? "Sin asignar"}</Text><Text selectable style={styles.price}>{formatMoney(item.status === "sold" ? item.soldPrice ?? item.price : item.price)}</Text></View>
    </View>
  </Pressable>;
}

export const ItemCard = memo(ItemCardView);

const styles = StyleSheet.create({
  grid: { flex: 1, minWidth: 0, overflow: "hidden", borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  list: { minHeight: 108, flexDirection: "row", alignItems: "center", overflow: "hidden", borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderWidth: 2, borderColor: colors.primary }, pressed: { opacity: 0.78 }, gridImage: { aspectRatio: 0.82, backgroundColor: colors.tint }, listImage: { width: 88, height: 88, marginVertical: spacing.sm, marginLeft: spacing.sm, borderRadius: radius.md, borderCurve: "continuous", overflow: "hidden", backgroundColor: colors.tint },
  image: { width: "100%", height: "100%" }, placeholder: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.xs }, placeholderText: { color: colors.textMuted, fontSize: typography.small, fontWeight: "700" },
  check: { position: "absolute", top: spacing.sm, right: spacing.sm, width: 36, height: 36, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary },
  checkSelected: { backgroundColor: colors.primary }, copy: { flex: 1, padding: spacing.md, gap: spacing.sm }, topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  code: { flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: "900" }, description: { color: colors.textMuted, fontSize: typography.small, lineHeight: 18 },
  bottomLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, location: { flex: 1, color: colors.primaryDark, fontSize: typography.tiny, fontWeight: "700" }, price: { color: colors.success, fontSize: typography.small, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
