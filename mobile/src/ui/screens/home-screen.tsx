import React, { useCallback } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";

import { inventoryService } from "../../application/inventory-service";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { eventTypeLabel, formatDate, formatMoney } from "../../utils/format";
import { useFocusLoad } from "../hooks/use-focus-load";
import { AppButton } from "../components/app-button";
import { MedusaIcon } from "../components/medusa-icon";
import { MetricCard } from "../components/metric-card";
import { ScreenState } from "../components/screen-state";

export function HomeScreen() {
  const load = useCallback(async () => ({ summary: await inventoryService.dashboard(), events: await inventoryService.history({}) }), []);
  const { data, loading, error, refresh } = useFocusLoad(load);
  if (!data && loading) return <ScreenState loading title="Preparando el inventario" />;
  if (!data) return <ScreenState title="No pudimos cargar el inicio" body={error ?? undefined} action={<AppButton label="Reintentar" icon="reload" onPress={() => void refresh()} />} />;
  const { summary, events } = data;
  return <View style={styles.root}><ScrollView contentInsetAdjustmentBehavior="automatic" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor={colors.primary} />} contentContainerStyle={styles.content}>
    <View style={styles.intro}><View style={styles.brandRow}><MedusaIcon size={20} color={colors.primary} /><Text style={styles.eyebrow}>MEDUSA STORE · INVENTARIO LOCAL</Text></View><Text accessibilityRole="header" style={styles.title}>Resumen del negocio</Text><Text style={styles.subtitle}>La información se guarda en este dispositivo y funciona sin conexión.</Text></View>
    <View style={styles.metrics}>
      <MetricCard label="Disponibles" value={String(summary.activeCount)} icon="hanger" />
      <MetricCard label="Vendidas" value={String(summary.soldCount)} icon="hand-coin-outline" />
      <MetricCard label="Valor disponible" value={formatMoney(summary.activeValue)} icon="cash-multiple" />
      <MetricCard label="Valor vendido" value={formatMoney(summary.soldValue)} icon="chart-line" />
      <MetricCard label="Ubicaciones" value={String(summary.locationCount)} icon="map-marker-multiple-outline" />
    </View>
    <InventoryChart active={summary.activeCount} sold={summary.soldCount} />
    <Text style={styles.sectionTitle}>Acciones rápidas</Text>
    <AppButton label="Agregar prenda" icon="plus" onPress={() => router.push("/items/new")} />
    <View style={styles.tiles}>
      <QuickTile label="Escanear" icon="qrcode-scan" onPress={() => router.navigate("/scan")} />
      <QuickTile label="Crear ubicación" icon="map-marker-plus-outline" onPress={() => router.push("/locations/new")} />
      <QuickTile label="Mover prendas" icon="swap-horizontal-bold" onPress={() => router.push("/transfer")} />
      <QuickTile label="Imprimir etiquetas" icon="printer-outline" onPress={() => router.push("/labels")} />
    </View>
    <Text style={styles.sectionTitle}>Atención</Text>
    <View style={styles.alerts}>
      <AlertRow icon="map-marker-alert-outline" label="Prendas sin ubicación" value={summary.unassignedCount} onPress={() => router.push({ pathname: "/catalog", params: { filter: "unassigned" } })} />
      <AlertRow icon="image-off-outline" label="Prendas sin foto" value={summary.withoutPhotoCount} onPress={() => router.push({ pathname: "/catalog", params: { filter: "no-photo" } })} />
    </View>
    <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>Actividad reciente</Text><Pressable accessibilityRole="button" onPress={() => router.push("/history")} style={styles.link}><Text style={styles.linkText}>Ver historial</Text></Pressable></View>
    <View style={styles.activity}>{events.slice(0, 6).map((event) => <View key={event.id} style={styles.event}><View style={styles.eventDot} /><View style={styles.eventCopy}><Text style={styles.eventTitle}>{event.summary}</Text><Text style={styles.eventMeta}>{eventTypeLabel(event.type)} · {formatDate(event.createdAt)}</Text></View></View>)}{events.length === 0 ? <Text style={styles.empty}>La actividad aparecerá cuando agregue o mueva prendas.</Text> : null}</View>
  </ScrollView></View>;
}

function InventoryChart({ active, sold }: { active: number; sold: number }) {
  const total = active + sold; const activeWidth = total ? `${Math.max(4, Math.round(active / total * 100))}%` as const : "0%"; const soldWidth = total ? `${Math.max(4, Math.round(sold / total * 100))}%` as const : "0%";
  return <View accessibilityRole="summary" accessibilityLabel={`Distribución del inventario: ${active} disponibles y ${sold} vendidas`} style={styles.chart}><Text style={styles.sectionTitle}>Disponibles frente a vendidas</Text><View style={styles.chartRow}><View style={styles.chartLabel}><Text style={styles.chartName}>Disponibles</Text><Text style={styles.chartValue}>{active}</Text></View><View style={styles.track}>{active ? <View style={[styles.activeBar, { width: activeWidth }]} /> : null}</View></View><View style={styles.chartRow}><View style={styles.chartLabel}><Text style={styles.chartName}>Vendidas</Text><Text style={styles.chartValue}>{sold}</Text></View><View style={styles.track}>{sold ? <View style={[styles.soldBar, { width: soldWidth }]} /> : null}</View></View><Text style={styles.chartNote}>Las cifras y etiquetas identifican cada estado sin depender del color.</Text></View>;
}

function QuickTile({ icon, label, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
    <View style={styles.tileIcon}><MaterialCommunityIcons name={icon} size={24} color={colors.primary} /></View>
    <Text numberOfLines={2} style={styles.tileLabel}>{label}</Text>
  </Pressable>;
}

function AlertRow({ icon, label, value, onPress }: { icon: keyof typeof MaterialCommunityIcons.glyphMap; label: string; value: number; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} onPress={onPress} style={({ pressed }) => [styles.alert, pressed && styles.pressed]}><MaterialCommunityIcons name={icon} size={24} color={value > 0 ? colors.danger : colors.success} /><Text style={styles.alertLabel}>{label}</Text><Text style={styles.alertValue}>{value}</Text><MaterialCommunityIcons name="chevron-right" size={22} color={colors.textMuted} /></Pressable>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: colors.canvas }, content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.lg, backgroundColor: colors.canvas }, intro: { gap: spacing.xs }, brandRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, eyebrow: { color: colors.primaryDark, fontSize: typography.tiny, fontWeight: "900", letterSpacing: 1.3 }, title: { color: colors.textPrimary, fontSize: 30, fontWeight: "900", letterSpacing: -0.7 }, subtitle: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, sectionTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, chart: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, chartRow: { gap: spacing.xs }, chartLabel: { flexDirection: "row", justifyContent: "space-between" }, chartName: { color: colors.textSecondary, fontWeight: "800" }, chartValue: { color: colors.textPrimary, fontWeight: "900", fontVariant: ["tabular-nums"] }, track: { height: 18, overflow: "hidden", borderRadius: radius.pill, backgroundColor: colors.tint }, activeBar: { height: "100%", backgroundColor: colors.success }, soldBar: { height: "100%", backgroundColor: colors.primaryDark }, chartNote: { color: colors.textMuted, fontSize: typography.small }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, tiles: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, tile: { flexBasis: "47%", flexGrow: 1, minHeight: 96, alignItems: "flex-start", justifyContent: "center", gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, tileIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.tint }, tileLabel: { color: colors.textPrimary, fontSize: typography.body, fontWeight: "800" }, alerts: { gap: spacing.sm }, alert: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, alertLabel: { flex: 1, color: colors.textPrimary, fontSize: typography.body, fontWeight: "800" }, alertValue: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", fontVariant: ["tabular-nums"] }, pressed: { opacity: 0.76 }, sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, link: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.sm }, linkText: { color: colors.primary, fontWeight: "800" }, activity: { gap: spacing.sm }, event: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }, eventDot: { width: 10, height: 10, marginTop: 5, borderRadius: 5, backgroundColor: colors.primary }, eventCopy: { flex: 1, gap: 3 }, eventTitle: { color: colors.textPrimary, fontWeight: "800" }, eventMeta: { color: colors.textMuted, fontSize: typography.small }, empty: { color: colors.textMuted, lineHeight: 20 } });
