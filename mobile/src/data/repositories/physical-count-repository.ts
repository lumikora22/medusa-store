import { DomainError } from "../../domain/errors";
import type { PhysicalCountLine, PhysicalCountResult } from "../../domain/models";
import { getDatabase, inTransaction } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { ItemRepository } from "./item-repository";

type CountRow = { id: number; location_id: number; status: PhysicalCountResult["status"]; expected_count: number; scanned_count: number; expected_ids_json: string; expected_pieces_json: string };
type EntryRow = { item_id: number; quantity: number };

export type ScanOutcome = "matched" | "unexpected";

/**
 * Expected pieces per record, frozen when the count starts.
 *
 * Counts opened before v5 only froze a list of ids, so those fall back to one piece each —
 * which is exactly what they meant when every record was a single garment.
 */
function expectedPieces(row: CountRow): Map<number, number> {
  const map = new Map<number, number>();
  try {
    const parsed = JSON.parse(row.expected_pieces_json || "{}") as Record<string, number>;
    for (const [id, pieces] of Object.entries(parsed)) map.set(Number(id), Number(pieces));
  } catch { /* Falls back to the legacy id list below. */ }
  if (map.size === 0) {
    try {
      for (const id of JSON.parse(row.expected_ids_json || "[]") as number[]) map.set(Number(id), 1);
    } catch { /* An unreadable snapshot leaves the count with nothing expected. */ }
  }
  return map;
}

export class PhysicalCountRepository {
  constructor(private readonly items = new ItemRepository()) {}

  async start(locationId: number): Promise<PhysicalCountResult> {
    const database = await getDatabase();
    const open = await database.getFirstAsync<CountRow>("SELECT * FROM physical_counts WHERE location_id = ? AND status = 'open'", locationId);
    if (open) return this.map(open);
    const expectedRows = await database.getAllAsync<{ id: number; pieces: number }>(
      "SELECT id, quantity - sold_quantity AS pieces FROM items WHERE current_location_id = ? AND status = 'active' AND quantity - sold_quantity > 0 ORDER BY id",
      locationId,
    );
    const pieces: Record<string, number> = {};
    let expectedCount = 0;
    for (const row of expectedRows) { pieces[String(row.id)] = Number(row.pieces); expectedCount += Number(row.pieces); }
    const now = new Date().toISOString();
    let countId = 0;
    await inTransaction(database, async (transaction) => {
      const result = await transaction.runAsync(
        "INSERT INTO physical_counts(stable_id, location_id, status, expected_count, scanned_count, created_at, expected_ids_json, expected_pieces_json) VALUES (?, ?, 'open', ?, 0, ?, ?, ?)",
        `COUNT-${locationId}-${Date.now()}`, locationId, expectedCount, now, JSON.stringify(expectedRows.map((row) => Number(row.id))), JSON.stringify(pieces),
      );
      countId = Number(result.lastInsertRowId);
      await insertEvent(transaction, { stableId: `EVENT-COUNT-${countId}-START`, type: "physical_count_started", locationId, summary: "Conteo físico iniciado", payload: { expectedCount }, createdAt: now });
    });
    return this.get(countId);
  }

  /**
   * Records one read. Reads beyond the pieces expected here are reported as extras rather
   * than swallowed as duplicates, because a count that hides a real surplus is worse than
   * one that shows a mistake the operator can see and undo.
   */
  async scan(countId: number, itemId: number): Promise<ScanOutcome> {
    const database = await getDatabase();
    const count = await database.getFirstAsync<CountRow>("SELECT * FROM physical_counts WHERE id = ?", countId);
    if (!count || count.status !== "open") throw new DomainError("El conteo no está activo.", "count_not_open");
    const item = await database.getFirstAsync<{ id: number }>("SELECT id FROM items WHERE id = ? AND status = 'active'", itemId);
    if (!item) throw new DomainError("No encontramos una prenda disponible con ese código.", "item_not_found", 404);

    const expected = expectedPieces(count).get(itemId) ?? 0;
    const entry = await database.getFirstAsync<{ id: number; quantity: number }>("SELECT id, quantity FROM physical_count_entries WHERE count_id = ? AND item_id = ?", countId, itemId);
    const alreadyScanned = entry ? Number(entry.quantity) : 0;
    const result: ScanOutcome = alreadyScanned < expected ? "matched" : "unexpected";

    await inTransaction(database, async (transaction) => {
      if (entry) await transaction.runAsync("UPDATE physical_count_entries SET quantity = quantity + 1, result = ?, scanned_at = ? WHERE id = ?", result, new Date().toISOString(), entry.id);
      else await transaction.runAsync("INSERT INTO physical_count_entries(count_id, item_id, result, quantity, scanned_at) VALUES (?, ?, ?, 1, ?)", countId, itemId, result, new Date().toISOString());
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
        payload: { matched: current.matchedPieces, unexpected: current.unexpectedPieces, missing: current.missingPieces }, createdAt: now,
      });
    });
    return this.get(countId);
  }

  private async map(row: CountRow): Promise<PhysicalCountResult> {
    const database = await getDatabase();
    const expected = expectedPieces(row);
    const entries = await database.getAllAsync<EntryRow>("SELECT item_id, quantity FROM physical_count_entries WHERE count_id = ? ORDER BY id", row.id);

    const matchedBy = new Map<number, number>();
    const unexpectedBy = new Map<number, number>();
    for (const entry of entries) {
      const itemId = Number(entry.item_id);
      const scanned = Number(entry.quantity);
      const counted = Math.min(scanned, expected.get(itemId) ?? 0);
      if (counted > 0) matchedBy.set(itemId, counted);
      if (scanned > counted) unexpectedBy.set(itemId, scanned - counted);
    }
    const missingBy = new Map<number, number>();
    for (const [itemId, pieces] of expected) {
      const short = pieces - (matchedBy.get(itemId) ?? 0);
      if (short > 0) missingBy.set(itemId, short);
    }

    const [matched, unexpected, missing] = await Promise.all([this.lines(matchedBy), this.lines(unexpectedBy), this.lines(missingBy)]);
    const total = (lines: PhysicalCountLine[]) => lines.reduce((sum, line) => sum + line.pieces, 0);
    return {
      id: Number(row.id), locationId: Number(row.location_id), status: row.status,
      expectedCount: Number(row.expected_count), scannedCount: Number(row.scanned_count),
      matchedPieces: total(matched), unexpectedPieces: total(unexpected), missingPieces: total(missing),
      matched, unexpected, missing,
    };
  }

  private async lines(pieces: Map<number, number>): Promise<PhysicalCountLine[]> {
    if (pieces.size === 0) return [];
    const items = await this.items.getByIds([...pieces.keys()]);
    return items.map((item) => ({ item, pieces: pieces.get(item.id) ?? 0 }));
  }
}
