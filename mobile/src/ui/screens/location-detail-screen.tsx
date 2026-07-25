import React, { useCallback, useDeferredValue, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Menu, Searchbar } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";

import { inventoryService } from "../../application/inventory-service";
import type { Item, LocationSummary, LocationType, PrecisionMode } from "../../domain/models";
import { colors, inputStyle, radius, spacing, typography } from "../../theme/tokens";
import { formatMoney, locationTypeIcon, locationTypeLabel, precisionLabel } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { Code128View } from "../components/code128-view";
import { FilterChip } from "../components/filter-chip";
import { ItemCard } from "../components/item-card";
import { ScreenState } from "../components/screen-state";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useDialog } from "../context/dialog";
import { useFocusLoad } from "../hooks/use-focus-load";

type DetailData = { location: LocationSummary; items: Item[] };

export function LocationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const locationId = Number(id);
  const { alert } = useDialog();
  const [search, setSearch] = useState(""); const deferred = useDeferredValue(search); const [showCodes, setShowCodes] = useState(false); const [selected, setSelected] = useState<Set<number>>(new Set()); const [editing, setEditing] = useState(false); const [view, setView] = useState<"grid" | "list">("list"); const [menuOpen, setMenuOpen] = useState(false);
  const loader = useCallback(async (): Promise<DetailData> => ({ location: await inventoryService.getLocation(locationId), items: await inventoryService.locationItems(locationId, deferred) }), [deferred, locationId]);
  const { data, loading, error, refresh } = useFocusLoad(loader);
  if (!data && loading) return <ScreenState loading title="Cargando ubicación" />;
  if (!data) return <ScreenState title="No pudimos abrir la ubicación" body={error ?? undefined} action={<AppButton label="Reintentar" icon="reload" onPress={() => void refresh()} />} />;
  const { location, items } = data;
  const selectedIds = [...selected];
  const insets = useSafeAreaInsets();
  const toggle = (itemId: number) => setSelected((current) => { const next = new Set(current); next.has(itemId) ? next.delete(itemId) : next.add(itemId); return next; });
  const startCount = async () => { try { const count = await inventoryService.startPhysicalCount(location.id); router.push({ pathname: "/counts/[id]", params: { id: String(count.id) } }); } catch (error) { void alert({ title: "No pudimos iniciar el conteo", message: error instanceof Error ? error.message : "Intente nuevamente.", tone: "danger" }); } };
  const openQuickView = () => router.push({ pathname: "/quick", params: { status: "active", locationId: String(location.id) } });
  return <View style={styles.root}><FlatList key={view} data={items} numColumns={view === "grid" ? 2 : 1} columnWrapperStyle={view === "grid" ? styles.row : undefined} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <ItemCard item={item} mode={view} selected={selected.has(item.id)} selectionMode={selected.size > 0} onToggle={toggle} onPress={(itemId) => router.push({ pathname: "/items/[id]", params: { id: String(itemId) } })} />} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.content, { paddingBottom: 140 + insets.bottom }]} ListHeaderComponent={<View style={styles.header}>
    <View style={styles.infoCard}>
      <View style={styles.infoTop}>
        <View style={styles.infoIcon}><MaterialCommunityIcons name={locationTypeIcon(location.type)} size={26} color={colors.primary} /></View>
        <View style={styles.titleCopy}><Text style={styles.eyebrow}>{location.code}</Text><Text accessibilityRole="header" numberOfLines={2} style={styles.title}>{location.name}</Text><Text style={styles.meta}>{locationTypeLabel(location.type)} · {precisionLabel(location.precisionMode)}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={location.favorite ? "Quitar favorita" : "Marcar favorita"} onPress={() => void inventoryService.updateLocation(location.id, { favorite: !location.favorite }).then(refresh)} style={styles.favorite}><MaterialCommunityIcons name={location.favorite ? "star" : "star-outline"} size={26} color={location.favorite ? colors.primarySoft : colors.primary} /></Pressable>
      </View>
      <View style={styles.metrics}><View style={styles.metric}><Text style={styles.metricLabel}>Prendas</Text><Text style={styles.metricValue}>{location.itemCount}</Text></View><View style={styles.metric}><Text style={styles.metricLabel}>Valor</Text><Text style={styles.metricValue}>{formatMoney(location.totalValue)}</Text></View></View>
      {location.notes ? <Text style={styles.notes}>{location.notes}</Text> : null}
    </View>
    <View style={styles.actions}>
      <AppButton grow label="Mover todo" icon="swap-horizontal-bold" disabled={items.length === 0} onPress={() => router.push({ pathname: "/transfer", params: { sourceId: String(location.id) } })} />
      <AppButton grow tone="secondary" label="Conteo físico" icon="clipboard-check-outline" onPress={() => void startCount()} />
      <AppButton grow tone="secondary" label={editing ? "Cerrar" : "Editar"} icon={editing ? "close" : "pencil-outline"} onPress={() => setEditing((value) => !value)} />
      <Menu visible={menuOpen} onDismiss={() => setMenuOpen(false)} anchor={<Pressable accessibilityRole="button" accessibilityLabel="Más acciones" onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.overflow, pressed && styles.pressed]}><MaterialCommunityIcons name="dots-horizontal" size={24} color={colors.primary} /></Pressable>}>
        <Menu.Item leadingIcon="qrcode" title={showCodes ? "Ocultar códigos" : "Ver códigos"} onPress={() => { setMenuOpen(false); setShowCodes((value) => !value); }} />
        <Menu.Item leadingIcon="printer-outline" title="Etiquetas del contenido" disabled={items.length === 0} onPress={() => { setMenuOpen(false); router.push({ pathname: "/labels", params: { itemIds: items.map((current) => current.id).join(",") } }); }} />
        <Menu.Item leadingIcon="tag-outline" title="Etiqueta de la ubicación" onPress={() => { setMenuOpen(false); router.push({ pathname: "/labels", params: { locationIds: String(location.id) } }); }} />
      </Menu>
    </View>
    {editing ? <LocationEditor location={location} onSaved={() => { setEditing(false); void refresh(); }} /> : null}
    {showCodes ? <View style={styles.codes}><QRCode value={location.machineCode} size={150} color={colors.primary} backgroundColor={colors.surface} /><View style={styles.barcode}><Code128View value={location.machineCode} /><Text selectable style={styles.machine}>{location.machineCode}</Text></View><AppButton label="Imprimir etiqueta" icon="printer-outline" onPress={() => router.push({ pathname: "/labels", params: { locationIds: String(location.id) } })} /></View> : null}
    <Searchbar accessibilityLabel="Buscar dentro de la ubicación" value={search} onChangeText={setSearch} placeholder="Buscar prendas" maxFontSizeMultiplier={1.4} style={styles.search} />
    <View style={styles.contentBar}>
      <Text style={styles.listTitle}>Contenido ({location.itemCount})</Text>
      <View style={styles.viewControls}>
        {(["grid", "list"] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={value === "grid" ? "Vista cuadrícula" : "Vista lista"} accessibilityState={{ selected: view === value }} onPress={() => setView(value)} style={[styles.viewButton, view === value && styles.viewActive]}><MaterialCommunityIcons name={value === "grid" ? "view-grid-outline" : "view-list-outline"} size={20} color={view === value ? colors.onPrimary : colors.primary} /></Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Vista rápida a pantalla completa" disabled={items.length === 0} onPress={openQuickView} style={({ pressed }) => [styles.quickButton, items.length === 0 && styles.quickDisabled, pressed && styles.pressed]}><MaterialCommunityIcons name="cellphone" size={18} color={colors.onPrimary} /></Pressable>
      </View>
    </View>
  </View>} ListEmptyComponent={!loading ? <ScreenState title="Ubicación vacía" body="No hay prendas disponibles en esta ubicación." /> : null} />
  {selected.size > 0 ? <View style={styles.selection}><Text style={styles.selectionText}>{selected.size} seleccionadas</Text><AppButton label="Mover selección" icon="swap-horizontal" onPress={() => router.push({ pathname: "/transfer", params: { ids: selectedIds.join(",") } })} /><AppButton tone="secondary" label="Etiquetas" icon="printer-outline" onPress={() => router.push({ pathname: "/labels", params: { itemIds: selectedIds.join(",") } })} /><Pressable accessibilityRole="button" accessibilityLabel="Cancelar selección" onPress={() => setSelected(new Set())} style={styles.close}><MaterialCommunityIcons name="close" size={24} color={colors.primary} /></Pressable></View> : null}</View>;
}

function LocationEditor({ location, onSaved }: { location: LocationSummary; onSaved: () => void }) {
  const { alert } = useDialog();
  const [name, setName] = useState(location.name); const [notes, setNotes] = useState(location.notes); const [type, setType] = useState<LocationType>(location.type); const [precision, setPrecision] = useState<PrecisionMode>(location.precisionMode); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await inventoryService.updateLocation(location.id, { name, notes, type, precisionMode: precision }); onSaved(); } catch (error) { void alert({ title: "No pudimos guardar", message: error instanceof Error ? error.message : "Revise la información.", tone: "danger" }); } finally { setSaving(false); } };
  return <View style={styles.editor}><Text style={styles.editorTitle}>Editar ubicación</Text><TextInput value={name} onChangeText={setName} placeholder="Nombre" style={styles.input} /><TextInput value={notes} onChangeText={setNotes} placeholder="Notas" multiline style={[styles.input, styles.area]} /><View style={styles.chips}>{(["rack","box","bag","shelf","display","other"] as const).map((value) => <FilterChip key={value} label={locationTypeLabel(value)} selected={type === value} onPress={() => setType(value)} />)}</View><View style={styles.chips}><FilterChip label="Exacta" selected={precision === "strict"} onPress={() => setPrecision("strict")} /><FilterChip label="Flexible" selected={precision === "flexible"} onPress={() => setPrecision("flexible")} /></View><AppButton label={saving ? "Guardando..." : "Guardar cambios"} icon="content-save-outline" onPress={() => void save()} disabled={saving || !name.trim()} /></View>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas }, content: { flexGrow: 1, padding: spacing.lg, paddingBottom: 140, gap: spacing.sm }, header: { gap: spacing.md }, infoCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, infoTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, infoIcon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.tint }, titleRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md }, titleCopy: { flex: 1, gap: 3 }, eyebrow: { color: colors.primaryDark, fontSize: typography.tiny, fontWeight: "900", letterSpacing: 1 }, title: { color: colors.textPrimary, fontSize: 24, fontWeight: "900" }, meta: { color: colors.textMuted, fontWeight: "700" }, favorite: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.tint }, metrics: { flexDirection: "row", gap: spacing.sm }, metric: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.tint }, metricLabel: { color: colors.textMuted, fontSize: typography.small, fontWeight: "700" }, metricValue: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", fontVariant: ["tabular-nums"] }, notes: { color: colors.textSecondary, lineHeight: 21 }, actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }, overflow: { width: 56, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, pressed: { opacity: 0.7 }, contentBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm }, viewControls: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, viewButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, viewActive: { backgroundColor: colors.primary, borderColor: colors.primary }, quickButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderCurve: "continuous", backgroundColor: colors.primaryDark }, quickDisabled: { opacity: 0.4 }, row: { gap: spacing.sm }, codes: { alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, barcode: { width: "100%", alignItems: "center", gap: spacing.xs }, machine: { color: colors.textPrimary, fontWeight: "900", letterSpacing: 1 }, search: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, listTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, selection: { position: "absolute", left: spacing.sm, right: spacing.sm, bottom: spacing.sm, flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm, padding: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, selectionText: { color: colors.textPrimary, fontWeight: "900", paddingHorizontal: spacing.sm }, close: { width: 48, height: 48, alignItems: "center", justifyContent: "center" }, editor: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.tint }, editorTitle: { color: colors.textPrimary, fontWeight: "900" }, input: inputStyle, area: { minHeight: 88, textAlignVertical: "top" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm } });
