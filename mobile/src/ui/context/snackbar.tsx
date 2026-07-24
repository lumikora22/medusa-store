import React, { createContext, useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "./interface-settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type Tone = "info" | "success" | "error";

export type SnackbarNotice = {
  message: string;
  tone?: Tone;
  /** When provided, an "Undo" action is shown. The snackbar hides itself once it resolves. */
  undo?: () => Promise<void>;
  undoLabel?: string;
  /** Milliseconds before auto-dismiss. Defaults to a longer window when an undo action is present. */
  duration?: number;
};

type SnackbarValue = { notify: (notice: SnackbarNotice) => void; dismiss: () => void };

const SnackbarContext = createContext<SnackbarValue | null>(null);
const noop: SnackbarValue = { notify: () => undefined, dismiss: () => undefined };

const toneIcon: Record<Tone, IconName> = {
  info: "information-outline",
  success: "check-circle-outline",
  error: "alert-circle-outline",
};

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { minTarget, textBoost } = useInterfaceSettings();
  const [notice, setNotice] = useState<SnackbarNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const translateY = useRef(new Animated.Value(140)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  }, []);

  const hide = useCallback(() => {
    clearTimer();
    Animated.parallel([
      Animated.timing(translateY, { toValue: 140, duration: 180, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start(({ finished }) => { if (finished) setNotice(null); });
  }, [clearTimer, opacity, translateY]);

  const notify = useCallback((next: SnackbarNotice) => {
    clearTimer();
    setBusy(false);
    setNotice(next);
    AccessibilityInfo.announceForAccessibility(next.message);
    translateY.setValue(140); opacity.setValue(0);
    Animated.parallel([
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    timer.current = setTimeout(hide, next.duration ?? (next.undo ? 6500 : 3500));
  }, [clearTimer, hide, opacity, translateY]);

  useEffect(() => clearTimer, [clearTimer]);

  const runUndo = useCallback(async () => {
    if (!notice?.undo || busy) return;
    clearTimer();
    setBusy(true);
    try {
      await notice.undo();
      hide();
    } catch (error) {
      setBusy(false);
      notify({ message: error instanceof Error ? error.message : "No pudimos deshacer la acción.", tone: "error" });
    }
  }, [busy, clearTimer, hide, notice, notify]);

  const tone = notice?.tone ?? "info";
  return (
    <SnackbarContext value={{ notify, dismiss: hide }}>
      {children}
      {notice ? (
        <Animated.View pointerEvents="box-none" style={[styles.wrap, { bottom: insets.bottom + 76, opacity, transform: [{ translateY }] }]}>
          <View accessibilityLiveRegion="polite" style={[styles.bar, tone === "error" && styles.barError]}>
            <MaterialCommunityIcons name={toneIcon[tone]} size={22} color={colors.onPrimary} />
            <Text numberOfLines={2} style={[styles.message, { fontSize: typography.body + textBoost }]}>{notice.message}</Text>
            {notice.undo ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={notice.undoLabel ?? "Deshacer"}
                accessibilityState={{ disabled: busy }}
                disabled={busy}
                onPress={() => void runUndo()}
                style={({ pressed }) => [styles.undo, { minHeight: minTarget - 12 }, pressed && styles.pressed, busy && styles.disabled]}
              >
                <MaterialCommunityIcons name="undo-variant" size={18} color={colors.primary} />
                <Text style={styles.undoText}>{busy ? "..." : (notice.undoLabel ?? "Deshacer")}</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button" accessibilityLabel="Cerrar aviso" onPress={hide} style={({ pressed }) => [styles.close, pressed && styles.pressed]}>
                <MaterialCommunityIcons name="close" size={20} color={colors.onPrimary} />
              </Pressable>
            )}
          </View>
        </Animated.View>
      ) : null}
    </SnackbarContext>
  );
}

export function useSnackbar(): SnackbarValue {
  return React.use(SnackbarContext) ?? noop;
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: spacing.sm, right: spacing.sm },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 56, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.dark, borderWidth: 1, borderColor: colors.primaryDark, shadowColor: colors.dark, shadowOpacity: 0.28, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  barError: { backgroundColor: colors.danger, borderColor: colors.danger },
  message: { flex: 1, color: colors.onPrimary, fontWeight: "700", lineHeight: 21 },
  undo: { flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.md, borderRadius: radius.pill, backgroundColor: colors.tint },
  undoText: { color: colors.primary, fontWeight: "900" },
  close: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.6 },
});
