import type * as SQLite from "expo-sqlite";

import { DomainError } from "../../domain/errors";
import type { ItemPhoto } from "../../domain/models";
import { getDatabase, inTransaction } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { mapPhoto, type Row } from "./mappers";

type AddPhotoRecord = { stableId: string; itemId: number; uri: string; fileName: string; mimeType: string; altText: string };

export class PhotoRepository {
  async add(input: AddPhotoRecord): Promise<ItemPhoto> {
    const database = await getDatabase();
    const now = new Date().toISOString();
    let photoId = 0;
    await inTransaction(database, async (transaction) => {
      const item = await transaction.getFirstAsync<{ code: string }>("SELECT code FROM items WHERE id = ?", input.itemId);
      if (!item) throw new DomainError("No encontramos la prenda.", "item_not_found", 404);
      const order = await transaction.getFirstAsync<{ next_order: number }>("SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM item_photos WHERE item_id = ?", input.itemId);
      const count = await transaction.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM item_photos WHERE item_id = ?", input.itemId);
      const result = await transaction.runAsync(
        `INSERT INTO item_photos
          (item_id, uri, file_name, mime_type, alt_text, created_at, stable_id, sort_order, is_primary, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        input.itemId, input.uri, input.fileName, input.mimeType, input.altText, now, input.stableId, order?.next_order ?? 1, Number(count?.count ?? 0) === 0 ? 1 : 0, now,
      );
      photoId = Number(result.lastInsertRowId);
      await transaction.runAsync("UPDATE items SET primary_photo_id = CASE WHEN ? = 0 THEN ? ELSE primary_photo_id END, updated_at = ?, sync_status = 'pending' WHERE id = ?", Number(count?.count ?? 0), photoId, now, input.itemId);
      await insertEvent(transaction, { stableId: `EVENT-PHOTO-${photoId}-ADD`, type: "photo_added", itemId: input.itemId, summary: `Foto agregada a ${item.code}`, payload: { photoId, uri: input.uri }, createdAt: now });
    });
    const row = await database.getFirstAsync<Row>("SELECT * FROM item_photos WHERE id = ?", photoId);
    if (!row) throw new DomainError("No pudimos guardar la foto.", "photo_write_failed");
    return mapPhoto(row);
  }

  async remove(photoId: number): Promise<ItemPhoto> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<Row>("SELECT * FROM item_photos WHERE id = ?", photoId);
    if (!row) throw new DomainError("No encontramos la foto.", "photo_not_found", 404);
    const photo = mapPhoto(row);
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      const primary = await transaction.getFirstAsync<{ id: number }>("SELECT id FROM item_photos WHERE item_id = ? AND id <> ? ORDER BY sort_order, id LIMIT 1", photo.itemId, photoId);
      await transaction.runAsync("UPDATE items SET primary_photo_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?", photo.isPrimary ? primary?.id ?? null : (await transaction.getFirstAsync<{ primary_photo_id: number | null }>("SELECT primary_photo_id FROM items WHERE id = ?", photo.itemId))?.primary_photo_id ?? null, now, photo.itemId);
      await transaction.runAsync("DELETE FROM item_photos WHERE id = ?", photoId);
      if (photo.isPrimary && primary) await transaction.runAsync("UPDATE item_photos SET is_primary = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE item_id = ?", primary.id, photo.itemId);
      await insertEvent(transaction, { stableId: `EVENT-PHOTO-${photoId}-REMOVE-${Date.now()}`, type: "photo_removed", itemId: photo.itemId, summary: "Foto eliminada", payload: { photoId, uri: photo.uri }, createdAt: now });
    });
    return photo;
  }

  async reorder(itemId: number, orderedIds: number[], primaryId: number): Promise<void> {
    if (!orderedIds.includes(primaryId)) throw new DomainError("Seleccione una foto principal válida.", "invalid_primary_photo");
    const database = await getDatabase();
    const rows = await database.getAllAsync<{ id: number }>("SELECT id FROM item_photos WHERE item_id = ?", itemId);
    const actual = rows.map((row) => row.id).sort((a, b) => a - b);
    const proposed = [...orderedIds].sort((a, b) => a - b);
    if (actual.length !== proposed.length || actual.some((id, index) => id !== proposed[index])) throw new DomainError("La lista de fotos cambió. Actualice e intente de nuevo.", "photo_order_conflict");
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      for (let index = 0; index < orderedIds.length; index += 1) {
        await transaction.runAsync("UPDATE item_photos SET sort_order = ?, is_primary = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?", index + 1, orderedIds[index] === primaryId ? 1 : 0, now, orderedIds[index]);
      }
      await transaction.runAsync("UPDATE items SET primary_photo_id = ?, updated_at = ?, sync_status = 'pending' WHERE id = ?", primaryId, now, itemId);
      await insertEvent(transaction, { stableId: `EVENT-PHOTOS-${itemId}-ORDER-${Date.now()}`, type: "photos_reordered", itemId, summary: "Fotos reordenadas", payload: { orderedIds, primaryId }, createdAt: now });
    });
  }
}
