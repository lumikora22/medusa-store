import React, { useCallback, useDeferredValue, useEffect, useRef, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Menu, Searchbar } from "react-native-paper";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inventoryService } from "../../application/inventory-service";
import { DEFAULT_CATALOG_FILTERS, type CatalogFilters, type Item, type LocationSummary } from "../../domain/models";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { locationTypeIcon, locationTypeLabel } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { FilterChip } from "../components/filter-chip";
import { ItemCard } from "../components/item-card";
import { ScreenState } from "../components/screen-state";
import { useDialog } from "../context/dialog";
import { useInterfaceSettings } from "../context/interface-settings";
import { useSnackbar } from "../context/snackbar";

const SORTS: { value: CatalogFilters["sort"]; label: string }[] = [
  { value: "newest", label: "Más nuevas" },
  { value: "updated", label: "Actualizadas" },
  { value: "price-asc", label: "Menor precio" },
  { value: "price-desc", label: "Mayor precio" },
  { value: "code", label: "Por código" },
];

type CatalogScreenProps = { initialFilter?: "unassigned" | "no-photo" | "sold" };

export function CatalogScreen({ initialFilter }: CatalogScreenProps = {}) {
  const params = useLocalSearchParams<{ filter?: string }>();
  const routeFilter = params.filter ?? initialFilter;
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<LocationSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const requestId = useRef(0);
  const loadMoreLock = useRef(false);
  const { notify } = useSnackbar();
  const { confirm } = useDialog();
  const { exhibitionMode } = useInterfaceSettings();
  const insets = useSafeAreaInsets();
  const [sortOpen, setSortOpen] = useState(false);
  const [containerOpen, setContainerOpen] = useState(false);
  const [containerSearch, setContainerSearch] = useState("");

  const openQuickView = useCallback(() => router.push({ pathname: "/quick", params: { status: filters.status, search: deferredSearch, unassignedOnly: filters.unassignedOnly ? "1" : "0", photo: filters.photo, sort: filters.sort, locationId: filters.locationId != null ? String(filters.locationId) : "" } }), [deferredSearch, filters.locationId, filters.photo, filters.sort, filters.status, filters.unassignedOnly]);

  useEffect(() => {
    if (routeFilter === "unassigned") setFilters((current) => ({ ...current, unassignedOnly: true, photo: "all" }));
    if (routeFilter === "no-photo") setFilters((current) => ({ ...current, photo: "without", unassignedOnly: false }));
    if (routeFilter === "sold") setFilters((current) => ({ ...current, status: "sold", unassignedOnly: false }));
  }, [routeFilter]);

  const effectiveFilters = { ...filters, search: deferredSearch };
  const loadFirst = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true); setError(null);
    try {
      const [page, locationRows] = await Promise.all([inventoryService.catalog(effectiveFilters), inventoryService.listLocations()]);
      if (current !== requestId.current) return;
      setItems(page.results); setTotal(page.total); setNextOffset(page.nextOffset); setLocations(locationRows);
    } catch (reason) {
      if (current === requestId.current) setError(reason instanceof Error ? reason.message : "No pudimos cargar el catálogo.");
    } finally { if (current === requestId.current) setLoading(false); }
  }, [deferredSearch, filters.locationId, filters.locationType, filters.photo, filters.sort, filters.status, filters.unassignedOnly]);

  useFocusEffect(useCallback(() => { void loadFirst(); return () => { requestId.current += 1; loadMoreLock.current = false; }; }, [loadFirst]));

  const loadMore = useCallback(async () => {
    if (nextOffset == null || loadingMore || loadMoreLock.current) return;
    const current = requestId.current; loadMoreLock.current = true; setLoadingMore(true);
    try {
      const page = await inventoryService.catalog(effectiveFilters, nextOffset);
      if (current !== requestId.current) return;
      setItems((existing) => [...existing, ...page.results.filter((item) => !existing.some((candidate) => candidate.id === item.id))]);
      setNextOffset(page.nextOffset);
    } catch (reason) { if (current === requestId.current) setError(reason instanceof Error ? reason.message : "No pudimos cargar más prendas."); }
    finally { loadMoreLock.current = false; setLoadingMore(false); }
  }, [effectiveFilters, loadingMore, nextOffset]);

  const toggle = useCallback((id: number) => { if (exhibitionMode) return; setSelected((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }, [exhibitionMode]);
  // Exhibition Mode has no item detail: tapping a card opens the read-only full-screen browser.
  const open = useCallback((id: number) => { if (exhibitionMode) { openQuickView(); return; } router.push({ pathname: "/items/[id]", params: { id: String(id) } }); }, [exhibitionMode, openQuickView]);
  const selectedIds = [...selected];
  const selectedContainer = locations.find((location) => location.id === filters.locationId) ?? null;
  const sortLabel = SORTS.find((option) => option.value === filters.sort)?.label ?? "Más nuevas";
  const containerMatches = locations.filter((location) => !containerSearch.trim() || `${location.name} ${location.code} ${location.type}`.toLowerCase().includes(containerSearch.trim().toLowerCase()));
  const chooseContainer = (locationId: number | null) => { setFilters((current) => ({ ...current, locationId })); setContainerOpen(false); setContainerSearch(""); };
  const sellSelected = async () => { const ids = [...selected]; if (!(await confirm({ title: "Marcar como vendidas", message: `Se venderá una pieza de cada ${ids.length === 1 ? "prenda seleccionada" : `una de las ${ids.length} prendas seleccionadas`} en una sola operación. Si alguna no tiene piezas disponibles, no se modificará ninguna.`, confirmLabel: "Confirmar venta", tone: "danger", icon: "hand-coin-outline" }))) return; try { await inventoryService.sellItems(ids); setSelected(new Set()); await loadFirst(); notify({ message: `${ids.length} ${ids.length === 1 ? "prenda vendida" : "prendas vendidas"}.`, tone: "success", undo: async () => { await inventoryService.restoreSales(ids, "Venta deshecha"); await loadFirst(); } }); } catch (reason) { notify({ message: reason instanceof Error ? reason.message : "No se modificó ninguna prenda.", tone: "error" }); } };

  const renderItem = useCallback(({ item }: { item: Item }) => <ItemCard item={item} mode={view} selected={selected.has(item.id)} selectionMode={selected.size > 0} onPress={open} onToggle={toggle} />, [open, selected, toggle, view]);
  const empty = !loading ? <ScreenState title="No encontramos prendas" body={exhibitionMode ? "Cambie los filtros para ver otras prendas." : "Cambie los filtros o agregue una nueva prenda."} action={exhibitionMode ? undefined : <AppButton label="Agregar prenda" icon="plus" onPress={() => router.push("/items/new")} />} /> : null;

  return <View style={styles.root}>
    <View style={styles.toolbar}><Searchbar accessibilityLabel="Buscar prendas" value={search} onChangeText={setSearch} placeholder="Buscar prendas" maxFontSizeMultiplier={1.4} style={styles.search} /><Pressable accessibilityRole="button" accessibilityLabel="Vista rápida a pantalla completa" onPress={openQuickView} style={({ pressed }) => [styles.quickButton, pressed && styles.pressed]}><MaterialCommunityIcons name="cellphone" size={20} color={colors.onPrimary} /></Pressable></View>
    <View style={styles.filterBand}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
        {(["active", "sold", "archived", "all"] as const).map((status) => <FilterChip key={status} label={status === "active" ? "Disponibles" : status === "sold" ? "Vendidas" : status === "archived" ? "Archivadas" : "Todas"} selected={filters.status === status} onPress={() => setFilters((current) => ({ ...current, status }))} />)}
        <FilterChip label="Sin asignar" selected={filters.unassignedOnly} onPress={() => setFilters((current) => ({ ...current, unassignedOnly: !current.unassignedOnly }))} />
        <FilterChip label="Sin foto" selected={filters.photo === "without"} onPress={() => setFilters((current) => ({ ...current, photo: current.photo === "without" ? "all" : "without" }))} />
      </ScrollView>
      <View style={styles.selectors}>
        <Pressable accessibilityRole="button" accessibilityLabel="Filtrar por contenedor" onPress={() => setContainerOpen(true)} style={({ pressed }) => [styles.selector, filters.locationId != null && styles.selectorActive, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="package-variant-closed" size={18} color={filters.locationId != null ? colors.onPrimary : colors.primary} />
          <Text numberOfLines={1} style={[styles.selectorText, filters.locationId != null && styles.selectorTextActive]}>{selectedContainer ? selectedContainer.name : "Todos los contenedores"}</Text>
          <MaterialCommunityIcons name="chevron-down" size={18} color={filters.locationId != null ? colors.onPrimary : colors.primary} />
        </Pressable>
        <Menu visible={sortOpen} onDismiss={() => setSortOpen(false)} anchor={<Pressable accessibilityRole="button" accessibilityLabel="Ordenar prendas" onPress={() => setSortOpen(true)} style={({ pressed }) => [styles.selector, pressed && styles.pressed]}><MaterialCommunityIcons name="sort" size={18} color={colors.primary} /><Text numberOfLines={1} style={styles.selectorText}>{sortLabel}</Text><MaterialCommunityIcons name="chevron-down" size={18} color={colors.primary} /></Pressable>}>
          {SORTS.map((option) => <Menu.Item key={option.value} title={option.label} leadingIcon={filters.sort === option.value ? "check" : undefined} onPress={() => { setFilters((current) => ({ ...current, sort: option.value })); setSortOpen(false); }} />)}
        </Menu>
        <View style={styles.viewSwitch}>{(["grid", "list"] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === "grid" ? "Vista cuadrícula" : "Vista lista"} accessibilityState={{ selected: view === value }} onPress={() => setView(value)} style={[styles.viewButton, view === value && styles.viewActive]}><MaterialCommunityIcons name={value === "grid" ? "view-grid-outline" : "view-list-outline"} size={22} color={view === value ? colors.onPrimary : colors.primary} /></Pressable>)}</View>
      </View>
    </View>
    <View style={styles.summary}><Text style={styles.summaryText}>{total} {total === 1 ? "prenda" : "prendas"}</Text></View>
    {error ? <Pressable accessibilityRole="button" onPress={() => void loadFirst()} style={styles.error}><Text style={styles.errorText}>{error} Toque para reintentar.</Text></Pressable> : null}
    <FlatList key={view === "grid" ? "grid" : "list"} data={items} numColumns={view === "grid" ? 2 : 1} renderItem={renderItem} keyExtractor={(item) => String(item.id)} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]} columnWrapperStyle={view === "grid" ? styles.row : undefined} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadFirst()} tintColor={colors.primary} />} onEndReached={() => void loadMore()} onEndReachedThreshold={0.4} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={7} ListEmptyComponent={empty} ListFooterComponent={loadingMore ? <Text style={styles.loadingMore}>Cargando más prendas...</Text> : null} />
    {selected.size > 0 && !exhibitionMode ? <View style={[styles.selection, { bottom: spacing.sm + insets.bottom }]}><Text style={styles.selectionText}>{selected.size} seleccionadas</Text><AppButton label="Mover" icon="swap-horizontal" onPress={() => router.push({ pathname: "/transfer", params: { ids: selectedIds.join(",") } })} /><AppButton tone="secondary" label="Etiquetas" icon="printer-outline" onPress={() => router.push({ pathname: "/labels", params: { itemIds: selectedIds.join(",") } })} /><AppButton tone="danger" label="Vender" icon="hand-coin-outline" onPress={() => void sellSelected()} /><Pressable accessibilityRole="button" accessibilityLabel="Cancelar selección" onPress={() => setSelected(new Set())} style={styles.close}><MaterialCommunityIcons name="close" size={24} color={colors.primary} /></Pressable></View> : null}
    <Modal visible={containerOpen} transparent animationType="slide" onRequestClose={() => setContainerOpen(false)}>
      <Pressable style={styles.pickerBackdrop} onPress={() => setContainerOpen(false)}>
        <Pressable style={[styles.picker, { paddingBottom: spacing.lg + insets.bottom }]} onPress={() => undefined}>
          <Text style={styles.pickerTitle}>Filtrar por contenedor</Text>
          <Searchbar accessibilityLabel="Buscar contenedor" value={containerSearch} onChangeText={setContainerSearch} placeholder="Nombre, código o tipo" style={styles.pickerSearch} />
          <FlatList
            data={containerMatches}
            keyExtractor={(location) => String(location.id)}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={<Pressable accessibilityRole="button" accessibilityLabel="Todos los contenedores" onPress={() => chooseContainer(null)} style={({ pressed }) => [styles.pickerRow, filters.locationId == null && styles.pickerRowActive, pressed && styles.pressed]}><MaterialCommunityIcons name="view-grid-outline" size={22} color={colors.primary} /><View style={styles.pickerRowCopy}><Text style={styles.pickerRowText}>Todos los contenedores</Text></View>{filters.locationId == null ? <MaterialCommunityIcons name="check" size={20} color={colors.primary} /> : null}</Pressable>}
            renderItem={({ item: location }) => <Pressable accessibilityRole="button" accessibilityLabel={location.name} onPress={() => chooseContainer(location.id)} style={({ pressed }) => [styles.pickerRow, filters.locationId === location.id && styles.pickerRowActive, pressed && styles.pressed]}><MaterialCommunityIcons name={locationTypeIcon(location.type)} size={22} color={colors.primary} /><View style={styles.pickerRowCopy}><Text numberOfLines={1} style={styles.pickerRowText}>{location.name}</Text><Text numberOfLines={1} style={styles.pickerRowMeta}>{location.code} · {locationTypeLabel(location.type)} · {location.itemCount} prendas</Text></View>{filters.locationId === location.id ? <MaterialCommunityIcons name="check" size={20} color={colors.primary} /> : null}</Pressable>}
            ItemSeparatorComponent={() => <View style={styles.pickerSeparator} />}
            contentContainerStyle={styles.pickerList}
            ListEmptyComponent={<Text style={styles.pickerEmpty}>No hay contenedores que coincidan.</Text>}
          />
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas }, toolbar: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }, search: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, viewSwitch: { flexDirection: "row", borderRadius: radius.md, borderCurve: "continuous", overflow: "hidden", borderWidth: 1, borderColor: colors.border }, viewButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }, viewActive: { backgroundColor: colors.primary }, filterBand: { borderBottomWidth: 1, borderBottomColor: colors.border }, filters: { alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm }, summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm }, summaryText: { color: colors.textMuted, fontWeight: "800" }, quickButton: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.primaryDark }, error: { marginHorizontal: spacing.lg, marginTop: spacing.sm, minHeight: 48, justifyContent: "center", padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.dangerSoft }, errorText: { color: colors.danger, fontWeight: "700" }, content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: 140, gap: spacing.sm }, row: { gap: spacing.sm }, loadingMore: { padding: spacing.lg, textAlign: "center", color: colors.textMuted }, selection: { position: "absolute", left: spacing.sm, right: spacing.sm, bottom: spacing.sm, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, selectionText: { color: colors.textPrimary, fontWeight: "900", paddingHorizontal: spacing.sm }, close: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  selectors: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  selector: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selectorActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  selectorText: { flex: 1, color: colors.primary, fontWeight: "800", fontSize: typography.small }, selectorTextActive: { color: colors.onPrimary },
  pressed: { opacity: 0.7 },
  pickerBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay },
  picker: { maxHeight: "80%", gap: spacing.md, padding: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.canvas },
  pickerTitle: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900" },
  pickerSearch: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pickerList: { paddingBottom: spacing.xl, gap: spacing.sm },
  pickerRow: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pickerRowActive: { borderColor: colors.primary, borderWidth: 2 },
  pickerRowCopy: { flex: 1, gap: 2 },
  pickerRowText: { color: colors.textPrimary, fontWeight: "800" }, pickerRowMeta: { color: colors.textMuted, fontSize: typography.small }, pickerSeparator: { height: spacing.sm }, pickerEmpty: { color: colors.textMuted, textAlign: "center", padding: spacing.lg } });
