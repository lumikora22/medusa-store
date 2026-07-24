import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";

import { BackupRepository } from "../../data/repositories/backup-repository";
import { ItemRepository } from "../../data/repositories/item-repository";
import { LocationRepository } from "../../data/repositories/location-repository";
import { PhotoRepository } from "../../data/repositories/photo-repository";
import { closeTestDatabase, createMigratedDatabase } from "../../test/database-fixture";
import type { SqlJsDatabase } from "../../test/sqljs-database";
import type { PhotoPromotion } from "../files/photo-storage";
import { BackupService, type BackupFileStore, type BackupPackage, type BackupPlatform, type BackupRepositoryPort } from "./backup-service";

class FakePlatform implements BackupPlatform {
  readonly packages = new Map<string, string>(); private sequence = 0;
  now() { return `2026-01-01T00:00:${String(this.sequence++).padStart(2, "0")}.000Z`; }
  randomId() { return `id-${this.sequence++}`; }
  async digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
  async writePackage(fileName: string, content: string) { const uri = `package://${fileName}`; this.packages.set(uri, content); return uri; }
  async readPackage(uri: string) { const value = this.packages.get(uri); if (!value) throw new Error("missing package"); return value; }
  async pickPackage() { return [...this.packages.keys()][0] ?? null; }
  async sharePackage() {}
}

class FakeFiles implements BackupFileStore {
  readonly live = new Map<string, string>(); readonly staged = new Map<string, string>(); readonly stages = new Set<string>();
  isAvailable() { return true; }
  async liveUri(fileName: string) { return `live://${fileName}`; }
  async readBase64(uri: string) { const value = this.live.get(uri); if (value == null) throw new Error(`missing ${uri}`); return value; }
  async createRestoreStage(id: string) { const stage = `stage://${id}/`; this.stages.add(stage); return stage; }
  async writeStageManifest(stage: string, content: string) { this.staged.set(`${stage}manifest`, content); }
  async stagePhoto(stage: string, fileName: string, content: string) { const uri = `${stage}incoming/${fileName}`; this.staged.set(uri, content); return uri; }
  async promotePhoto(stage: string, stagedUri: string, fileName: string): Promise<PhotoPromotion> { const liveUri = await this.liveUri(fileName); const current = this.live.get(liveUri); const previousUri = current == null ? null : `${stage}previous/${fileName}`; if (previousUri && current !== undefined) this.staged.set(previousUri, current); this.live.set(liveUri, this.staged.get(stagedUri) ?? ""); return { liveUri, previousUri }; }
  async rollbackPromotion(promotion: PhotoPromotion) { if (promotion.previousUri) this.live.set(promotion.liveUri, this.staged.get(promotion.previousUri) ?? ""); else this.live.delete(promotion.liveUri); }
  async cleanupRestoreStage(stage: string) { this.stages.delete(stage); for (const key of [...this.staged.keys()]) if (key.startsWith(stage)) this.staged.delete(key); }
}

let database: SqlJsDatabase; let items: ItemRepository; let locations: LocationRepository; let photos: PhotoRepository; let repository: BackupRepository; let files: FakeFiles; let platform: FakePlatform;
beforeEach(async () => { database = await createMigratedDatabase(); items = new ItemRepository(); locations = new LocationRepository(); photos = new PhotoRepository(); repository = new BackupRepository(); files = new FakeFiles(); platform = new FakePlatform(); });
afterEach(() => closeTestDatabase(database));

async function seed() {
  const rack = await locations.create({ code: "RACK-BACKUP", name: "Backup rack", type: "rack", precisionMode: "strict", notes: "" });
  const item = await items.create({ code: "ITEM-BACKUP", price: "48.00", description: "Original garment", tags: ["new"], locationId: rack.id });
  await photos.add({ stableId: "PHOTO-BACKUP", itemId: item.id, uri: "live://photo.jpg", fileName: "photo.jpg", mimeType: "image/jpeg", altText: "" }); files.live.set("live://photo.jpg", "ORIGINAL-BYTES");
  return { rack, item };
}

function latestPackage(): BackupPackage { const raw = [...platform.packages.values()][0]; assert.ok(raw); return JSON.parse(raw) as BackupPackage; }

describe("staged backup restore", () => {
  it("exports and successfully restores database rows and photo bytes", async () => {
    const { item } = await seed(); const service = new BackupService(repository, files, platform); const summary = await service.create(false); assert.equal(summary.photoCount, 1); const backup = latestPackage();
    await items.update(item.id, { description: "Changed after backup" }); files.live.set("live://photo.jpg", "CHANGED-BYTES");
    await service.restore(backup);
    assert.equal((await items.getById(item.id)).description, "Original garment"); assert.equal(files.live.get("live://photo.jpg"), "ORIGINAL-BYTES"); assert.equal(files.stages.size, 0); assert.equal(files.staged.size, 0);
  });

  it("cleans only staged files when database restore fails before promotion", async () => {
    const { item } = await seed(); const normal = new BackupService(repository, files, platform); await normal.create(false); const backup = latestPackage(); await items.update(item.id, { description: "Current state" }); files.live.set("live://photo.jpg", "CURRENT-BYTES");
    const failing: BackupRepositoryPort = { exportTables: () => repository.exportTables(), recordBackup: (input) => repository.recordBackup(input), restoreTables: async () => { throw new Error("injected database restore failure"); } };
    await assert.rejects(new BackupService(failing, files, platform).restore(backup), /injected database restore failure/);
    assert.equal((await items.getById(item.id)).description, "Current state"); assert.equal(files.live.get("live://photo.jpg"), "CURRENT-BYTES"); assert.equal(files.stages.size, 0); assert.equal(files.staged.size, 0);
  });

  it("rolls back exact database state and overwritten photo bytes after promotion failure", async () => {
    const { item } = await seed(); const normal = new BackupService(repository, files, platform); await normal.create(false); const backup = latestPackage(); await items.update(item.id, { description: "Current state before restore" }); files.live.set("live://photo.jpg", "CURRENT-BYTES");
    const failing: BackupRepositoryPort = { exportTables: () => repository.exportTables(), restoreTables: (tables) => repository.restoreTables(tables), recordBackup: async (input) => { if (input.stableId.startsWith("RESTORE-")) throw new Error("injected failure after promotion"); await repository.recordBackup(input); } };
    await assert.rejects(new BackupService(failing, files, platform).restore(backup), /injected failure after promotion/);
    assert.equal((await items.getById(item.id)).description, "Current state before restore"); assert.equal(files.live.get("live://photo.jpg"), "CURRENT-BYTES"); assert.equal(files.stages.size, 0); assert.equal(files.staged.size, 0);
  });

  it("rejects a modified package before creating a stage", async () => {
    await seed(); const service = new BackupService(repository, files, platform); await service.create(false); const backup = latestPackage(); backup.photos[0].contentBase64 = "TAMPERED";
    await assert.rejects(service.restore(backup), /modificado/); assert.equal(files.stages.size, 0); assert.equal(files.live.get("live://photo.jpg"), "ORIGINAL-BYTES");
  });
});
