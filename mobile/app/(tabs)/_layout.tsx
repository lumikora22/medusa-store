import React, { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Tabs, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { inventoryService } from "../../src/application/inventory-service";
import { colors, radius, spacing, typography } from "../../src/theme/tokens";
import { ExhibitionPinDialog } from "../../src/ui/components/exhibition-pin-dialog";
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

/**
 * Exit affordance for Exhibition Mode. Long press only, so a customer tapping around the
 * screen cannot reach the PIN prompt by accident.
 */
function ExhibitionExitButton() {
  const { disableExhibition, recoverExhibition } = useInterfaceSettings();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [canRecover, setCanRecover] = useState(false);

  useEffect(() => { void inventoryService.canRecoverExhibitionMode().then(setCanRecover).catch(() => setCanRecover(false)); }, []);

  const unlock = async (pin: string) => {
    setBusy(true);
    try { await disableExhibition(pin); setAsking(false); }
    finally { setBusy(false); }
  };
  const recover = async () => {
    setBusy(true);
    try { await recoverExhibition(); setAsking(false); }
    finally { setBusy(false); }
  };
  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Salir del modo exhibición: mantenga presionado"
      delayLongPress={700}
      onLongPress={() => setAsking(true)}
      style={({ pressed }) => [styles.exitButton, pressed && styles.addPressed]}
    >
      <MaterialCommunityIcons name="lock-outline" size={22} color={colors.textMuted} />
    </Pressable>
    <ExhibitionPinDialog visible={asking} mode="unlock" busy={busy} onCancel={() => setAsking(false)} onSubmit={unlock} onRecover={canRecover ? recover : undefined} />
  </>;
}

const TAB_BAR_HEIGHT = 64;
const TAB_BAR_HEIGHT_LARGE = 74;

export default function TabLayout() {
  const { largeInterface, textBoost, exhibitionMode } = useInterfaceSettings();
  const insets = useSafeAreaInsets();
  const hidden = exhibitionMode ? { href: null as null } : {};
  /**
   * Height and bottom padding are set explicitly instead of relying on the navigator's
   * own inset maths. A standalone Android build runs edge-to-edge and draws underneath the
   * three-button navigation bar, and this style is merged last, so whatever it declares
   * wins. Declaring `height` also makes the navigator reserve the same space for content.
   */
  const barHeight = (largeInterface ? TAB_BAR_HEIGHT_LARGE : TAB_BAR_HEIGHT) + insets.bottom;
  const barSize = { height: barHeight, paddingBottom: insets.bottom };
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.textPrimary, fontWeight: "800" },
        headerShadowVisible: false,
        headerLeft: exhibitionMode ? undefined : () => <AddButton />,
        headerRight: exhibitionMode ? () => <ExhibitionExitButton /> : undefined,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: exhibitionMode ? styles.tabBarHidden : [styles.tabBar, largeInterface && styles.tabBarLarge, barSize],
        tabBarLabelStyle: [styles.tabLabel, { fontSize: typography.tiny + textBoost }],
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Inicio", tabBarIcon: ({ color }) => <TabIcon name="home-variant-outline" color={color} />, ...hidden }} />
      <Tabs.Screen name="catalog" options={{ title: "Catálogo", tabBarIcon: ({ color }) => <TabIcon name="view-grid-outline" color={color} /> }} />
      <Tabs.Screen name="scan" options={{ title: "Escanear", tabBarIcon: ({ color }) => <TabIcon name="qrcode-scan" color={color} scan />, ...hidden }} />
      <Tabs.Screen name="locations" options={{ title: "Ubicaciones", tabBarIcon: ({ color }) => <TabIcon name="package-variant-closed" color={color} />, ...hidden }} />
      <Tabs.Screen name="more" options={{ title: "Más", tabBarIcon: ({ color }) => <TabIcon name="dots-horizontal-circle-outline" color={color} />, ...hidden }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: { backgroundColor: colors.surface, borderTopColor: colors.border, paddingTop: spacing.xs },
  tabBarLarge: { paddingTop: spacing.sm },
  tabBarHidden: { display: "none" },
  tabLabel: { fontSize: typography.tiny, fontWeight: "700" },
  tabIcon: { minWidth: 32, minHeight: 32, alignItems: "center", justifyContent: "center" },
  scanIcon: { width: 52, height: 52, marginTop: -18, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.primary, borderWidth: 3, borderColor: colors.primarySoft },
  addButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", paddingLeft: spacing.md },
  exitButton: { minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center", paddingRight: spacing.md },
  addPressed: { opacity: 0.55 },
});
