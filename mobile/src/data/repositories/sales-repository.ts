import { normalizeMoney } from "../../domain/codes";
import { DomainError } from "../../domain/errors";
import type { Item, MultiSaleResult } from "../../domain/models";
import { getDatabase, inTransaction } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { ItemRepository } from "./item-repository";

export class SalesRepository {
  constructor(private readonly items = new ItemRepository()) {}

  async sell(itemId: number, input: { soldPrice?: string; soldAt?: string }): Promise<Item> {
    return (await this.sellMany([itemId], input)).soldItems[0];
  }

  async sellMany(itemIds: number[], input: { soldPrice?: string; soldAt?: string } = {}): Promise<MultiSaleResult> {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) throw new DomainError("Seleccione al menos una prenda.", "empty_sale");
    if (uniqueIds.length !== itemIds.length) throw new DomainError("La selección contiene prendas repetidas.", "duplicate_item");
    const database = await getDatabase();
    const soldAt = input.soldAt ? new Date(input.soldAt).toISOString() : new Date().toISOString();
    const soldPrice = input.soldPrice?.trim() ? normalizeMoney(input.soldPrice) : null;
    await inTransaction(database, async (transaction) => {
      const placeholders = uniqueIds.map(() => "?").join(",");
      const rows = await transaction.getAllAsync<{ id: number; code: string; status: string; current_location_id: number | null }>(
        `SELECT id, code, status, current_location_id FROM items WHERE id IN (${placeholders}) ORDER BY id`, ...uniqueIds,
      );
      if (rows.length !== uniqueIds.length) throw new DomainError("Una o más prendas ya no existen.", "item_not_found");
      const unavailable = rows.find((row) => row.status !== "active");
      if (unavailable) throw new DomainError(`La prenda ${unavailable.code} no está disponible para vender. No se registró ninguna venta.`, "item_not_available");
      for (const row of rows) {
        const locationId = row.current_location_id ?? -1;
        await transaction.runAsync(
          "UPDATE items SET status = 'sold', sold_price = ?, sold_at = ?, last_location_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?",
          soldPrice, soldAt, locationId, soldAt, row.id,
        );
        await transaction.runAsync("INSERT INTO inventory_movements(item_id, movement_type, from_container_id, created_at) VALUES (?, 'sold', ?, ?)", row.id, locationId, soldAt);
        await insertEvent(transaction, {
          stableId: `EVENT-ITEM-${row.id}-SOLD-${soldAt}`,
          type: "item_sold", itemId: row.id, locationId,
          summary: `Prenda ${row.code} vendida`, payload: { soldPrice, soldAt, lastLocationId: locationId }, createdAt: soldAt,
        });
      }
    });
    return { soldItems: await this.items.getByIds(uniqueIds), soldAt };
  }

  async restore(itemId: number, reason: string): Promise<Item> {
    return (await this.restoreMany([itemId], reason))[0];
  }

  async restoreMany(itemIds: number[], reason: string): Promise<Item[]> {
    if (reason.trim().length < 4) throw new DomainError("Explique brevemente por qué se restaura la venta.", "restore_reason_required");
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) throw new DomainError("Seleccione al menos una prenda.", "empty_restore");
    if (uniqueIds.length !== itemIds.length) throw new DomainError("La selección contiene prendas repetidas.", "duplicate_item");
    const database = await getDatabase();
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      const placeholders = uniqueIds.map(() => "?").join(",");
      const rows = await transaction.getAllAsync<{ id: number; code: string; status: string; last_location_id: number | null; sold_at: string | null; sold_price: string | null }>(
        `SELECT id, code, status, last_location_id, sold_at, sold_price FROM items WHERE id IN (${placeholders}) ORDER BY id`, ...uniqueIds,
      );
      if (rows.length !== uniqueIds.length) throw new DomainError("Una o más prendas ya no existen.", "item_not_found");
      const notSold = rows.find((row) => row.status !== "sold");
      if (notSold) throw new DomainError(`La prenda ${notSold.code} no está vendida. No se restauró ninguna venta.`, "not_sold");
      for (const [index, row] of rows.entries()) {
        const targetLocationId = row.last_location_id ?? -1;
        await transaction.runAsync(
          "UPDATE items SET status = 'active', sold_price = NULL, sold_at = NULL, current_location_id = ?, container_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?",
          targetLocationId, targetLocationId, now, row.id,
        );
        await insertEvent(transaction, {
          stableId: `EVENT-ITEM-${row.id}-RESTORE-${now}-${index}`, type: "sale_restored", itemId: row.id, locationId: targetLocationId,
          summary: `Venta de ${row.code} restaurada`, payload: { reason, previousSoldAt: row.sold_at, previousSoldPrice: row.sold_price }, createdAt: now,
        });
      }
    });
    return this.items.getByIds(uniqueIds);
  }
}
