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

  it("persists physical count matched, extra, missing and completion results", async () => {
    const rack = await createLocation("RACK-COUNT"); const otherRack = await createLocation("RACK-OTHER"); const expectedA = await createItem("COUNT-A", rack.id); const expectedB = await createItem("COUNT-B", rack.id); const extra = await createItem("COUNT-X", otherRack.id);
    const counts = new PhysicalCountRepository(items); const count = await counts.start(rack.id); assert.equal(count.expectedCount, 2);
    assert.equal(await counts.scan(count.id, expectedA.id), "matched");
    assert.equal(await counts.scan(count.id, expectedA.id), "unexpected", "a second read of a single-piece record is a surplus, not a silent duplicate");
    assert.equal(await counts.scan(count.id, extra.id), "unexpected");
    const open = await counts.get(count.id);
    assert.deepEqual(open.matched.map((line) => [line.item.id, line.pieces]), [[expectedA.id, 1]]);
    assert.deepEqual(open.missing.map((line) => [line.item.id, line.pieces]), [[expectedB.id, 1]]);
    assert.deepEqual(open.unexpected.map((line) => [line.item.id, line.pieces]).sort((a, b) => a[0] - b[0]), [[expectedA.id, 1], [extra.id, 1]]);
    assert.equal(open.matchedPieces, 1); assert.equal(open.unexpectedPieces, 2); assert.equal(open.missingPieces, 1);
    const completed = await counts.finish(count.id); assert.equal(completed.status, "completed");
    const events = await new EventRepository().list({ type: "physical_count_completed" }); assert.equal(events.length, 1);
    const cancelled = await counts.start(rack.id); assert.equal((await counts.cancel(cancelled.id)).status, "cancelled");
  });

  it("sells part of a record and leaves the rest available in the catalog", async () => {
    const rack = await createLocation("RACK-PIECES"); const item = await createItem("PIECES-A", rack.id, "40.00");
    await database.runAsync("UPDATE items SET quantity = 5 WHERE id = ?", item.id);

    const partial = await sales.sell(item.id, { quantity: 2, soldPrice: "35.00" });
    assert.equal(partial.status, "active", "a record with pieces left stays in the normal catalog");
    assert.equal(partial.soldQuantity, 2); assert.equal(partial.availableQuantity, 3);

    const rest = await sales.sell(item.id, { quantity: 3 });
    assert.equal(rest.status, "sold", "the record only becomes sold once every piece is gone");
    assert.equal(rest.availableQuantity, 0);

    await assert.rejects(sales.sell(item.id, { quantity: 1 }), /solo tiene 0 piezas disponibles/);
  });

  it("refuses to sell more pieces than the record holds without touching anything", async () => {
    const rack = await createLocation("RACK-SHORT"); const item = await createItem("SHORT-A", rack.id); const other = await createItem("SHORT-B", rack.id);
    await database.runAsync("UPDATE items SET quantity = 3 WHERE id = ?", other.id);
    await assert.rejects(sales.sellMany([other.id, item.id], { quantity: 2 }), /solo tiene 1 pieza disponible/);
    assert.equal((await items.getById(other.id)).soldQuantity, 0, "the valid record must not be modified either");
    assert.equal((await sales.salesOf(other.id)).length, 0);
  });

  it("restores the most recent sale by default and walks history backwards for larger amounts", async () => {
    const rack = await createLocation("RACK-HISTORY"); const item = await createItem("HISTORY-A", rack.id);
    await database.runAsync("UPDATE items SET quantity = 6 WHERE id = ?", item.id);
    await sales.sell(item.id, { quantity: 2, soldAt: "2025-05-01T00:00:00.000Z", soldPrice: "30.00" });
    await sales.sell(item.id, { quantity: 3, soldAt: "2025-05-10T00:00:00.000Z", soldPrice: "25.00" });

    const afterDefault = await sales.restore(item.id, "Cliente devolvió");
    assert.equal(afterDefault.soldQuantity, 2, "restoring without a quantity undoes only the last sale");
    assert.equal(afterDefault.availableQuantity, 4);
    assert.equal(afterDefault.soldPrice, "30.00", "the displayed price falls back to the remaining open sale");

    const history = await sales.salesOf(item.id);
    assert.deepEqual(history.map((sale) => [sale.quantity, sale.restoredQuantity]), [[3, 3], [2, 0]]);

    const afterPartial = await sales.restore(item.id, "Segunda devolución", 1);
    assert.equal(afterPartial.soldQuantity, 1); assert.equal(afterPartial.availableQuantity, 5);
    assert.equal((await sales.salesOf(item.id)).find((sale) => sale.quantity === 2)?.restoredQuantity, 1);

    await assert.rejects(sales.restore(item.id, "Demasiadas", 4), /solo tiene 1 pieza vendida/);
  });

  it("counts every piece of a record before reporting a surplus", async () => {
    const rack = await createLocation("RACK-PHYS"); const item = await createItem("PHYS-A", rack.id); const single = await createItem("PHYS-B", rack.id);
    await database.runAsync("UPDATE items SET quantity = 3 WHERE id = ?", item.id);
    const counts = new PhysicalCountRepository(items);
    const count = await counts.start(rack.id);
    assert.equal(count.expectedCount, 4, "three pieces plus one single-piece record");

    assert.equal(await counts.scan(count.id, item.id), "matched");
    assert.equal(await counts.scan(count.id, item.id), "matched");
    assert.equal(await counts.scan(count.id, item.id), "matched", "each expected piece counts on its own read");
    assert.equal(await counts.scan(count.id, item.id), "unexpected", "the fourth read exceeds what the container should hold");

    const open = await counts.get(count.id);
    assert.equal(open.matchedPieces, 3); assert.equal(open.unexpectedPieces, 1);
    assert.deepEqual(open.missing.map((line) => [line.item.id, line.pieces]), [[single.id, 1]]);
    assert.equal(open.scannedCount, 4);
  });

  it("excludes already sold pieces from what a count expects", async () => {
    const rack = await createLocation("RACK-SOLDOUT"); const item = await createItem("SOLDOUT-A", rack.id);
    await database.runAsync("UPDATE items SET quantity = 4 WHERE id = ?", item.id);
    await sales.sell(item.id, { quantity: 3 });
    const counts = new PhysicalCountRepository(items);
    const count = await counts.start(rack.id);
    assert.equal(count.expectedCount, 1, "only the piece still in the container is expected");
    assert.equal(await counts.scan(count.id, item.id), "matched");
    assert.equal(await counts.scan(count.id, item.id), "unexpected");
  });

  it("edits piece count but never below what is already sold", async () => {
    const rack = await createLocation("RACK-EDIT"); const item = await createItem("EDIT-A", rack.id);
    const grown = await items.update(item.id, { quantity: 4 });
    assert.equal(grown.quantity, 4); assert.equal(grown.availableQuantity, 4);

    await sales.sell(item.id, { quantity: 3 });
    await assert.rejects(items.update(item.id, { quantity: 2 }), /Restaure ventas antes de reducir/);
    assert.equal((await items.getById(item.id)).quantity, 4, "the rejected edit must not change anything");

    const shrunk = await items.update(item.id, { quantity: 3 });
    assert.equal(shrunk.status, "sold", "reducing to exactly the sold count leaves nothing available");
    assert.equal(shrunk.availableQuantity, 0);
    await assert.rejects(items.update(item.id, { quantity: 0 }), /al menos 1/);
  });

  it("counts pieces, not records, in dashboard and location totals", async () => {
    const rack = await createLocation("RACK-COUNT"); const item = await createItem("COUNT-A", rack.id, "10.00");
    await database.runAsync("UPDATE items SET quantity = 4 WHERE id = ?", item.id);
    await sales.sell(item.id, { quantity: 1, soldPrice: "10.00" });

    const dashboard = await items.dashboard();
    assert.equal(dashboard.activeCount, 3); assert.equal(dashboard.soldCount, 1);
    assert.equal(dashboard.activeValue, "30.00"); assert.equal(dashboard.soldValue, "10.00");

    const location = await locations.getById(rack.id);
    assert.equal(location.itemCount, 3, "a container holds pieces, not catalog rows");
    assert.equal(location.totalValue, "30.00");
  });

  it("refuses to delete a container that still holds pieces", async () => {
    const rack = await createLocation("RACK-FULL"); await createItem("FULL-A", rack.id);
    await assert.rejects(locations.remove(rack.id), /todavía tiene prendas/);
    assert.equal((await locations.getById(rack.id)).status, "active", "a refused delete must leave the container untouched");
    await assert.rejects(locations.remove(-1), /del sistema no se puede eliminar/);
  });

  it("deletes an unused empty container and archives one with history", async () => {
    const unused = await createLocation("RACK-UNUSED");
    assert.equal(await locations.remove(unused.id), "deleted");
    await assert.rejects(locations.getById(unused.id), /No encontramos la ubicación/);
    assert.equal(await new CodeRepository().resolve("RACK-UNUSED"), null, "its code must be freed for reuse");

    const used = await createLocation("RACK-USED"); const item = await createItem("USED-A", used.id);
    await sales.sell(item.id, {});
    assert.equal(await locations.remove(used.id), "archived", "a container referenced by past garments survives hidden");
    assert.equal((await locations.getById(used.id)).status, "archived");
    assert.equal((await locations.list()).some((location) => location.id === used.id), false, "archived containers leave the list");
  });

  it("restores an archived item to available or sold depending on its pieces", async () => {
    const rack = await createLocation("RACK-ARCHIVE"); const item = await createItem("ARCH-A", rack.id);
    await database.runAsync("UPDATE items SET quantity = 2 WHERE id = ?", item.id);
    await sales.sell(item.id, { quantity: 1 });
    await items.archive(item.id);
    assert.equal((await items.getById(item.id)).status, "archived");

    const restored = await items.unarchive(item.id);
    assert.equal(restored.status, "active", "one piece is still available so it returns to the catalog");
    await assert.rejects(items.unarchive(item.id), /no está archivada/);

    await sales.sell(item.id, { quantity: 1 });
    await items.archive(item.id);
    assert.equal((await items.unarchive(item.id)).status, "sold", "with no pieces left it returns as sold");
  });

  it("computes and persists backup reminder settings", async () => {
    const settings = new SettingsRepository(); assert.equal((await settings.get()).backupDue, true);
    await settings.set("backupReminderDays", 14); await database.runAsync("INSERT INTO backup_history(stable_id, file_uri, checksum, item_count, location_count, photo_count, status, created_at) VALUES ('BACKUP-TEST', 'memory://backup', 'hash', 0, 0, 0, 'created', ?)", new Date().toISOString());
    const updated = await settings.get(); assert.equal(updated.backupReminderDays, 14); assert.equal(updated.backupDue, false); assert.equal(updated.backupDueInDays, 14);
  });

  it("stores, reports and clears the exhibition PIN without exposing it", async () => {
    const settings = new SettingsRepository();
    const initial = await settings.get(); assert.equal(initial.exhibitionMode, false); assert.equal(initial.exhibitionPinSet, false);
    assert.equal(await settings.getExhibitionPin(), null);

    await settings.setExhibitionPin("saltvalue:digestvalue"); await settings.set("exhibitionMode", true);
    const locked = await settings.get();
    assert.equal(locked.exhibitionMode, true); assert.equal(locked.exhibitionPinSet, true);
    assert.equal(await settings.getExhibitionPin(), "saltvalue:digestvalue");
    assert.ok(!Object.values(locked).includes("saltvalue:digestvalue"), "the stored digest must never reach AppSettings");

    await settings.clearExhibitionPin(); await settings.set("exhibitionMode", false);
    const recovered = await settings.get();
    assert.equal(recovered.exhibitionMode, false); assert.equal(recovered.exhibitionPinSet, false);
    assert.equal(await settings.getExhibitionPin(), null);
  });
});
