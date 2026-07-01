import React from "react";
import { StyleSheet, Text, View } from "react-native";

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, borderRadius: 18, backgroundColor: "#ffffff", alignItems: "center" },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  body: { marginTop: 8, textAlign: "center", color: "#6b7280", lineHeight: 20 },
});
