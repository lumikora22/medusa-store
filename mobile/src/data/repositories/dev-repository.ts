import type { LocationType } from "../../domain/models";
import { PhotoStorage } from "../../core/files/photo-storage";
import { getDatabase } from "../sqlite/database";
import { migrateDatabase } from "../sqlite/migrations";
import { ItemRepository } from "./item-repository";
import { LocationRepository } from "./location-repository";
import { PhotoRepository } from "./photo-repository";
import { SalesRepository } from "./sales-repository";

export type SeedProgress = { done: number; total: number; phase: "locations" | "items" };

const LOCATION_TYPES: LocationType[] = ["rack", "box", "bag", "shelf", "display", "other"];
const GARMENTS = ["Playera", "Vestido", "Pantalón", "Blusa", "Camisa", "Short", "Sudadera", "Falda", "Chamarra", "Ropa interior"];
const COLORS = ["negro", "blanco", "azul", "rojo", "verde", "gris", "rosa", "beige"];
const SIZES = ["CH", "M", "G", "XG", "28", "30", "32", "34", "Unitalla"];

function pick<T>(list: T[], index: number): T {
  return list[index % list.length];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Development-only tooling to populate and wipe the local database. Not wired to
 * any production flow; the UI only exposes it behind `__DEV__`.
 */
export class DevRepository {
  constructor(
    private readonly items = new ItemRepository(),
    private readonly locations = new LocationRepository(),
    private readonly sales = new SalesRepository(),
    private readonly photos = new PhotoRepository(),
    private readonly photoStorage = new PhotoStorage(),
  ) {}

  async seed(placeholderUris: string[], onProgress?: (progress: SeedProgress) => void, counts = { locations: 100, items: 1000 }): Promise<void> {
    const total = counts.locations + counts.items;
    let done = 0;
    const tick = (phase: SeedProgress["phase"]) => { done += 1; if (done % 20 === 0 || done === total) onProgress?.({ done, total, phase }); };

    const locationIds: number[] = [];
    for (let index = 0; index < counts.locations; index += 1) {
      const type = pick(LOCATION_TYPES, index);
      const location = await this.locations.create({
        name: `${type === "box" ? "Caja" : type === "bag" ? "Bolsa" : type === "rack" ? "Rack" : type === "shelf" ? "Estante" : type === "display" ? "Exhibidor" : "Zona"} ${String(index + 1).padStart(2, "0")}`,
        type,
        precisionMode: type === "box" || type === "bag" ? "strict" : "flexible",
        notes: "",
      });
      locationIds.push(location.id);
      tick("locations");
    }

    for (let index = 0; index < counts.items; index += 1) {
      const garment = pick(GARMENTS, index);
      const color = pick(COLORS, randomInt(0, COLORS.length - 1));
      const size = pick(SIZES, randomInt(0, SIZES.length - 1));
      const item = await this.items.create({
        price: String(randomInt(20, 200)),
        description: `${garment} ${color}`,
        tags: [garment.toLowerCase(), color, `talla ${size}`],
        locationId: Math.random() < 0.1 ? null : pick(locationIds, randomInt(0, locationIds.length - 1)),
      });
      if (placeholderUris.length) {
        const uri = pick(placeholderUris, index);
        await this.photos.add({ stableId: `PHOTO-DEV-${item.id}`, itemId: item.id, uri, fileName: `dev-${item.id}.jpg`, mimeType: "image/jpeg", altText: `${garment} ${color}` });
      }
      if (Math.random() < 0.12) await this.sales.sell(item.id, {});
      tick("items");
    }
  }

  async reset(): Promise<void> {
    const database = await getDatabase();
    await database.execAsync(`
      PRAGMA foreign_keys = OFF;
      DROP TRIGGER IF EXISTS inventory_events_no_update;
      DROP TRIGGER IF EXISTS inventory_events_no_delete;
      DROP TABLE IF EXISTS item_photos;
      DROP TABLE IF EXISTS inventory_movements;
      DROP TABLE IF EXISTS inventory_events;
      DROP TABLE IF EXISTS physical_count_entries;
      DROP TABLE IF EXISTS physical_counts;
      DROP TABLE IF EXISTS transfer_batches;
      DROP TABLE IF EXISTS code_registry;
      DROP TABLE IF EXISTS backup_history;
      DROP TABLE IF EXISTS app_settings;
      DROP TABLE IF EXISTS items;
      DROP TABLE IF EXISTS locations;
      DROP TABLE IF EXISTS containers;
      DROP TABLE IF EXISTS schema_migrations;
      PRAGMA foreign_keys = ON;
    `);
    await migrateDatabase(database);
    await this.photoStorage.clearAllPhotos();
  }
}
