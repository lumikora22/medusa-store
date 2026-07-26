import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Menu } from "react-native-paper";
import QRCode from "react-native-qrcode-svg";

import { inventoryService } from "../../application/inventory-service";
import { parseTags } from "../../domain/codes";
import type { InventoryEvent, Item, ItemPhoto, LocationSummary, PhotoAsset } from "../../domain/models";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, inputStyle, radius, spacing, typography } from "../../theme/tokens";
import { eventTypeLabel, formatDate, formatMoney } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { Code128View } from "../components/code128-view";
import { KeyboardAwareScreen, useKeyboardHeight } from "../components/keyboard-aware-screen";
import { QuantityStepper } from "../components/quantity-stepper";
import { ScreenState } from "../components/screen-state";
import { StatusChip } from "../components/status-chip";
import { ZoomableImage } from "../components/zoomable-image";
import { useDialog } from "../context/dialog";
import { useFocusLoad } from "../hooks/use-focus-load";

type DetailData = { item: Item; locations: LocationSummary[]; events: InventoryEvent[] };

async function pickOne(): Promise<PhotoAsset | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: false, quality: 0.82 });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType };
}

export function ItemDetailScreen() {
  const { id, edit } = useLocalSearchParams<{ id: string; edit?: string }>(); const itemId = Number(id);
  const loader = useCallback(async (): Promise<DetailData> => ({ item: await inventoryService.getItem(itemId), locations: await inventoryService.listLocations(), events: await inventoryService.history({ itemId }) }), [itemId]);
  const { data, loading, error, refresh } = useFocusLoad(loader);
  const { confirm, alert } = useDialog();
  const [editing, setEditing] = useState(edit === "1"); const [showCodes, setShowCodes] = useState(false); const [viewerIndex, setViewerIndex] = useState<number | null>(null); const [saleOpen, setSaleOpen] = useState(false); const [menuOpen, setMenuOpen] = useState(false); const [addingPhoto, setAddingPhoto] = useState(false);
  if (!data && loading) return <ScreenState loading title="Cargando prenda" />;
  if (!data) return <ScreenState title="No pudimos abrir la prenda" body={error ?? undefined} action={<AppButton label="Reintentar" icon="reload" onPress={() => void refresh()} />} />;
  const { item, locations, events } = data;

  const addPhoto = async (camera = false) => {
    let assets: PhotoAsset[] = [];
    if (camera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { void alert({ title: "Permiso de cámara", message: "Active el permiso para tomar una foto." }); return; }
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.82 });
      if (!result.canceled && result.assets[0]) assets = [{ uri: result.assets[0].uri, fileName: result.assets[0].fileName, mimeType: result.assets[0].mimeType }];
    } else {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsMultipleSelection: true, quality: 0.82, selectionLimit: 8 });
      if (!result.canceled) assets = result.assets.map((asset) => ({ uri: asset.uri, fileName: asset.fileName, mimeType: asset.mimeType }));
    }
    if (!assets.length) return;
    setAddingPhoto(true);
    try { for (const asset of assets) await inventoryService.addPhoto(item.id, asset); await refresh(); }
    catch (reason) { void alert({ title: "No pudimos agregar las fotos", message: reason instanceof Error ? reason.message : "Intente nuevamente.", tone: "danger" }); }
    finally { setAddingPhoto(false); }
  };

  const removePhoto = async (photo: ItemPhoto) => {
    if (!(await confirm({ title: "Eliminar foto", message: "La foto se quitará de esta prenda.", confirmLabel: "Eliminar", tone: "danger", icon: "delete-outline" }))) return;
    try { await inventoryService.removePhoto(photo.id); await refresh(); } catch (reason) { void alert({ title: "No pudimos eliminarla", message: reason instanceof Error ? reason.message : "Intente nuevamente.", tone: "danger" }); }
  };
  const replacePhoto = async (photo: ItemPhoto) => { const asset = await pickOne(); if (!asset) return; try { await inventoryService.replacePhoto(photo.id, item.id, asset); await refresh(); } catch (reason) { void alert({ title: "No pudimos reemplazarla", message: reason instanceof Error ? reason.message : "Intente nuevamente.", tone: "danger" }); } };
  const reorder = async (index: number, direction: -1 | 1) => { const nextIndex = index + direction; if (nextIndex < 0 || nextIndex >= item.photos.length) return; const ids = item.photos.map((photo) => photo.id); [ids[index], ids[nextIndex]] = [ids[nextIndex], ids[index]]; await inventoryService.reorderPhotos(item.id, ids, item.photos.find((photo) => photo.isPrimary)?.id ?? ids[0]); await refresh(); };
  const primary = async (photoId: number) => { await inventoryService.reorderPhotos(item.id, item.photos.map((photo) => photo.id), photoId); await refresh(); };
  const archive = async () => {
    if (!(await confirm({ title: "Archivar prenda", message: "La prenda dejará de aparecer entre las disponibles, pero conservará su historial.", confirmLabel: "Archivar", tone: "danger", icon: "archive-outline" }))) return;
    try { await inventoryService.archiveItem(item.id); await refresh(); } catch (reason) { void alert({ title: "No pudimos archivar", message: reason instanceof Error ? reason.message : "Intente nuevamente.", tone: "danger" }); }
  };
  const unarchive = async () => {
    try { await inventoryService.unarchiveItem(item.id); await refresh(); }
    catch (reason) { void alert({ title: "No pudimos restaurarla", message: reason instanceof Error ? reason.message : "Intente nuevamente.", tone: "danger" }); }
  };
  const restore = async (quantity?: number) => {
    const pieces = quantity ?? 1;
    const message = item.quantity > 1
      ? `¿Devolver ${pieces} ${pieces === 1 ? "pieza" : "piezas"} de ${item.code} al inventario disponible? La corrección quedará registrada en el historial.`
      : `¿Devolver ${item.code} al inventario disponible? La corrección quedará registrada en el historial.`;
    if (!(await confirm({ title: "Restaurar venta", message, confirmLabel: "Restaurar", icon: "backup-restore" }))) return;
    try { await inventoryService.restoreSale(item.id, "Restauración confirmada", quantity); await refresh(); } catch (reason) { void alert({ title: "No pudimos restaurar la venta", message: reason instanceof Error ? reason.message : "Intente nuevamente.", tone: "danger" }); }
  };

  return <KeyboardAwareScreen contentContainerStyle={styles.content}>
    {item.photos.length === 0 ? <View style={styles.emptyPhotos}><MaterialCommunityIcons name="image-off-outline" size={40} color={colors.primaryDark} /><Text style={styles.muted}>Esta prenda todavía no tiene fotos.</Text><View style={styles.photoActions}><AppButton label="Cámara" icon="camera-outline" tone="secondary" disabled={addingPhoto} onPress={() => void addPhoto(true)} /><AppButton label="Galería" icon="image-plus" tone="secondary" disabled={addingPhoto} onPress={() => void addPhoto(false)} /></View></View> : <View style={styles.photoBlock}><FlatList horizontal data={item.photos} keyExtractor={(photo) => String(photo.id)} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery} renderItem={({ item: photo, index }) => <View style={styles.photoCard}><Pressable accessibilityRole="button" accessibilityLabel={`Ampliar foto ${index + 1}`} onPress={() => setViewerIndex(index)}><Image source={photo.uri} contentFit="cover" style={styles.photo} />{photo.isPrimary ? <View style={styles.primaryBadge}><MaterialCommunityIcons name="star" size={16} color={colors.primary} /><Text style={styles.primaryText}>Principal</Text></View> : null}</Pressable><View style={styles.photoToolbar}><PhotoAction label="Anterior" icon="arrow-left" disabled={index === 0} onPress={() => void reorder(index, -1)} /><PhotoAction label="Siguiente" icon="arrow-right" disabled={index === item.photos.length - 1} onPress={() => void reorder(index, 1)} /><PhotoAction label="Principal" icon="star-outline" disabled={photo.isPrimary} onPress={() => void primary(photo.id)} /><PhotoAction label="Reemplazar" icon="image-sync-outline" onPress={() => void replacePhoto(photo)} /><PhotoAction label="Eliminar" icon="delete-outline" danger onPress={() => void removePhoto(photo)} /></View></View>} /><View style={styles.photoActions}><AppButton grow label="Cámara" icon="camera-outline" tone="secondary" disabled={addingPhoto} onPress={() => void addPhoto(true)} /><AppButton grow label="Galería" icon="image-plus" tone="secondary" disabled={addingPhoto} onPress={() => void addPhoto(false)} /></View></View>}
    {addingPhoto ? <View style={styles.addingRow}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Agregando fotos...</Text></View> : null}
    <View style={styles.hero}><View style={styles.heroTop}><View><Text style={styles.eyebrow}>{item.machineCode}</Text><Text accessibilityRole="header" style={styles.title}>{item.code}</Text></View><StatusChip status={item.status} /></View><Text style={styles.price}>{formatMoney(item.status === "sold" ? item.soldPrice ?? item.price : item.price)}</Text>{item.quantity > 1 ? <Text style={styles.pieces}>{item.availableQuantity} de {item.quantity} piezas disponibles · {item.soldQuantity} vendidas</Text> : null}<Text style={styles.location}>{item.currentLocation?.name ?? "Sin asignar / En transición"}</Text><Text style={styles.description}>{item.description || "Sin descripción"}</Text>{item.tags.length ? <View style={styles.tags}>{item.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View> : null}</View>
    <View style={styles.actions}>
      {item.status === "archived" ? <AppButton grow tone="secondary" label="Restaurar del archivo" icon="archive-arrow-up-outline" onPress={() => void unarchive()} /> : null}
      {item.status !== "archived" && item.availableQuantity > 0 ? <AppButton grow tone="danger" label="Vender" icon="hand-coin-outline" onPress={() => setSaleOpen(true)} /> : null}
      {item.soldQuantity > 0 ? <AppButton grow tone="secondary" label={item.quantity > 1 ? "Restaurar última venta" : "Restaurar"} icon="backup-restore" onPress={() => void restore()} /> : null}
      <AppButton grow label="Mover" icon="swap-horizontal" onPress={() => router.push({ pathname: "/transfer", params: { ids: String(item.id) } })} disabled={item.status !== "active" || item.availableQuantity === 0} />
    </View>
    <View style={styles.actions}>
      <AppButton grow tone="secondary" label={editing ? "Cerrar edición" : "Editar datos"} icon={editing ? "close" : "pencil-outline"} onPress={() => setEditing((value) => !value)} />
      <Menu visible={menuOpen} onDismiss={() => setMenuOpen(false)} anchor={<Pressable accessibilityRole="button" accessibilityLabel="Más acciones" onPress={() => setMenuOpen(true)} style={({ pressed }) => [styles.overflow, pressed && styles.overflowPressed]}><MaterialCommunityIcons name="dots-horizontal" size={24} color={colors.primary} /></Pressable>}>
        <Menu.Item leadingIcon="printer-outline" title="Imprimir etiqueta" onPress={() => { setMenuOpen(false); router.push({ pathname: "/labels", params: { itemIds: String(item.id) } }); }} />
        <Menu.Item leadingIcon="archive-outline" title="Archivar prenda" onPress={() => { setMenuOpen(false); archive(); }} />
      </Menu>
    </View>
    {editing ? <ItemEditor item={item} locations={locations} onSaved={() => { setEditing(false); void refresh(); }} /> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={showCodes ? "Ocultar códigos" : "Mostrar códigos"} onPress={() => setShowCodes((value) => !value)} style={styles.disclosure}><MaterialCommunityIcons name="qrcode" size={22} color={colors.primary} /><Text style={styles.disclosureText}>{showCodes ? "Ocultar códigos" : "Mostrar QR y Code 128"}</Text><MaterialCommunityIcons name={showCodes ? "chevron-up" : "chevron-down"} size={22} color={colors.primary} /></Pressable>
    {showCodes ? <View style={styles.codes}><QRCode value={item.machineCode} size={160} color={colors.primary} backgroundColor={colors.surface} /><Code128View value={item.machineCode} /><Text selectable style={styles.machine}>{item.machineCode}</Text></View> : null}
    <Text style={styles.sectionTitle}>Historial</Text><View style={styles.history}>{events.map((event) => <View key={event.id} style={styles.event}><View style={styles.eventDot} /><View style={styles.eventCopy}><Text style={styles.eventTitle}>{event.summary}</Text><Text style={styles.eventMeta}>{eventTypeLabel(event.type)} · {formatDate(event.createdAt)}</Text></View></View>)}</View>
    <SalePanel visible={saleOpen} item={item} onClose={() => setSaleOpen(false)} onSaved={() => { setSaleOpen(false); void refresh(); }} />
    <PhotoViewer photos={item.photos} index={viewerIndex} onClose={() => setViewerIndex(null)} />
  </KeyboardAwareScreen>;
}

function ItemEditor({ item, locations, onSaved }: { item: Item; locations: LocationSummary[]; onSaved: () => void }) {
  const { alert } = useDialog();
  const [code, setCode] = useState(item.code); const [price, setPrice] = useState(item.price); const [description, setDescription] = useState(item.description); const [tags, setTags] = useState(item.tags.join(", ")); const [locationId, setLocationId] = useState<number | null>(item.currentLocationId); const [quantity, setQuantity] = useState(item.quantity); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await inventoryService.updateItem(item.id, { code, price, description, tags: parseTags(tags), quantity, ...(item.status === "sold" ? {} : { locationId }) }); onSaved(); } catch (error) { void alert({ title: "No pudimos guardar", message: error instanceof Error ? error.message : "Revise la información.", tone: "danger" }); } finally { setSaving(false); } };
  return <View style={styles.editor}><Text style={styles.sectionTitle}>Editar datos</Text><QuantityStepper label="Piezas totales" value={quantity} min={Math.max(1, item.soldQuantity)} onChange={setQuantity} />{item.soldQuantity > 0 ? <Text style={styles.muted}>No puede bajar de {item.soldQuantity} porque ya hay piezas vendidas. Restaure ventas primero.</Text> : null}<TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="Código" style={styles.input} /><TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder="Precio" style={styles.input} /><TextInput value={description} onChangeText={setDescription} multiline placeholder="Descripción" style={[styles.input, styles.area]} /><TextInput value={tags} onChangeText={setTags} placeholder="Etiquetas" style={styles.input} />{item.status === "sold" ? <Text style={styles.muted}>La última ubicación se conserva y no cambia al editar una prenda vendida.</Text> : <><Text style={styles.editorLabel}>Ubicación actual</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.locationOptions}><Pressable accessibilityRole="button" accessibilityState={{ selected: locationId == null }} onPress={() => setLocationId(null)} style={[styles.locationOption, locationId == null && styles.locationOptionActive]}><Text style={[styles.locationOptionText, locationId == null && styles.locationOptionTextActive]}>Sin asignar</Text></Pressable>{locations.map((location) => <Pressable key={location.id} accessibilityRole="button" accessibilityLabel={`Seleccionar ${location.name}`} accessibilityState={{ selected: locationId === location.id }} onPress={() => setLocationId(location.id)} style={[styles.locationOption, locationId === location.id && styles.locationOptionActive]}><Text style={[styles.locationOptionText, locationId === location.id && styles.locationOptionTextActive]}>{location.name}</Text></Pressable>)}</ScrollView></>}<AppButton label={saving ? "Guardando..." : "Guardar cambios"} icon="content-save-outline" onPress={() => void save()} disabled={saving} /></View>;
}

function PhotoAction({ label, icon, onPress, disabled = false, danger = false }: { label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap; onPress: () => void; disabled?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.photoAction, { minWidth: 48, minHeight: 48 }, disabled && styles.disabled]}><MaterialCommunityIcons name={icon} size={20} color={danger ? colors.danger : colors.primary} /></Pressable>; }

function SalePanel({ visible, item, onClose, onSaved }: { visible: boolean; item: Item; onClose: () => void; onSaved: () => void }) {
  const { alert } = useDialog(); const keyboardHeight = useKeyboardHeight(); const insets = useSafeAreaInsets();
  const [price, setPrice] = useState(""); const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [quantity, setQuantity] = useState(1); const [saving, setSaving] = useState(false);
  useEffect(() => { if (visible) setQuantity(1); }, [visible]);
  const save = async () => {
    setSaving(true);
    try { await inventoryService.sellItem(item.id, { quantity, soldPrice: price || undefined, soldAt: date }); onSaved(); }
    catch (error) { void alert({ title: "No pudimos registrar la venta", message: error instanceof Error ? error.message : "Revise la información.", tone: "danger" }); }
    finally { setSaving(false); }
  };
  const remaining = item.availableQuantity - quantity;
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={[styles.modalBackdrop, { paddingBottom: spacing.md + (keyboardHeight > 0 ? keyboardHeight : insets.bottom) }]}><View style={styles.modal}>
    <Text style={styles.modalTitle}>Marcar como vendida</Text>
    <Text style={styles.muted}>El precio real es opcional. La última ubicación y las fotos se conservarán.</Text>
    {item.quantity > 1 ? <><QuantityStepper label="Piezas vendidas" value={quantity} max={item.availableQuantity} onChange={setQuantity} /><Text style={styles.muted}>{remaining > 0 ? `Quedarán ${remaining} ${remaining === 1 ? "pieza disponible" : "piezas disponibles"} en el catálogo.` : "Se venderán todas las piezas disponibles."}</Text></> : null}
    <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" placeholder={`Precio real (referencia ${item.price})`} style={styles.input} />
    <TextInput value={date} onChangeText={setDate} placeholder="AAAA-MM-DD" style={styles.input} />
    <View style={styles.actions}><AppButton grow tone="quiet" label="Cancelar" icon="close" onPress={onClose} /><AppButton grow tone="danger" label={saving ? "Guardando..." : "Confirmar venta"} icon="hand-coin-outline" onPress={() => void save()} disabled={saving} /></View>
  </View></View></Modal>;
}

function PhotoViewer({ photos, index, onClose }: { photos: ItemPhoto[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [zoomed, setZoomed] = useState(false);
  const visible = index != null;
  return <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
    <GestureHandlerRootView style={styles.viewer}>
      {visible ? <FlatList
        data={photos}
        horizontal
        pagingEnabled
        scrollEnabled={!zoomed}
        initialScrollIndex={index ?? 0}
        getItemLayout={(_, itemIndex) => ({ length: width, offset: width * itemIndex, index: itemIndex })}
        keyExtractor={(photo) => String(photo.id)}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item: photo }) => <View style={{ width, height }}><ZoomableImage uri={photo.uri} width={width} height={height} onZoomChange={setZoomed} /></View>}
      /> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Cerrar foto" onPress={onClose} style={styles.viewerClose}><MaterialCommunityIcons name="close" size={28} color={colors.onPrimary} /></Pressable>
      <Text style={styles.viewerHint}>{photos.length > 1 ? "Deslice para ver más · pellizque para acercar" : "Pellizque para acercar"}</Text>
    </GestureHandlerRootView>
  </Modal>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.xl, backgroundColor: colors.canvas }, hero: { gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.primary }, heroTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: spacing.md }, eyebrow: { color: colors.tintStrong, fontSize: typography.tiny, fontWeight: "900", letterSpacing: 1, marginBottom: spacing.xs }, title: { color: colors.onPrimary, fontSize: 28, fontWeight: "900", letterSpacing: -0.5 }, price: { color: colors.onPrimary, fontSize: 32, fontWeight: "900", letterSpacing: -0.5 }, location: { flexDirection: "row", alignItems: "center", color: colors.tintStrong, fontWeight: "800" }, pieces: { color: colors.onPrimary, fontWeight: "900", fontVariant: ["tabular-nums"] }, description: { color: colors.tint, fontSize: typography.body, lineHeight: 22 }, tags: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.xs }, tag: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderCurve: "continuous", backgroundColor: colors.tint }, tagText: { color: colors.primary, fontSize: typography.tiny, fontWeight: "800" }, actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, overflow: { width: 56, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, overflowPressed: { opacity: 0.7 }, sectionHeader: { gap: spacing.md }, sectionTitle: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, photoActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, addingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingTop: spacing.xs }, photoBlock: { gap: spacing.md }, emptyPhotos: { minHeight: 160, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderCurve: "continuous", backgroundColor: colors.tint }, muted: { color: colors.textMuted, lineHeight: 20 }, gallery: { gap: spacing.md }, photoCard: { width: 280, overflow: "hidden", borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, photo: { width: "100%", height: 310 }, primaryBadge: { position: "absolute", left: spacing.sm, bottom: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface }, primaryText: { color: colors.primary, fontSize: typography.tiny, fontWeight: "900" }, photoToolbar: { flexDirection: "row", justifyContent: "space-around", padding: spacing.sm }, photoAction: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.tint }, disabled: { opacity: 0.3 }, disclosure: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, disclosureText: { flex: 1, color: colors.primary, fontWeight: "800" }, codes: { alignItems: "center", gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, machine: { color: colors.textPrimary, fontWeight: "900", letterSpacing: 1 }, history: { gap: spacing.sm }, event: { flexDirection: "row", gap: spacing.md, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surface }, eventDot: { width: 10, height: 10, marginTop: 5, borderRadius: 5, backgroundColor: colors.primary }, eventCopy: { flex: 1, gap: 3 }, eventTitle: { color: colors.textPrimary, fontWeight: "800" }, eventMeta: { color: colors.textMuted, fontSize: typography.small }, editor: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.lg, backgroundColor: colors.tint }, input: inputStyle, area: { minHeight: 88, textAlignVertical: "top" }, editorLabel: { color: colors.textPrimary, fontWeight: "800" }, locationOptions: { gap: spacing.sm }, locationOption: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, locationOptionActive: { backgroundColor: colors.primary }, locationOptionText: { color: colors.primary, fontWeight: "800" }, locationOptionTextActive: { color: colors.onPrimary }, modalBackdrop: { flex: 1, justifyContent: "flex-end", padding: spacing.md, backgroundColor: colors.overlay }, modal: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.surface }, modalTitle: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900" }, viewer: { flex: 1, backgroundColor: colors.dark }, viewerContent: { flexGrow: 1, alignItems: "center", justifyContent: "center" }, viewerClose: { position: "absolute", top: 48, right: spacing.lg, width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.overlay }, viewerHint: { position: "absolute", bottom: 40, alignSelf: "center", color: colors.tintStrong, fontWeight: "700", fontSize: typography.small } });
