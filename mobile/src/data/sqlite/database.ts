import type * as SQLite from "expo-sqlite";

export type DatabaseBindValue = SQLite.SQLiteBindValue;
export type DatabaseRunResult = { lastInsertRowId: number; changes: number };
export type DatabaseClient = {
  databasePath: string;
  execAsync(source: string): Promise<void>;
  runAsync(source: string, ...params: DatabaseBindValue[]): Promise<DatabaseRunResult>;
  getFirstAsync<T>(source: string, ...params: DatabaseBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, ...params: DatabaseBindValue[]): Promise<T[]>;
  withTransactionAsync(operation: () => Promise<void>): Promise<void>;
  withExclusiveTransactionAsync(operation: (transaction: DatabaseClient) => Promise<void>): Promise<void>;
};

export type DatabaseFactory = () => Promise<DatabaseClient>;

let databaseFactory: DatabaseFactory | null = null;
let databasePromise: Promise<DatabaseClient> | null = null;

export function configureDatabase(factory: DatabaseFactory): void {
  databasePromise = null;
  databaseFactory = factory;
}

export async function getDatabase(): Promise<DatabaseClient> {
  if (!databaseFactory) throw new Error("Database factory is not configured.");
  if (!databasePromise) databasePromise = databaseFactory().catch((error) => { databasePromise = null; throw error; });
  return databasePromise;
}

export async function inTransaction<T>(database: DatabaseClient, operation: (transaction: DatabaseClient) => Promise<T>): Promise<T> {
  let result: T | undefined;
  if (process.env.EXPO_OS === "web") await database.withTransactionAsync(async () => { result = await operation(database); });
  else await database.withExclusiveTransactionAsync(async (transaction) => { result = await operation(transaction); });
  return result as T;
}

export function resetDatabaseConnectionForTests(): void {
  databasePromise = null; databaseFactory = null;
}

export function setDatabaseFactoryForTests(factory: DatabaseFactory): void {
  configureDatabase(factory);
}
