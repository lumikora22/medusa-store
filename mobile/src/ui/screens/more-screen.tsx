import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import { colors, radius, spacing, typography } from "../../theme/tokens";

const actions = [
  { title: "Vendidas", description: "Consultar prendas vendidas y corregir ventas.", icon: "hand-coin-outline" as const, route: "/sold" as const },
  { title: "Historial", description: "Revisar movimientos, ventas, fotos y correcciones.", icon: "history" as const, route: "/history" as const },
  { title: "Traslado masivo", description: "Elegir un destino y mover varias prendas.", icon: "swap-horizontal-bold" as const, route: "/transfer" as const },
  { title: "Etiquetas", description: "Generar QR, Code 128 y hojas PDF.", icon: "printer-outline" as const, route: "/labels" as const },
  { title: "Respaldo y restauración", description: "Proteger la base local y las fotografías.", icon: "shield-check-outline" as const, route: "/backup" as const },
  { title: "Ajustes", description: "Recordatorios, accesibilidad y preferencias.", icon: "cog-outline" as const, route: "/settings" as const },
];

export function MoreScreen() { return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}><Text style={styles.intro}>Herramientas operativas y protección de datos.</Text><View style={styles.list}>{actions.map((action) => <Pressable key={action.route} accessibilityRole="button" accessibilityLabel={action.title} onPress={() => router.push(action.route)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}><View style={styles.icon}><MaterialCommunityIcons name={action.icon} size={25} color={colors.primary} /></View><View style={styles.copy}><Text style={styles.title}>{action.title}</Text><Text style={styles.description}>{action.description}</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textMuted} /></Pressable>)}</View></ScrollView>; }

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 120, gap: spacing.lg, backgroundColor: colors.canvas }, intro: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 }, list: { gap: spacing.sm }, row: { minHeight: 84, flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, pressed: { opacity: 0.76 }, icon: { width: 48, height: 48, alignItems: "center", justifyContent: "center", borderRadius: radius.md, backgroundColor: colors.tint }, copy: { flex: 1, gap: 3 }, title: { color: colors.textPrimary, fontSize: typography.title, fontWeight: "900" }, description: { color: colors.textMuted, fontSize: typography.small, lineHeight: 19 } });
