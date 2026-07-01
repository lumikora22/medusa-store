import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, SafeAreaView, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { Appbar, Chip, MD3LightTheme, PaperProvider, Text } from "react-native-paper";

import { bootstrapSession, loginSession, logoutSession, type Credentials } from "./src/api/session";
import { CreateItemScreen } from "./src/screens/CreateItemScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { ContainersScreen } from "./src/screens/ContainersScreen";
import { InventoryScreen } from "./src/screens/InventoryScreen";
import { ItemDetailScreen } from "./src/screens/ItemDetailScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { ScannerScreen } from "./src/screens/ScannerScreen";
import { SoldItemsScreen } from "./src/screens/SoldItemsScreen";
import type { Item } from "./src/types";

type Screen = "dashboard" | "inventory" | "create" | "containers" | "sold" | "scan" | "detail";

const navItems: Array<{ key: Exclude<Screen, "detail">; label: string }> = [
  { key: "dashboard", label: "Inicio" },
  { key: "inventory", label: "Inventario" },
  { key: "create", label: "Agregar" },
  { key: "containers", label: "Contenedores" },
  { key: "sold", label: "Vendidos" },
  { key: "scan", label: "Escanear" },
];

const theme = {
  ...MD3LightTheme,
  roundness: 14,
  colors: {
    ...MD3LightTheme.colors,
    primary: "#111111",
    secondary: "#8b5cf6",
    tertiary: "#a78bfa",
    background: "#f5f3ff",
    surface: "#ffffff",
    surfaceVariant: "#ede9fe",
    primaryContainer: "#ddd6fe",
    secondaryContainer: "#ede9fe",
    onPrimaryContainer: "#1f1235",
  },
};

export default function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [previousScreen, setPreviousScreen] = useState<Exclude<Screen, "detail">>("inventory");
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [authToken, setAuthToken] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const bootstrapAuth = async () => {
      setAuthToken(await bootstrapSession(SecureStore));
    };

    void bootstrapAuth();
  }, []);

  const activeMenu = useMemo(() => (screen === "detail" ? previousScreen : screen), [previousScreen, screen]);

  const navigate = (target: Exclude<Screen, "detail">) => {
    setSelectedItem(null);
    setScreen(target);
  };

  const openItem = (item: Item, origin: Exclude<Screen, "detail"> = activeMenu) => {
    setSelectedItem(item);
    setPreviousScreen(origin);
    setScreen("detail");
  };

  const handleLogin = async (credentials: Credentials) => {
    const token = await loginSession(credentials, SecureStore);
    setAuthToken(token);
    setScreen("dashboard");
  };

  const handleLogout = async () => {
    await logoutSession(SecureStore);
    setSelectedItem(null);
    setScreen("dashboard");
    setAuthToken(null);
  };

  return (
    <PaperProvider theme={theme}>
      <View style={styles.appRoot} onStartShouldSetResponderCapture={() => { Keyboard.dismiss(); return false; }}>
        <SafeAreaView style={styles.safeArea}>
          <StatusBar style="dark" />
          <Appbar.Header mode="small" elevated style={styles.appbar}>
            <Appbar.Content title="Medusa Store" subtitle="Inventario móvil" />
            {authToken && <Appbar.Action icon="logout" accessibilityLabel="Cerrar sesión" onPress={handleLogout} />}
          </Appbar.Header>

          {authToken && (
            <View style={styles.menuWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.menuContent}>
                {navItems.map((item) => (
                  <Chip key={item.key} selected={activeMenu === item.key} onPress={() => navigate(item.key)} style={styles.menuChip}>
                    {item.label}
                  </Chip>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={styles.content}>
            {authToken === undefined && <ActivityIndicator style={styles.loader} />}
            {authToken === null && <LoginScreen onLogin={handleLogin} />}
            {authToken && screen === "dashboard" && <DashboardScreen onOpenInventory={() => navigate("inventory")} />}
            {authToken && screen === "inventory" && <InventoryScreen onOpenItem={(item) => openItem(item, "inventory")} />}
            {authToken && screen === "create" && <CreateItemScreen onCreated={(item) => openItem(item, "inventory")} />}
            {authToken && screen === "containers" && <ContainersScreen onOpenItem={(item) => openItem(item, "containers")} />}
            {authToken && screen === "sold" && <SoldItemsScreen onOpenItem={(item) => openItem(item, "sold")} />}
            {authToken && screen === "scan" && <ScannerScreen onOpenItem={(item) => openItem(item, "scan")} />}
            {authToken && screen === "detail" && selectedItem && (
              <ItemDetailScreen item={selectedItem} onBack={() => setScreen(previousScreen)} onChanged={(item) => openItem(item, previousScreen)} />
            )}
            {authToken && screen === "detail" && !selectedItem && <Text>No hay un artículo seleccionado.</Text>}
          </View>
        </SafeAreaView>
      </View>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  appRoot: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: "#f5f3ff" },
  appbar: { backgroundColor: "#ffffff" },
  menuWrap: { backgroundColor: "#ffffff", borderBottomWidth: 1, borderBottomColor: "#ddd6fe" },
  menuContent: { gap: 8, paddingHorizontal: 12, paddingVertical: 10 },
  menuChip: { marginRight: 0 },
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  loader: { marginTop: 40 },
});
