import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";

import type { DatabaseBindValue, DatabaseClient, DatabaseRunResult } from "../data/sqlite/database";

let sqlPromise: Promise<SqlJsStatic> | null = null;

function loadSql(): Promise<SqlJsStatic> {
  sqlPromise ??= initSqlJs();
  return sqlPromise;
}

function normalize(value: DatabaseBindValue): string | number | null | Uint8Array {
  if (typeof value === "boolean") return value ? 1 : 0;
  return value as string | number | null | Uint8Array;
}

export class SqlJsDatabase implements DatabaseClient {
  readonly databasePath = "memory://medusa-store-test";

  private constructor(private readonly database: Database) {}

  static async create(bytes?: Uint8Array): Promise<SqlJsDatabase> {
    const SQL = await loadSql();
    const instance = new SqlJsDatabase(new SQL.Database(bytes));
    await instance.execAsync("PRAGMA foreign_keys = ON;");
    return instance;
  }

  export(): Uint8Array {
    return this.database.export();
  }

  close(): void {
    this.database.close();
  }

  async execAsync(source: string): Promise<void> {
    this.database.exec(source);
  }

  async runAsync(source: string, ...params: DatabaseBindValue[]): Promise<DatabaseRunResult> {
    this.database.run(source, params.map(normalize));
    const row = this.database.exec("SELECT last_insert_rowid() AS id, changes() AS changes")[0];
    return { lastInsertRowId: Number(row?.values[0]?.[0] ?? 0), changes: Number(row?.values[0]?.[1] ?? 0) };
  }

  async getFirstAsync<T>(source: string, ...params: DatabaseBindValue[]): Promise<T | null> {
    const rows = await this.getAllAsync<T>(source, ...params);
    return rows[0] ?? null;
  }

  async getAllAsync<T>(source: string, ...params: DatabaseBindValue[]): Promise<T[]> {
    const statement = this.database.prepare(source);
    try {
      statement.bind(params.map(normalize));
      const rows: T[] = [];
      while (statement.step()) rows.push(statement.getAsObject() as T);
      return rows;
    } finally {
      statement.free();
    }
  }

  async withTransactionAsync(operation: () => Promise<void>): Promise<void> {
    await this.transaction(() => operation());
  }

  async withExclusiveTransactionAsync(operation: (transaction: DatabaseClient) => Promise<void>): Promise<void> {
    await this.transaction(() => operation(this));
  }

  private async transaction(operation: () => Promise<void>): Promise<void> {
    this.database.run("BEGIN IMMEDIATE");
    try {
      await operation();
      this.database.run("COMMIT");
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }
}
