import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useLocalSearchParams } from "expo-router";

import { inventoryService } from "../../application/inventory-service";
import type { Item, LocationSummary } from "../../domain/models";
import type { LabelRecord, LabelSize } from "../../core/labels/label-service";
import { colors, inputStyle, radius, spacing, typography } from "../../theme/tokens";
import { formatMoney } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { Code128View } from "../components/code128-view";
import { FilterChip } from "../components/filter-chip";
import { MedusaIcon } from "../components/medusa-icon";
import { useDialog } from "../context/dialog";

function ids(value?: string): number[] { return value?.split(",").map(Number).filter(Number.isFinite) ?? []; }

export function LabelsScreen() {
  const params = useLocalSearchParams<{ itemIds?: string; locationIds?: string }>();
  const { alert } = useDialog();
  const [records, setRecords] = useState<LabelRecord[]>([]); const [size, setSize] = useState<LabelSize>("item-small"); const [quantity, setQuantity] = useState("1"); const [busy, setBusy] = useState(false);
  useEffect(() => { void (async () => { const itemRows = await inventoryService.getItems(ids(params.itemIds)); const locationRows = await Promise.all(ids(params.locationIds).map((id) => inventoryService.getLocation(id))); setRecords([...itemRows.map((item) => ({ kind: "item" as const, item })), ...locationRows.map((location) => ({ kind: "location" as const, location }))]); if (locationRows.length && !itemRows.length) setSize("location-large"); })(); }, [params.itemIds, params.locationIds]);
  const count = Math.max(1, Math.min(50, Number(quantity) || 1));
  const run = async (mode: "print" | "share") => { if (!records.length) { void alert({ title: "Sin etiquetas", message: "Seleccione prendas o ubicaciones desde el catálogo." }); return; } setBusy(true); try { if (mode === "print") await inventoryService.printLabels(records, size, count); else await inventoryService.shareLabels(records, size, count); } catch (error) { void alert({ title: "No pudimos generar las etiquetas", message: error instanceof Error ? error.message : "Intente nuevamente.", tone: "danger" }); } finally { setBusy(false); } };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}><Text style={styles.intro}>Los códigos contienen únicamente identificadores estables. El precio y la ubicación no forman parte del código.</Text><View style={styles.controls}><Text style={styles.label}>Tamaño</Text><View style={styles.chips}><FilterChip label="Prenda pequeña" selected={size === "item-small"} onPress={() => setSize("item-small")} /><FilterChip label="Ubicación grande" selected={size === "location-large"} onPress={() => setSize("location-large")} /><FilterChip label="Hoja múltiple" selected={size === "sheet"} onPress={() => setSize("sheet")} /></View><Text style={styles.label}>Copias por etiqueta</Text><TextInput value={quantity} onChangeText={setQuantity} keyboardType="number-pad" style={styles.input} /><Text style={styles.count}>{records.length} registros · {records.length * count} etiquetas</Text></View>{records.length ? <View style={styles.previews}>{records.slice(0,4).map((record) => <LabelPreview key={`${record.kind}-${record.kind === "item" ? record.item.id : record.location.id}`} record={record} />)}{records.length > 4 ? <Text style={styles.more}>Y {records.length - 4} etiquetas más en el documento final.</Text> : null}</View> : <View style={styles.empty}><Text style={styles.emptyTitle}>No hay registros seleccionados</Text><Text style={styles.intro}>Abra el catálogo o una ubicación, seleccione registros y elija “Etiquetas”.</Text></View>}<View style={styles.actions}><AppButton grow label={busy ? "Generando..." : "Imprimir"} icon="printer-outline" onPress={() => void run("print")} disabled={busy || !records.length} /><AppButton grow tone="secondary" label="Crear PDF y compartir" icon="file-pdf-box" onPress={() => void run("share")} disabled={busy || !records.length} /></View></ScrollView>;
}

function LabelPreview({ record }: { record: LabelRecord }) {
  const entity: Item | LocationSummary = record.kind === "item" ? record.item : record.location;
  const title = record.kind === "item" ? record.item.code : record.location.name;
  return <View style={styles.preview}>
    <View style={styles.previewHead}><MedusaIcon size={14} color={colors.primary} /><Text style={styles.brand}>MEDUSA STORE</Text>{record.kind === "item" ? <Text style={styles.previewPrice}>{formatMoney(record.item.price)}</Text> : null}</View>
    <View style={styles.previewBody}><View style={styles.previewCopy}><Text style={styles.previewTitle}>{title}</Text>{record.kind === "item" && record.item.tags.length ? <Text numberOfLines={1} style={styles.previewTags}>{record.item.tags.slice(0, 3).join(" · ")}</Text> : null}<Text style={styles.machine}>{entity.machineCode}</Text></View><QRCode value={entity.machineCode} size={72} color={colors.primary} backgroundColor={colors.surface} /></View>
    <Code128View value={entity.machineCode} height={42} />
  </View>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.lg, backgroundColor: colors.canvas }, intro: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 }, controls: { gap: spacing.sm }, label: { color: colors.textPrimary, fontWeight: "800" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, input: { ...inputStyle, maxWidth: 120 }, count: { color: colors.primary, fontWeight: "900" }, previews: { gap: spacing.md }, preview: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface }, previewHead: { flexDirection: "row", alignItems: "center", gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.xs }, brand: { flex: 1, color: colors.primary, fontSize: typography.tiny, fontWeight: "900", letterSpacing: 1.2 }, previewPrice: { color: colors.success, fontSize: typography.title, fontWeight: "900" }, previewTags: { color: colors.textSecondary, fontSize: typography.small, fontWeight: "700" }, previewBody: { flexDirection: "row", alignItems: "center", gap: spacing.md }, previewCopy: { flex: 1, gap: spacing.xs }, previewTitle: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900" }, machine: { color: colors.textMuted, fontWeight: "800" }, more: { color: colors.textMuted, textAlign: "center" }, empty: { gap: spacing.sm, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.tint }, emptyTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm } });
