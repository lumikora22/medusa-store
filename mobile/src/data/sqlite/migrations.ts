import { DomainError } from "../../domain/errors";
import { getDatabase, inTransaction, type DatabaseClient } from "./database";

export const DATABASE_VERSION = 5;
type SafetySnapshot = (database: DatabaseClient, label: string) => Promise<string | null>;
const noSafetySnapshot: SafetySnapshot = async () => null;

export const V1_SCHEMA = `
  CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, qr_value TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('box','bag','other')), status TEXT NOT NULL DEFAULT 'active', notes TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL UNIQUE, qr_value TEXT NOT NULL UNIQUE,
    container_id INTEGER NOT NULL REFERENCES containers(id), status TEXT NOT NULL DEFAULT 'active', price TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '', tags_json TEXT NOT NULL DEFAULT '[]', sold_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS item_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    uri TEXT NOT NULL, file_name TEXT NOT NULL, mime_type TEXT NOT NULL, alt_text TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS inventory_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    movement_type TEXT NOT NULL CHECK(movement_type IN ('created','moved','sold')), from_container_id INTEGER REFERENCES containers(id),
    to_container_id INTEGER REFERENCES containers(id), created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
  CREATE INDEX IF NOT EXISTS idx_items_container ON items(container_id);
  CREATE INDEX IF NOT EXISTS idx_items_search ON items(code, description);
`;

export const V2_TABLES = [
  "locations",
  "code_registry",
  "inventory_events",
  "transfer_batches",
  "app_settings",
  "backup_history",
  "physical_counts",
  "physical_count_entries",
] as const;

type ColumnRow = { name: string };
type CollisionRow = { value: string; owners: string };

function now(): string {
  return new Date().toISOString();
}

async function hasColumn(database: DatabaseClient, table: string, column: string): Promise<boolean> {
  const rows = await database.getAllAsync<ColumnRow>(`PRAGMA table_info(${table})`);
  return rows.some((row) => row.name === column);
}

async function addColumn(database: DatabaseClient, table: string, column: string, definition: string): Promise<void> {
  if (!(await hasColumn(database, table, column))) {
    await database.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function findLegacyCodeCollisions(database: DatabaseClient): Promise<CollisionRow[]> {
  return database.getAllAsync<CollisionRow>(`
    WITH aliases(value, owner) AS (
      SELECT UPPER(code), 'item:' || id FROM items
      UNION ALL SELECT UPPER(qr_value), 'item:' || id FROM items
      UNION ALL SELECT UPPER(printf('MSI-%06d', id)), 'item:' || id FROM items
      UNION ALL SELECT UPPER(code), 'location:' || id FROM containers
      UNION ALL SELECT UPPER(qr_value), 'location:' || id FROM containers
      UNION ALL SELECT UPPER(printf('LOC-%06d', id)), 'location:' || id FROM containers WHERE id >= 0
      UNION ALL SELECT 'LOC-UNASSIGNED', 'location:-1'
    )
    SELECT value, GROUP_CONCAT(DISTINCT owner) AS owners
    FROM aliases
    WHERE value <> ''
    GROUP BY value
    HAVING COUNT(DISTINCT owner) > 1
    ORDER BY value
  `);
}

async function applyV1(database: DatabaseClient): Promise<void> {
  await inTransaction(database, async (transaction) => {
    await transaction.execAsync(V1_SCHEMA);
    await transaction.runAsync("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (1, ?)", now());
  });
}

async function applyV2(database: DatabaseClient, safetySnapshot: SafetySnapshot): Promise<void> {
  const collisions = await findLegacyCodeCollisions(database);
  if (collisions.length > 0) {
    const details = collisions.slice(0, 5).map((collision) => `${collision.value} (${collision.owners})`).join(", ");
    throw new DomainError(`La migración se detuvo porque hay códigos ambiguos: ${details}. Corrija los códigos antes de continuar.`, "migration_code_collision");
  }

  await safetySnapshot(database, "before-v2");

  await inTransaction(database, async (transaction) => {
    const timestamp = now();
    await transaction.runAsync(
      "INSERT OR IGNORE INTO containers (id, code, qr_value, type, status, notes, created_at) VALUES (-1, 'LOC-UNASSIGNED', 'LOC-UNASSIGNED', 'other', 'active', 'Ubicación del sistema: Sin asignar / En transición', ?)",
      timestamp,
    );

    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY, stable_id TEXT NOT NULL UNIQUE, code TEXT NOT NULL UNIQUE COLLATE NOCASE,
        machine_code TEXT NOT NULL UNIQUE COLLATE NOCASE, legacy_qr_value TEXT,
        name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('box','bag','rack','shelf','display','transition','other')),
        precision_mode TEXT NOT NULL CHECK(precision_mode IN ('strict','flexible')),
        status TEXT NOT NULL CHECK(status IN ('active','archived')) DEFAULT 'active', notes TEXT NOT NULL DEFAULT '',
        favorite INTEGER NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0, last_used_at TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sync_status TEXT NOT NULL DEFAULT 'local'
      );
      CREATE TABLE IF NOT EXISTS code_registry (
        value TEXT PRIMARY KEY COLLATE NOCASE, entity_type TEXT NOT NULL CHECK(entity_type IN ('item','location')),
        entity_id INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('display','machine','legacy'))
      );
      CREATE TABLE IF NOT EXISTS transfer_batches (
        id INTEGER PRIMARY KEY AUTOINCREMENT, stable_id TEXT NOT NULL UNIQUE, destination_location_id INTEGER NOT NULL REFERENCES locations(id),
        status TEXT NOT NULL CHECK(status IN ('completed','undone')), item_count INTEGER NOT NULL,
        created_at TEXT NOT NULL, undo_expires_at TEXT NOT NULL, undone_at TEXT
      );
      CREATE TABLE IF NOT EXISTS inventory_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, stable_id TEXT NOT NULL UNIQUE, event_type TEXT NOT NULL,
        item_id INTEGER, location_id INTEGER, batch_id INTEGER REFERENCES transfer_batches(id), reverse_of_event_id INTEGER,
        summary TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', legacy_movement_id INTEGER UNIQUE, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS backup_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, stable_id TEXT NOT NULL UNIQUE, file_uri TEXT NOT NULL,
        checksum TEXT NOT NULL, item_count INTEGER NOT NULL, location_count INTEGER NOT NULL, photo_count INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('created','restored','failed')), created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS physical_counts (
        id INTEGER PRIMARY KEY AUTOINCREMENT, stable_id TEXT NOT NULL UNIQUE, location_id INTEGER NOT NULL REFERENCES locations(id),
        status TEXT NOT NULL CHECK(status IN ('open','completed','cancelled')), expected_count INTEGER NOT NULL,
        scanned_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, completed_at TEXT
      );
      CREATE TABLE IF NOT EXISTS physical_count_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, count_id INTEGER NOT NULL REFERENCES physical_counts(id) ON DELETE CASCADE,
        item_id INTEGER NOT NULL, result TEXT NOT NULL CHECK(result IN ('matched','unexpected','duplicate')), scanned_at TEXT NOT NULL,
        UNIQUE(count_id, item_id)
      );
    `);

    await addColumn(transaction, "items", "stable_id", "TEXT");
    await addColumn(transaction, "items", "machine_code", "TEXT");
    await addColumn(transaction, "items", "current_location_id", "INTEGER REFERENCES locations(id)");
    await addColumn(transaction, "items", "last_location_id", "INTEGER REFERENCES locations(id)");
    await addColumn(transaction, "items", "sold_price", "TEXT");
    await addColumn(transaction, "items", "primary_photo_id", "INTEGER REFERENCES item_photos(id)");
    await addColumn(transaction, "items", "sync_status", "TEXT NOT NULL DEFAULT 'local'");
    await addColumn(transaction, "item_photos", "stable_id", "TEXT");
    await addColumn(transaction, "item_photos", "sort_order", "INTEGER NOT NULL DEFAULT 0");
    await addColumn(transaction, "item_photos", "is_primary", "INTEGER NOT NULL DEFAULT 0");
    await addColumn(transaction, "item_photos", "updated_at", "TEXT");
    await addColumn(transaction, "item_photos", "sync_status", "TEXT NOT NULL DEFAULT 'local'");

    await transaction.execAsync(`
      INSERT OR IGNORE INTO locations (
        id, stable_id, code, machine_code, legacy_qr_value, name, type, precision_mode, status, notes,
        favorite, is_system, created_at, updated_at, sync_status
      )
      SELECT id,
        CASE WHEN id = -1 THEN 'LOC-UNASSIGNED' ELSE printf('LOC-%06d', id) END,
        code,
        CASE WHEN id = -1 THEN 'LOC-UNASSIGNED' ELSE printf('LOC-%06d', id) END,
        qr_value,
        CASE WHEN id = -1 THEN 'Sin asignar / En transición' ELSE code END,
        CASE WHEN id = -1 THEN 'transition' ELSE type END,
        CASE WHEN type IN ('box','bag') THEN 'strict' ELSE 'flexible' END,
        CASE WHEN status = 'archived' THEN 'archived' ELSE 'active' END,
        notes, 0, CASE WHEN id = -1 THEN 1 ELSE 0 END, created_at, created_at, 'local'
      FROM containers;

      UPDATE items SET
        stable_id = COALESCE(stable_id, printf('MSI-%06d', id)),
        machine_code = COALESCE(machine_code, printf('MSI-%06d', id)),
        current_location_id = COALESCE(current_location_id, container_id),
        last_location_id = COALESCE(last_location_id, container_id),
        sync_status = COALESCE(sync_status, 'local');

      UPDATE item_photos SET
        stable_id = COALESCE(stable_id, printf('PHOTO-%06d', id)),
        sort_order = CASE WHEN sort_order = 0 THEN id ELSE sort_order END,
        is_primary = CASE WHEN id = (SELECT MIN(p2.id) FROM item_photos p2 WHERE p2.item_id = item_photos.item_id) THEN 1 ELSE is_primary END,
        updated_at = COALESCE(updated_at, created_at),
        sync_status = COALESCE(sync_status, 'local');

      UPDATE items SET primary_photo_id = (
        SELECT p.id FROM item_photos p
        WHERE p.item_id = items.id AND p.is_primary = 1
        ORDER BY p.sort_order, p.id LIMIT 1
      );

      INSERT OR IGNORE INTO code_registry(value, entity_type, entity_id, kind) SELECT code, 'item', id, 'display' FROM items;
      INSERT OR IGNORE INTO code_registry(value, entity_type, entity_id, kind) SELECT stable_id, 'item', id, 'machine' FROM items;
      INSERT OR IGNORE INTO code_registry(value, entity_type, entity_id, kind) SELECT qr_value, 'item', id, 'legacy' FROM items WHERE qr_value <> code AND qr_value <> stable_id;
      INSERT OR IGNORE INTO code_registry(value, entity_type, entity_id, kind) SELECT code, 'location', id, 'display' FROM locations;
      INSERT OR IGNORE INTO code_registry(value, entity_type, entity_id, kind) SELECT stable_id, 'location', id, 'machine' FROM locations;
      INSERT OR IGNORE INTO code_registry(value, entity_type, entity_id, kind) SELECT legacy_qr_value, 'location', id, 'legacy' FROM locations WHERE legacy_qr_value IS NOT NULL AND legacy_qr_value <> code AND legacy_qr_value <> stable_id;

      INSERT OR IGNORE INTO inventory_events (
        id, stable_id, event_type, item_id, location_id, summary, payload_json, legacy_movement_id, created_at
      )
      SELECT id, printf('EVENT-LEGACY-%06d', id),
        CASE movement_type WHEN 'created' THEN 'item_created' WHEN 'moved' THEN 'item_moved' ELSE 'item_sold' END,
        item_id, COALESCE(to_container_id, from_container_id),
        CASE movement_type WHEN 'created' THEN 'Prenda creada' WHEN 'moved' THEN 'Prenda movida' ELSE 'Prenda vendida' END,
        json_object('fromLocationId', from_container_id, 'toLocationId', to_container_id, 'legacy', 1), id, created_at
      FROM inventory_movements;

      INSERT OR IGNORE INTO app_settings(key, value_json, updated_at) VALUES
        ('backupReminderDays', '7', '${timestamp}'),
        ('largeInterface', 'false', '${timestamp}'),
        ('scanSound', 'true', '${timestamp}');

      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_stable_id ON items(stable_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_items_machine_code ON items(machine_code);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_photos_stable_id ON item_photos(stable_id);
      CREATE INDEX IF NOT EXISTS idx_items_current_location ON items(current_location_id);
      CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at);
      CREATE INDEX IF NOT EXISTS idx_events_created_at ON inventory_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_events_item ON inventory_events(item_id);
      CREATE INDEX IF NOT EXISTS idx_events_location ON inventory_events(location_id);
      CREATE TRIGGER IF NOT EXISTS inventory_events_no_update BEFORE UPDATE ON inventory_events BEGIN SELECT RAISE(ABORT, 'inventory_events are immutable'); END;
      CREATE TRIGGER IF NOT EXISTS inventory_events_no_delete BEFORE DELETE ON inventory_events BEGIN SELECT RAISE(ABORT, 'inventory_events are immutable'); END;
    `);
    await transaction.runAsync("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (2, ?)", timestamp);
    await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

async function applyV3(database: DatabaseClient, safetySnapshot: SafetySnapshot): Promise<void> {
  await safetySnapshot(database, "before-v3");
  await inTransaction(database, async (transaction) => {
    const timestamp = now();
    await addColumn(transaction, "physical_counts", "expected_ids_json", "TEXT NOT NULL DEFAULT '[]'");
    await transaction.execAsync(`
      UPDATE item_photos SET is_primary = CASE
        WHEN id = (SELECT p2.id FROM item_photos p2 WHERE p2.item_id = item_photos.item_id ORDER BY p2.is_primary DESC, p2.sort_order, p2.id LIMIT 1) THEN 1
        ELSE 0
      END;
      UPDATE items SET primary_photo_id = (
        SELECT p.id FROM item_photos p WHERE p.item_id = items.id AND p.is_primary = 1 ORDER BY p.sort_order, p.id LIMIT 1
      );
    `);
    await transaction.runAsync("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (3, ?)", timestamp);
    await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

/**
 * Rebuilds the piece counters from the sales history.
 *
 * Shared by migration v4 and by backup restore, so the invariant
 * `sold_quantity = SUM(quantity - restored_quantity)` has exactly one definition. Restoring
 * a pre-v4 backup lands items with no sales rows, and this rebuilds them from item status.
 */
export async function reconcilePieceCounters(database: DatabaseClient): Promise<void> {
  await database.execAsync(`
    INSERT OR IGNORE INTO item_sales (stable_id, item_id, quantity, restored_quantity, sold_price, sold_at, location_id, created_at)
    SELECT printf('SALE-LEGACY-%06d', i.id), i.id, 1, 0, i.sold_price,
      COALESCE(i.sold_at, i.updated_at, i.created_at),
      COALESCE(i.last_location_id, i.current_location_id, -1),
      COALESCE(i.sold_at, i.updated_at, i.created_at)
    FROM items i
    WHERE i.status = 'sold' AND NOT EXISTS (SELECT 1 FROM item_sales s WHERE s.item_id = i.id);

    UPDATE items SET quantity = 1 WHERE quantity < 1;
    UPDATE items SET sold_quantity = (
      SELECT COALESCE(SUM(s.quantity - s.restored_quantity), 0) FROM item_sales s WHERE s.item_id = items.id
    );
    UPDATE items SET quantity = sold_quantity WHERE sold_quantity > quantity;
  `);
}

/**
 * v4 turns an item from "one physical garment" into "a catalog record holding N pieces".
 *
 * Sale price and date move from the item to `item_sales`, because with partial sales an
 * item no longer has a single sale price. Each sale keeps how many of its pieces were
 * already returned, so restoring walks the history newest-first and can restore partially.
 * `items.sold_quantity` stays denormalized for catalog queries and is always the sum of
 * `quantity - restored_quantity` over that item's sales.
 */
async function applyV4(database: DatabaseClient, safetySnapshot: SafetySnapshot): Promise<void> {
  await safetySnapshot(database, "before-v4");
  await inTransaction(database, async (transaction) => {
    const timestamp = now();
    await addColumn(transaction, "items", "quantity", "INTEGER NOT NULL DEFAULT 1");
    await addColumn(transaction, "items", "sold_quantity", "INTEGER NOT NULL DEFAULT 0");
    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS item_sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT, stable_id TEXT NOT NULL UNIQUE,
        item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        quantity INTEGER NOT NULL CHECK(quantity > 0),
        restored_quantity INTEGER NOT NULL DEFAULT 0 CHECK(restored_quantity >= 0),
        sold_price TEXT, sold_at TEXT NOT NULL, location_id INTEGER, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_item_sales_item ON item_sales(item_id, sold_at DESC, id DESC);
    `);
    await reconcilePieceCounters(transaction);
    await transaction.runAsync("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (4, ?)", timestamp);
    await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

/**
 * v5 makes physical counts count pieces. An entry now carries how many reads it collected,
 * and the count freezes the expected pieces per record instead of a plain list of ids.
 * Counts already open keep working: a missing map falls back to one piece per frozen id.
 */
async function applyV5(database: DatabaseClient, safetySnapshot: SafetySnapshot): Promise<void> {
  await safetySnapshot(database, "before-v5");
  await inTransaction(database, async (transaction) => {
    const timestamp = now();
    await addColumn(transaction, "physical_count_entries", "quantity", "INTEGER NOT NULL DEFAULT 1");
    await addColumn(transaction, "physical_counts", "expected_pieces_json", "TEXT NOT NULL DEFAULT '{}'");
    await transaction.runAsync("INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (5, ?)", timestamp);
    await transaction.execAsync(`PRAGMA user_version = ${DATABASE_VERSION};`);
  });
}

export async function initializeDatabase(safetySnapshot: SafetySnapshot = noSafetySnapshot): Promise<void> {
  const database = await getDatabase();
  await migrateDatabase(database, safetySnapshot);
}

export async function migrateDatabase(database: DatabaseClient, safetySnapshot: SafetySnapshot = noSafetySnapshot): Promise<void> {
  await database.execAsync("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, applied_at TEXT NOT NULL);");
  const row = await database.getFirstAsync<{ version: number | null }>("SELECT MAX(version) AS version FROM schema_migrations");
  let version = row?.version ?? 0;
  if (version < 1) {
    await applyV1(database);
    version = 1;
  }
  if (version < 2) { await applyV2(database, safetySnapshot); version = 2; }
  if (version < 3) { await applyV3(database, safetySnapshot); version = 3; }
  if (version < 4) { await applyV4(database, safetySnapshot); version = 4; }
  if (version < 5) await applyV5(database, safetySnapshot);
}
