import React, { useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inventoryService } from "../../application/inventory-service";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "../context/interface-settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type Rect = { x: number; y: number; w: number; h: number };
type Step = { rect: Rect; place: "above" | "below"; icon: IconName; title: string; body: string };

/**
 * First-run coach tour: dims the whole screen except one target region and
 * explains it, walking through the add button and the five bottom tabs.
 * Runs once (persisted via `tutorialSeen`); can be replayed from Settings.
 */
export function CoachTour() {
  const { settings, update } = useInterfaceSettings();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (!settings || settings.tutorialSeen || dismissed) return null;

  const tabBarHeight = 64 + insets.bottom;
  const tabTop = height - tabBarHeight;
  const slot = width / 5;
  const steps: Step[] = [
    { rect: { x: 4, y: insets.top + 2, w: 62, h: 46 }, place: "below", icon: "plus-circle-outline", title: "Agregar prenda", body: "Toca el signo + para registrar una prenda nueva desde cualquier pantalla." },
    { rect: { x: 0, y: tabTop, w: slot, h: tabBarHeight }, place: "above", icon: "home-variant-outline", title: "Inicio", body: "Resumen del negocio: métricas, accesos rápidos y actividad reciente." },
    { rect: { x: slot, y: tabTop, w: slot, h: tabBarHeight }, place: "above", icon: "view-grid-outline", title: "Catálogo", body: "Todas tus prendas con búsqueda, filtros por contenedor y vista rápida." },
    { rect: { x: slot * 2, y: tabTop, w: slot, h: tabBarHeight }, place: "above", icon: "qrcode-scan", title: "Escanear", body: "Lee el código de una prenda o ubicación y actúa al instante." },
    { rect: { x: slot * 3, y: tabTop, w: slot, h: tabBarHeight }, place: "above", icon: "package-variant-closed", title: "Ubicaciones", body: "Tus cajas, bolsas, racks y estantes, con su contenido y valor." },
    { rect: { x: slot * 4, y: tabTop, w: slot, h: tabBarHeight }, place: "above", icon: "dots-horizontal-circle-outline", title: "Más", body: "Historial, etiquetas, respaldo y ajustes de la aplicación." },
  ];

  const step = steps[stepIndex];
  const last = stepIndex === steps.length - 1;
  const finish = () => { setDismissed(true); void update("tutorialSeen", true).catch(() => undefined); };
  const next = () => (last ? finish() : setStepIndex((value) => value + 1));
  const { rect } = step;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={[styles.dim, { left: 0, top: 0, width, height: rect.y }]} onPress={next} />
      <Pressable style={[styles.dim, { left: 0, top: rect.y + rect.h, width, height: Math.max(0, height - rect.y - rect.h) }]} onPress={next} />
      <Pressable style={[styles.dim, { left: 0, top: rect.y, width: rect.x, height: rect.h }]} onPress={next} />
      <Pressable style={[styles.dim, { left: rect.x + rect.w, top: rect.y, width: Math.max(0, width - rect.x - rect.w), height: rect.h }]} onPress={next} />
      <Pressable accessibilityRole="button" accessibilityLabel={`${step.title}: continuar`} onPress={next} style={[styles.highlight, { left: rect.x, top: rect.y, width: rect.w, height: rect.h }]} />
      <View style={[styles.tooltip, step.place === "below" ? { top: rect.y + rect.h + 14 } : { bottom: Math.max(0, height - rect.y) + 14 }]}>
        <View style={styles.tipHead}><View style={styles.tipIcon}><MaterialCommunityIcons name={step.icon} size={22} color={colors.primary} /></View><Text style={styles.tipTitle}>{step.title}</Text></View>
        <Text style={styles.tipBody}>{step.body}</Text>
        <View style={styles.tipFooter}>
          <Text style={styles.tipStep}>{stepIndex + 1} / {steps.length}</Text>
          <View style={styles.tipButtons}>
            <Pressable accessibilityRole="button" accessibilityLabel="Saltar tutorial" onPress={finish} style={({ pressed }) => [styles.skip, pressed && styles.pressed]}><Text style={styles.skipText}>Saltar</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={last ? "Entendido" : "Siguiente"} onPress={next} style={({ pressed }) => [styles.nextBtn, pressed && styles.pressed]}><Text style={styles.nextText}>{last ? "Entendido" : "Siguiente"}</Text><MaterialCommunityIcons name={last ? "check" : "arrow-right"} size={18} color={colors.onPrimary} /></Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: "absolute", backgroundColor: "rgba(13,27,42,0.84)" },
  highlight: { position: "absolute", borderRadius: radius.md, borderCurve: "continuous", borderWidth: 2, borderColor: colors.primarySoft },
  tooltip: { position: "absolute", left: spacing.lg, right: spacing.lg, gap: spacing.sm, padding: spacing.lg, borderRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  tipHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  tipIcon: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", backgroundColor: colors.tint },
  tipTitle: { flex: 1, color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900" },
  tipBody: { color: colors.textMuted, fontSize: typography.body, lineHeight: 21 },
  tipFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: spacing.xs },
  tipStep: { color: colors.textMuted, fontWeight: "800", fontVariant: ["tabular-nums"] },
  tipButtons: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  skip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md },
  skipText: { color: colors.textSecondary, fontWeight: "800" },
  nextBtn: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderCurve: "continuous", backgroundColor: colors.primary },
  nextText: { color: colors.onPrimary, fontWeight: "900" },
  pressed: { opacity: 0.8 },
});
