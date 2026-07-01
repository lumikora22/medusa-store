import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { ActivityIndicator, Button, Card, Text } from "react-native-paper";
import { BarChart } from "react-native-gifted-charts";

import { api } from "../api/client";
import type { DashboardSummary } from "../types";
import { formatMoney } from "../utils/format";

export function DashboardScreen({ onOpenInventory }: { onOpenInventory: () => void }) {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      setSummary(await api.dashboardSummary());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el tablero.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = summary?.active_items_count ?? 0;
  const soldCount = summary?.sold_items_count ?? 0;
  const chartData = useMemo(() => ([
    { value: activeCount, label: "Disp.", frontColor: "#111111" },
    { value: soldCount, label: "Vend.", frontColor: "#a78bfa" },
  ]), [activeCount, soldCount]);
  const chartWidth = Math.min(width - 96, 320);
  const chartMaxValue = Math.max(1, activeCount, soldCount);

  if (loading && !summary) {
    return <ActivityIndicator style={styles.loader} />;
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
    >
      <Text variant="headlineSmall" style={styles.heading}>Tablero</Text>
      <Text variant="bodyMedium" style={styles.subtitle}>Resumen general del inventario y ventas.</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.grid}>
        <MetricCard label="Artículos activos" value={String(summary?.active_items_count ?? 0)} />
        <MetricCard label="Valor disponible" value={formatMoney(summary?.active_inventory_value ?? "0")} accent />
        <MetricCard label="Vendidos" value={String(summary?.sold_items_count ?? 0)} />
        <MetricCard label="Valor vendido" value={formatMoney(summary?.sold_inventory_value ?? "0")} accent />
        <MetricCard label="Contenedores" value={String(summary?.containers_count ?? 0)} />
      </View>

      <Card mode="contained" style={styles.chartCard}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.chartTitle}>Inventario disponible vs vendido</Text>
          <Text style={styles.chartText}>Comparación rápida por cantidad de artículos.</Text>
          <View style={styles.chartWrap}>
            <BarChart
              data={chartData}
              width={chartWidth}
              height={160}
              maxValue={chartMaxValue}
              noOfSections={4}
              barWidth={52}
              spacing={48}
              initialSpacing={20}
              endSpacing={20}
              roundedTop
              roundedBottom
              yAxisThickness={0}
              xAxisColor="#ddd6fe"
              yAxisTextStyle={styles.axisText}
              xAxisLabelTextStyle={styles.axisText}
              rulesColor="#ede9fe"
            />
          </View>
          <View style={styles.legendRow}>
            <LegendDot color="#111111" label={`Disponibles: ${activeCount}`} />
            <LegendDot color="#a78bfa" label={`Vendidos: ${soldCount}`} />
          </View>
        </Card.Content>
      </Card>

      <Card mode="contained" style={styles.actionCard}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.actionTitle}>Inventario listo para revisar</Text>
          <Text style={styles.actionText}>Usá filtros, fotos y paginación desde la pestaña Inventario.</Text>
          <Button mode="contained" onPress={onOpenInventory} style={styles.actionButton}>Ver inventario</Button>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

function MetricCard({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card mode="elevated" style={styles.metricCard}>
      <Card.Content>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, accent && styles.metricAccent]}>{value}</Text>
      </Card.Content>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 40 },
  heading: { fontWeight: "900", color: "#111827" },
  subtitle: { color: "#6d5f8f", marginBottom: 14 },
  error: { color: "#b91c1c", marginBottom: 12, fontWeight: "700" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metricCard: { width: "48%", minHeight: 116, backgroundColor: "#ffffff", borderColor: "#ddd6fe", borderWidth: 1 },
  metricLabel: { color: "#6d5f8f", fontWeight: "800", marginBottom: 10 },
  metricValue: { color: "#111827", fontSize: 24, fontWeight: "900" },
  metricAccent: { color: "#7c3aed", fontSize: 22 },
  chartCard: { marginTop: 16, backgroundColor: "#ffffff", borderColor: "#ddd6fe", borderWidth: 1 },
  chartTitle: { fontWeight: "900", color: "#111827" },
  chartText: { color: "#6d5f8f", marginTop: 4, marginBottom: 12 },
  chartWrap: { alignItems: "center", overflow: "hidden" },
  axisText: { color: "#6d5f8f", fontSize: 11, fontWeight: "700" },
  legendRow: { flexDirection: "row", gap: 12, flexWrap: "wrap", marginTop: 12 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 999 },
  legendText: { color: "#111827", fontWeight: "800" },
  actionCard: { marginTop: 16, marginBottom: 32, backgroundColor: "#ede9fe" },
  actionTitle: { fontWeight: "900", color: "#1f1235" },
  actionText: { color: "#4c1d95", marginTop: 6, marginBottom: 12 },
  actionButton: { alignSelf: "flex-start" },
});
