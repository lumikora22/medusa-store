import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { migrateDatabase, V1_SCHEMA } from "./migrations";
import type { DatabaseClient } from "./database";
import { SqlJsDatabase } from "../../test/sqljs-database";

const open: SqlJsDatabase[] = [];
afterEach(() => { for (const database of open.splice(0)) database.close(); });

async function legacyDatabase(): Promise<SqlJsDatabase> {
  const database = await SqlJsDatabase.create(); open.push(database);
  await database.execAsync("CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);" + V1_SCHEMA);
  await database.runAsync("INSERT INTO schema_migrations(version, applied_at) VALUES (1, '2025-01-01T00:00:00.000Z')");
  await database.runAsync("INSERT INTO containers(id, code, qr_value, type, status, notes, created_at) VALUES (7, 'RACK-OLD', 'QR-RACK-OLD', 'other', 'active', 'Legacy rack', '2025-01-01T00:00:00.000Z')");
  await database.runAsync("INSERT INTO items(id, code, qr_value, container_id, status, price, description, tags_json, created_at, updated_at) VALUES (11, 'ITEM-OLD', 'QR-ITEM-OLD', 7, 'active', '39.90', 'Legacy item', '[\"new\"]', '2025-01-02T00:00:00.000Z', '2025-01-02T00:00:00.000Z')");
  await database.runAsync("INSERT INTO item_photos(id, item_id, uri, file_name, mime_type, alt_text, created_at) VALUES (21, 11, 'file:///old-a.jpg', 'old-a.jpg', 'image/jpeg', 'Front', '2025-01-02T00:00:00.000Z'), (22, 11, 'file:///old-b.jpg', 'old-b.jpg', 'image/jpeg', 'Back', '2025-01-03T00:00:00.000Z')");
  await database.runAsync("INSERT INTO inventory_movements(id, item_id, movement_type, to_container_id, created_at) VALUES (31, 11, 'created', 7, '2025-01-02T00:00:00.000Z')");
  return database;
}

describe("SQLite migrations", () => {
  it("preserves v1 IDs, rows, photos and events while backfilling a consistent primary photo", async () => {
    const database = await legacyDatabase(); await migrateDatabase(database, async () => "snapshot");
    const item = await database.getFirstAsync<Record<string, unknown>>("SELECT * FROM items WHERE id = 11");
    assert.equal(item?.code, "ITEM-OLD"); assert.equal(item?.stable_id, "MSI-000011"); assert.equal(item?.current_location_id, 7); assert.equal(item?.primary_photo_id, 21);
    const photos = await database.getAllAsync<Record<string, unknown>>("SELECT id, is_primary, sort_order FROM item_photos WHERE item_id = 11 ORDER BY id");
    assert.deepEqual(photos, [{ id: 21, is_primary: 1, sort_order: 21 }, { id: 22, is_primary: 0, sort_order: 22 }]);
    const event = await database.getFirstAsync<Record<string, unknown>>("SELECT id, legacy_movement_id, event_type FROM inventory_events WHERE legacy_movement_id = 31");
    assert.deepEqual(event, { id: 31, legacy_movement_id: 31, event_type: "item_created" });
    assert.equal((await database.getFirstAsync<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations"))?.version, 5);
  });

  it("gives every legacy item one piece and rebuilds sold items as a single sale", async () => {
    const database = await legacyDatabase();
    await database.runAsync("INSERT INTO items(id, code, qr_value, container_id, status, price, description, tags_json, sold_at, created_at, updated_at) VALUES (12, 'ITEM-SOLD', 'QR-ITEM-SOLD', 7, 'sold', '80.00', 'Sold item', '[]', '2025-02-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z', '2025-02-01T00:00:00.000Z')");
    await migrateDatabase(database, async () => null);

    const active = await database.getFirstAsync<{ quantity: number; sold_quantity: number }>("SELECT quantity, sold_quantity FROM items WHERE id = 11");
    assert.deepEqual(active, { quantity: 1, sold_quantity: 0 });

    const sold = await database.getFirstAsync<{ quantity: number; sold_quantity: number }>("SELECT quantity, sold_quantity FROM items WHERE id = 12");
    assert.deepEqual(sold, { quantity: 1, sold_quantity: 1 });

    const sales = await database.getAllAsync<Record<string, unknown>>("SELECT item_id, quantity, restored_quantity, sold_at, location_id FROM item_sales ORDER BY item_id");
    assert.deepEqual(sales, [{ item_id: 12, quantity: 1, restored_quantity: 0, sold_at: "2025-02-01T00:00:00.000Z", location_id: 7 }]);
    assert.equal((await database.getFirstAsync<{ total: number }>("SELECT COUNT(*) AS total FROM item_sales"))?.total, 1);
  });

  it("keeps sold_quantity equal to the sales history after a partial restore", async () => {
    const database = await legacyDatabase(); await migrateDatabase(database, async () => null);
    await database.runAsync("UPDATE items SET quantity = 5 WHERE id = 11");
    await database.runAsync("INSERT INTO item_sales(stable_id, item_id, quantity, restored_quantity, sold_price, sold_at, location_id, created_at) VALUES ('SALE-A', 11, 2, 0, '30.00', '2025-03-01T00:00:00.000Z', 7, '2025-03-01T00:00:00.000Z'), ('SALE-B', 11, 3, 1, '28.00', '2025-03-05T00:00:00.000Z', 7, '2025-03-05T00:00:00.000Z')");
    await database.runAsync("UPDATE items SET sold_quantity = (SELECT COALESCE(SUM(s.quantity - s.restored_quantity), 0) FROM item_sales s WHERE s.item_id = items.id) WHERE id = 11");

    const item = await database.getFirstAsync<{ quantity: number; sold_quantity: number }>("SELECT quantity, sold_quantity FROM items WHERE id = 11");
    assert.deepEqual(item, { quantity: 5, sold_quantity: 4 }, "2 + (3 - 1) pieces remain sold");
  });

  it("is idempotent", async () => {
    const database = await legacyDatabase(); await migrateDatabase(database, async () => null); const before = database.export(); await migrateDatabase(database, async () => null); const after = database.export();
    assert.deepEqual(after, before);
  });

  it("stops on global code collisions before creating v2 structures", async () => {
    const database = await legacyDatabase();
    await database.runAsync("INSERT INTO containers(id, code, qr_value, type, status, notes, created_at) VALUES (8, 'ITEM-OLD', 'QR-OTHER', 'box', 'active', '', '2025-01-01T00:00:00.000Z')");
    await assert.rejects(migrateDatabase(database, async () => null), /códigos ambiguos/);
    assert.equal(await database.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'locations'"), null);
    assert.equal((await database.getFirstAsync<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations"))?.version, 1);
  });

  it("rolls back every v2 alteration when a statement fails mid-migration", async () => {
    const database = await legacyDatabase();
    const failing = new Proxy(database as DatabaseClient, { get(target, property, receiver) { if (property !== "execAsync") return Reflect.get(target, property, receiver); return async (source: string) => { if (source.includes("INSERT OR IGNORE INTO code_registry")) throw new Error("injected migration failure"); return target.execAsync(source); }; } });
    await assert.rejects(migrateDatabase(failing, async () => null), /injected migration failure/);
    const columns = await database.getAllAsync<{ name: string }>("PRAGMA table_info(items)");
    assert.equal(columns.some((column) => column.name === "stable_id"), false);
    assert.equal(await database.getFirstAsync("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'locations'"), null);
    assert.equal((await database.getFirstAsync<{ version: number }>("SELECT MAX(version) AS version FROM schema_migrations"))?.version, 1);
  });
});
