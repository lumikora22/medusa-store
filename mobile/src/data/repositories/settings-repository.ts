import type { AppSettings } from "../../domain/models";
import { getDatabase } from "../sqlite/database";

export class SettingsRepository {
  async get(): Promise<AppSettings> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ key: string; value_json: string }>("SELECT key, value_json FROM app_settings");
    const values = new Map(rows.map((row) => [row.key, row.value_json]));
    const history = await database.getFirstAsync<{ created_at: string }>("SELECT created_at FROM backup_history WHERE status = 'created' ORDER BY created_at DESC LIMIT 1");
    const backupReminderDays = Number(JSON.parse(values.get("backupReminderDays") ?? "7"));
    const lastBackupAt = history?.created_at ?? null;
    const elapsedDays = lastBackupAt ? Math.floor((Date.now() - new Date(lastBackupAt).getTime()) / 86_400_000) : Number.POSITIVE_INFINITY;
    return {
      backupReminderDays,
      largeInterface: Boolean(JSON.parse(values.get("largeInterface") ?? "false")),
      scanSound: Boolean(JSON.parse(values.get("scanSound") ?? "true")),
      tutorialSeen: Boolean(JSON.parse(values.get("tutorialSeen") ?? "false")),
      lastBackupAt,
      backupDue: !lastBackupAt || elapsedDays >= backupReminderDays,
      backupDueInDays: lastBackupAt ? Math.max(0, backupReminderDays - elapsedDays) : 0,
    };
  }

  async set<K extends keyof Omit<AppSettings, "lastBackupAt">>(key: K, value: AppSettings[K]): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      key, JSON.stringify(value), new Date().toISOString(),
    );
  }
}
