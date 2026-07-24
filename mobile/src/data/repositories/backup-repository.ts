import { getDatabase, inTransaction, type DatabaseBindValue, type DatabaseClient } from "../sqlite/database";
import { DomainError } from "../../domain/errors";

export const BACKUP_TABLES = [
  "containers",
  "locations",
  "items",
  "item_photos",
  "inventory_movements",
  "transfer_batches",
  "inventory_events",
  "code_registry",
  "app_settings",
  "backup_history",
  "physical_counts",
  "physical_count_entries",
] as const;

export type BackupTable = typeof BACKUP_TABLES[number];
export type BackupTables = Record<BackupTable, Array<Record<string, unknown>>>;

const DELETE_ORDER: BackupTable[] = [
  "physical_count_entries", "physical_counts", "inventory_events", "transfer_batches", "code_registry",
  "item_photos", "items", "locations", "inventory_movements", "containers", "backup_history", "app_settings",
];

const INSERT_ORDER: BackupTable[] = [
  "containers", "locations", "items", "item_photos", "inventory_movements", "transfer_batches",
  "inventory_events", "code_registry", "app_settings", "backup_history", "physical_counts", "physical_count_entries",
];

async function insertRows(database: DatabaseClient, table: BackupTable, rows: Array<Record<string, unknown>>): Promise<void> {
  for (const row of rows) {
    const columns = Object.keys(row);
    if (columns.length === 0) continue;
    const placeholders = columns.map(() => "?").join(",");
    const quoted = columns.map((column) => `"${column.replace(/"/g, "")}"`).join(",");
    await database.runAsync(`INSERT INTO ${table} (${quoted}) VALUES (${placeholders})`, ...columns.map((column) => row[column] as DatabaseBindValue));
  }
}

export class BackupRepository {
  async exportTables(): Promise<BackupTables> {
    const database = await getDatabase();
    const entries = await Promise.all(BACKUP_TABLES.map(async (table) => [table, await database.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`)] as const));
    return Object.fromEntries(entries) as BackupTables;
  }

  async restoreTables(tables: BackupTables): Promise<void> {
    const database = await getDatabase();
    await inTransaction(database, async (transaction) => {
      await transaction.execAsync("DROP TRIGGER IF EXISTS inventory_events_no_update; DROP TRIGGER IF EXISTS inventory_events_no_delete;");
      await transaction.execAsync("UPDATE items SET primary_photo_id = NULL;");
      for (const table of DELETE_ORDER) await transaction.execAsync(`DELETE FROM ${table};`);
      const primaryPhotoIds = new Map<number, number>();
      for (const table of INSERT_ORDER) {
        if (table === "items") {
          const rows = (tables.items ?? []).map((row) => {
            const copy = { ...row };
            if (copy.primary_photo_id != null) primaryPhotoIds.set(Number(copy.id), Number(copy.primary_photo_id));
            copy.primary_photo_id = null;
            return copy;
          });
          await insertRows(transaction, table, rows);
        } else {
          await insertRows(transaction, table, tables[table] ?? []);
        }
      }
      for (const [itemId, photoId] of primaryPhotoIds) await transaction.runAsync("UPDATE items SET primary_photo_id = ? WHERE id = ?", photoId, itemId);
      const foreignKeyViolations = await transaction.getAllAsync<Record<string, unknown>>("PRAGMA foreign_key_check");
      const integrity = await transaction.getFirstAsync<{ integrity_check: string }>("PRAGMA integrity_check");
      if (foreignKeyViolations.length || integrity?.integrity_check !== "ok") throw new DomainError("El respaldo no supera la validación de integridad de SQLite.", "backup_database_integrity_failed");
      await transaction.execAsync(`
        CREATE TRIGGER IF NOT EXISTS inventory_events_no_update BEFORE UPDATE ON inventory_events BEGIN SELECT RAISE(ABORT, 'inventory_events are immutable'); END;
        CREATE TRIGGER IF NOT EXISTS inventory_events_no_delete BEFORE DELETE ON inventory_events BEGIN SELECT RAISE(ABORT, 'inventory_events are immutable'); END;
      `);
    });
  }

  async recordBackup(input: { stableId: string; uri: string; checksum: string; itemCount: number; locationCount: number; photoCount: number; status: "created" | "restored" | "failed" }): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      "INSERT INTO backup_history(stable_id, file_uri, checksum, item_count, location_count, photo_count, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      input.stableId, input.uri, input.checksum, input.itemCount, input.locationCount, input.photoCount, input.status, new Date().toISOString(),
    );
  }
}
