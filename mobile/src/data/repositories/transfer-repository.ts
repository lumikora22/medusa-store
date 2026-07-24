import { DomainError } from "../../domain/errors";
import type { Item, TransferResult } from "../../domain/models";
import { getDatabase, inTransaction } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { ItemRepository } from "./item-repository";
import { LocationRepository } from "./location-repository";
import { jsonObject, type Row } from "./mappers";

const UNDO_WINDOW_MS = 5 * 60 * 1000;

export class TransferRepository {
  constructor(private readonly items = new ItemRepository(), private readonly locations = new LocationRepository()) {}

  async move(itemIds: number[], destinationId: number): Promise<TransferResult> {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length !== itemIds.length) throw new DomainError("La selección contiene prendas repetidas.", "duplicate_item");
    if (uniqueIds.length === 0) throw new DomainError("Seleccione al menos una prenda.", "empty_transfer");
    const destination = await this.locations.getById(destinationId);
    if (destination.status !== "active") throw new DomainError("La ubicación destino no está activa.", "inactive_location");
    const database = await getDatabase();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS).toISOString();
    let batchId = 0;
    await inTransaction(database, async (transaction) => {
      const placeholders = uniqueIds.map(() => "?").join(",");
      const rows = await transaction.getAllAsync<{ id: number; code: string; status: string; current_location_id: number | null }>(
        `SELECT id, code, status, current_location_id FROM items WHERE id IN (${placeholders})`, ...uniqueIds,
      );
      if (rows.length !== uniqueIds.length) throw new DomainError("Una o más prendas ya no existen.", "item_not_found");
      const sold = rows.find((row) => row.status === "sold");
      if (sold) throw new DomainError(`La prenda ${sold.code} está vendida y no se puede mover.`, "sold_item_move");
      const alreadyThere = rows.find((row) => row.current_location_id === destinationId);
      if (alreadyThere) throw new DomainError(`La prenda ${alreadyThere.code} ya está en el destino.`, "already_in_destination");
      const batch = await transaction.runAsync(
        "INSERT INTO transfer_batches(stable_id, destination_location_id, status, item_count, created_at, undo_expires_at) VALUES (?, ?, 'completed', ?, ?, ?)",
        `PENDING-BATCH-${Date.now()}`, destinationId, rows.length, now.toISOString(), expiresAt,
      );
      batchId = Number(batch.lastInsertRowId);
      await transaction.runAsync("UPDATE transfer_batches SET stable_id = ? WHERE id = ?", `BATCH-${String(batchId).padStart(6, "0")}`, batchId);
      for (const row of rows) {
        const fromLocationId = row.current_location_id ?? -1;
        await transaction.runAsync("UPDATE items SET current_location_id = ?, last_location_id = ?, container_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?", destinationId, destinationId, destinationId, now.toISOString(), row.id);
        await transaction.runAsync("INSERT INTO inventory_movements(item_id, movement_type, from_container_id, to_container_id, created_at) VALUES (?, 'moved', ?, ?, ?)", row.id, fromLocationId, destinationId, now.toISOString());
        await insertEvent(transaction, {
          stableId: `EVENT-BATCH-${batchId}-ITEM-${row.id}`,
          type: "batch_moved",
          itemId: row.id,
          locationId: destinationId,
          batchId,
          summary: `${row.code} movida a ${destination.code}`,
          payload: { fromLocationId, toLocationId: destinationId },
          createdAt: now.toISOString(),
        });
      }
      await transaction.runAsync("UPDATE locations SET last_used_at = ?, updated_at = ? WHERE id = ?", now.toISOString(), now.toISOString(), destinationId);
    });
    return { batchId, destination, movedItems: await this.items.getByIds(uniqueIds), expiresAt };
  }

  async undo(batchId: number): Promise<Item[]> {
    const database = await getDatabase();
    const batch = await database.getFirstAsync<{ status: string; destination_location_id: number; undo_expires_at: string }>("SELECT status, destination_location_id, undo_expires_at FROM transfer_batches WHERE id = ?", batchId);
    if (!batch) throw new DomainError("No encontramos el traslado.", "batch_not_found", 404);
    if (batch.status === "undone") throw new DomainError("Este traslado ya fue deshecho.", "batch_already_undone");
    if (Date.now() > new Date(batch.undo_expires_at).getTime()) throw new DomainError("El tiempo para deshacer este traslado terminó.", "undo_expired");
    const eventRows = await database.getAllAsync<Row>("SELECT * FROM inventory_events WHERE batch_id = ? AND event_type = 'batch_moved' ORDER BY id", batchId);
    const now = new Date().toISOString();
    const restoredIds: number[] = [];
    await inTransaction(database, async (transaction) => {
      for (const eventRow of eventRows) {
        const itemId = Number(eventRow.item_id);
        const payload = jsonObject(eventRow.payload_json);
        const fromLocationId = Number(payload.fromLocationId ?? -1);
        const item = await transaction.getFirstAsync<{ code: string; status: string; current_location_id: number }>("SELECT code, status, current_location_id FROM items WHERE id = ?", itemId);
        if (!item || item.status !== "active" || item.current_location_id !== batch.destination_location_id) {
          throw new DomainError("No se puede deshacer porque una prenda cambió después del traslado.", "undo_conflict");
        }
        await transaction.runAsync("UPDATE items SET current_location_id = ?, last_location_id = ?, container_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?", fromLocationId, fromLocationId, fromLocationId, now, itemId);
        await transaction.runAsync("INSERT INTO inventory_movements(item_id, movement_type, from_container_id, to_container_id, created_at) VALUES (?, 'moved', ?, ?, ?)", itemId, batch.destination_location_id, fromLocationId, now);
        await insertEvent(transaction, {
          stableId: `EVENT-BATCH-${batchId}-UNDO-${itemId}`,
          type: "batch_undone",
          itemId,
          locationId: fromLocationId,
          batchId,
          reverseOfEventId: Number(eventRow.id),
          summary: `Traslado de ${item.code} deshecho`,
          payload: { fromLocationId: batch.destination_location_id, toLocationId: fromLocationId },
          createdAt: now,
        });
        restoredIds.push(itemId);
      }
      await transaction.runAsync("UPDATE transfer_batches SET status = 'undone', undone_at = ? WHERE id = ?", now, batchId);
    });
    return this.items.getByIds(restoredIds);
  }
}
