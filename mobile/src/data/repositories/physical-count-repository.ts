import { DomainError } from "../../domain/errors";
import type { PhysicalCountResult } from "../../domain/models";
import { getDatabase, inTransaction } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { ItemRepository } from "./item-repository";

type CountRow = { id: number; location_id: number; status: PhysicalCountResult["status"]; expected_count: number; scanned_count: number; expected_ids_json: string };

export class PhysicalCountRepository {
  constructor(private readonly items = new ItemRepository()) {}

  async start(locationId: number): Promise<PhysicalCountResult> {
    const database = await getDatabase();
    const open = await database.getFirstAsync<CountRow>("SELECT * FROM physical_counts WHERE location_id = ? AND status = 'open'", locationId);
    if (open) return this.map(open);
    const expectedRows = await database.getAllAsync<{ id: number }>("SELECT id FROM items WHERE current_location_id = ? AND status = 'active' ORDER BY id", locationId);
    const expectedIds = expectedRows.map((row) => Number(row.id));
    const now = new Date().toISOString();
    let countId = 0;
    await inTransaction(database, async (transaction) => {
      const result = await transaction.runAsync(
        "INSERT INTO physical_counts(stable_id, location_id, status, expected_count, scanned_count, created_at, expected_ids_json) VALUES (?, ?, 'open', ?, 0, ?, ?)",
        `COUNT-${locationId}-${Date.now()}`, locationId, expectedIds.length, now, JSON.stringify(expectedIds),
      );
      countId = Number(result.lastInsertRowId);
      await insertEvent(transaction, { stableId: `EVENT-COUNT-${countId}-START`, type: "physical_count_started", locationId, summary: "Conteo físico iniciado", payload: { expectedCount: expectedIds.length }, createdAt: now });
    });
    return this.get(countId);
  }

  async scan(countId: number, itemId: number): Promise<"matched" | "unexpected" | "duplicate"> {
    const database = await getDatabase();
    const count = await database.getFirstAsync<CountRow>("SELECT * FROM physical_counts WHERE id = ?", countId);
    if (!count || count.status !== "open") throw new DomainError("El conteo no está activo.", "count_not_open");
    const duplicate = await database.getFirstAsync<{ id: number }>("SELECT id FROM physical_count_entries WHERE count_id = ? AND item_id = ?", countId, itemId);
    if (duplicate) return "duplicate";
    const item = await database.getFirstAsync<{ id: number }>("SELECT id FROM items WHERE id = ? AND status = 'active'", itemId);
    if (!item) throw new DomainError("No encontramos una prenda disponible con ese código.", "item_not_found", 404);
    const expectedIds = JSON.parse(count.expected_ids_json) as number[];
    const result = expectedIds.includes(itemId) ? "matched" : "unexpected";
    await inTransaction(database, async (transaction) => {
      await transaction.runAsync("INSERT INTO physical_count_entries(count_id, item_id, result, scanned_at) VALUES (?, ?, ?, ?)", countId, itemId, result, new Date().toISOString());
      await transaction.runAsync("UPDATE physical_counts SET scanned_count = scanned_count + 1 WHERE id = ?", countId);
    });
    return result;
  }

  async get(countId: number): Promise<PhysicalCountResult> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<CountRow>("SELECT * FROM physical_counts WHERE id = ?", countId);
    if (!row) throw new DomainError("No encontramos el conteo físico.", "count_not_found", 404);
    return this.map(row);
  }

  async finish(countId: number): Promise<PhysicalCountResult> {
    return this.close(countId, "completed");
  }

  async cancel(countId: number): Promise<PhysicalCountResult> {
    return this.close(countId, "cancelled");
  }

  private async close(countId: number, status: "completed" | "cancelled"): Promise<PhysicalCountResult> {
    const current = await this.get(countId);
    if (current.status !== "open") throw new DomainError("El conteo ya está cerrado.", "count_not_open");
    const database = await getDatabase();
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      await transaction.runAsync("UPDATE physical_counts SET status = ?, completed_at = ? WHERE id = ?", status, now, countId);
      await insertEvent(transaction, {
        stableId: `EVENT-COUNT-${countId}-${status.toUpperCase()}`, type: status === "completed" ? "physical_count_completed" : "physical_count_cancelled",
        locationId: current.locationId, summary: status === "completed" ? "Conteo físico finalizado" : "Conteo físico cancelado",
        payload: { matched: current.matched.length, unexpected: current.unexpected.length, missing: current.missing.length }, createdAt: now,
      });
    });
    return this.get(countId);
  }

  private async map(row: CountRow): Promise<PhysicalCountResult> {
    const database = await getDatabase();
    const expectedIds = JSON.parse(row.expected_ids_json || "[]") as number[];
    const entries = await database.getAllAsync<{ item_id: number; result: "matched" | "unexpected" }>("SELECT item_id, result FROM physical_count_entries WHERE count_id = ? ORDER BY id", row.id);
    const scannedIds = entries.map((entry) => Number(entry.item_id));
    const matchedIds = entries.filter((entry) => entry.result === "matched").map((entry) => Number(entry.item_id));
    const unexpectedIds = entries.filter((entry) => entry.result === "unexpected").map((entry) => Number(entry.item_id));
    const missingIds = expectedIds.filter((id) => !scannedIds.includes(id));
    const [matched, unexpected, missing] = await Promise.all([this.items.getByIds(matchedIds), this.items.getByIds(unexpectedIds), this.items.getByIds(missingIds)]);
    return { id: Number(row.id), locationId: Number(row.location_id), status: row.status, expectedCount: Number(row.expected_count), scannedCount: Number(row.scanned_count), matched, unexpected, missing };
  }
}
