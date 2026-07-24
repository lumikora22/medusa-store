import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { DEFAULT_CATALOG_FILTERS } from "../../domain/models";
import { closeTestDatabase, createMigratedDatabase } from "../../test/database-fixture";
import type { SqlJsDatabase } from "../../test/sqljs-database";
import { CodeRepository } from "./code-repository";
import { EventRepository } from "./event-repository";
import { ItemRepository } from "./item-repository";
import { LocationRepository } from "./location-repository";
import { PhotoRepository } from "./photo-repository";
import { PhysicalCountRepository } from "./physical-count-repository";
import { SalesRepository } from "./sales-repository";
import { SettingsRepository } from "./settings-repository";
import { TransferRepository } from "./transfer-repository";

let database: SqlJsDatabase;
let items: ItemRepository; let locations: LocationRepository; let photos: PhotoRepository; let sales: SalesRepository; let transfers: TransferRepository;

beforeEach(async () => { database = await createMigratedDatabase(); items = new ItemRepository(); locations = new LocationRepository(); photos = new PhotoRepository(); sales = new SalesRepository(items); transfers = new TransferRepository(items, locations); });
afterEach(() => closeTestDatabase(database));

async function createLocation(code: string, name = code) { return locations.create({ code, name, type: "rack", precisionMode: "strict", notes: "" }); }
async function createItem(code: string, locationId: number | null, price = "25.00", description = "New liquidation garment") { return items.create({ code, locationId, price, description, tags: ["amazon", "new"] }); }

describe("inventory repositories", () => {
  it("creates and edits items and locations while enforcing global code uniqueness", async () => {
    const rack = await createLocation("RACK-A", "Rack A"); const item = await createItem("ITEM-A", rack.id);
    assert.equal(item.currentLocation?.name, "Rack A"); assert.equal((await new CodeRepository().resolve(item.machineCode))?.entityId, item.id);
    const edited = await items.update(item.id, { code: "ITEM-A2", price: "31,5", description: "New dress", tags: ["dress"] });
    assert.equal(edited.code, "ITEM-A2"); assert.equal(edited.price, "31.50"); assert.deepEqual(edited.tags, ["dress"]);
    await assert.rejects(createLocation("ITEM-A2"), /otra prenda o ubicación/);
    await assert.rejects(createItem("RACK-A", rack.id), /otra prenda o ubicación/);
  });

  it("adds, reorders, selects primary and removes photos consistently", async () => {
    const rack = await createLocation("RACK-P"); const item = await createItem("ITEM-P", rack.id);
    const first = await photos.add({ stableId: "PHOTO-A", itemId: item.id, uri: "memory://a", fileName: "a.jpg", mimeType: "image/jpeg", altText: "Front" });
    const second = await photos.add({ stableId: "PHOTO-B", itemId: item.id, uri: "memory://b", fileName: "b.jpg", mimeType: "image/jpeg", altText: "Back" });
    assert.equal((await items.getById(item.id)).photos[0].id, first.id);
    assert.equal((await database.getFirstAsync<{ primary_photo_id: number }>("SELECT primary_photo_id FROM items WHERE id = ?", item.id))?.primary_photo_id, first.id);
    await photos.reorder(item.id, [second.id, first.id], second.id);
    assert.deepEqual((await items.getById(item.id)).photos.map((photo) => [photo.id, photo.isPrimary]), [[second.id, true], [first.id, false]]);
    await photos.remove(second.id);
    const remaining = await items.getById(item.id); assert.equal(remaining.photos[0].id, first.id); assert.equal(remaining.photos[0].isPrimary, true);
    assert.equal((await database.getFirstAsync<{ primary_photo_id: number }>("SELECT primary_photo_id FROM items WHERE id = ?", item.id))?.primary_photo_id, first.id);
  });

  it("filters and searches catalog data by status, photo, location and text", async () => {
    const rack = await createLocation("RACK-S", "North Rack"); const shirt = await createItem("SHIRT-RED", rack.id, "44.00", "Red department-store shirt"); const other = await createItem("PANTS-BLUE", null, "55.00", "Blue pants");
    await photos.add({ stableId: "PHOTO-S", itemId: shirt.id, uri: "memory://shirt", fileName: "shirt.jpg", mimeType: "image/jpeg", altText: "" });
    const search = await items.list({ ...DEFAULT_CATALOG_FILTERS, search: "department-store" }); assert.deepEqual(search.results.map((item) => item.id), [shirt.id]);
    const noPhoto = await items.list({ ...DEFAULT_CATALOG_FILTERS, photo: "without" }); assert.deepEqual(noPhoto.results.map((item) => item.id), [other.id]);
    const unassigned = await items.list({ ...DEFAULT_CATALOG_FILTERS, unassignedOnly: true }); assert.deepEqual(unassigned.results.map((item) => item.id), [other.id]);
    const inRack = await items.list({ ...DEFAULT_CATALOG_FILTERS, locationId: rack.id }); assert.deepEqual(inRack.results.map((item) => item.id), [shirt.id]);
  });

  it("moves one or many items atomically, rejects sold items and undoes a batch", async () => {
    const source = await createLocation("RACK-FROM"); const destination = await createLocation("RACK-TO"); const one = await createItem("MOVE-ONE", source.id); const two = await createItem("MOVE-TWO", source.id); const single = await createItem("MOVE-SINGLE", source.id);
    const singleBatch = await transfers.move([single.id], destination.id); assert.equal((await items.getById(single.id)).currentLocationId, destination.id); await transfers.undo(singleBatch.batchId);
    const batch = await transfers.move([one.id, two.id], destination.id); assert.equal(batch.movedItems.every((item) => item.currentLocationId === destination.id), true);
    const restored = await transfers.undo(batch.batchId); assert.equal(restored.every((item) => item.currentLocationId === source.id), true);
    const history = await new EventRepository().list({ type: "batch_moved", originLocationId: source.id, destinationLocationId: destination.id, from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) }); assert.equal(history.length, 3);
    await sales.sell(two.id, {}); await assert.rejects(transfers.move([one.id, two.id], destination.id), /vendida/);
    assert.equal((await items.getById(one.id)).currentLocationId, source.id);
  });

  it("sells multiple items all-or-nothing, edits sold fields without moving, and restores", async () => {
    const rack = await createLocation("RACK-SALE"); const one = await createItem("SALE-ONE", rack.id); const two = await createItem("SALE-TWO", rack.id);
    const sold = await sales.sellMany([one.id, two.id], { soldPrice: "20" }); assert.equal(sold.soldItems.every((item) => item.status === "sold"), true);
    const edited = await items.update(one.id, { code: "SALE-ONE-EDIT", price: "26", description: "Edited sold garment", tags: ["edited"] }); assert.equal(edited.description, "Edited sold garment"); assert.equal(edited.lastLocationId, rack.id);
    await photos.add({ stableId: "PHOTO-SOLD", itemId: one.id, uri: "memory://sold", fileName: "sold.jpg", mimeType: "image/jpeg", altText: "" }); assert.equal((await items.getById(one.id)).photos.length, 1);
    await assert.rejects(items.update(one.id, { locationId: null }), /vendida no se puede mover/);
    const restored = await sales.restore(one.id, "Customer return correction"); assert.equal(restored.status, "active"); assert.equal(restored.currentLocationId, rack.id);
    const active = await createItem("SALE-ACTIVE", rack.id); await assert.rejects(sales.sellMany([active.id, two.id]), /No se registró ninguna venta/); assert.equal((await items.getById(active.id)).status, "active");
  });

  it("restores multiple sales all-or-nothing back to their last location", async () => {
    const rack = await createLocation("RACK-UNDO"); const one = await createItem("UNDO-ONE", rack.id); const two = await createItem("UNDO-TWO", rack.id); const active = await createItem("UNDO-ACTIVE", rack.id);
    await sales.sellMany([one.id, two.id], {});
    await assert.rejects(sales.restoreMany([one.id, active.id], "Venta deshecha"), /no está vendida/); assert.equal((await items.getById(one.id)).status, "sold");
    const restored = await sales.restoreMany([one.id, two.id], "Venta deshecha"); assert.equal(restored.every((item) => item.status === "active" && item.currentLocationId === rack.id), true);
    await assert.rejects(sales.restoreMany([one.id], "no"), /Explique/);
  });

  it("re-sells an item after undo even with a date-only sold_at (no event stable_id collision)", async () => {
    const rack = await createLocation("RACK-RESELL"); const item = await createItem("RESELL-1", rack.id);
    const day = new Date().toISOString().slice(0, 10);
    await sales.sell(item.id, { soldPrice: "20", soldAt: day });
    await sales.restore(item.id, "Venta deshecha");
    const resold = await sales.sell(item.id, { soldPrice: "20", soldAt: day });
    assert.equal(resold.status, "sold");
  });

  it("persists physical count matched, duplicate, unexpected, missing and completion results", async () => {
    const rack = await createLocation("RACK-COUNT"); const otherRack = await createLocation("RACK-OTHER"); const expectedA = await createItem("COUNT-A", rack.id); const expectedB = await createItem("COUNT-B", rack.id); const extra = await createItem("COUNT-X", otherRack.id);
    const counts = new PhysicalCountRepository(items); const count = await counts.start(rack.id); assert.equal(count.expectedCount, 2);
    assert.equal(await counts.scan(count.id, expectedA.id), "matched"); assert.equal(await counts.scan(count.id, expectedA.id), "duplicate"); assert.equal(await counts.scan(count.id, extra.id), "unexpected");
    const open = await counts.get(count.id); assert.deepEqual(open.matched.map((item) => item.id), [expectedA.id]); assert.deepEqual(open.missing.map((item) => item.id), [expectedB.id]); assert.deepEqual(open.unexpected.map((item) => item.id), [extra.id]);
    const completed = await counts.finish(count.id); assert.equal(completed.status, "completed");
    const events = await new EventRepository().list({ type: "physical_count_completed" }); assert.equal(events.length, 1);
    const cancelled = await counts.start(rack.id); assert.equal((await counts.cancel(cancelled.id)).status, "cancelled");
  });

  it("computes and persists backup reminder settings", async () => {
    const settings = new SettingsRepository(); assert.equal((await settings.get()).backupDue, true);
    await settings.set("backupReminderDays", 14); await database.runAsync("INSERT INTO backup_history(stable_id, file_uri, checksum, item_count, location_count, photo_count, status, created_at) VALUES ('BACKUP-TEST', 'memory://backup', 'hash', 0, 0, 0, 'created', ?)", new Date().toISOString());
    const updated = await settings.get(); assert.equal(updated.backupReminderDays, 14); assert.equal(updated.backupDue, false); assert.equal(updated.backupDueInDays, 14);
  });
});
