import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, router } from "expo-router";

import { colors, radius, spacing, typography } from "../../src/theme/tokens";
import { useInterfaceSettings } from "../../src/ui/context/interface-settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

function TabIcon({ name, color, scan = false }: { name: IconName; color: string; scan?: boolean }) {
  return (
    <View style={scan ? styles.scanIcon : styles.tabIcon}>
      <MaterialCommunityIcons name={name} size={scan ? 27 : 24} color={scan ? colors.onPrimary : color} />
    </View>
  );
}

function AddButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Agregar prenda" onPress={() => router.push("/items/new")} style={({ pressed }) => [styles.addButton, pressed && styles.addPressed]}>
      <MaterialCommunityIcons name="plus" size={28} color={colors.primary} />
    </Pressable>
  );
}

export default function TabLayout() {
  const { largeInterface, textBoost } = useInterfaceSettings();
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontWeight: "800" },
        headerShadowVisible: false,
        headerLeft: () => <AddButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: [styles.tabBar, largeInterface && styles.tabBarLarge],
        tabBarLabelStyle: [styles.tabLabel, { fontSize: typography.tiny + textBoost }],
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color }) => <TabIcon name="home-variant-outline" color={color} /> }} />
      <Tabs.Screen name="catalog" options={{ title: "Catálogo", tabBarIcon: ({ color }) => <TabIcon name="view-grid-outline" color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: "Escanear", tabBarIcon: ({ color }) => <TabIcon name="qrcode-scan" color={color} scan /> }} />
      <Tabs.Screen name="locations" options={{ title: "Ubicaciones", tabBarIcon: ({ color }) => <TabIcon name="package-variant-closed" color={color} /> }} />
      <Tabs.Screen name="more" options={{ title: "Más", tabBarIcon: ({ color }) => <TabIcon name="dots-horizontal-circle-outline" color={color} /> }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, minHeight: 64, paddingTop: spacing.xs },
  tabBarLarge: { minHeight: 74, paddingTop: spacing.sm },
  tabLabel: { fontSize: typography.tiny, fontWeight: "700" },
  tabIcon: { minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
  scanIcon: { width: 52, height: 52, marginTop: -18, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.primarySoft },
  addButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", paddingLeft: spacing.md },
  addPressed: { opacity: 0.55 },
});
