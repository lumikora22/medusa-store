import React, { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Asset } from "expo-asset";
import { router } from "expo-router";

import { inventoryService } from "../../application/inventory-service";
import { colors, inputStyle, radius, spacing, typography } from "../../theme/tokens";
import { formatDate } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { ScreenState } from "../components/screen-state";
import { useDialog } from "../context/dialog";
import { useInterfaceSettings } from "../context/interface-settings";
import { SEED_IMAGE_MODULES } from "../seed-images";

export function SettingsScreen() {
  const { settings, update, refresh } = useInterfaceSettings();
  const { alert, confirm } = useDialog();
  const [days, setDays] = useState("7"); const [saving, setSaving] = useState(false);
  const [devBusy, setDevBusy] = useState(false); const [devProgress, setDevProgress] = useState<string | null>(null);

  const seedDev = async () => {
    if (!(await confirm({ title: "Poblar datos de prueba", message: "Se crearán 100 ubicaciones y 1000 prendas de ejemplo sobre los datos actuales. Solo para pruebas.", confirmLabel: "Poblar", icon: "database-plus-outline" }))) return;
    setDevBusy(true); setDevProgress("Preparando imágenes...");
    try {
      const assets = await Asset.loadAsync(SEED_IMAGE_MODULES);
      const uris = assets.map((asset) => asset.localUri ?? asset.uri).filter((uri): uri is string => Boolean(uri));
      await inventoryService.seedDevData(uris, (progress) => setDevProgress(`${progress.phase === "locations" ? "Ubicaciones" : "Prendas"}: ${progress.done}/${progress.total}`));
      await refresh();
      void alert({ title: "Datos de prueba listos", message: "Se crearon 100 ubicaciones y 1000 prendas.", icon: "check-circle-outline" });
    } catch (error) { void alert({ title: "No pudimos poblar", message: error instanceof Error ? error.message : "Intente nuevamente.", tone: "danger" }); }
    finally { setDevBusy(false); setDevProgress(null); }
  };

  const wipeApp = async () => {
    if (!(await confirm({ title: "Vaciar toda la app", message: "Se borrarán TODAS las prendas, ubicaciones, historial y fotos de este dispositivo. No se puede deshacer.", confirmLabel: "Vaciar todo", tone: "danger", icon: "delete-alert-outline" }))) return;
    setDevBusy(true); setDevProgress("Vaciando...");
    try { await inventoryService.resetAllData(); await refresh(); void alert({ title: "Aplicación vaciada", message: "La base local quedó en blanco.", icon: "check-circle-outline" }); }
    catch (error) { void alert({ title: "No pudimos vaciar", message: error instanceof Error ? error.message : "Intente nuevamente.", tone: "danger" }); }
    finally { setDevBusy(false); setDevProgress(null); }
  };

  useEffect(() => { if (settings) setDays(String(settings.backupReminderDays)); }, [settings]);
  if (!settings) return <ScreenState loading title="Cargando ajustes" />;
  const saveDays = async () => {
    const value = Number(days);
    if (!Number.isInteger(value) || value < 1 || value > 365) { void alert({ title: "Revise el recordatorio", message: "Use un número entero entre 1 y 365 días." }); return; }
    setSaving(true); try { await update("backupReminderDays", value); } finally { setSaving(false); }
  };
  return <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <View style={styles.card}><View style={styles.row}><View style={styles.copy}><Text style={styles.title}>Interfaz grande</Text><Text style={styles.text}>Aumenta texto, botones, filtros y encabezados de navegación.</Text></View><Switch accessibilityLabel="Interfaz grande" hitSlop={14} value={settings.largeInterface} onValueChange={(value) => void update("largeInterface", value)} trackColor={{ true: colors.primary, false: colors.border }} /></View></View>
    <View style={styles.card}><View style={styles.row}><View style={styles.copy}><Text style={styles.title}>Sonido de escaneo</Text><Text style={styles.text}>Reproduce una confirmación breve cuando la plataforma permite audio. La vibración y confirmación visual siempre permanecen activas.</Text></View><Switch accessibilityLabel="Sonido de escaneo" hitSlop={14} value={settings.scanSound} onValueChange={(value) => void update("scanSound", value)} trackColor={{ true: colors.primary, false: colors.border }} /></View></View>
    <View style={styles.card}><Text style={styles.title}>Recordatorio de respaldo</Text><Text style={styles.text}>Último respaldo: {formatDate(settings.lastBackupAt)}</Text><View accessibilityLabel={settings.backupDue ? "Respaldo pendiente" : `Próximo respaldo en ${settings.backupDueInDays} días`} style={[styles.reminder, settings.backupDue && styles.reminderDue]}><Text style={[styles.reminderText, settings.backupDue && styles.reminderDueText]}>{settings.backupDue ? "Respaldo pendiente: cree una copia hoy." : `Próximo respaldo en ${settings.backupDueInDays} días.`}</Text></View><Text style={styles.label}>Días entre respaldos</Text><View style={styles.saveRow}><TextInput accessibilityLabel="Días entre respaldos" value={days} onChangeText={setDays} keyboardType="number-pad" returnKeyType="done" onSubmitEditing={() => void saveDays()} style={styles.input} /><AppButton label={saving ? "Guardando..." : "Guardar recordatorio"} icon="content-save-outline" onPress={() => void saveDays()} disabled={saving} /></View></View>
    <View style={styles.card}><Text style={styles.title}>Tutorial</Text><Text style={styles.text}>Vuelve a ver la guía rápida de la aplicación paso a paso.</Text><AppButton tone="secondary" label="Ver tutorial de nuevo" icon="school-outline" onPress={() => void update("tutorialSeen", false).then(() => router.replace("/"))} /></View>
    <View style={styles.local}><Text style={styles.localTitle}>Modo local-first</Text><Text style={styles.text}>SQLite es la fuente de verdad en este dispositivo. Cada teléfono conserva su propia copia hasta implementar sincronización.</Text></View>
    {__DEV__ ? <View style={styles.devCard}>
      <Text style={styles.devTitle}>⚙︎ Herramientas de desarrollo</Text>
      <Text style={styles.text}>Solo visibles en modo desarrollo. Sirven para probar la app con datos realistas.</Text>
      {devProgress ? <View style={styles.devProgress}><ActivityIndicator color={colors.primary} /><Text style={styles.devProgressText}>{devProgress}</Text></View> : null}
      <AppButton label="Poblar datos de prueba" icon="database-plus-outline" onPress={() => void seedDev()} disabled={devBusy} />
      <AppButton tone="danger" label="Vaciar toda la app" icon="delete-alert-outline" onPress={() => void wipeApp()} disabled={devBusy} />
    </View> : null}
  </ScrollView>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 100, gap: spacing.md, backgroundColor: colors.canvas }, card: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, row: { flexDirection: "row", alignItems: "center", gap: spacing.md }, copy: { flex: 1, gap: spacing.xs }, title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, text: { color: colors.textMuted, fontSize: typography.body, lineHeight: 21 }, label: { color: colors.textSecondary, fontWeight: "800" }, input: { ...inputStyle, width: 100 }, saveRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm }, reminder: { minHeight: 48, justifyContent: "center", padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tint }, reminderDue: { backgroundColor: colors.dangerSoft }, reminderText: { color: colors.primary, fontWeight: "800" }, reminderDueText: { color: colors.danger }, local: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, backgroundColor: colors.tint }, localTitle: { color: colors.primary, fontSize: typography.title, fontWeight: "900" }, devCard: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.xl, borderCurve: "continuous", borderWidth: 1, borderStyle: "dashed", borderColor: colors.primaryDark, backgroundColor: colors.surface }, devTitle: { color: colors.primaryDark, fontSize: typography.title, fontWeight: "900" }, devProgress: { flexDirection: "row", alignItems: "center", gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.tint }, devProgressText: { color: colors.primary, fontWeight: "800", fontVariant: ["tabular-nums"] } });
