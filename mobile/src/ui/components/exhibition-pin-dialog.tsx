import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { PIN_LENGTH } from "../../core/security/exhibition-lock";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import { AppButton } from "./app-button";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "erase"] as const;

type Props = {
  visible: boolean;
  /** `set` asks for the PIN twice before activating; `unlock` verifies the stored PIN. */
  mode: "set" | "unlock";
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (pin: string) => Promise<void>;
  /** Forgotten-PIN recovery through the device lock screen; omitted when unavailable. */
  onRecover?: () => Promise<void>;
};

export function ExhibitionPinDialog({ visible, mode, busy = false, onCancel, onSubmit, onRecover }: Props) {
  const [entry, setEntry] = useState("");
  const [firstEntry, setFirstEntry] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!visible) { setEntry(""); setFirstEntry(null); setError(null); } }, [visible]);

  const recover = async () => {
    if (!onRecover) return;
    setError(null);
    try { await onRecover(); }
    catch (reason) { setEntry(""); setError(reason instanceof Error ? reason.message : "No pudimos confirmar su identidad."); }
  };

  const confirming = mode === "set" && firstEntry != null;

  const complete = async (pin: string) => {
    if (mode === "set" && firstEntry == null) { setFirstEntry(pin); setEntry(""); return; }
    if (mode === "set" && firstEntry !== pin) { setFirstEntry(null); setEntry(""); setError("Los PIN no coinciden. Empiece de nuevo."); return; }
    try { await onSubmit(pin); }
    catch (reason) { setEntry(""); setFirstEntry(null); setError(reason instanceof Error ? reason.message : "No pudimos validar el PIN."); }
  };

  const press = (key: string) => {
    if (busy) return;
    setError(null);
    if (key === "erase") { setEntry((current) => current.slice(0, -1)); return; }
    if (entry.length >= PIN_LENGTH) return;
    const next = entry + key;
    setEntry(next);
    if (next.length === PIN_LENGTH) void complete(next);
  };

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <MaterialCommunityIcons name={mode === "set" ? "lock-outline" : "lock-open-variant-outline"} size={34} color={colors.primary} />
        <Text style={styles.title}>{mode === "set" ? "Modo exhibición" : "Salir del modo exhibición"}</Text>
        <Text style={styles.text}>{mode === "set" ? (confirming ? "Repita el PIN para confirmarlo." : `Elija un PIN de ${PIN_LENGTH} dígitos. Lo necesitará para salir del modo exhibición.`) : "Ingrese el PIN para volver a la aplicación completa."}</Text>
        <View style={styles.dots}>{Array.from({ length: PIN_LENGTH }, (_, index) => <View key={index} style={[styles.dot, index < entry.length && styles.dotFilled]} />)}</View>
        {error ? <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text> : null}
        <View style={styles.keypad}>{KEYS.map((key, index) => key === "" ? <View key={`gap-${index}`} style={styles.key} /> : <Pressable
          key={key}
          accessibilityRole="button"
          accessibilityLabel={key === "erase" ? "Borrar" : key}
          disabled={busy}
          onPress={() => press(key)}
          style={({ pressed }) => [styles.key, styles.keyFilled, pressed && styles.pressed, busy && styles.disabled]}
        >{key === "erase" ? <MaterialCommunityIcons name="backspace-outline" size={24} color={colors.primary} /> : <Text style={styles.keyText}>{key}</Text>}</Pressable>)}</View>
        {mode === "unlock" && onRecover ? <AppButton tone="secondary" label="Olvidé el PIN" icon="cellphone-key" onPress={() => void recover()} disabled={busy} /> : null}
        <AppButton tone="quiet" label="Cancelar" icon="close" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.lg, backgroundColor: colors.overlay },
  card: { width: "100%", maxWidth: 380, alignItems: "center", gap: spacing.md, padding: spacing.xl, borderRadius: radius.xl, borderCurve: "continuous", backgroundColor: colors.surface },
  title: { color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", textAlign: "center" },
  text: { color: colors.textMuted, fontSize: typography.body, lineHeight: 21, textAlign: "center" },
  dots: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.sm },
  dot: { width: 18, height: 18, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.primary },
  dotFilled: { backgroundColor: colors.primary },
  error: { color: colors.danger, fontWeight: "800", textAlign: "center" },
  keypad: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  key: { width: 78, height: 62, alignItems: "center", justifyContent: "center", borderRadius: radius.lg, borderCurve: "continuous" },
  keyFilled: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.canvas },
  keyText: { color: colors.textPrimary, fontSize: 26, fontWeight: "900" },
  pressed: { opacity: 0.6 },
  disabled: { opacity: 0.4 },
});
