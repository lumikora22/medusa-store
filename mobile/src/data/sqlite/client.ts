import * as FileSystem from "expo-file-system/legacy";
import * as SQLite from "expo-sqlite";

import { configureDatabase, type DatabaseClient } from "./database";

export const DATABASE_NAME = "medusa-store.db";
export function configureProductionDatabase(): void {
  configureDatabase(async () => {
    const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await database.execAsync("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    return database as DatabaseClient;
  });
}

export async function createDatabaseSafetySnapshot(database: DatabaseClient, label: string): Promise<string | null> {
  if (process.env.EXPO_OS === "web" || !FileSystem.documentDirectory) return null;
  const directory = `${FileSystem.documentDirectory}medusa-store/safety/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await database.execAsync("PRAGMA wal_checkpoint(FULL);");
  const source = database.databasePath.startsWith("file://") ? database.databasePath : `file://${database.databasePath}`;
  const destination = `${directory}${label}-${Date.now()}.db`;
  await FileSystem.copyAsync({ from: source, to: destination });
  return destination;
}
