import { assertValidCode, generatedItemCode, normalizeMoney, stableItemCode } from "../../domain/codes";
import { DomainError } from "../../domain/errors";
import type { CatalogFilters, CreateItemInput, DashboardSummary, Item, Page, UpdateItemInput } from "../../domain/models";
import { getDatabase, inTransaction, type DatabaseClient } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { ITEM_SELECT, mapItem, mapPhoto, type Row } from "./mappers";

const PAGE_SIZE = 30;

function assertPieces(value: number | undefined): number {
  const quantity = value ?? 1;
  if (!Number.isInteger(quantity) || quantity < 1) throw new DomainError("La cantidad de piezas debe ser un número entero de al menos 1.", "invalid_quantity");
  return quantity;
}

async function photosForItems(database: DatabaseClient, itemIds: number[]): Promise<Map<number, ReturnType<typeof mapPhoto>[]>> {
  const result = new Map<number, ReturnType<typeof mapPhoto>[]>();
  if (itemIds.length === 0) return result;
  const placeholders = itemIds.map(() => "?").join(",");
  const rows = await database.getAllAsync<Row>(
    `SELECT * FROM item_photos WHERE item_id IN (${placeholders}) ORDER BY item_id, is_primary DESC, sort_order, id`,
    ...itemIds,
  );
  for (const row of rows) {
    const photo = mapPhoto(row);
    const current = result.get(photo.itemId) ?? [];
    current.push(photo);
    result.set(photo.itemId, current);
  }
  return result;
}

async function mapItems(database: DatabaseClient, rows: Row[]): Promise<Item[]> {
  const photos = await photosForItems(database, rows.map((row) => Number(row.id)));
  return rows.map((row) => mapItem(row, photos.get(Number(row.id)) ?? []));
}

async function assertCodeAvailable(database: DatabaseClient, code: string, entityId?: number): Promise<void> {
  const owner = await database.getFirstAsync<{ entity_type: string; entity_id: number }>("SELECT entity_type, entity_id FROM code_registry WHERE value = ? COLLATE NOCASE", code);
  if (owner && (owner.entity_type !== "item" || owner.entity_id !== entityId)) {
    throw new DomainError("Ese código ya identifica otra prenda o ubicación.", "code_in_use");
  }
}

function catalogWhere(filters: CatalogFilters): { clause: string; values: Array<string | number> } {
  const conditions: string[] = [];
  const values: Array<string | number> = [];
  if (filters.status !== "all") { conditions.push("i.status = ?"); values.push(filters.status); }
  if (filters.unassignedOnly) conditions.push("(i.current_location_id IS NULL OR l.is_system = 1)");
  if (filters.photo === "with") conditions.push("EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = i.id)");
  if (filters.photo === "without") conditions.push("NOT EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = i.id)");
  if (filters.locationId != null) { conditions.push("i.current_location_id = ?"); values.push(filters.locationId); }
  if (filters.locationType) { conditions.push("l.type = ?"); values.push(filters.locationType); }
  if (filters.search.trim()) {
    const query = `%${filters.search.trim()}%`;
    conditions.push("(i.code LIKE ? OR i.description LIKE ? OR i.tags_json LIKE ? OR CAST(i.price AS TEXT) LIKE ? OR l.code LIKE ? OR l.name LIKE ?)");
    values.push(query, query, query, query, query, query);
  }
  return { clause: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", values };
}

function catalogOrder(sort: CatalogFilters["sort"]): string {
  switch (sort) {
    case "updated": return "i.updated_at DESC, i.id DESC";
    case "price-asc": return "CAST(i.price AS REAL) ASC, i.id DESC";
    case "price-desc": return "CAST(i.price AS REAL) DESC, i.id DESC";
    case "code": return "i.code COLLATE NOCASE ASC, i.id DESC";
    default: return "i.created_at DESC, i.id DESC";
  }
}

export class ItemRepository {
  async getById(id: number): Promise<Item> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<Row>(`${ITEM_SELECT} WHERE i.id = ?`, id);
    if (!row) throw new DomainError("No encontramos la prenda.", "item_not_found", 404);
    return (await mapItems(database, [row]))[0];
  }

  async list(filters: CatalogFilters, offset = 0, pageSize = PAGE_SIZE): Promise<Page<Item>> {
    const database = await getDatabase();
    const where = catalogWhere(filters);
    const count = await database.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total FROM items i LEFT JOIN locations l ON l.id = i.current_location_id ${where.clause}`,
      ...where.values,
    );
    const rows = await database.getAllAsync<Row>(
      `${ITEM_SELECT} ${where.clause} ORDER BY ${catalogOrder(filters.sort)} LIMIT ? OFFSET ?`,
      ...where.values,
      pageSize,
      offset,
    );
    const total = Number(count?.total ?? 0);
    return { results: await mapItems(database, rows), total, nextOffset: offset + pageSize < total ? offset + pageSize : null };
  }

  async getByIds(ids: number[]): Promise<Item[]> {
    if (ids.length === 0) return [];
    const database = await getDatabase();
    const placeholders = ids.map(() => "?").join(",");
    const rows = await database.getAllAsync<Row>(`${ITEM_SELECT} WHERE i.id IN (${placeholders}) ORDER BY i.code`, ...ids);
    return mapItems(database, rows);
  }

  async listByLocation(locationId: number, search = ""): Promise<Item[]> {
    const database = await getDatabase();
    const query = `%${search.trim()}%`;
    const rows = await database.getAllAsync<Row>(
      `${ITEM_SELECT} WHERE i.current_location_id = ? AND i.status = 'active' AND (? = '%%' OR i.code LIKE ? OR i.description LIKE ?) ORDER BY i.updated_at DESC`,
      locationId, query, query, query,
    );
    return mapItems(database, rows);
  }

  async create(input: CreateItemInput): Promise<Item> {
    const database = await getDatabase();
    const now = new Date().toISOString();
    let itemId = 0;
    await inTransaction(database, async (transaction) => {
      const locationId = input.locationId ?? -1;
      const location = await transaction.getFirstAsync<{ id: number }>("SELECT id FROM locations WHERE id = ? AND status = 'active'", locationId);
      if (!location) throw new DomainError("La ubicación seleccionada no está disponible.", "location_not_found");
      const placeholder = `PENDING-ITEM-${Date.now()}`;
      const result = await transaction.runAsync(
        `INSERT INTO items
          (code, qr_value, container_id, status, price, description, tags_json, quantity, sold_at, created_at, updated_at, current_location_id, last_location_id, sync_status)
         VALUES (?, ?, ?, 'active', ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'pending')`,
        placeholder, placeholder, locationId, normalizeMoney(input.price), input.description.trim(), JSON.stringify(input.tags), assertPieces(input.quantity), now, now, locationId, locationId,
      );
      itemId = Number(result.lastInsertRowId);
      const stableId = stableItemCode(itemId);
      const code = input.code ? assertValidCode(input.code) : generatedItemCode(itemId);
      await assertCodeAvailable(transaction, code);
      await assertCodeAvailable(transaction, stableId);
      await transaction.runAsync("UPDATE items SET code = ?, qr_value = ?, stable_id = ?, machine_code = ? WHERE id = ?", code, stableId, stableId, stableId, itemId);
      await transaction.runAsync("INSERT INTO code_registry(value, entity_type, entity_id, kind) VALUES (?, 'item', ?, 'display'), (?, 'item', ?, 'machine')", code, itemId, stableId, itemId);
      await transaction.runAsync("UPDATE locations SET last_used_at = ? WHERE id = ?", now, locationId);
      await insertEvent(transaction, { stableId: `EVENT-${stableId}-CREATED`, type: "item_created", itemId, locationId, summary: `Prenda ${code} creada`, payload: { price: normalizeMoney(input.price), tags: input.tags }, createdAt: now });
    });
    return this.getById(itemId);
  }

  async update(id: number, input: UpdateItemInput): Promise<Item> {
    const database = await getDatabase();
    const current = await this.getById(id);
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      const fields: string[] = [];
      const values: Array<string | number | null> = [];
      if (input.code !== undefined) {
        const code = assertValidCode(input.code);
        await assertCodeAvailable(transaction, code, id);
        await transaction.runAsync("DELETE FROM code_registry WHERE entity_type = 'item' AND entity_id = ? AND kind = 'display'", id);
        await transaction.runAsync("INSERT INTO code_registry(value, entity_type, entity_id, kind) VALUES (?, 'item', ?, 'display')", code, id);
        fields.push("code = ?"); values.push(code);
      }
      if (input.quantity !== undefined) {
        const quantity = assertPieces(input.quantity);
        if (quantity < current.soldQuantity) {
          throw new DomainError(`La prenda ya tiene ${current.soldQuantity} ${current.soldQuantity === 1 ? "pieza vendida" : "piezas vendidas"}. Restaure ventas antes de reducir la cantidad.`, "quantity_below_sold");
        }
        fields.push("quantity = ?", "status = CASE WHEN status = 'archived' THEN 'archived' WHEN ? > sold_quantity THEN 'active' ELSE 'sold' END");
        values.push(quantity, quantity);
      }
      if (input.price !== undefined) { fields.push("price = ?"); values.push(normalizeMoney(input.price)); }
      if (input.description !== undefined) { fields.push("description = ?"); values.push(input.description.trim()); }
      if (input.tags !== undefined) { fields.push("tags_json = ?"); values.push(JSON.stringify(input.tags)); }
      if (input.locationId !== undefined) {
        if (current.status === "sold") throw new DomainError("Una prenda vendida no se puede mover.", "sold_item_move");
        const targetId = input.locationId ?? -1;
        const location = await transaction.getFirstAsync<{ id: number }>("SELECT id FROM locations WHERE id = ? AND status = 'active'", targetId);
        if (!location) throw new DomainError("La ubicación seleccionada no está disponible.", "location_not_found");
        fields.push("current_location_id = ?", "last_location_id = ?", "container_id = ?"); values.push(targetId, targetId, targetId);
        if ((current.currentLocationId ?? -1) !== targetId) {
          await insertEvent(transaction, { stableId: `EVENT-ITEM-${id}-MOVE-${Date.now()}`, type: "item_moved", itemId: id, locationId: targetId, summary: `Prenda ${current.code} movida`, payload: { fromLocationId: current.currentLocationId ?? -1, toLocationId: targetId }, createdAt: now });
        }
      }
      fields.push("updated_at = ?", "sync_status = 'pending'"); values.push(now);
      await transaction.runAsync(`UPDATE items SET ${fields.join(", ")} WHERE id = ?`, ...values, id);
      await insertEvent(transaction, { stableId: `EVENT-ITEM-${id}-EDIT-${Date.now()}`, type: "item_updated", itemId: id, locationId: input.locationId ?? current.currentLocationId, summary: `Prenda ${current.code} actualizada`, payload: input, createdAt: now });
    });
    return this.getById(id);
  }

  /** Brings an archived record back; it lands available or sold depending on its pieces. */
  async unarchive(id: number): Promise<Item> {
    const database = await getDatabase();
    const current = await this.getById(id);
    if (current.status !== "archived") throw new DomainError("La prenda no está archivada.", "item_not_archived");
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      await transaction.runAsync(
        "UPDATE items SET status = CASE WHEN sold_quantity >= quantity THEN 'sold' ELSE 'active' END, updated_at = ?, sync_status = 'pending' WHERE id = ?",
        now, id,
      );
      await insertEvent(transaction, { stableId: `EVENT-ITEM-${id}-UNARCHIVE-${Date.now()}`, type: "item_unarchived", itemId: id, locationId: current.currentLocationId, summary: `Prenda ${current.code} restaurada del archivo`, createdAt: now });
    });
    return this.getById(id);
  }

  async archive(id: number): Promise<Item> {
    const database = await getDatabase();
    const current = await this.getById(id);
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      await transaction.runAsync("UPDATE items SET status = 'archived', updated_at = ?, sync_status = 'pending' WHERE id = ?", now, id);
      await insertEvent(transaction, { stableId: `EVENT-ITEM-${id}-ARCHIVE-${Date.now()}`, type: "item_archived", itemId: id, locationId: current.currentLocationId, summary: `Prenda ${current.code} archivada`, createdAt: now });
    });
    return this.getById(id);
  }

  async dashboard(): Promise<DashboardSummary> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<Record<string, number>>(`
      SELECT
        SUM(CASE WHEN status <> 'archived' THEN quantity - sold_quantity ELSE 0 END) AS active_count,
        SUM(CASE WHEN status <> 'archived' THEN sold_quantity ELSE 0 END) AS sold_count,
        SUM(CASE WHEN status <> 'archived' THEN (quantity - sold_quantity) * CAST(price AS REAL) ELSE 0 END) AS active_value,
        SUM(CASE WHEN status <> 'archived' THEN sold_quantity * CAST(COALESCE(sold_price, price) AS REAL) ELSE 0 END) AS sold_value,
        SUM(CASE WHEN status = 'active' AND (current_location_id IS NULL OR current_location_id = -1) THEN 1 ELSE 0 END) AS unassigned_count,
        SUM(CASE WHEN status = 'active' AND NOT EXISTS (SELECT 1 FROM item_photos p WHERE p.item_id = items.id) THEN 1 ELSE 0 END) AS without_photo_count
      FROM items
    `);
    const locations = await database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM locations WHERE status = 'active' AND is_system = 0");
    return {
      activeCount: Number(row?.active_count ?? 0), soldCount: Number(row?.sold_count ?? 0), locationCount: Number(locations?.count ?? 0),
      activeValue: Number(row?.active_value ?? 0).toFixed(2), soldValue: Number(row?.sold_value ?? 0).toFixed(2),
      unassignedCount: Number(row?.unassigned_count ?? 0), withoutPhotoCount: Number(row?.without_photo_count ?? 0),
    };
  }
}
