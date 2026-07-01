import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import DropDownPicker from "react-native-dropdown-picker";

import { api } from "../api/client";
import { createItemWithPhotos } from "../api/photoUploads";
import type { Container, Item } from "../types";
import { getContainerTypeLabel, parseTags } from "../utils/format";

export function CreateItemScreen({ onCreated }: { onCreated: (item: Item) => void }) {
  const [containers, setContainers] = useState<Container[]>([]);
  const [containerItems, setContainerItems] = useState<Array<{ label: string; value: number }>>([]);
  const [containerDropdownOpen, setContainerDropdownOpen] = useState(false);
  const [code, setCode] = useState("");
  const [useCustomCode, setUseCustomCode] = useState(false);
  const [containerId, setContainerId] = useState<number | null>(null);
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [photos, setPhotos] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingContainers, setLoadingContainers] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadContainers = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await api.listContainers();
      setContainers(data);
      setContainerItems(data.map((container) => ({
        label: `${container.code} · ${getContainerTypeLabel(container.type)} · ${container.active_items_count ?? 0} activos`,
        value: container.id,
      })));
      setContainerId((current) => current ?? data[0]?.id ?? null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "No pudimos cargar los contenedores.");
    } finally {
      setLoadingContainers(false);
    }
  }, []);

  useEffect(() => {
    loadContainers();
  }, [loadContainers]);

  const selectedContainer = containers.find((container) => container.id === containerId);

  const submit = async () => {
    if (!containerId || !price) {
      Alert.alert("Faltan datos", "El contenedor y el precio son obligatorios.");
      return;
    }
    if (useCustomCode && !code.trim()) {
      Alert.alert("Falta el código", "Ingresá un código personalizado o volvé a la generación automática.");
      return;
    }
    setSaving(true);
    try {
      const result = await createItemWithPhotos({
        ...(useCustomCode ? { code } : {}),
        container: containerId,
        price,
        description,
        tags: parseTags(tags),
      }, photos);
      setCode("");
      setUseCustomCode(false);
      setPrice("");
      setDescription("");
      setTags("");
      setPhotos([]);
      onCreated(result.item);
      if (result.failedPhotoUploads > 0) {
        Alert.alert("Artículo guardado", `No se pudieron subir ${result.failedPhotoUploads} foto(s). Podés agregarlas de nuevo más tarde.`);
      }
    } catch (err) {
      Alert.alert("No pudimos guardar el artículo", err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  };

  const addPhotoFromLibrary = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotos((current) => [...current, ...result.assets]);
    }
  };

  const capturePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permiso de cámara requerido", "Habilitá la cámara para sacar fotos del artículo.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });

    if (!result.canceled) {
      setPhotos((current) => [...current, ...result.assets]);
    }
  };

  const removePhoto = (uri: string) => {
    setPhotos((current) => current.filter((photo) => photo.uri !== uri));
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>Agregar prenda</Text>
      {loadingContainers && <ActivityIndicator style={styles.loader} />}
      {loadError && (
        <View style={styles.errorBox}>
          <Text style={styles.error}>{loadError}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadContainers}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={styles.autoCodeBox}>
        <View style={styles.autoCodeIcon}>
          <Text style={styles.autoCodeIconText}>ITEM</Text>
        </View>
        <View style={styles.autoCodeCopy}>
          <Text style={styles.autoCodeTitle}>Código automático</Text>
          <Text style={styles.autoCodeText}>El backend va a generar un código único con prefijo ITEM- al guardar.</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.advancedToggle} onPress={() => setUseCustomCode((current) => !current)}>
        <Text style={styles.advancedToggleText}>{useCustomCode ? "Usar código automático" : "Ingresar código personalizado"}</Text>
      </TouchableOpacity>
      {useCustomCode && (
        <>
          <Text style={styles.label}>Código personalizado</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder="ITEM-0001" autoCapitalize="characters" />
        </>
      )}

      <Text style={styles.label}>Ubicación / contenedor</Text>
      <View style={styles.dropdownWrap}>
        <DropDownPicker
          open={containerDropdownOpen}
          value={containerId}
          items={containerItems}
          setOpen={setContainerDropdownOpen}
          setValue={setContainerId}
          setItems={setContainerItems}
          searchable
          listMode="MODAL"
          modalTitle="Elegí un contenedor"
          searchPlaceholder="Buscar por código o tipo"
          placeholder={loadingContainers ? "Cargando contenedores..." : "Seleccionar contenedor"}
          disabled={loadingContainers || containers.length === 0}
          closeAfterSelecting
          style={styles.dropdown}
          dropDownContainerStyle={styles.dropdownContainer}
          textStyle={styles.dropdownText}
          searchTextInputStyle={styles.dropdownSearchInput}
          placeholderStyle={styles.dropdownPlaceholder}
          selectedItemContainerStyle={styles.dropdownSelectedItem}
          selectedItemLabelStyle={styles.dropdownSelectedLabel}
        />
      </View>
      {selectedContainer && (
        <Text style={styles.selectedContainer}>Seleccionado: {selectedContainer.code} · {getContainerTypeLabel(selectedContainer.type)}</Text>
      )}

      <Text style={styles.label}>Precio</Text>
      <TextInput style={styles.input} value={price} onChangeText={setPrice} placeholder="25.00" keyboardType="decimal-pad" />

      <Text style={styles.label}>Descripción</Text>
      <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} multiline />

      <Text style={styles.label}>Etiquetas</Text>
      <TextInput style={styles.input} value={tags} onChangeText={setTags} placeholder="jean, campera, vintage" />

      <Text style={styles.label}>Fotos</Text>
      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.secondaryButton} onPress={addPhotoFromLibrary} disabled={saving}>
          <Text style={styles.secondaryButtonText}>Elegir fotos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={capturePhoto} disabled={saving}>
          <Text style={styles.secondaryButtonText}>Sacar foto</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.photoGrid}>
        {photos.map((photo) => (
          <View key={photo.uri} style={styles.photoPreviewBox}>
            <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
            <TouchableOpacity style={styles.removePhotoButton} onPress={() => removePhoto(photo.uri)} disabled={saving}>
              <Text style={styles.removePhotoText}>Quitar</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={submit} disabled={saving}>
        <Text style={styles.buttonText}>{saving ? "Guardando..." : "Guardar artículo"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { marginBottom: 12 },
  heading: { fontSize: 20, fontWeight: "800", color: "#111827", marginBottom: 12 },
  errorBox: { backgroundColor: "#fee2e2", borderRadius: 14, padding: 12, marginBottom: 12 },
  error: { color: "#991b1b", fontWeight: "700", marginBottom: 8 },
  retryButton: { alignSelf: "flex-start", backgroundColor: "#991b1b", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  retryText: { color: "#ffffff", fontWeight: "800" },
  label: { fontWeight: "800", color: "#374151", marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: "#ffffff", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "#ddd6fe" },
  autoCodeBox: { backgroundColor: "#eef2ff", borderRadius: 18, padding: 12, flexDirection: "row", gap: 12, alignItems: "center", borderWidth: 1, borderColor: "#c7d2fe" },
  autoCodeIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: "#111111", alignItems: "center", justifyContent: "center" },
  autoCodeIconText: { color: "#ffffff", fontWeight: "900", fontSize: 11 },
  autoCodeCopy: { flex: 1 },
  autoCodeTitle: { color: "#111827", fontWeight: "900", marginBottom: 3 },
  autoCodeText: { color: "#6d5f8f", lineHeight: 18 },
  advancedToggle: { alignSelf: "flex-start", marginTop: 10, paddingVertical: 8 },
  advancedToggleText: { color: "#7c3aed", fontWeight: "900" },
  textArea: { minHeight: 90, textAlignVertical: "top" },
  dropdownWrap: { zIndex: 10 },
  dropdown: { backgroundColor: "#ffffff", borderColor: "#ddd6fe", borderRadius: 14, minHeight: 52 },
  dropdownContainer: { borderColor: "#ddd6fe" },
  dropdownText: { color: "#111827", fontWeight: "700" },
  dropdownSearchInput: { borderColor: "#ddd6fe", color: "#111827" },
  dropdownPlaceholder: { color: "#6d5f8f" },
  dropdownSelectedItem: { backgroundColor: "#ede9fe" },
  dropdownSelectedLabel: { color: "#111111", fontWeight: "900" },
  selectedContainer: { color: "#7c3aed", fontWeight: "800", marginTop: 8 },
  photoActions: { flexDirection: "row", gap: 8 },
  secondaryButton: { flex: 1, backgroundColor: "#ede9fe", borderRadius: 14, padding: 12, alignItems: "center" },
  secondaryButtonText: { color: "#111827", fontWeight: "800" },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  photoPreviewBox: { width: 96, backgroundColor: "#ffffff", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: "#ddd6fe" },
  photoPreview: { width: 96, height: 96 },
  removePhotoButton: { padding: 8, alignItems: "center" },
  removePhotoText: { color: "#b91c1c", fontWeight: "800", fontSize: 12 },
  button: { backgroundColor: "#111111", borderRadius: 16, padding: 16, alignItems: "center", marginTop: 18, marginBottom: 32 },
  buttonText: { color: "#ffffff", fontWeight: "800" },
});
