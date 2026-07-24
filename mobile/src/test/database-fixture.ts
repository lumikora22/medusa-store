import { resetDatabaseConnectionForTests, setDatabaseFactoryForTests } from "../data/sqlite/database";
import { migrateDatabase } from "../data/sqlite/migrations";
import { SqlJsDatabase } from "./sqljs-database";

export async function createMigratedDatabase(): Promise<SqlJsDatabase> {
  const database = await SqlJsDatabase.create();
  setDatabaseFactoryForTests(async () => database);
  await migrateDatabase(database, async () => null);
  return database;
}

export function closeTestDatabase(database: SqlJsDatabase): void {
  resetDatabaseConnectionForTests();
  database.close();
}
