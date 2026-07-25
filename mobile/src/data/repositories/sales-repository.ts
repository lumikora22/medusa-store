import { normalizeMoney } from "../../domain/codes";
import { DomainError } from "../../domain/errors";
import type { Item, ItemSale, MultiSaleResult } from "../../domain/models";
import { getDatabase, inTransaction, type DatabaseClient } from "../sqlite/database";
import { insertEvent, uniqueStableId } from "./event-repository";
import { ItemRepository } from "./item-repository";
import { mapItemSale, type Row } from "./mappers";

export type SellInput = { quantity?: number; soldPrice?: string; soldAt?: string };

type ItemRow = { id: number; code: string; status: string; quantity: number; sold_quantity: number; current_location_id: number | null; last_location_id: number | null };
type SaleRow = { id: number; quantity: number; restored_quantity: number; sold_price: string | null; sold_at: string };

function pieces(value: number | undefined, fallback = 1): number {
  const quantity = value ?? fallback;
  if (!Number.isInteger(quantity) || quantity < 1) throw new DomainError("La cantidad debe ser un número entero de al menos 1 pieza.", "invalid_quantity");
  return quantity;
}

export class SalesRepository {
  constructor(private readonly items = new ItemRepository()) {}

  async sell(itemId: number, input: SellInput = {}): Promise<Item> {
    return (await this.sellMany([itemId], input)).soldItems[0];
  }

  /** Sells `quantity` pieces of every listed record. All records succeed or none is touched. */
  async sellMany(itemIds: number[], input: SellInput = {}): Promise<MultiSaleResult> {
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) throw new DomainError("Seleccione al menos una prenda.", "empty_sale");
    if (uniqueIds.length !== itemIds.length) throw new DomainError("La selección contiene prendas repetidas.", "duplicate_item");
    const quantity = pieces(input.quantity);
    const database = await getDatabase();
    const soldAt = input.soldAt ? new Date(input.soldAt).toISOString() : new Date().toISOString();
    const soldPrice = input.soldPrice?.trim() ? normalizeMoney(input.soldPrice) : null;

    await inTransaction(database, async (transaction) => {
      const rows = await this.lockRows(transaction, uniqueIds);
      const archived = rows.find((row) => row.status === "archived");
      if (archived) throw new DomainError(`La prenda ${archived.code} está archivada. No se registró ninguna venta.`, "item_not_available");
      const short = rows.find((row) => row.quantity - row.sold_quantity < quantity);
      if (short) {
        const available = short.quantity - short.sold_quantity;
        throw new DomainError(
          `La prenda ${short.code} solo tiene ${available} ${available === 1 ? "pieza disponible" : "piezas disponibles"}. No se registró ninguna venta.`,
          "insufficient_pieces",
        );
      }

      for (const row of rows) {
        const locationId = row.current_location_id ?? -1;
        const remaining = row.quantity - row.sold_quantity - quantity;
        await transaction.runAsync(
          `UPDATE items SET sold_quantity = sold_quantity + ?, status = CASE WHEN ? = 0 THEN 'sold' ELSE 'active' END,
             sold_price = ?, sold_at = ?, last_location_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?`,
          quantity, remaining, soldPrice, soldAt, locationId, soldAt, row.id,
        );
        await transaction.runAsync(
          "INSERT INTO item_sales(stable_id, item_id, quantity, restored_quantity, sold_price, sold_at, location_id, created_at) VALUES (?, ?, ?, 0, ?, ?, ?, ?)",
          uniqueStableId(`SALE-${row.id}`), row.id, quantity, soldPrice, soldAt, locationId, soldAt,
        );
        await transaction.runAsync("INSERT INTO inventory_movements(item_id, movement_type, from_container_id, created_at) VALUES (?, 'sold', ?, ?)", row.id, locationId, soldAt);
        await insertEvent(transaction, {
          stableId: `EVENT-ITEM-${row.id}-SOLD-${soldAt}`,
          type: "item_sold", itemId: row.id, locationId,
          summary: quantity === 1 ? `Prenda ${row.code} vendida` : `${quantity} piezas de ${row.code} vendidas`,
          payload: { quantity, remaining, soldPrice, soldAt, lastLocationId: locationId }, createdAt: soldAt,
        });
      }
    });
    return { soldItems: await this.items.getByIds(uniqueIds), soldAt };
  }

  /** Restores the most recent sale of the record, or `quantity` pieces walking history backwards. */
  async restore(itemId: number, reason: string, quantity?: number): Promise<Item> {
    return (await this.restoreMany([itemId], reason, quantity))[0];
  }

  async restoreMany(itemIds: number[], reason: string, quantity?: number): Promise<Item[]> {
    if (reason.trim().length < 4) throw new DomainError("Explique brevemente por qué se restaura la venta.", "restore_reason_required");
    const uniqueIds = [...new Set(itemIds)];
    if (uniqueIds.length === 0) throw new DomainError("Seleccione al menos una prenda.", "empty_restore");
    if (uniqueIds.length !== itemIds.length) throw new DomainError("La selección contiene prendas repetidas.", "duplicate_item");
    if (quantity !== undefined) pieces(quantity);
    const database = await getDatabase();
    const now = new Date().toISOString();

    await inTransaction(database, async (transaction) => {
      const rows = await this.lockRows(transaction, uniqueIds);
      const plans = new Map<number, { row: ItemRow; total: number; sales: SaleRow[] }>();
      for (const row of rows) {
        const sales = await transaction.getAllAsync<SaleRow>(
          "SELECT id, quantity, restored_quantity, sold_price, sold_at FROM item_sales WHERE item_id = ? AND restored_quantity < quantity ORDER BY sold_at DESC, id DESC",
          row.id,
        );
        if (sales.length === 0) throw new DomainError(`La prenda ${row.code} no está vendida. No se restauró ninguna venta.`, "not_sold");
        // No explicit quantity means "undo the last sale", which is what the history shows.
        const target = quantity ?? sales[0].quantity - sales[0].restored_quantity;
        const restorable = sales.reduce((total, sale) => total + sale.quantity - sale.restored_quantity, 0);
        if (target > restorable) {
          throw new DomainError(`La prenda ${row.code} solo tiene ${restorable} ${restorable === 1 ? "pieza vendida" : "piezas vendidas"}. No se restauró ninguna venta.`, "insufficient_sold_pieces");
        }
        plans.set(row.id, { row, total: target, sales });
      }

      for (const { row, total, sales } of plans.values()) {
        let pending = total;
        for (const sale of sales) {
          if (pending === 0) break;
          const take = Math.min(pending, sale.quantity - sale.restored_quantity);
          await transaction.runAsync("UPDATE item_sales SET restored_quantity = restored_quantity + ? WHERE id = ?", take, sale.id);
          pending -= take;
        }
        const wasFullySold = row.sold_quantity >= row.quantity;
        const targetLocationId = row.last_location_id ?? row.current_location_id ?? -1;
        await transaction.runAsync(
          `UPDATE items SET sold_quantity = sold_quantity - ?, status = 'active',
             current_location_id = CASE WHEN ? = 1 THEN ? ELSE current_location_id END,
             container_id = CASE WHEN ? = 1 THEN ? ELSE container_id END,
             updated_at = ?, sync_status = 'pending' WHERE id = ?`,
          total, wasFullySold ? 1 : 0, targetLocationId, wasFullySold ? 1 : 0, targetLocationId, now, row.id,
        );
        await this.refreshSaleSummary(transaction, row.id);
        await insertEvent(transaction, {
          stableId: `EVENT-ITEM-${row.id}-RESTORE-${now}`, type: "sale_restored", itemId: row.id, locationId: targetLocationId,
          summary: total === 1 ? `Venta de ${row.code} restaurada` : `${total} piezas de ${row.code} restauradas`,
          payload: { reason, quantity: total }, createdAt: now,
        });
      }
    });
    return this.items.getByIds(uniqueIds);
  }

  async salesOf(itemId: number): Promise<ItemSale[]> {
    const database = await getDatabase();
    const rows = await database.getAllAsync<Row>("SELECT * FROM item_sales WHERE item_id = ? ORDER BY sold_at DESC, id DESC", itemId);
    return rows.map(mapItemSale);
  }

  private async lockRows(transaction: DatabaseClient, ids: number[]): Promise<ItemRow[]> {
    const placeholders = ids.map(() => "?").join(",");
    const rows = await transaction.getAllAsync<ItemRow>(
      `SELECT id, code, status, quantity, sold_quantity, current_location_id, last_location_id FROM items WHERE id IN (${placeholders}) ORDER BY id`,
      ...ids,
    );
    if (rows.length !== ids.length) throw new DomainError("Una o más prendas ya no existen.", "item_not_found");
    return rows;
  }

  /** Keeps the item's displayed sale price and date pointing at its most recent open sale. */
  private async refreshSaleSummary(transaction: DatabaseClient, itemId: number): Promise<void> {
    const latest = await transaction.getFirstAsync<{ sold_price: string | null; sold_at: string }>(
      "SELECT sold_price, sold_at FROM item_sales WHERE item_id = ? AND restored_quantity < quantity ORDER BY sold_at DESC, id DESC LIMIT 1",
      itemId,
    );
    await transaction.runAsync("UPDATE items SET sold_price = ?, sold_at = ? WHERE id = ?", latest?.sold_price ?? null, latest?.sold_at ?? null, itemId);
  }
}
