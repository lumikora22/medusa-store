import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { colors, radius, spacing, typography } from "../../theme/tokens";
import { useInterfaceSettings } from "../context/interface-settings";

type Props = {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
};

/** Piece picker. Buttons only, because a numeric keyboard for "how many" is friction. */
export function QuantityStepper({ label, value, min = 1, max = 999, onChange }: Props) {
  const { minTarget } = useInterfaceSettings();
  const step = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  return <View style={styles.root}>
    <Text style={styles.label}>{label}</Text>
    <View style={styles.control}>
      <StepButton label="Quitar una pieza" icon="minus" size={minTarget} disabled={value <= min} onPress={() => step(-1)} />
      <Text accessibilityLiveRegion="polite" style={styles.value}>{value}</Text>
      <StepButton label="Agregar una pieza" icon="plus" size={minTarget} disabled={value >= max} onPress={() => step(1)} />
    </View>
  </View>;
}

function StepButton({ label, icon, size, disabled, onPress }: { label: string; icon: "plus" | "minus"; size: number; disabled: boolean; onPress: () => void }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.button, { width: size, height: size }, disabled && styles.disabled, pressed && styles.pressed]}
  >
    <MaterialCommunityIcons name={icon} size={22} color={colors.primary} />
  </Pressable>;
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  label: { color: colors.textPrimary, fontWeight: "800" },
  control: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  button: { alignItems: "center", justifyContent: "center", borderRadius: radius.md, borderCurve: "continuous", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  value: { minWidth: 56, textAlign: "center", color: colors.textPrimary, fontSize: typography.h2, fontWeight: "900", fontVariant: ["tabular-nums"] },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.6 },
});
