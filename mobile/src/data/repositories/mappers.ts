import type { Item, ItemPhoto, ItemSale, LocationSummary, SyncStatus } from "../../domain/models";

export type Row = Record<string, unknown>;

export function text(value: unknown): string {
  return value == null ? "" : String(value);
}

export function nullableText(value: unknown): string | null {
  return value == null || value === "" ? null : String(value);
}

export function numberValue(value: unknown): number {
  return Number(value ?? 0);
}

export function booleanValue(value: unknown): boolean {
  return Number(value ?? 0) === 1;
}

export function jsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(text(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

export function jsonObject(value: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function mapLocation(row: Row, prefix = ""): LocationSummary {
  const value = (name: string) => row[`${prefix}${name}`];
  return {
    id: numberValue(value("id")),
    stableId: text(value("stable_id")),
    code: text(value("code")),
    machineCode: text(value("machine_code")),
    name: text(value("name")),
    type: text(value("type")) as LocationSummary["type"],
    precisionMode: text(value("precision_mode")) as LocationSummary["precisionMode"],
    status: text(value("status")) as LocationSummary["status"],
    notes: text(value("notes")),
    favorite: booleanValue(value("favorite")),
    isSystem: booleanValue(value("is_system")),
    itemCount: numberValue(value("item_count")),
    totalValue: Number(value("total_value") ?? 0).toFixed(2),
    lastUsedAt: nullableText(value("last_used_at")),
    createdAt: text(value("created_at")),
    updatedAt: text(value("updated_at")),
    syncStatus: text(value("sync_status")) as SyncStatus,
  };
}

export function mapPhoto(row: Row): ItemPhoto {
  return {
    id: numberValue(row.id),
    stableId: text(row.stable_id),
    itemId: numberValue(row.item_id),
    uri: text(row.uri),
    fileName: text(row.file_name),
    mimeType: text(row.mime_type),
    altText: text(row.alt_text),
    sortOrder: numberValue(row.sort_order),
    isPrimary: booleanValue(row.is_primary),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    syncStatus: text(row.sync_status) as SyncStatus,
  };
}

export function mapItemSale(row: Row): ItemSale {
  const quantity = Math.max(1, numberValue(row.quantity));
  const restoredQuantity = Math.min(quantity, Math.max(0, numberValue(row.restored_quantity)));
  return {
    id: numberValue(row.id),
    stableId: text(row.stable_id),
    itemId: numberValue(row.item_id),
    quantity,
    restoredQuantity,
    restorableQuantity: quantity - restoredQuantity,
    soldPrice: nullableText(row.sold_price),
    soldAt: text(row.sold_at),
    locationId: row.location_id == null ? null : numberValue(row.location_id),
    createdAt: text(row.created_at),
  };
}

export function mapItem(row: Row, photos: ItemPhoto[]): Item {
  const hasLocation = row.location_id != null && !booleanValue(row.location_is_system);
  const quantity = Math.max(1, numberValue(row.quantity ?? 1));
  const soldQuantity = Math.min(quantity, Math.max(0, numberValue(row.sold_quantity)));
  return {
    id: numberValue(row.id),
    stableId: text(row.stable_id),
    code: text(row.code),
    machineCode: text(row.machine_code),
    status: text(row.status) as Item["status"],
    price: text(row.price),
    quantity,
    soldQuantity,
    availableQuantity: quantity - soldQuantity,
    soldPrice: nullableText(row.sold_price),
    description: text(row.description),
    tags: jsonArray(row.tags_json),
    currentLocationId: hasLocation ? numberValue(row.current_location_id) : null,
    currentLocation: hasLocation ? mapLocation(row, "location_") : null,
    lastLocationId: row.last_location_id == null ? null : numberValue(row.last_location_id),
    soldAt: nullableText(row.sold_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    syncStatus: text(row.sync_status) as SyncStatus,
    photos,
  };
}

export const ITEM_SELECT = `
  SELECT i.*,
    l.id AS location_id, l.stable_id AS location_stable_id, l.code AS location_code,
    l.machine_code AS location_machine_code, l.name AS location_name, l.type AS location_type,
    l.precision_mode AS location_precision_mode, l.status AS location_status, l.notes AS location_notes,
    l.favorite AS location_favorite, l.is_system AS location_is_system, l.last_used_at AS location_last_used_at,
    l.created_at AS location_created_at, l.updated_at AS location_updated_at, l.sync_status AS location_sync_status,
    0 AS location_item_count, 0 AS location_total_value
  FROM items i LEFT JOIN locations l ON l.id = i.current_location_id
`;

export const LOCATION_SELECT = `
  SELECT l.*,
    SUM(CASE WHEN i.status = 'active' THEN i.quantity - i.sold_quantity ELSE 0 END) AS item_count,
    SUM(CASE WHEN i.status = 'active' THEN (i.quantity - i.sold_quantity) * CAST(i.price AS REAL) ELSE 0 END) AS total_value
  FROM locations l LEFT JOIN items i ON i.current_location_id = l.id
`;
