import type { AppSettings } from "../../domain/models";
import { getDatabase } from "../sqlite/database";

/** Settings key holding the salted Exhibition Mode PIN digest; never exposed to the UI. */
const EXHIBITION_PIN_KEY = "exhibitionPin";

/** Derived or write-protected fields that callers must not set directly. */
export type WritableSetting = keyof Omit<AppSettings, "lastBackupAt" | "backupDue" | "backupDueInDays" | "exhibitionPinSet">;

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
      exhibitionMode: Boolean(JSON.parse(values.get("exhibitionMode") ?? "false")),
      exhibitionPinSet: Boolean(values.get(EXHIBITION_PIN_KEY)),
      lastBackupAt,
      backupDue: !lastBackupAt || elapsedDays >= backupReminderDays,
      backupDueInDays: lastBackupAt ? Math.max(0, backupReminderDays - elapsedDays) : 0,
    };
  }

  async set<K extends WritableSetting>(key: K, value: AppSettings[K]): Promise<void> {
    await this.write(key, value);
  }

  async getExhibitionPin(): Promise<string | null> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ value_json: string }>("SELECT value_json FROM app_settings WHERE key = ?", EXHIBITION_PIN_KEY);
    return row ? String(JSON.parse(row.value_json)) : null;
  }

  async setExhibitionPin(record: string): Promise<void> {
    await this.write(EXHIBITION_PIN_KEY, record);
  }

  async clearExhibitionPin(): Promise<void> {
    const database = await getDatabase();
    await database.runAsync("DELETE FROM app_settings WHERE key = ?", EXHIBITION_PIN_KEY);
  }

  private async write(key: string, value: unknown): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
      key, JSON.stringify(value), new Date().toISOString(),
    );
  }
}
