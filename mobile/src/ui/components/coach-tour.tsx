import React, { useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inventoryService } from "../../application/inventory-service";
import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "../context/interface-settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type Rect = { x: number; y: number; w: number; h: number };
type Step = { rect: Rect; place: "above" | "below"; icon: IconName; title: string; body: string };

const DIM_COLOR = "rgba(13,27,42,0.84)";

/**
 * Full-screen dim with a rounded hole punched out of it, as a single even-odd path:
 * the outer rectangle is filled and the inner rounded rectangle cancels it out. Tiling
 * four plain rectangles around the target would leave square corners showing behind the
 * rounded highlight border.
 */
function dimPath(width: number, height: number, rect: Rect, cornerRadius: number): string {
  const r = Math.max(0, Math.min(cornerRadius, rect.w / 2, rect.h / 2));
  const { x, y, w, h } = rect;
  const hole = `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
  return `M0,0 H${width} V${height} H0 Z ${hole}`;
}

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

  if (!settings || settings.tutorialSeen || settings.exhibitionMode || dismissed) return null;

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
      <Pressable accessibilityLabel="Continuar tutorial" onPress={next} style={StyleSheet.absoluteFill} />
      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Path d={dimPath(width, height, rect, radius.md)} fill={DIM_COLOR} fillRule="evenodd" />
      </Svg>
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
