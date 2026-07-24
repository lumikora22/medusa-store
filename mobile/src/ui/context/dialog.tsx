import React, { createContext, useCallback, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "./interface-settings";

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
type DialogTone = "primary" | "danger";

type ConfirmOptions = { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; tone?: DialogTone; icon?: IconName };
type AlertOptions = { title: string; message?: string; confirmLabel?: string; tone?: DialogTone; icon?: IconName };

type Request = (ConfirmOptions & { kind: "confirm" }) | (AlertOptions & { kind: "alert" });

type DialogValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  alert: (options: AlertOptions) => Promise<void>;
};

const DialogContext = createContext<DialogValue | null>(null);
const noop: DialogValue = { confirm: async () => false, alert: async () => undefined };

const toneIcon: Record<DialogTone, IconName> = { primary: "information-outline", danger: "alert-outline" };

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const { textBoost } = useInterfaceSettings();
  const [request, setRequest] = useState<Request | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setRequest({ kind: "confirm", ...options });
  }), []);

  const alert = useCallback((options: AlertOptions) => new Promise<void>((resolve) => {
    resolver.current = () => resolve();
    setRequest({ kind: "alert", ...options });
  }), []);

  const tone = request?.tone ?? "primary";
  const accent = tone === "danger" ? colors.danger : colors.primary;

  return (
    <DialogContext value={{ confirm, alert }}>
      {children}
      <Modal visible={request != null} transparent animationType="fade" statusBarTranslucent onRequestClose={() => settle(false)}>
        <Pressable accessibilityLabel="Cerrar diálogo" style={styles.backdrop} onPress={() => settle(false)}>
          <Pressable style={styles.card} onPress={() => undefined}>
            <View style={[styles.iconWrap, { backgroundColor: tone === "danger" ? colors.dangerSoft : colors.tint }]}>
              <MaterialCommunityIcons name={request?.icon ?? toneIcon[tone]} size={28} color={accent} />
            </View>
            <Text accessibilityRole="header" style={[styles.title, { fontSize: typography.h2 + textBoost }]}>{request?.title}</Text>
            {request?.message ? <Text style={[styles.message, { fontSize: typography.body + textBoost }]}>{request.message}</Text> : null}
            <View style={styles.actions}>
              {request?.kind === "confirm" ? (
                <Pressable accessibilityRole="button" accessibilityLabel={request.cancelLabel ?? "Cancelar"} onPress={() => settle(false)} style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}>
                  <Text style={styles.cancelLabel}>{request.cancelLabel ?? "Cancelar"}</Text>
                </Pressable>
              ) : null}
              <Pressable accessibilityRole="button" accessibilityLabel={request?.confirmLabel ?? "Aceptar"} onPress={() => settle(true)} style={({ pressed }) => [styles.button, { backgroundColor: accent, borderColor: accent }, pressed && styles.pressed]}>
                <Text style={styles.confirmLabel}>{request?.confirmLabel ?? "Aceptar"}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext>
  );
}

export function useDialog(): DialogValue {
  return React.use(DialogContext) ?? noop;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: colors.overlay },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  iconWrap: { width: 56, height: 56, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  title: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", textAlign: "center" },
  message: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22, textAlign: "center" },
  actions: { flexDirection: "row", alignSelf: "stretch", gap: spacing.sm, marginTop: spacing.xs },
  button: { flex: 1, minHeight: 50, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1 },
  cancel: { backgroundColor: colors.surface, borderColor: colors.border },
  cancelLabel: { color: colors.primary, fontSize: typography.body, fontWeight: "800" },
  confirmLabel: { color: colors.onPrimary, fontSize: typography.body, fontWeight: "900" },
  pressed: { opacity: 0.8 },
});
