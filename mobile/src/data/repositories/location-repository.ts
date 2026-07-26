import { assertValidCode, generatedLocationCode, stableLocationCode } from "../../domain/codes";
import { DomainError } from "../../domain/errors";
import type { CreateLocationInput, LocationSummary, UpdateLocationInput } from "../../domain/models";
import { getDatabase, inTransaction, type DatabaseClient } from "../sqlite/database";
import { insertEvent } from "./event-repository";
import { LOCATION_SELECT, mapLocation, type Row } from "./mappers";

function legacyType(type: CreateLocationInput["type"]): "box" | "bag" | "other" {
  return type === "box" || type === "bag" ? type : "other";
}

async function assertCodeAvailable(database: DatabaseClient, code: string, entityId?: number): Promise<void> {
  const owner = await database.getFirstAsync<{ entity_type: string; entity_id: number }>("SELECT entity_type, entity_id FROM code_registry WHERE value = ? COLLATE NOCASE", code);
  if (owner && (owner.entity_type !== "location" || owner.entity_id !== entityId)) throw new DomainError("Ese código ya identifica otra prenda o ubicación.", "code_in_use");
}

export class LocationRepository {
  async list(options: { search?: string; includeArchived?: boolean; includeSystem?: boolean; favoritesFirst?: boolean } = {}): Promise<LocationSummary[]> {
    const database = await getDatabase();
    const conditions = [options.includeSystem ? "1 = 1" : "l.is_system = 0"];
    const values: string[] = [];
    if (!options.includeArchived) conditions.push("l.status = 'active'");
    if (options.search?.trim()) {
      conditions.push("(l.code LIKE ? OR l.name LIKE ? OR l.notes LIKE ? OR l.type LIKE ?)");
      const query = `%${options.search.trim()}%`;
      values.push(query, query, query, query);
    }
    const order = options.favoritesFirst ? "l.favorite DESC, l.last_used_at DESC, l.code" : "l.favorite DESC, l.code";
    const rows = await database.getAllAsync<Row>(`${LOCATION_SELECT} WHERE ${conditions.join(" AND ")} GROUP BY l.id ORDER BY ${order}`, ...values);
    return rows.map((row) => mapLocation(row));
  }

  async getById(id: number): Promise<LocationSummary> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<Row>(`${LOCATION_SELECT} WHERE l.id = ? GROUP BY l.id`, id);
    if (!row) throw new DomainError("No encontramos la ubicación.", "location_not_found", 404);
    return mapLocation(row);
  }

  async create(input: CreateLocationInput): Promise<LocationSummary> {
    const database = await getDatabase();
    const now = new Date().toISOString();
    let createdId = 0;
    await inTransaction(database, async (transaction) => {
      const temporary = `PENDING-LOC-${Date.now()}`;
      if (input.code) await assertCodeAvailable(transaction, assertValidCode(input.code));
      const legacy = await transaction.runAsync(
        "INSERT INTO containers (code, qr_value, type, status, notes, created_at) VALUES (?, ?, ?, 'active', ?, ?)",
        temporary,
        temporary,
        legacyType(input.type),
        input.notes,
        now,
      );
      createdId = Number(legacy.lastInsertRowId);
      const stableId = stableLocationCode(createdId);
      const code = input.code ? assertValidCode(input.code) : generatedLocationCode(input.type, createdId);
      await assertCodeAvailable(transaction, code);
      await assertCodeAvailable(transaction, stableId);
      await transaction.runAsync("UPDATE containers SET code = ?, qr_value = ?, type = ?, notes = ? WHERE id = ?", code, stableId, legacyType(input.type), input.notes, createdId);
      await transaction.runAsync(
        `INSERT INTO locations
          (id, stable_id, code, machine_code, legacy_qr_value, name, type, precision_mode, status, notes, favorite, is_system, created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, 0, 0, ?, ?, 'pending')`,
        createdId, stableId, code, stableId, stableId, input.name.trim() || code, input.type, input.precisionMode, input.notes, now, now,
      );
      await transaction.runAsync("INSERT INTO code_registry(value, entity_type, entity_id, kind) VALUES (?, 'location', ?, 'display'), (?, 'location', ?, 'machine')", code, createdId, stableId, createdId);
      await insertEvent(transaction, { stableId: `EVENT-${stableId}-CREATED`, type: "location_created", locationId: createdId, summary: `Ubicación ${code} creada`, payload: { name: input.name, type: input.type }, createdAt: now });
    });
    return this.getById(createdId);
  }

  async update(id: number, input: UpdateLocationInput): Promise<LocationSummary> {
    const database = await getDatabase();
    const current = await this.getById(id);
    if (current.isSystem) throw new DomainError("La ubicación del sistema no se puede editar.", "system_location");
    const now = new Date().toISOString();
    await inTransaction(database, async (transaction) => {
      const fields: string[] = [];
      const values: Array<string | number> = [];
      if (input.code !== undefined) {
        const code = assertValidCode(input.code);
        await assertCodeAvailable(transaction, code, id);
        await transaction.runAsync("DELETE FROM code_registry WHERE entity_type = 'location' AND entity_id = ? AND kind = 'display'", id);
        await transaction.runAsync("INSERT INTO code_registry(value, entity_type, entity_id, kind) VALUES (?, 'location', ?, 'display')", code, id);
        fields.push("code = ?"); values.push(code);
        await transaction.runAsync("UPDATE containers SET code = ? WHERE id = ?", code, id);
      }
      if (input.name !== undefined) { fields.push("name = ?"); values.push(input.name.trim()); }
      if (input.type !== undefined) { fields.push("type = ?"); values.push(input.type); await transaction.runAsync("UPDATE containers SET type = ? WHERE id = ?", legacyType(input.type), id); }
      if (input.precisionMode !== undefined) { fields.push("precision_mode = ?"); values.push(input.precisionMode); }
      if (input.notes !== undefined) { fields.push("notes = ?"); values.push(input.notes); await transaction.runAsync("UPDATE containers SET notes = ? WHERE id = ?", input.notes, id); }
      if (input.status !== undefined) { fields.push("status = ?"); values.push(input.status); await transaction.runAsync("UPDATE containers SET status = ? WHERE id = ?", input.status, id); }
      if (input.favorite !== undefined) { fields.push("favorite = ?"); values.push(input.favorite ? 1 : 0); }
      fields.push("updated_at = ?", "sync_status = 'pending'"); values.push(now);
      await transaction.runAsync(`UPDATE locations SET ${fields.join(", ")} WHERE id = ?`, ...values, id);
      await insertEvent(transaction, { stableId: `EVENT-LOC-${id}-${Date.now()}`, type: "location_updated", locationId: id, summary: `Ubicación ${current.code} actualizada`, payload: input, createdAt: now });
    });
    return this.getById(id);
  }

  /**
   * Removes a container the user no longer wants.
   *
   * A container still holding pieces is refused outright: emptying it is the user's call,
   * never a silent side effect. Once empty, the row is only really deleted when nothing
   * else points at it. Transfers, counts and past garments keep foreign keys into
   * `locations`, so anything with history is archived instead — it disappears from the
   * lists either way, but the record behind old events survives.
   */
  async remove(id: number): Promise<"deleted" | "archived"> {
    if (id < 0) throw new DomainError("La ubicación del sistema no se puede eliminar.", "system_location");
    const database = await getDatabase();
    const location = await this.getById(id);
    const now = new Date().toISOString();
    let outcome: "deleted" | "archived" = "deleted";

    await inTransaction(database, async (transaction) => {
      const held = await transaction.getFirstAsync<{ total: number }>(
        "SELECT COUNT(*) AS total FROM items WHERE current_location_id = ? AND status = 'active' AND quantity - sold_quantity > 0", id,
      );
      if (Number(held?.total ?? 0) > 0) {
        throw new DomainError(`${location.name} todavía tiene prendas. Muévalas o véndalas antes de eliminar el contenedor.`, "location_not_empty");
      }
      const referenced = await transaction.getFirstAsync<{ total: number }>(
        `SELECT
           (SELECT COUNT(*) FROM items WHERE current_location_id = ? OR last_location_id = ? OR container_id = ?) +
           (SELECT COUNT(*) FROM transfer_batches WHERE destination_location_id = ?) +
           (SELECT COUNT(*) FROM physical_counts WHERE location_id = ?) AS total`,
        id, id, id, id, id,
      );
      outcome = Number(referenced?.total ?? 0) > 0 ? "archived" : "deleted";

      if (outcome === "archived") {
        await transaction.runAsync("UPDATE locations SET status = 'archived', updated_at = ?, sync_status = 'pending' WHERE id = ?", now, id);
      } else {
        await transaction.runAsync("DELETE FROM code_registry WHERE entity_type = 'location' AND entity_id = ?", id);
        await transaction.runAsync("DELETE FROM locations WHERE id = ?", id);
        await transaction.runAsync("DELETE FROM containers WHERE id = ?", id);
      }
      await insertEvent(transaction, {
        stableId: `EVENT-LOCATION-${id}-REMOVED`, type: "location_removed", locationId: outcome === "archived" ? id : null,
        summary: `Ubicación ${location.code} eliminada`, payload: { name: location.name, code: location.code, outcome }, createdAt: now,
      });
    });
    return outcome;
  }

  async touch(id: number): Promise<void> {
    const database = await getDatabase();
    await database.runAsync("UPDATE locations SET last_used_at = ? WHERE id = ?", new Date().toISOString(), id);
  }
}
