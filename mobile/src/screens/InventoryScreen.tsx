import React, { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Searchbar, Text } from "react-native-paper";

import { api } from "../api/client";
import { EmptyState } from "../components/EmptyState";
import { ItemCard } from "../components/ItemCard";
import type { Item, Paginated } from "../types";

const DEFAULT_PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 300;

export function InventoryScreen({ onOpenItem }: { onOpenItem: (item: Item) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [pageData, setPageData] = useState<Paginated<Item> | null>(null);
  const [page, setPage] = useState(1);
  const [pagePath, setPagePath] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetPath: string | null = null, targetPage = 1) => {
    setLoading(true);
    setError(null);
    try {
      const data = targetPath
        ? await api.listItemsPage(targetPath)
        : await api.listInventoryPage({ search: debouncedSearch });
      setPageData(data);
      setItems(data.results);
      setPage(targetPage);
      setPagePath(targetPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar el inventario.");
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch]);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setPagePath(null);
    void load(null, 1);
  }, [debouncedSearch, load]);

  const totalPages = pageData ? Math.max(1, Math.ceil(pageData.count / DEFAULT_PAGE_SIZE)) : 1;
  const rangeStart = pageData && pageData.count > 0 ? (page - 1) * DEFAULT_PAGE_SIZE + 1 : 0;
  const rangeEnd = pageData ? Math.min(pageData.count, rangeStart + items.length - 1) : 0;

  if (loading && !pageData) {
    return <ActivityIndicator style={styles.loader} />;
  }

  return (
    <View style={styles.container}>
      <Text variant="headlineSmall" style={styles.heading}>Inventario</Text>
      <Card mode="contained" style={styles.filtersCard}>
        <Card.Content>
          <Searchbar
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar por código, descripción o contenedor"
            style={styles.search}
          />
          <Text style={styles.filterHint}>La lista se actualiza mientras escribís. Borrá el texto para volver al inventario completo.</Text>
        </Card.Content>
      </Card>
      {pageData && (
        <Text style={styles.pageSummary}>
          {pageData.count === 0 ? "No hay artículos activos" : `Mostrando ${rangeStart}-${rangeEnd} de ${pageData.count} artículos activos`}
        </Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={items}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <ItemCard item={item} onPress={onOpenItem} />}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(pagePath, page)} />}
        ListEmptyComponent={<EmptyState title="Sin artículos activos" body="Registrá la primera prenda para empezar a controlar el inventario." />}
        ListFooterComponent={pageData ? (
          <Card mode="contained" style={styles.paginationCard}>
            <Card.Content>
              <Text style={styles.paginationText}>Página {page} de {totalPages}</Text>
              <View style={styles.paginationActions}>
                <Button
                  mode="contained-tonal"
                  disabled={!pageData.previous || loading}
                  onPress={() => pageData.previous && load(pageData.previous, Math.max(1, page - 1))}
                  style={styles.pageButton}
                >
                  Anterior
                </Button>
                <Button
                  mode="contained-tonal"
                  disabled={!pageData.next || loading}
                  onPress={() => pageData.next && load(pageData.next, page + 1)}
                  style={styles.pageButton}
                >
                  Siguiente
                </Button>
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
  heading: { fontWeight: "900", color: "#111827", marginBottom: 8 },
  filtersCard: { backgroundColor: "#ffffff", marginBottom: 12, borderColor: "#ddd6fe", borderWidth: 1 },
  search: { marginBottom: 8 },
  filterHint: { color: "#6d5f8f", fontWeight: "700", lineHeight: 18 },
  pageSummary: { color: "#6b7280", marginBottom: 12, fontWeight: "700" },
  error: { color: "#b91c1c", marginBottom: 12, fontWeight: "700" },
  paginationCard: { backgroundColor: "#ffffff", marginBottom: 18, borderColor: "#ddd6fe", borderWidth: 1 },
  paginationText: { textAlign: "center", color: "#4b5563", fontWeight: "800", marginBottom: 10 },
  paginationActions: { flexDirection: "row", gap: 8 },
  pageButton: { flex: 1 },
});
