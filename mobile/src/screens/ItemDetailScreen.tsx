import React, { useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { api } from "../api/client";
import type { Item } from "../types";
import { formatMoney, getStatusLabel } from "../utils/format";

export function ItemDetailScreen({ item, onBack, onChanged }: { item: Item; onBack: () => void; onChanged: (item: Item) => void }) {
  const [moveCode, setMoveCode] = useState("");

  const markSold = async () => {
    try {
      const updated = await api.markSold(item.id);
      onChanged(updated);
    } catch (err) {
      Alert.alert("No pudimos marcar como vendido", err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const move = async () => {
    if (!moveCode) return;
    if (item.status === "sold") {
      Alert.alert("No se puede mover un vendido", "Los artículos vendidos conservan su última ubicación para el historial.");
      return;
    }
    try {
      const updated = await api.moveItem(item.id, moveCode);
      setMoveCode("");
      onChanged(updated);
    } catch (err) {
      Alert.alert("No pudimos mover el artículo", err instanceof Error ? err.message : "Error desconocido");
    }
  };

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.back}>Volver</Text>
      </TouchableOpacity>
      <View style={styles.card}>
        <Text style={styles.code}>{item.code}</Text>
        <Text style={styles.price}>{formatMoney(item.price)}</Text>
        <Text style={styles.meta}>Estado: {getStatusLabel(item.status)}</Text>
        <Text style={styles.meta}>Guardado en: {item.container_code}</Text>
        <Text style={styles.meta}>Valor QR: {item.qr_value}</Text>
        {!!item.description && <Text style={styles.description}>{item.description}</Text>}
        {item.tags.length > 0 && <Text style={styles.tags}>{item.tags.join(" · ")}</Text>}
      </View>

      {item.photos.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Fotos</Text>
          <View style={styles.photoGrid}>
            {item.photos.map((photo) => (
              <Image key={photo.id} source={{ uri: photo.image_url ?? photo.image }} style={styles.photo} />
            ))}
          </View>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Mover artículo</Text>
        {item.status === "sold" && <Text style={styles.warning}>Los artículos vendidos no se pueden mover.</Text>}
        <TextInput style={styles.input} value={moveCode} onChangeText={setMoveCode} placeholder="Código del contenedor destino" autoCapitalize="characters" />
        <TouchableOpacity style={[styles.button, item.status === "sold" && styles.buttonDisabled]} onPress={move} disabled={item.status === "sold"}>
          <Text style={styles.buttonText}>Mover</Text>
        </TouchableOpacity>
      </View>

      {item.status !== "sold" && (
        <TouchableOpacity style={styles.soldButton} onPress={markSold}>
          <Text style={styles.buttonText}>Marcar como vendido</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  back: { color: "#2563eb", fontWeight: "800", marginBottom: 12 },
  card: { backgroundColor: "#ffffff", borderRadius: 18, padding: 16, marginBottom: 12 },
  code: { fontSize: 24, fontWeight: "900", color: "#111827" },
  price: { fontSize: 22, fontWeight: "900", color: "#047857", marginTop: 6 },
  meta: { color: "#4b5563", marginTop: 8, fontWeight: "700" },
  description: { color: "#374151", marginTop: 12, lineHeight: 20 },
  tags: { color: "#6b7280", marginTop: 12, textTransform: "uppercase" },
  sectionTitle: { fontSize: 16, fontWeight: "800", marginBottom: 8, color: "#111827" },
  warning: { color: "#b45309", fontWeight: "700", marginBottom: 8 },
  input: { borderWidth: 1, borderColor: "#e5e7eb", borderRadius: 14, padding: 12 },
  button: { backgroundColor: "#111827", borderRadius: 14, padding: 14, alignItems: "center", marginTop: 10 },
  buttonDisabled: { backgroundColor: "#9ca3af" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: 96, height: 96, borderRadius: 12, backgroundColor: "#e5e7eb" },
  soldButton: { backgroundColor: "#b91c1c", borderRadius: 14, padding: 16, alignItems: "center", marginBottom: 32 },
  buttonText: { color: "#ffffff", fontWeight: "800" },
});
