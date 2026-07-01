import React, { useRef, useState } from "react";
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";

import { api } from "../api/client";
import { resolveScannedCode as resolveScannedCodeFromApi } from "../api/scanner";
import { ItemCard } from "../components/ItemCard";
import type { Item } from "../types";

export function ScannerScreen({ onOpenItem }: { onOpenItem: (item: Item) => void }) {
  const [code, setCode] = useState("");
  const [containerItems, setContainerItems] = useState<Item[]>([]);
  const [scanInFlight, setScanInFlight] = useState(false);
  const scanInFlightRef = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();

  const searchItem = async (targetCode = code) => {
    try {
      const item = await api.scanItem(targetCode);
      setContainerItems([]);
      onOpenItem(item);
    } catch (err) {
      Alert.alert("No encontramos el artículo", err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const searchContainer = async (targetCode = code) => {
    try {
      const result = await api.scanContainer(targetCode);
      setContainerItems(result.items);
    } catch (err) {
      Alert.alert("No encontramos el contenedor", err instanceof Error ? err.message : "Error desconocido");
    }
  };

  const resolveScannedCode = async (targetCode: string) => {
    const normalizedCode = targetCode.trim();
    if (!normalizedCode || scanInFlightRef.current) return;

    scanInFlightRef.current = true;
    setScanInFlight(true);
    setCode(normalizedCode);
    try {
      const resolution = await resolveScannedCodeFromApi(normalizedCode);
      if (resolution.type === "item") {
        setContainerItems([]);
        onOpenItem(resolution.item);
      } else {
        setContainerItems(resolution.items);
      }
    } catch (err) {
      Alert.alert("Código no encontrado", err instanceof Error ? err.message : "No hay artículos ni contenedores con ese código.");
    } finally {
      scanInFlightRef.current = false;
      setScanInFlight(false);
    }
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    void resolveScannedCode(data);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Escanear o buscar</Text>
      <Text style={styles.note}>Apuntá la cámara a un QR o código de barras de artículo o contenedor. También podés buscar manualmente.</Text>
      {!permission && <ActivityIndicator style={styles.loader} />}
      {permission?.granted ? (
        <CameraView
          style={styles.camera}
          facing="back"
          onBarcodeScanned={scanInFlight ? undefined : handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13"] }}
        >
          {scanInFlight && (
            <View style={styles.scanOverlay}>
              <Text style={styles.scanOverlayText}>Buscando código...</Text>
            </View>
          )}
        </CameraView>
      ) : (
        <View style={styles.permissionBox}>
          <Text style={styles.note}>Necesitamos permiso de cámara para escanear.</Text>
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Habilitar cámara</Text>
          </TouchableOpacity>
        </View>
      )}
      <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="BOX-0001, BAG-0001, or ITEM-0001" autoCapitalize="characters" />
      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={() => searchContainer()} disabled={scanInFlight}>
          <Text style={styles.buttonText}>Buscar contenedor</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => searchItem()} disabled={scanInFlight}>
          <Text style={styles.buttonText}>Buscar artículo</Text>
        </TouchableOpacity>
      </View>
      <FlatList data={containerItems} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <ItemCard item={item} onPress={onOpenItem} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  heading: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 8 },
  note: { color: "#6b7280", lineHeight: 20, marginBottom: 12 },
  loader: { marginBottom: 12 },
  camera: { height: 220, borderRadius: 18, overflow: "hidden", marginBottom: 12 },
  scanOverlay: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(17, 24, 39, 0.45)" },
  scanOverlayText: { color: "#ffffff", fontWeight: "900" },
  permissionBox: { backgroundColor: "#ffffff", borderRadius: 18, padding: 14, marginBottom: 12 },
  input: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#e5e7eb" },
  row: { flexDirection: "row", gap: 8, marginVertical: 12 },
  button: { flex: 1, backgroundColor: "#111827", borderRadius: 16, padding: 14, alignItems: "center" },
  buttonText: { color: "#ffffff", fontWeight: "800" },
});
