import type { EntityId, HistoryFilters, InventoryEvent } from "../../domain/models";
import { getDatabase, type DatabaseClient } from "../sqlite/database";
import { jsonObject, nullableText, numberValue, type Row, text } from "./mappers";

type EventInput = {
  stableId: string;
  type: InventoryEvent["type"];
  itemId?: EntityId | null;
  locationId?: EntityId | null;
  batchId?: EntityId | null;
  reverseOfEventId?: EntityId | null;
  summary: string;
  payload?: Record<string, unknown>;
  createdAt?: string;
};

let eventSequence = 0;

/**
 * Events are append-only and their `stable_id` is a unique sync token, never a
 * business key. Deriving it from a business timestamp (e.g. a date-only sold_at)
 * lets the same entity collide when the action repeats — selling an item, undoing,
 * and selling again on the same day. We always append a monotonic + random suffix
 * so uniqueness never depends on the caller's semantic prefix.
 */
export function uniqueStableId(base: string): string {
  eventSequence = (eventSequence + 1) % 0x1000000;
  const stamp = Date.now().toString(36);
  const seq = eventSequence.toString(36);
  const rand = Math.floor(Math.random() * 0x1000000).toString(36);
  return `${base}-${stamp}${seq}${rand}`;
}

export async function insertEvent(transaction: DatabaseClient, input: EventInput): Promise<number> {
  const result = await transaction.runAsync(
    `INSERT INTO inventory_events
      (stable_id, event_type, item_id, location_id, batch_id, reverse_of_event_id, summary, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uniqueStableId(input.stableId),
    input.type,
    input.itemId ?? null,
    input.locationId ?? null,
    input.batchId ?? null,
    input.reverseOfEventId ?? null,
    input.summary,
    JSON.stringify(input.payload ?? {}),
    input.createdAt ?? new Date().toISOString(),
  );
  return Number(result.lastInsertRowId);
}

function mapEvent(row: Row): InventoryEvent {
  const payload = jsonObject(row.payload_json);
  if (row.from_location_code) payload.fromLocationCode = text(row.from_location_code);
  if (row.to_location_code) payload.toLocationCode = text(row.to_location_code);
  return {
    id: numberValue(row.id),
    stableId: text(row.stable_id),
    type: text(row.event_type) as InventoryEvent["type"],
    itemId: row.item_id == null ? null : numberValue(row.item_id),
    itemCode: nullableText(row.item_code),
    locationId: row.location_id == null ? null : numberValue(row.location_id),
    locationCode: nullableText(row.location_code),
    batchId: row.batch_id == null ? null : numberValue(row.batch_id),
    reverseOfEventId: row.reverse_of_event_id == null ? null : numberValue(row.reverse_of_event_id),
    summary: text(row.summary),
    payload,
    createdAt: text(row.created_at),
  };
}

export class EventRepository {
  async list(filters: HistoryFilters = {}, limit = 100): Promise<InventoryEvent[]> {
    const database = await getDatabase();
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    if (filters.itemId != null) { conditions.push("e.item_id = ?"); values.push(filters.itemId); }
    if (filters.originLocationId != null) { conditions.push("CAST(json_extract(e.payload_json, '$.fromLocationId') AS INTEGER) = ?"); values.push(filters.originLocationId); }
    if (filters.destinationLocationId != null) { conditions.push("CAST(json_extract(e.payload_json, '$.toLocationId') AS INTEGER) = ?"); values.push(filters.destinationLocationId); }
    if (filters.type) { conditions.push("e.event_type = ?"); values.push(filters.type); }
    if (filters.from) { conditions.push("e.created_at >= ?"); values.push(`${filters.from}T00:00:00.000Z`); }
    if (filters.to) { conditions.push("e.created_at <= ?"); values.push(`${filters.to}T23:59:59.999Z`); }
    if (filters.search?.trim()) {
      conditions.push("(e.summary LIKE ? OR i.code LIKE ? OR l.code LIKE ?)");
      const query = `%${filters.search.trim()}%`;
      values.push(query, query, query);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = await database.getAllAsync<Row>(`
      SELECT e.*, i.code AS item_code, l.code AS location_code,
        from_l.code AS from_location_code, to_l.code AS to_location_code
      FROM inventory_events e
      LEFT JOIN items i ON i.id = e.item_id
      LEFT JOIN locations l ON l.id = e.location_id
      LEFT JOIN locations from_l ON from_l.id = CAST(json_extract(e.payload_json, '$.fromLocationId') AS INTEGER)
      LEFT JOIN locations to_l ON to_l.id = CAST(json_extract(e.payload_json, '$.toLocationId') AS INTEGER)
      ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ?
    `, ...values, limit);
    return rows.map(mapEvent);
  }
}
