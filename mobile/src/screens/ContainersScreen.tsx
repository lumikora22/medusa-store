import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { ActivityIndicator, Button, Card, Chip, Searchbar, Surface, Text, TextInput } from "react-native-paper";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ItemCard } from "../components/ItemCard";
import type { Container, Item } from "../types";
import { getContainerTypeLabel } from "../utils/format";

type ContainerDetail = { container: Container; items: Item[] };

export function ContainersScreen({ onOpenItem }: { onOpenItem: (item: Item) => void }) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [detail, setDetail] = useState<ContainerDetail | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState<Container["type"]>("box");
  const [customTypeLabel, setCustomTypeLabel] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadContainers = useCallback(async () => {
    setError(null);
    try {
      const data = await api.listContainers();
      setContainers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los contenedores.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContainers();
  }, [loadContainers]);

  const filteredContainers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return containers;
    }

    return containers.filter((container) =>
      container.code.toLowerCase().includes(normalizedQuery) ||
      getContainerTypeLabel(container.type).toLowerCase().includes(normalizedQuery) ||
      container.type.toLowerCase().includes(normalizedQuery),
    );
  }, [containers, query]);

  const openContainer = async (code: string, revealQr = false) => {
    try {
      const data = await api.scanContainer(code);
      setDetail(data);
      setShowQr(revealQr);
    } catch (err) {
      Alert.alert("No encontramos el contenedor", err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const createContainer = async () => {
    if (!newCode.trim()) {
      Alert.alert("Falta el código", "Ingresá un código para crear el contenedor.");
      return;
    }
    try {
      const created = await api.createContainer({
        code: newCode,
        type: newType,
        ...(newType === "other" && customTypeLabel.trim() ? { notes: `Tipo personalizado: ${customTypeLabel.trim()}` } : {}),
      });
      setNewCode("");
      setCustomTypeLabel("");
      await loadContainers();
      setDetail({ container: created, items: [] });
      setShowQr(true);
    } catch (err) {
      Alert.alert("No pudimos crear el contenedor", err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const printQr = () => {
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.print === "function") {
      window.print();
      return;
    }
    Alert.alert("Impresión no disponible", "En móvil, hacé una captura del QR o abrí la app en web para usar imprimir.");
  };

  if (detail) {
    const qrValue = detail.container.qr_value || detail.container.code;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.detailContent} keyboardShouldPersistTaps="handled">
        <Button mode="text" onPress={() => setDetail(null)} style={styles.backButton}>Volver a contenedores</Button>
        <Card mode="elevated" style={styles.heroCard}>
          <Card.Content>
            <View style={styles.heroTopRow}>
              <View style={styles.heroTitleWrap}>
                <Text variant="headlineSmall" style={styles.heading}>{detail.container.code}</Text>
                <Text style={styles.meta}>{getContainerTypeLabel(detail.container.type)} · {detail.container.active_items_count ?? detail.items.length} artículos activos</Text>
              </View>
              <Chip style={styles.heroChip}>{detail.container.status === "active" ? "Activo" : "Archivado"}</Chip>
            </View>
                  {!!detail.container.notes && <Text style={styles.notes}>{detail.container.notes}</Text>}
            <View style={styles.heroActions}>
              <Button mode="contained-tonal" onPress={() => setShowQr((current) => !current)} style={styles.detailButton}>
                {showQr ? "Ocultar QR" : "Mostrar QR"}
              </Button>
              <Button mode="contained" onPress={printQr} style={styles.detailButton}>Imprimir QR</Button>
            </View>
          </Card.Content>
        </Card>

        {showQr && (
          <Card mode="contained" style={styles.qrBox}>
            <Card.Content>
              <Text variant="titleMedium" style={styles.sectionTitle}>Código QR del contenedor</Text>
              <View style={styles.qrRow}>
                <QRCode value={qrValue} size={156} />
                <View style={styles.qrCopy}>
                  <Text style={styles.containerCode}>{detail.container.code}</Text>
                  <Text style={styles.meta}>Valor QR: {qrValue}</Text>
                  <Text style={styles.qrHint}>Pegá este QR en el contenedor para abrir su detalle desde el escáner.</Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        <Text variant="titleMedium" style={styles.sectionTitle}>Productos en este contenedor</Text>
        {detail.items.length === 0 ? (
          <EmptyState title="Sin productos activos" body="Este contenedor no tiene artículos activos por ahora." />
        ) : (
          detail.items.map((item) => <ItemCard key={item.id} item={item} onPress={onOpenItem} />)
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Card mode="contained" style={styles.headerCard}>
        <Card.Content>
          <Text variant="headlineSmall" style={styles.heading}>Contenedores</Text>
          <Text style={styles.subtitle}>Administrá cajas, bolsas y espacios personalizados desde un solo lugar.</Text>
        </Card.Content>
      </Card>
      {loading && <ActivityIndicator style={styles.loader} />}
      {error && (
        <Card mode="contained" style={styles.errorBox}>
          <Card.Content>
            <Text style={styles.error}>{error}</Text>
            <Button mode="contained" onPress={loadContainers}>Reintentar</Button>
          </Card.Content>
        </Card>
      )}
      <Card mode="elevated" style={styles.card}>
        <Card.Content>
          <Text variant="titleMedium" style={styles.sectionTitle}>Crear contenedor</Text>
          <TextInput mode="outlined" value={newCode} onChangeText={setNewCode} label="Código" placeholder="BOX-0001 o BAG-0001" autoCapitalize="characters" style={styles.input} />
          <View style={styles.row}>
            {(["box", "bag", "other"] as const).map((type) => (
              <Chip key={type} selected={newType === type} onPress={() => setNewType(type)} style={[styles.typeChip, newType === type && styles.typeChipActive]}>
                {getContainerTypeLabel(type)}
              </Chip>
            ))}
          </View>
          {newType === "other" && (
            <TextInput
              mode="outlined"
              value={customTypeLabel}
              onChangeText={setCustomTypeLabel}
              label="Tipo personalizado"
              placeholder="Perchero, estante, vitrina"
              style={styles.customTypeInput}
            />
          )}
          <Button mode="contained" onPress={createContainer} style={styles.createButton}>Crear y ver QR</Button>
        </Card.Content>
      </Card>

      <Surface style={styles.searchSurface} elevation={1}>
        <Searchbar value={query} onChangeText={setQuery} placeholder="Buscar contenedores" style={styles.search} />
      </Surface>

      {filteredContainers.length === 0 ? (
        <EmptyState title="Sin contenedores" body="No hay contenedores que coincidan con la búsqueda." />
      ) : (
        filteredContainers.map((container) => (
          <Card mode="elevated" key={container.id} style={styles.containerCard} onPress={() => openContainer(container.code)}>
            <Card.Content style={styles.containerCardContent}>
              <View style={styles.containerCardTextWrap}>
                <Text style={styles.containerCode}>{container.code}</Text>
                <Text style={styles.meta}>{getContainerTypeLabel(container.type)} · {container.active_items_count ?? 0} activos</Text>
                {!!container.notes && <Text style={styles.containerNotes} numberOfLines={2}>{container.notes}</Text>}
              </View>
              <Button mode="contained-tonal" onPress={() => openContainer(container.code)} style={styles.openButton}>Abrir</Button>
            </Card.Content>
          </Card>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  detailContent: { paddingBottom: 28 },
  loader: { marginBottom: 12 },
  headerCard: { backgroundColor: "#f5f3ff", marginBottom: 12, borderColor: "#ddd6fe", borderWidth: 1 },
  subtitle: { color: "#6d5f8f", marginTop: 4 },
  heading: { fontWeight: "900", color: "#111111" },
  errorBox: { backgroundColor: "#fee2e2", marginBottom: 12 },
  error: { color: "#991b1b", fontWeight: "700", marginBottom: 8 },
  card: { backgroundColor: "#ffffff", marginBottom: 12, borderColor: "#ddd6fe", borderWidth: 1 },
  sectionTitle: { fontWeight: "900", color: "#111827", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" },
  input: { marginTop: 4 },
  notes: { color: "#4c1d95", marginTop: 10, lineHeight: 20 },
  customTypeInput: { marginTop: 8 },
  typeChip: { backgroundColor: "#f5f3ff" },
  typeChipActive: { backgroundColor: "#111111" },
  createButton: { marginTop: 12, alignSelf: "flex-start" },
  searchSurface: { borderRadius: 16, marginBottom: 12, backgroundColor: "#ffffff", overflow: "hidden" },
  search: { marginBottom: 0, backgroundColor: "#ffffff" },
  containerCard: { backgroundColor: "#ffffff", marginBottom: 10, borderColor: "#ddd6fe", borderWidth: 1 },
  containerCardContent: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  containerCardTextWrap: { flex: 1, minWidth: 0 },
  containerCode: { fontWeight: "900", color: "#111111", fontSize: 18 },
  meta: { color: "#6d5f8f", marginTop: 4, fontWeight: "700" },
  containerNotes: { color: "#4c1d95", marginTop: 6, lineHeight: 18 },
  detailButton: { marginTop: 12, alignSelf: "flex-start" },
  backButton: { alignSelf: "flex-start", marginBottom: 8 },
  qrBox: { backgroundColor: "#ede9fe", marginBottom: 12, borderColor: "#ddd6fe", borderWidth: 1 },
  qrRow: { flexDirection: "row", gap: 12, alignItems: "center", flexWrap: "wrap" },
  qrCopy: { flex: 1, minWidth: 160 },
  qrHint: { color: "#4c1d95", lineHeight: 18, marginTop: 8 },
  printButton: { marginTop: 12, alignSelf: "flex-start" },
  heroCard: { backgroundColor: "#ffffff", marginBottom: 12, borderColor: "#ddd6fe", borderWidth: 1 },
  heroTopRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  heroTitleWrap: { flex: 1 },
  heroChip: { backgroundColor: "#ede9fe" },
  heroActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  openButton: { minWidth: 92 },
});
