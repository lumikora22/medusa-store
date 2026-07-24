import React, { useCallback, useDeferredValue, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Menu, Searchbar } from "react-native-paper";
import { inventoryService } from "../../application/inventory-service";
import type { LocationSummary } from "../../domain/models";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { AppButton } from "../components/app-button";
import { LocationCard } from "../components/location-card";
import { ScreenState } from "../components/screen-state";
import { useFocusLoad } from "../hooks/use-focus-load";

type LocationSort = "favorites" | "name" | "items" | "value" | "recent";
const SORT_LABELS: Record<LocationSort, string> = { favorites: "Favoritas primero", name: "Nombre (A-Z)", items: "Más prendas", value: "Mayor valor", recent: "Usadas recientemente" };

function sortLocations(list: LocationSummary[], sort: LocationSort): LocationSummary[] {
  const copy = [...list];
  switch (sort) {
    case "name": return copy.sort((a, b) => a.name.localeCompare(b.name, "es"));
    case "items": return copy.sort((a, b) => b.itemCount - a.itemCount);
    case "value": return copy.sort((a, b) => Number(b.totalValue) - Number(a.totalValue));
    case "recent": return copy.sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""));
    default: return copy;
  }
}

export function LocationsScreen() {
  const [search, setSearch] = useState("");
  const deferred = useDeferredValue(search);
  const [sort, setSort] = useState<LocationSort>("favorites");
  const [sortOpen, setSortOpen] = useState(false);
  const loader = useCallback(() => inventoryService.listLocations(deferred), [deferred]);
  const { data, loading, error, refresh } = useFocusLoad(loader, [] as LocationSummary[]);
  const open = useCallback((id: number) => router.push({ pathname: "/locations/[id]", params: { id: String(id) } }), []);
  const locations = useMemo(() => sortLocations(data ?? [], sort), [data, sort]);

  return <View style={styles.root}>
    <View style={styles.toolbar}>
      <Searchbar accessibilityLabel="Buscar ubicaciones" value={search} onChangeText={setSearch} placeholder="Código, nombre o tipo" style={styles.search} />
      <AppButton label="Nueva" icon="plus" onPress={() => router.push("/locations/new")} />
    </View>
    <View style={styles.sortRow}>
      <Text style={styles.count}>{locations.length} {locations.length === 1 ? "ubicación" : "ubicaciones"}</Text>
      <Menu visible={sortOpen} onDismiss={() => setSortOpen(false)} anchor={<Pressable accessibilityRole="button" accessibilityLabel="Ordenar ubicaciones" onPress={() => setSortOpen(true)} style={({ pressed }) => [styles.sortButton, pressed && styles.pressed]}><MaterialCommunityIcons name="sort" size={18} color={colors.primary} /><Text style={styles.sortText}>{SORT_LABELS[sort]}</Text><MaterialCommunityIcons name="chevron-down" size={18} color={colors.primary} /></Pressable>}>
        {(Object.keys(SORT_LABELS) as LocationSort[]).map((value) => <Menu.Item key={value} title={SORT_LABELS[value]} leadingIcon={sort === value ? "check" : undefined} onPress={() => { setSort(value); setSortOpen(false); }} />)}
      </Menu>
    </View>
    <FlatList data={locations} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <LocationCard location={item} onPress={open} />} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={!loading ? <ScreenState title="Sin ubicaciones" body={error ?? "Cree la primera ubicación para organizar el inventario."} action={<AppButton label="Crear ubicación" icon="plus" onPress={() => router.push("/locations/new")} />} /> : null} />
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm },
  search: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  sortRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  count: { color: colors.textMuted, fontWeight: "800" },
  sortButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 40, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  sortText: { color: colors.primary, fontWeight: "800", fontSize: typography.small },
  pressed: { opacity: 0.7 },
  content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: 120 },
  separator: { height: spacing.sm },
});
