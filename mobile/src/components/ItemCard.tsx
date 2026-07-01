import React from "react";
import { Image, StyleSheet, View } from "react-native";
import { Card, Chip, Text } from "react-native-paper";

import type { Item } from "../types";
import { formatMoney, getStatusLabel } from "../utils/format";

export function ItemCard({ item, onPress }: { item: Item; onPress: (item: Item) => void }) {
  const previewUri = item.photos[0]?.image_url ?? item.photos[0]?.image;

  return (
    <Card mode="elevated" style={styles.card} onPress={() => onPress(item)}>
      <Card.Content style={styles.contentRow}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.preview} />
        ) : (
          <View style={styles.previewPlaceholder}>
            <Text style={styles.previewPlaceholderText}>Sin foto</Text>
          </View>
        )}
        <View style={styles.details}>
          <View style={styles.row}>
            <Text variant="titleMedium" style={styles.code}>{item.code}</Text>
            <Text style={styles.price}>{formatMoney(item.price)}</Text>
          </View>
          <Text style={styles.location}>Guardado en {item.container_code}</Text>
          {!!item.description && <Text style={styles.description} numberOfLines={2}>{item.description}</Text>}
          <View style={styles.tagRow}>
            <Chip compact style={styles.statusChip}>{getStatusLabel(item.status)}</Chip>
            {item.tags.slice(0, 2).map((tag) => (
              <Chip compact key={tag} style={styles.tagChip}>{tag}</Chip>
            ))}
          </View>
        </View>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, backgroundColor: "#ffffff" },
  contentRow: { flexDirection: "row", gap: 12 },
  preview: { width: 84, height: 84, borderRadius: 14, backgroundColor: "#e5e7eb" },
  previewPlaceholder: { width: 84, height: 84, borderRadius: 14, backgroundColor: "#f3f4f6", alignItems: "center", justifyContent: "center" },
  previewPlaceholderText: { color: "#9ca3af", fontSize: 11, fontWeight: "800", textAlign: "center" },
  details: { flex: 1, minWidth: 0 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  code: { color: "#111827", fontWeight: "900", flex: 1 },
  price: { color: "#047857", fontSize: 18, fontWeight: "900" },
  location: { marginTop: 6, color: "#4b5563", fontWeight: "700" },
  description: { marginTop: 8, color: "#374151" },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  statusChip: { backgroundColor: "#e0f2fe" },
  tagChip: { backgroundColor: "#f3f4f6" },
});
