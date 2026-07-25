import React, { useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAudioPlayer } from "expo-audio";
import { type BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { router } from "expo-router";

import { inventoryService } from "../../application/inventory-service";
import { DuplicateScanLock } from "../../core/scanner/duplicate-lock";
import type { ScanResolution } from "../../domain/models";
import { colors, inputStyle, radius, spacing, typography } from "../../theme/tokens";
import { formatMoney, itemStatusLabel } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { KeyboardAwareScreen } from "../components/keyboard-aware-screen";
import { StatusChip } from "../components/status-chip";
import { useDialog } from "../context/dialog";
import { useInterfaceSettings } from "../context/interface-settings";
import { useSnackbar } from "../context/snackbar";

const SCAN_BEEP = { uri: "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAmp6enpqWlpaWlpSUlJSU" };

export function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false); const [manualCode, setManualCode] = useState("");
  const [busy, setBusy] = useState(false); const [resolution, setResolution] = useState<ScanResolution | null>(null);
  const lock = useRef(new DuplicateScanLock(1800)); const { scanSound } = useInterfaceSettings(); const { alert } = useDialog(); const player = useAudioPlayer(SCAN_BEEP);
  const feedback = async (type: Haptics.NotificationFeedbackType) => {
    if (process.env.EXPO_OS !== "web") await Haptics.notificationAsync(type).catch(() => undefined);
    if (scanSound && type === Haptics.NotificationFeedbackType.Success) { try { await player.seekTo(0); player.play(); } catch { /* Haptic and visual feedback remain available. */ } }
  };
  const resolve = async (value: string) => {
    const code = value.trim(); if (!code || busy || !lock.current.accept(code)) return;
    setBusy(true);
    try { const result = await inventoryService.resolveCode(code); setResolution(result); await feedback(result.type === "unknown" ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success); }
    catch (error) { await feedback(Haptics.NotificationFeedbackType.Error); void alert({ title: "No pudimos leer el código", message: error instanceof Error ? error.message : "Intente nuevamente.", tone: "danger" }); }
    finally { setBusy(false); }
  };
  return <KeyboardAwareScreen contentContainerStyle={styles.content}>
    <View style={styles.heading}><Text style={styles.title}>Escáner universal</Text><Pressable accessibilityRole="button" accessibilityLabel={torch ? "Apagar luz" : "Encender luz"} onPress={() => setTorch((value) => !value)} style={styles.torch}><MaterialCommunityIcons name={torch ? "flashlight-off" : "flashlight"} size={24} color={colors.primary} /><Text style={styles.torchText}>{torch ? "Apagar" : "Luz"}</Text></Pressable></View>
    <Text style={styles.intro}>Lea el código de una prenda o ubicación. También puede escribirlo manualmente.</Text>
    {!permission ? <View style={styles.cameraPlaceholder}><Text style={styles.note}>Consultando permiso de cámara...</Text></View> : permission.granted ? <View style={styles.cameraFrame}><CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={torch} onBarcodeScanned={busy ? undefined : ({ data }: BarcodeScanningResult) => void resolve(data)} barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13"] }} /><View pointerEvents="none" style={styles.guide}><View style={styles.guideBox} /><Text style={styles.guideText}>{busy ? "Buscando..." : "Centre el código"}</Text></View></View> : <View style={styles.permission}><MaterialCommunityIcons name="camera-off-outline" size={36} color={colors.primary} /><Text style={styles.note}>La cámara necesita permiso para escanear.</Text><AppButton label="Permitir cámara" icon="camera-outline" onPress={() => void requestPermission()} /></View>}
    <View style={styles.manual}><TextInput accessibilityLabel="Código manual" value={manualCode} onChangeText={setManualCode} autoCapitalize="characters" autoCorrect={false} placeholder="Código manual" placeholderTextColor={colors.textMuted} maxFontSizeMultiplier={1.4} style={styles.input} onSubmitEditing={() => void resolve(manualCode)} /><AppButton label="Buscar" icon="magnify" onPress={() => void resolve(manualCode)} disabled={!manualCode.trim() || busy} /></View>
    {resolution ? <ResultCard resolution={resolution} onChange={setResolution} onClear={() => { setResolution(null); lock.current.clear(); }} /> : <View style={styles.help}><Text style={styles.helpTitle}>Códigos compatibles</Text><Text style={styles.note}>QR, Code 128, Code 39 y EAN-13. La confirmación siempre es visual y háptica; el sonido depende del ajuste y soporte de la plataforma.</Text></View>}
  </KeyboardAwareScreen>;
}

function ResultCard({ resolution, onChange, onClear }: { resolution: ScanResolution; onChange: (value: ScanResolution) => void; onClear: () => void }) {
  const { notify } = useSnackbar();
  const { confirm, alert } = useDialog();
  if (resolution.type === "item") {
    const item = resolution.item; const photo = item.photos[0];
    const sell = () => void inventoryService.sellItem(item.id).then((sold) => { onChange({ type: "item", item: sold }); notify({ message: `${item.code} marcada como vendida.`, tone: "success", undo: async () => { const restored = await inventoryService.restoreSale(item.id, "Venta deshecha"); onChange({ type: "item", item: restored }); } }); }).catch((error) => notify({ message: error instanceof Error ? error.message : "No pudimos registrar la venta.", tone: "error" }));
    const restore = async () => {
      if (!(await confirm({ title: "Restaurar venta", message: `¿Devolver ${item.code} al inventario disponible? La corrección quedará registrada en el historial.`, confirmLabel: "Restaurar", icon: "backup-restore" }))) return;
      try { const restored = await inventoryService.restoreSale(item.id, "Corrección confirmada desde escáner"); onChange({ type: "item", item: restored }); }
      catch (error) { void alert({ title: "No pudimos restaurar", message: error instanceof Error ? error.message : "Intente nuevamente.", tone: "danger" }); }
    };
    return <View style={styles.result}>{photo ? <Image source={photo.uri} contentFit="cover" style={styles.photo} /> : <View style={styles.photoEmpty}><MaterialCommunityIcons name="hanger" size={42} color={colors.primary} /></View>}<StatusChip status={item.status} /><Text style={styles.resultTitle}>{item.code}</Text><Text style={styles.resultMeta}>{formatMoney(item.soldPrice ?? item.price)} · {itemStatusLabel(item.status)}</Text><Text style={styles.resultMeta}>{item.currentLocation?.name ?? (item.lastLocationId ? "Última ubicación conservada" : "Sin asignar")}</Text><View style={styles.actions}><AppButton grow label="Ver" icon="eye-outline" onPress={() => router.push({ pathname: "/items/[id]", params: { id: String(item.id) } })} /><AppButton grow tone="secondary" label="Mover" icon="swap-horizontal" disabled={item.status !== "active"} onPress={() => router.push({ pathname: "/transfer", params: { ids: String(item.id) } })} /><AppButton grow tone="secondary" label="Imprimir" icon="printer-outline" onPress={() => router.push({ pathname: "/labels", params: { itemIds: String(item.id) } })} /><AppButton grow tone={item.status === "sold" ? "secondary" : "danger"} label={item.status === "sold" ? "Restaurar" : "Vender"} icon={item.status === "sold" ? "backup-restore" : "hand-coin-outline"} onPress={item.status === "sold" ? () => void restore() : sell} /></View><AppButton tone="quiet" label="Escanear otro" icon="qrcode-scan" onPress={onClear} /></View>;
  }
  if (resolution.type === "location") {
    const location = resolution.location;
    return <View style={styles.result}><MaterialCommunityIcons name="map-marker-check-outline" size={36} color={colors.success} /><Text style={styles.resultTitle}>{location.name}</Text><Text style={styles.resultMeta}>{location.code} · {location.itemCount} prendas · {formatMoney(location.totalValue)}</Text><View style={styles.actions}><AppButton grow label="Abrir" icon="map-marker-radius-outline" onPress={() => router.push({ pathname: "/locations/[id]", params: { id: String(location.id) } })} /><AppButton grow tone="secondary" label="Usar como destino" icon="swap-horizontal" onPress={() => router.push({ pathname: "/transfer", params: { destinationId: String(location.id) } })} /><AppButton grow tone="secondary" label="Imprimir" icon="printer-outline" onPress={() => router.push({ pathname: "/labels", params: { locationIds: String(location.id) } })} /><AppButton grow tone="secondary" label="Conteo físico" icon="clipboard-check-outline" onPress={() => void inventoryService.startPhysicalCount(location.id).then((count) => router.push({ pathname: "/counts/[id]", params: { id: String(count.id) } }))} /></View><AppButton tone="quiet" label="Escanear otro" icon="qrcode-scan" onPress={onClear} /></View>;
  }
  return <View style={styles.result}><MaterialCommunityIcons name="help-circle-outline" size={32} color={colors.danger} /><Text style={styles.resultTitle}>Código desconocido</Text><Text selectable style={styles.resultMeta}>{resolution.code}</Text><Text style={styles.note}>Puede crear un registro con este código sin perderlo.</Text><View style={styles.actions}><AppButton grow label="Crear prenda" icon="hanger" onPress={() => router.push({ pathname: "/items/new", params: { code: resolution.code } })} /><AppButton grow tone="secondary" label="Crear ubicación" icon="map-marker-plus-outline" onPress={() => router.push({ pathname: "/locations/new", params: { code: resolution.code } })} /></View><AppButton tone="quiet" label="Escanear otro" icon="qrcode-scan" onPress={onClear} /></View>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md, backgroundColor: colors.canvas }, heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md }, title: { flex: 1, color: colors.textPrimary, fontSize: 28, fontWeight: "900" }, intro: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 }, torch: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.tint }, torchText: { color: colors.primary, fontWeight: "800" }, cameraFrame: { height: 330, overflow: "hidden", borderRadius: radius.xl, backgroundColor: colors.dark }, guide: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md, backgroundColor: "rgba(13, 27, 42, 0.22)" }, guideBox: { width: "76%", height: 150, borderWidth: 3, borderColor: colors.onPrimary, borderRadius: radius.lg }, guideText: { color: colors.onPrimary, fontWeight: "900", backgroundColor: colors.overlay, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill }, cameraPlaceholder: { height: 260, alignItems: "center", justifyContent: "center", borderRadius: radius.xl, backgroundColor: colors.tint }, permission: { minHeight: 260, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, manual: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }, input: { ...inputStyle, flex: 1, minWidth: 180 }, help: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, helpTitle: { color: colors.textPrimary, fontWeight: "900" }, note: { color: colors.textMuted, lineHeight: 21, textAlign: "center" }, result: { gap: spacing.md, alignItems: "center", padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, photo: { width: 132, height: 132, borderRadius: radius.lg }, photoEmpty: { width: 132, height: 132, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, backgroundColor: colors.tint }, resultTitle: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900" }, resultMeta: { color: colors.textMuted, textAlign: "center", fontWeight: "700" }, actions: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: spacing.sm } });
