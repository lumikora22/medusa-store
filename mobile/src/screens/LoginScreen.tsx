import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { ActivityIndicator, Button, Card, Text, TextInput } from "react-native-paper";

import { ApiError } from "../api/client";
import type { Credentials } from "../api/session";

function normalizeLoginError(error: unknown): string {
  if (error instanceof ApiError && [400, 401, 403].includes(error.status)) {
    return "No pudimos iniciar sesión. Revisá el usuario y la contraseña.";
  }
  return error instanceof Error ? error.message : "No pudimos iniciar sesión. Intentá de nuevo.";
}

export function LoginScreen({ onLogin }: { onLogin: (credentials: Credentials) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async () => {
    setError(null);
    if (!username || !password) {
      setError("Usuario y contraseña son obligatorios.");
      return;
    }

    setLoading(true);
    try {
      await onLogin({ username, password });
      setPassword("");
    } catch (err) {
      setError(normalizeLoginError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Card mode="elevated" style={styles.card}>
        <Card.Content>
          <View style={styles.logoPlaceholder}>
            <Text style={styles.logoText}>MS</Text>
          </View>
          <Text variant="headlineSmall" style={styles.heading}>Bienvenido de vuelta</Text>
          <Text style={styles.note}>Iniciá sesión para gestionar inventario, contenedores, fotos y códigos QR.</Text>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorTitle}>No se pudo iniciar sesión</Text>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
          <TextInput
            mode="outlined"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            label="Usuario"
            placeholder="admin"
            style={styles.input}
          />
          <TextInput
            mode="outlined"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            label="Contraseña"
            placeholder="Contraseña"
            right={<TextInput.Icon icon={showPassword ? "eye-off" : "eye"} onPress={() => setShowPassword((current) => !current)} />}
            style={styles.input}
          />
          <Button mode="contained" onPress={submit} disabled={loading} style={styles.button}>
            {loading ? <ActivityIndicator color="#ffffff" /> : "Ingresar"}
          </Button>
        </Card.Content>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center" },
  card: { backgroundColor: "#ffffff", borderRadius: 24 },
  logoPlaceholder: { width: 64, height: 64, borderRadius: 20, backgroundColor: "#111827", alignItems: "center", justifyContent: "center", marginBottom: 16 },
  logoText: { color: "#ffffff", fontSize: 22, fontWeight: "900" },
  heading: { fontWeight: "900", color: "#111827", marginBottom: 8 },
  note: { color: "#6b7280", lineHeight: 20, marginBottom: 14 },
  errorBox: { backgroundColor: "#fef2f2", borderColor: "#fecaca", borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 12 },
  errorTitle: { color: "#991b1b", fontWeight: "900", marginBottom: 4 },
  errorText: { color: "#7f1d1d", lineHeight: 18 },
  input: { marginTop: 10 },
  button: { marginTop: 18, borderRadius: 16 },
});
