import type { BackupPackage } from "../core/backup/backup-service";
import { BackupService } from "../core/backup/backup-service";
import { PhotoStorage } from "../core/files/photo-storage";
import { LabelService, type LabelRecord, type LabelSize } from "../core/labels/label-service";
import { expoCryptoPort } from "../core/security/crypto";
import { canConfirmDeviceOwner, confirmDeviceOwner } from "../core/security/device-auth";
import { ExhibitionLock } from "../core/security/exhibition-lock";
import type { AppSettings, CatalogFilters, CreateItemInput, CreateLocationInput, HistoryFilters, PhotoAsset, UpdateItemInput, UpdateLocationInput } from "../domain/models";
import { CodeRepository } from "../data/repositories/code-repository";
import { DevRepository, type SeedProgress } from "../data/repositories/dev-repository";
import { EventRepository } from "../data/repositories/event-repository";
import { ItemRepository } from "../data/repositories/item-repository";
import { LocationRepository } from "../data/repositories/location-repository";
import { PhotoRepository } from "../data/repositories/photo-repository";
import { PhysicalCountRepository } from "../data/repositories/physical-count-repository";
import { SalesRepository, type SellInput } from "../data/repositories/sales-repository";
import { SettingsRepository, type WritableSetting } from "../data/repositories/settings-repository";
import { TransferRepository } from "../data/repositories/transfer-repository";
import { initializeDatabase } from "../data/sqlite/migrations";
import { configureProductionDatabase, createDatabaseSafetySnapshot } from "../data/sqlite/client";

export class InventoryService {
  private readonly items = new ItemRepository();
  private readonly locations = new LocationRepository();
  private readonly events = new EventRepository();
  private readonly settings = new SettingsRepository();
  private readonly transfers = new TransferRepository(this.items, this.locations);
  private readonly sales = new SalesRepository(this.items);
  private readonly counts = new PhysicalCountRepository(this.items);
  private readonly backups = new BackupService();
  private readonly labels = new LabelService();
  private readonly photoRecords = new PhotoRepository();
  private readonly photoStorage = new PhotoStorage();
  private readonly codes = new CodeRepository();
  private readonly exhibitionLock = new ExhibitionLock(expoCryptoPort);
  private readonly dev = new DevRepository(this.items, this.locations, this.sales, this.photoRecords, this.photoStorage);

  initialize(): Promise<void> { configureProductionDatabase(); return initializeDatabase(createDatabaseSafetySnapshot); }
  dashboard() { return this.items.dashboard(); }
  catalog(filters: CatalogFilters, offset = 0) { return this.items.list(filters, offset); }
  getItem(id: number) { return this.items.getById(id); }
  getItems(ids: number[]) { return this.items.getByIds(ids); }

  async createItem(input: CreateItemInput, photos: PhotoAsset[]) {
    const item = await this.items.create(input);
    const photoFailures: string[] = [];
    for (const asset of photos) {
      try { await this.addPhoto(item.id, asset); }
      catch (error) { photoFailures.push(error instanceof Error ? error.message : "No se pudo guardar una foto."); }
    }
    return { item: await this.items.getById(item.id), photoFailures };
  }

  updateItem(id: number, input: UpdateItemInput) { return this.items.update(id, input); }
  archiveItem(id: number) { return this.items.archive(id); }

  async addPhoto(itemId: number, asset: PhotoAsset) {
    const persisted = await this.photoStorage.persist(asset);
    try { return await this.photoRecords.add({ ...persisted, itemId, altText: "" }); }
    catch (error) { await this.photoStorage.remove(persisted.uri).catch(() => undefined); throw error; }
  }

  async removePhoto(photoId: number): Promise<void> {
    const removed = await this.photoRecords.remove(photoId);
    await this.photoStorage.remove(removed.uri).catch(() => undefined);
  }

  async replacePhoto(photoId: number, itemId: number, asset: PhotoAsset): Promise<void> {
    const created = await this.addPhoto(itemId, asset);
    try { await this.removePhoto(photoId); }
    catch (error) { await this.removePhoto(created.id).catch(() => undefined); throw error; }
  }

  reorderPhotos(itemId: number, orderedIds: number[], primaryId: number) { return this.photoRecords.reorder(itemId, orderedIds, primaryId); }
  listLocations(search = "") { return this.locations.list({ search, favoritesFirst: true }); }
  getLocation(id: number) { return this.locations.getById(id); }
  createLocation(input: CreateLocationInput) { return this.locations.create(input); }
  updateLocation(id: number, input: UpdateLocationInput) { return this.locations.update(id, input); }
  locationItems(id: number, search = "") { return this.items.listByLocation(id, search); }

  async moveAllFromLocation(sourceId: number, destinationId: number) {
    const items = await this.items.listByLocation(sourceId);
    return this.transfers.move(items.map((item) => item.id), destinationId);
  }

  moveItems(itemIds: number[], destinationId: number) { return this.transfers.move(itemIds, destinationId); }
  undoTransfer(batchId: number) { return this.transfers.undo(batchId); }
  sellItem(itemId: number, input: SellInput = {}) { return this.sales.sell(itemId, input); }
  sellItems(itemIds: number[], input: SellInput = {}) { return this.sales.sellMany(itemIds, input); }
  /** Without a quantity this undoes the record's most recent sale, as the history shows it. */
  restoreSale(itemId: number, reason: string, quantity?: number) { return this.sales.restore(itemId, reason, quantity); }
  restoreSales(itemIds: number[], reason: string, quantity?: number) { return this.sales.restoreMany(itemIds, reason, quantity); }
  itemSales(itemId: number) { return this.sales.salesOf(itemId); }

  async resolveCode(code: string) {
    const owner = await this.codes.resolve(code);
    if (!owner) return { type: "unknown" as const, code: code.trim().toUpperCase() };
    if (owner.entityType === "item") return { type: "item" as const, item: await this.items.getById(owner.entityId) };
    return { type: "location" as const, location: await this.locations.getById(owner.entityId) };
  }

  history(filters: HistoryFilters = {}) { return this.events.list(filters); }
  getSettings() { return this.settings.get(); }
  updateSetting<K extends WritableSetting>(key: K, value: AppSettings[K]) { return this.settings.set(key, value); }

  /** Locks the app into read-only Catalog browsing; the PIN becomes the only way out. */
  async enableExhibitionMode(pin: string): Promise<void> {
    await this.settings.setExhibitionPin(await this.exhibitionLock.createRecord(pin));
    await this.settings.set("exhibitionMode", true);
  }

  async disableExhibitionMode(pin: string): Promise<void> {
    if (!(await this.exhibitionLock.verify(await this.settings.getExhibitionPin(), pin))) throw new Error("PIN incorrecto.");
    await this.settings.set("exhibitionMode", false);
  }

  /** True when the phone has a lock screen that can stand in for a forgotten PIN. */
  canRecoverExhibitionMode(): Promise<boolean> { return canConfirmDeviceOwner(); }

  /**
   * Escape hatch for a forgotten PIN: the device lock screen proves ownership, so the app
   * never has to be reinstalled — which on a local-first app would mean losing the inventory.
   */
  async recoverExhibitionMode(): Promise<void> {
    if (!(await confirmDeviceOwner("Confirme su identidad para salir del modo exhibición"))) throw new Error("No pudimos confirmar su identidad.");
    await this.settings.clearExhibitionPin();
    await this.settings.set("exhibitionMode", false);
  }
  createBackup(share = true) { return this.backups.create(share); }
  pickBackup() { return this.backups.pick(); }
  restoreBackup(backup: BackupPackage) { return this.backups.restore(backup); }
  printLabels(records: LabelRecord[], size: LabelSize, quantity = 1) { return this.labels.print(records, size, quantity); }
  shareLabels(records: LabelRecord[], size: LabelSize, quantity = 1) { return this.labels.createAndSharePdf(records, size, quantity); }
  seedDevData(placeholderUris: string[], onProgress?: (progress: SeedProgress) => void) { return this.dev.seed(placeholderUris, onProgress); }
  resetAllData() { return this.dev.reset(); }
  startPhysicalCount(locationId: number) { return this.counts.start(locationId); }
  scanPhysicalCount(countId: number, itemId: number) { return this.counts.scan(countId, itemId); }
  getPhysicalCount(countId: number) { return this.counts.get(countId); }
  finishPhysicalCount(countId: number) { return this.counts.finish(countId); }
  cancelPhysicalCount(countId: number) { return this.counts.cancel(countId); }
}

export const inventoryService = new InventoryService();
