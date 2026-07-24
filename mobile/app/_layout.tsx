import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { PaperProvider } from "react-native-paper";

import { inventoryService } from "../src/application/inventory-service";
import { createPaperTheme, paperTheme } from "../src/theme/paper-theme";
import { colors } from "../src/theme/tokens";
import { AppButton } from "../src/ui/components/app-button";
import { CoachTour } from "../src/ui/components/coach-tour";
import { ScreenState } from "../src/ui/components/screen-state";
import { DialogProvider } from "../src/ui/context/dialog";
import { InterfaceSettingsProvider, useInterfaceSettings } from "../src/ui/context/interface-settings";
import { SnackbarProvider } from "../src/ui/context/snackbar";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
const paperSettings = { icon: ({ name, color, size }: { name: string; color?: string; size: number }) => <MaterialCommunityIcons name={name as IconName} color={color} size={size} /> };

function AppStack() {
  const { largeInterface, textBoost } = useInterfaceSettings();
  return <PaperProvider theme={createPaperTheme(largeInterface)} settings={paperSettings}><StatusBar style="dark" /><DialogProvider><SnackbarProvider><Stack screenOptions={{ contentStyle: { backgroundColor: colors.canvas }, headerStyle: { backgroundColor: colors.surface }, headerTintColor: colors.primary, headerTitleStyle: { color: colors.textPrimary, fontWeight: "800", fontSize: 17 + textBoost }, headerShadowVisible: false, headerBackButtonDisplayMode: "minimal" }}>
    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    <Stack.Screen name="items/new" options={{ title: "Agregar prenda" }} /><Stack.Screen name="items/[id]" options={{ title: "Detalle de prenda" }} />
    <Stack.Screen name="locations/new" options={{ title: "Nueva ubicación" }} /><Stack.Screen name="locations/[id]" options={{ title: "Detalle de ubicación" }} />
    <Stack.Screen name="counts/[id]" options={{ title: "Conteo físico" }} /><Stack.Screen name="transfer" options={{ title: "Traslado masivo" }} />
    <Stack.Screen name="history" options={{ title: "Historial" }} /><Stack.Screen name="labels" options={{ title: "Etiquetas e impresión" }} />
    <Stack.Screen name="backup" options={{ title: "Respaldo y restauración" }} /><Stack.Screen name="settings" options={{ title: "Ajustes" }} />
    <Stack.Screen name="sold" options={{ title: "Vendidas" }} />
    <Stack.Screen name="quick" options={{ headerShown: false, presentation: "fullScreenModal", animation: "fade" }} />
  </Stack></SnackbarProvider><CoachTour /></DialogProvider></PaperProvider>;
}

export default function RootLayout() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState(""); const [retry, setRetry] = useState(0);
  useEffect(() => { let active = true; setState("loading"); inventoryService.initialize().then(() => { if (active) setState("ready"); }).catch((error) => { if (active) { setMessage(error instanceof Error ? error.message : "No pudimos preparar los datos locales."); setState("error"); } }); return () => { active = false; }; }, [retry]);
  return <GestureHandlerRootView style={{ flex: 1 }}>
    {state === "ready" ? <InterfaceSettingsProvider><AppStack /></InterfaceSettingsProvider> : <PaperProvider theme={paperTheme} settings={paperSettings}><StatusBar style="dark" /><View style={{ flex: 1 }}><ScreenState loading={state === "loading"} title={state === "loading" ? "Preparando inventario" : "La actualización local necesita atención"} body={state === "error" ? message : "Conservando sus datos en este dispositivo."} action={state === "error" ? <AppButton label="Reintentar" icon="reload" onPress={() => setRetry((value) => value + 1)} /> : undefined} /></View></PaperProvider>}
  </GestureHandlerRootView>;
}
