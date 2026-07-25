import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { inventoryService } from "../../application/inventory-service";
import type { LocationType, PrecisionMode } from "../../domain/models";
import { colors, inputStyle, spacing, typography } from "../../theme/tokens";
import { locationTypeLabel } from "../../utils/format";
import { AppButton } from "../components/app-button";
import { FilterChip } from "../components/filter-chip";
import { KeyboardAwareScreen } from "../components/keyboard-aware-screen";
import { useDialog } from "../context/dialog";

export function LocationFormScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { alert } = useDialog();
  const [name, setName] = useState(""); const [code, setCode] = useState(params.code ?? ""); const [type, setType] = useState<LocationType>("box"); const [precision, setPrecision] = useState<PrecisionMode>("strict"); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { const location = await inventoryService.createLocation({ code: code.trim() || undefined, name: name.trim(), type, precisionMode: precision, notes }); router.replace({ pathname: "/locations/[id]", params: { id: String(location.id) } }); } catch (error) { void alert({ title: "No pudimos crear la ubicación", message: error instanceof Error ? error.message : "Revise la información.", tone: "danger" }); } finally { setSaving(false); } };
  return <KeyboardAwareScreen contentContainerStyle={styles.content}><Text style={styles.intro}>Use un nombre fácil de reconocer. El código puede generarse automáticamente.</Text><Text style={styles.label}>Nombre</Text><TextInput value={name} onChangeText={setName} placeholder="Rack principal" placeholderTextColor={colors.textMuted} style={styles.input} /><Text style={styles.label}>Código opcional</Text><TextInput value={code} onChangeText={setCode} autoCapitalize="characters" placeholder="LOC-RACK-004" placeholderTextColor={colors.textMuted} style={styles.input} /><Text style={styles.label}>Tipo</Text><View style={styles.chips}>{(["rack","box","bag","shelf","display","other"] as const).map((value) => <FilterChip key={value} label={locationTypeLabel(value)} selected={type === value} onPress={() => { setType(value); setPrecision(value === "box" || value === "bag" ? "strict" : "flexible"); }} />)}</View><Text style={styles.label}>Precisión</Text><View style={styles.chips}><FilterChip label="Exacta" selected={precision === "strict"} onPress={() => setPrecision("strict")} /><FilterChip label="Flexible" selected={precision === "flexible"} onPress={() => setPrecision("flexible")} /></View><Text style={styles.label}>Notas</Text><TextInput value={notes} onChangeText={setNotes} multiline placeholder="Indicaciones para encontrarla" placeholderTextColor={colors.textMuted} style={[styles.input, styles.area]} /><AppButton label={saving ? "Guardando..." : "Crear ubicación"} icon="content-save-outline" onPress={() => void save()} disabled={saving || !name.trim()} /></KeyboardAwareScreen>;
}

const styles = StyleSheet.create({ content: { padding: spacing.lg, paddingBottom: 80, gap: spacing.sm, backgroundColor: colors.canvas }, intro: { color: colors.textMuted, fontSize: typography.body, lineHeight: 22 }, label: { marginTop: spacing.sm, color: colors.textPrimary, fontWeight: "800" }, input: inputStyle, area: { minHeight: 96, textAlignVertical: "top" }, chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm } });
