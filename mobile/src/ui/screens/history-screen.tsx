import React, { useCallback, useDeferredValue, useState } from "react";
import { FlatList, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Searchbar } from "react-native-paper";

import { inventoryService } from "../../application/inventory-service";
import type { EventType, HistoryFilters, InventoryEvent, LocationSummary } from "../../domain/models";
import { colors, inputStyle, radius, spacing, typography } from "../../theme/tokens";
import { eventTypeLabel, formatDate } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { FilterChip } from "../components/filter-chip";
import { ScreenState } from "../components/screen-state";
import { useDialog } from "../context/dialog";
import { useFocusLoad } from "../hooks/use-focus-load";

const EVENT_TYPES: EventType[] = ["item_created", "item_updated", "item_archived", "photo_added", "photo_removed", "photos_reordered", "item_moved", "batch_moved", "batch_undone", "item_sold", "sale_restored", "location_created", "location_updated", "physical_count_started", "physical_count_completed", "physical_count_cancelled"];

export function HistoryScreen() {
  const [search, setSearch] = useState(""); const deferred = useDeferredValue(search); const [type, setType] = useState<EventType | undefined>();
  const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [itemCode, setItemCode] = useState(""); const [itemId, setItemId] = useState<number | undefined>();
  const [originLocationId, setOrigin] = useState<number | undefined>(); const [destinationLocationId, setDestination] = useState<number | undefined>();
  const filters: HistoryFilters = { search: deferred, type, from: from || undefined, to: to || undefined, itemId, originLocationId, destinationLocationId };
  const loader = useCallback(async () => ({ events: await inventoryService.history(filters), locations: await inventoryService.listLocations() }), [deferred, destinationLocationId, from, itemId, originLocationId, to, type]);
  const { data, loading, error, refresh } = useFocusLoad(loader, { events: [] as InventoryEvent[], locations: [] as LocationSummary[] });
  const { alert } = useDialog();
  const [pickerFor, setPickerFor] = useState<null | "from" | "to">(null);
  const applyItem = async () => { if (!itemCode.trim()) { setItemId(undefined); return; } const result = await inventoryService.resolveCode(itemCode); if (result.type !== "item") { void alert({ title: "Prenda no encontrada", message: "Ingrese o escanee un código de prenda válido." }); return; } setItemId(result.item.id); setItemCode(result.item.code); };
  const currentDate = (pickerFor === "from" ? from : to) || undefined;
  const onDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type === "dismissed") { setPickerFor(null); return; }
    if (date) { const iso = date.toISOString().slice(0, 10); if (pickerFor === "from") setFrom(iso); else setTo(iso); }
    if (process.env.EXPO_OS !== "ios") setPickerFor(null);
  };
  return <View style={styles.root}><Searchbar accessibilityLabel="Buscar historial" value={search} onChangeText={setSearch} placeholder="Prenda, ubicación o acción" style={styles.search} /><View style={styles.filterPanel}><View style={styles.fieldRow}>
    <Pressable accessibilityRole="button" accessibilityLabel="Fecha desde" onPress={() => setPickerFor("from")} style={[styles.dateButton, styles.date]}><MaterialCommunityIcons name="calendar-start" size={18} color={colors.primary} /><Text style={[styles.dateText, !from && styles.datePlaceholder]}>{from ? formatDay(from) : "Desde"}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Fecha hasta" onPress={() => setPickerFor("to")} style={[styles.dateButton, styles.date]}><MaterialCommunityIcons name="calendar-end" size={18} color={colors.primary} /><Text style={[styles.dateText, !to && styles.datePlaceholder]}>{to ? formatDay(to) : "Hasta"}</Text></Pressable>
    {from || to ? <Pressable accessibilityRole="button" accessibilityLabel="Limpiar fechas" onPress={() => { setFrom(""); setTo(""); }} style={styles.clearDates}><MaterialCommunityIcons name="close" size={20} color={colors.danger} /></Pressable> : null}
  </View><View style={styles.fieldRow}><TextInput accessibilityLabel="Código de prenda" value={itemCode} onChangeText={(value) => { setItemCode(value); if (!value.trim()) setItemId(undefined); }} onSubmitEditing={() => void applyItem()} placeholder="Código de prenda" style={[styles.input, styles.itemInput]} /><AppButton label="Aplicar prenda" icon="magnify" onPress={() => void applyItem()} /></View><Text style={styles.label}>Tipo de evento</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><FilterChip label="Todos" selected={!type} onPress={() => setType(undefined)} />{EVENT_TYPES.map((eventType) => <FilterChip key={eventType} label={eventTypeLabel(eventType)} selected={type === eventType} onPress={() => setType(type === eventType ? undefined : eventType)} />)}</ScrollView><LocationFilters title="Origen" locations={data?.locations ?? []} selected={originLocationId} onSelect={setOrigin} /><LocationFilters title="Destino" locations={data?.locations ?? []} selected={destinationLocationId} onSelect={setDestination} /></View><FlatList data={data?.events ?? []} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <EventRow item={item} />} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />} ItemSeparatorComponent={() => <View style={styles.separator} />} ListEmptyComponent={!loading ? <ScreenState title="Sin actividad" body={error ?? "No hay eventos que coincidan con los filtros."} /> : null} />
    {pickerFor ? (process.env.EXPO_OS === "ios" ? (
      <Modal transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={styles.pickerBackdrop} onPress={() => setPickerFor(null)}>
          <Pressable style={styles.pickerSheet} onPress={() => undefined}>
            <DateTimePicker value={currentDate ? new Date(`${currentDate}T12:00:00`) : new Date()} mode="date" display="spinner" themeVariant="light" textColor={colors.textPrimary} accentColor={colors.primary} onChange={onDateChange} />
            <AppButton label="Listo" icon="check" onPress={() => setPickerFor(null)} />
          </Pressable>
        </Pressable>
      </Modal>
    ) : (
      <DateTimePicker value={currentDate ? new Date(`${currentDate}T12:00:00`) : new Date()} mode="date" display="default" themeVariant="light" onChange={onDateChange} />
    )) : null}
  </View>;
}

function formatDay(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function LocationFilters({ title, locations, selected, onSelect }: { title: string; locations: LocationSummary[]; selected?: number; onSelect: (id?: number) => void }) { return <View><Text style={styles.label}>{title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}><FilterChip label="Cualquiera" selected={selected == null} onPress={() => onSelect(undefined)} />{locations.map((location) => <FilterChip key={location.id} label={location.name} selected={selected === location.id} onPress={() => onSelect(selected === location.id ? undefined : location.id)} />)}</ScrollView></View>; }

function EventRow({ item }: { item: InventoryEvent }) { const from = String(item.payload.fromLocationCode ?? ""); const to = String(item.payload.toLocationCode ?? ""); return <View style={styles.event}><View style={styles.icon}><Text style={styles.iconText}>{eventTypeLabel(item.type).slice(0, 1)}</Text></View><View style={styles.copy}><Text selectable style={styles.title}>{item.summary}</Text><Text style={styles.meta}>{eventTypeLabel(item.type)} · {formatDate(item.createdAt)}</Text>{item.itemCode ? <Text style={styles.reference}>Prenda: {item.itemCode}</Text> : null}{from || to ? <Text style={styles.reference}>{from ? `Origen: ${from}` : ""}{from && to ? " · " : ""}{to ? `Destino: ${to}` : ""}</Text> : item.locationCode ? <Text style={styles.reference}>Ubicación: {item.locationCode}</Text> : null}</View></View>; }

const styles = StyleSheet.create({ root: { flex: 1, paddingTop: spacing.sm, backgroundColor: colors.canvas }, search: { marginHorizontal: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, filterPanel: { gap: spacing.sm, padding: spacing.lg, paddingBottom: spacing.sm }, fieldRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, input: inputStyle, date: { flex: 1, minWidth: 120 }, itemInput: { flex: 1, minWidth: 180 }, dateButton: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: colors.tintStrong, backgroundColor: colors.surface }, dateText: { color: colors.textPrimary, fontWeight: "800", fontSize: typography.body }, datePlaceholder: { color: colors.textMuted, fontWeight: "700" }, clearDates: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.dangerSoft }, pickerBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.overlay }, pickerSheet: { gap: spacing.md, padding: spacing.lg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.surface }, label: { color: colors.textSecondary, fontWeight: "900", paddingTop: spacing.xs }, chips: { gap: spacing.sm, paddingVertical: spacing.xs }, content: { flexGrow: 1, paddingHorizontal: spacing.lg, paddingBottom: 100 }, separator: { height: spacing.sm }, event: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.tint }, iconText: { color: colors.primary, fontSize: typography.title, fontWeight: "900" }, copy: { flex: 1, gap: 3 }, title: { color: colors.textPrimary, fontWeight: "800", lineHeight: 20 }, meta: { color: colors.textMuted, fontSize: typography.small }, reference: { color: colors.primaryDark, fontSize: typography.small, fontWeight: "800" } });
