import React, { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text, TextInput } from "react-native-paper";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ItemCard } from "../components/ItemCard";
import type { Item, Paginated } from "../types";
import { parseTags } from "../utils/format";

const DEFAULT_PAGE_SIZE = 25;

export function SoldItemsScreen({ onOpenItem }: { onOpenItem: (item: Item) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [pageData, setPageData] = useState<Paginated<Item> | null>(null);
  const [page, setPage] = useState(1);
  const [pagePath, setPagePath] = useState("/items/?status=sold");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (targetPath = pagePath, targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listSoldItemsPage(targetPath);
      setPageData(data);
      setItems(data.results);
      setPage(targetPage);
      setPagePath(targetPath);
      if (targetPage === 1 && data.results.length > 0) {
        setPageSize(data.results.length);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar los vendidos.");
    } finally {
      setLoading(false);
    }
  }, [page, pagePath]);

  useEffect(() => {
    void load("/items/?status=sold", 1);
  }, []);

  const startEditing = (item: Item) => {
    setEditingItem(item);
    setEditPrice(item.price);
    setEditDescription(item.description);
    setEditTags(item.tags.join(", "));
  };

  const saveSoldItem = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const updated = await api.updateItem(editingItem.id, {
        price: editPrice,
        description: editDescription,
        tags: parseTags(editTags),
      });
      setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setEditingItem(null);
      Alert.alert("Vendido actualizado", "La información del artículo vendido quedó guardada.");
    } catch (err) {
      Alert.alert("No pudimos actualizar", err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.count / pageSize)) : 1;
  const rangeStart = pageData && pageData.count > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = pageData ? Math.min(pageData.count, rangeStart + items.length - 1) : 0;

  if (loading && !pageData) {
    return <ActivityIndicator style={styles.loader} />;
  }

  if (editingItem) {
    return (
      <View style={styles.container}>
        <Button mode="text" onPress={() => setEditingItem(null)} style={styles.backButton}>Volver a vendidos</Button>
        <Card mode="elevated" style={styles.editCard}>
          <Card.Content>
            <Text variant="headlineSmall" style={styles.heading}>Editar vendido</Text>
            <Text style={styles.meta}>{editingItem.code} · {editingItem.container_code}</Text>
            <TextInput mode="outlined" value={editPrice} onChangeText={setEditPrice} label="Precio" keyboardType="decimal-pad" style={styles.input} />
            <TextInput mode="outlined" value={editDescription} onChangeText={setEditDescription} label="Descripción" multiline style={styles.input} />
            <TextInput mode="outlined" value={editTags} onChangeText={setEditTags} label="Etiquetas" placeholder="jean, vintage" style={styles.input} />
            <Button mode="contained" onPress={saveSoldItem} disabled={saving} style={styles.saveButton}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </Card.Content>
        </Card>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.heading}>Vendidos</Text>
      {pageData && (
        <Text style={styles.pageSummary}>
          {pageData.count === 0 ? "No hay artículos vendidos" : `Mostrando ${rangeStart}-${rangeEnd} de ${pageData.count} vendidos`}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(pagePath, page)} />}
        renderItem={({ item }) => (
          <View style={styles.soldCardWrap}>
            <ItemCard item={item} onPress={onOpenItem} />
            <Button mode="contained-tonal" onPress={() => startEditing(item)} style={styles.editButton}>Editar vendido</Button>
          </View>
        )}
        ListEmptyComponent={<EmptyState title="Sin vendidos" body="Los artículos marcados como vendidos van a aparecer acá." />}
        ListFooterComponent={pageData ? (
          <Card mode="contained" style={styles.paginationCard}>
            <Card.Content>
              <Text style={styles.paginationText}>Página {page} de {totalPages}</Text>
              <View style={styles.paginationActions}>
                <Button mode="contained-tonal" disabled={!pageData.previous || loading} onPress={() => pageData.previous && load(pageData.previous, Math.max(1, page - 1))} style={styles.pageButton}>Anterior</Button>
                <Button mode="contained-tonal" disabled={!pageData.next || loading} onPress={() => pageData.next && load(pageData.next, page + 1)} style={styles.pageButton}>Siguiente</Button>
              </View>
            </Card.Content>
          </Card>
        ) : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginTop: 40 },
  heading: { fontWeight: "900", color: "#111827", marginBottom: 6 },
  pageSummary: { color: "#6b7280", marginBottom: 12, fontWeight: "700" },
  error: { color: "#b91c1c", marginBottom: 12, fontWeight: "700" },
  soldCardWrap: { marginBottom: 8 },
  editButton: { alignSelf: "flex-start", marginTop: -4, marginBottom: 8 },
  editCard: { backgroundColor: "#ffffff" },
  meta: { color: "#6b7280", marginBottom: 10, fontWeight: "700" },
  input: { marginTop: 10 },
  saveButton: { marginTop: 16, alignSelf: "flex-start" },
  backButton: { alignSelf: "flex-start", marginBottom: 8 },
  paginationCard: { backgroundColor: "#ffffff", marginBottom: 18 },
  paginationText: { textAlign: "center", color: "#4b5563", fontWeight: "800", marginBottom: 10 },
  paginationActions: { flexDirection: "row", gap: 8 },
  pageButton: { flex: 1 },
});
