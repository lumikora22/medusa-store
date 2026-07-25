import { DomainError } from "../../domain/errors";
import type { BackupSummary } from "../../domain/models";
import { BACKUP_TABLES, BackupRepository, type BackupTables } from "../../data/repositories/backup-repository";
import { PhotoStorage, type PhotoPromotion } from "../files/photo-storage";

const BACKUP_FORMAT = "medusa-store-backup";
const BACKUP_VERSION = 2;
const BACKUP_SCHEMA_VERSION = 4;
/**
 * Schema versions a restore still accepts. Schema 3 predates per-piece sales: it carries no
 * `item_sales` table, and the restore rebuilds the piece counters from item status instead.
 * Rejecting it would turn every backup taken before this release into an unreadable file.
 */
const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [3, 4];
/** Tables introduced after the oldest supported schema, so older packages may omit them. */
const OPTIONAL_TABLES: readonly string[] = ["item_sales"];

export type BackupPhoto = { photoId: number; stableId: string; fileName: string; mimeType: string; contentBase64: string; checksum: string };

export type BackupPackage = {
  format: typeof BACKUP_FORMAT;
  version: number;
  schemaVersion: number;
  createdAt: string;
  checksum: string;
  tables: BackupTables;
  photos: BackupPhoto[];
};

export type BackupRepositoryPort = Pick<BackupRepository, "exportTables" | "restoreTables" | "recordBackup">;
export type BackupFileStore = Pick<PhotoStorage,
  "isAvailable" | "readBase64" | "liveUri" | "createRestoreStage" | "writeStageManifest" | "stagePhoto" |
  "promotePhoto" | "rollbackPromotion" | "cleanupRestoreStage"
>;
export type BackupPlatform = {
  now(): string;
  randomId(): string;
  digest(value: string): Promise<string>;
  writePackage(fileName: string, content: string): Promise<string>;
  readPackage(uri: string): Promise<string>;
  pickPackage(): Promise<string | null>;
  sharePackage(uri: string): Promise<void>;
};

const expoPlatform: BackupPlatform = {
  now: () => new Date().toISOString(),
  randomId: () => `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  async digest(value) { const Crypto = await import("expo-crypto"); return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value); },
  async writePackage(fileName, content) {
    const FileSystem = await import("expo-file-system/legacy");
    if (!FileSystem.documentDirectory) throw new DomainError("El respaldo no está disponible en esta plataforma.", "backup_unavailable");
    const directory = `${FileSystem.documentDirectory}medusa-store/backups/`;
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const uri = `${directory}${fileName}`;
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    return uri;
  },
  async readPackage(uri) { const FileSystem = await import("expo-file-system/legacy"); return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 }); },
  async pickPackage() {
    const DocumentPicker = await import("expo-document-picker");
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/json", "application/octet-stream", "*/*"], copyToCacheDirectory: true, multiple: false });
    return result.canceled ? null : result.assets[0].uri;
  },
  async sharePackage(uri) {
    const Sharing = await import("expo-sharing");
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: "application/json", dialogTitle: "Guardar respaldo de Medusa Store" });
  },
};

function serialized(value: Omit<BackupPackage, "checksum">): string {
  return JSON.stringify(value);
}

function counts(value: BackupPackage): Pick<BackupSummary, "itemCount" | "locationCount" | "photoCount"> {
  return { itemCount: value.tables.items.length, locationCount: value.tables.locations.filter((row) => Number(row.is_system ?? 0) === 0).length, photoCount: value.photos.length };
}

function assertBackupShape(value: unknown): asserts value is BackupPackage {
  if (!value || typeof value !== "object") throw new DomainError("El archivo no contiene un respaldo válido de Medusa Store.", "invalid_backup");
  const backup = value as Partial<BackupPackage>;
  if (backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !SUPPORTED_SCHEMA_VERSIONS.includes(Number(backup.schemaVersion)) || !backup.tables || !Array.isArray(backup.photos) || !backup.createdAt || !backup.checksum) {
    throw new DomainError("El formato o la versión del respaldo no es compatible.", "unsupported_backup");
  }
  for (const table of BACKUP_TABLES) {
    if (Array.isArray(backup.tables[table])) continue;
    if (OPTIONAL_TABLES.includes(table) && Number(backup.schemaVersion) < BACKUP_SCHEMA_VERSION) continue;
    throw new DomainError(`El respaldo no contiene la tabla ${table}.`, "invalid_backup_manifest");
  }
}

function assertManifestIntegrity(backup: BackupPackage): void {
  const photoRows = new Map(backup.tables.item_photos.map((row) => [Number(row.id), row]));
  const photoIds = new Set<number>();
  const fileNames = new Set<string>();
  for (const photo of backup.photos) {
    if (!Number.isInteger(photo.photoId) || photo.photoId <= 0 || photoIds.has(photo.photoId) || !photoRows.has(photo.photoId)) throw new DomainError("El manifiesto de fotografías contiene IDs inválidos o repetidos.", "invalid_backup_manifest");
    const normalizedName = photo.fileName.toLowerCase();
    if (!photo.fileName || photo.fileName.includes("/") || photo.fileName.includes("\\") || fileNames.has(normalizedName)) throw new DomainError("El manifiesto de fotografías contiene nombres inválidos o repetidos.", "invalid_backup_manifest");
    photoIds.add(photo.photoId); fileNames.add(normalizedName);
  }
  if (photoRows.size !== photoIds.size) throw new DomainError("El respaldo no contiene todos los archivos de fotografía declarados.", "invalid_backup_manifest");
  const codes = new Set<string>();
  for (const row of backup.tables.code_registry) {
    const value = String(row.value ?? "").trim().toUpperCase();
    if (!value || codes.has(value)) throw new DomainError("El registro global de códigos del respaldo contiene colisiones.", "backup_code_collision");
    codes.add(value);
  }
}

export class BackupService {
  constructor(
    private readonly repository: BackupRepositoryPort = new BackupRepository(),
    private readonly files: BackupFileStore = new PhotoStorage(),
    private readonly platform: BackupPlatform = expoPlatform,
  ) {}

  async create(share = true): Promise<BackupSummary> {
    if (!this.files.isAvailable()) throw new DomainError("El respaldo no está disponible en esta plataforma.", "backup_unavailable");
    const tables = await this.repository.exportTables();
    const photos: BackupPhoto[] = [];
    for (const row of tables.item_photos) {
      let contentBase64: string;
      try { contentBase64 = await this.files.readBase64(String(row.uri)); }
      catch { throw new DomainError(`No se pudo leer la foto ${String(row.file_name)}. El respaldo se canceló sin crear un paquete incompleto.`, "backup_photo_read_failed"); }
      photos.push({ photoId: Number(row.id), stableId: String(row.stable_id), fileName: String(row.file_name), mimeType: String(row.mime_type), contentBase64, checksum: await this.platform.digest(contentBase64) });
    }
    const createdAt = this.platform.now();
    const base = { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: BACKUP_SCHEMA_VERSION, createdAt, tables, photos } as const;
    const backup: BackupPackage = { ...base, checksum: await this.platform.digest(serialized(base)) };
    const uri = await this.platform.writePackage(`medusa-store-${createdAt.replace(/[:.]/g, "-")}.medusa-backup`, JSON.stringify(backup));
    const summary = { uri, createdAt, checksum: backup.checksum, ...counts(backup) };
    await this.repository.recordBackup({ stableId: `BACKUP-${this.platform.randomId()}`, ...summary, status: "created" });
    if (share) await this.platform.sharePackage(uri);
    return summary;
  }

  async pick(): Promise<BackupPackage | null> {
    const uri = await this.platform.pickPackage();
    return uri ? this.inspect(uri) : null;
  }

  async inspect(uri: string): Promise<BackupPackage> {
    let parsed: unknown;
    try { parsed = JSON.parse(await this.platform.readPackage(uri)); }
    catch { throw new DomainError("El archivo no contiene un respaldo válido de Medusa Store.", "invalid_backup"); }
    assertBackupShape(parsed);
    assertManifestIntegrity(parsed);
    const expected = await this.platform.digest(serialized({ format: BACKUP_FORMAT, version: parsed.version, schemaVersion: parsed.schemaVersion, createdAt: parsed.createdAt, tables: parsed.tables, photos: parsed.photos }));
    if (expected !== parsed.checksum) throw new DomainError("El respaldo está incompleto o fue modificado. No se restauró ningún dato.", "backup_integrity_failed");
    for (const photo of parsed.photos) {
      if (await this.platform.digest(photo.contentBase64) !== photo.checksum) throw new DomainError(`La fotografía ${photo.fileName} no supera la validación de integridad.`, "backup_photo_integrity_failed");
    }
    return parsed;
  }

  async restore(candidate: BackupPackage): Promise<BackupSummary> {
    if (!this.files.isAvailable()) throw new DomainError("La restauración no está disponible en esta plataforma.", "backup_unavailable");
    const backup = await this.validateCandidate(candidate);
    const stageUri = await this.files.createRestoreStage(this.platform.randomId());
    const staged: Array<{ photo: BackupPhoto; uri: string }> = [];
    const promotions: PhotoPromotion[] = [];
    let safety: BackupPackage | null = null;
    let databaseCommitted = false;
    try {
      await this.files.writeStageManifest(stageUri, JSON.stringify(backup));
      for (const photo of backup.photos) staged.push({ photo, uri: await this.files.stagePhoto(stageUri, photo.fileName, photo.contentBase64) });
      safety = await this.createSafetyPackage();
      const tables = structuredClone(backup.tables);
      for (const entry of staged) {
        const row = tables.item_photos.find((candidateRow) => Number(candidateRow.id) === entry.photo.photoId);
        if (!row) throw new DomainError("El manifiesto de fotografías cambió durante la restauración.", "invalid_backup_manifest");
        row.uri = await this.files.liveUri(entry.photo.fileName);
      }
      await this.repository.restoreTables(tables);
      databaseCommitted = true;
      for (const entry of staged) promotions.push(await this.files.promotePhoto(stageUri, entry.uri, entry.photo.fileName));
      const summary = { uri: "restored-package", createdAt: this.platform.now(), checksum: backup.checksum, ...counts(backup) };
      await this.repository.recordBackup({ stableId: `RESTORE-${this.platform.randomId()}`, ...summary, status: "restored" });
      await this.files.cleanupRestoreStage(stageUri);
      return summary;
    } catch (error) {
      if (databaseCommitted && safety) await this.repository.restoreTables(safety.tables).catch(() => undefined);
      for (const promotion of [...promotions].reverse()) await this.files.rollbackPromotion(promotion).catch(() => undefined);
      await this.files.cleanupRestoreStage(stageUri).catch(() => undefined);
      throw error;
    }
  }

  private async validateCandidate(candidate: BackupPackage): Promise<BackupPackage> {
    const raw = JSON.stringify(candidate);
    const uri = `memory://${this.platform.randomId()}`;
    const platform = this.platform as BackupPlatform & { inspectRaw?: (uri: string, raw: string) => Promise<void> };
    if (platform.inspectRaw) await platform.inspectRaw(uri, raw);
    const parsed = JSON.parse(raw) as unknown;
    assertBackupShape(parsed); assertManifestIntegrity(parsed);
    const expected = await this.platform.digest(serialized({ format: BACKUP_FORMAT, version: parsed.version, schemaVersion: parsed.schemaVersion, createdAt: parsed.createdAt, tables: parsed.tables, photos: parsed.photos }));
    if (expected !== parsed.checksum) throw new DomainError("El respaldo está incompleto o fue modificado. No se restauró ningún dato.", "backup_integrity_failed");
    for (const photo of parsed.photos) if (await this.platform.digest(photo.contentBase64) !== photo.checksum) throw new DomainError(`La fotografía ${photo.fileName} no supera la validación de integridad.`, "backup_photo_integrity_failed");
    return parsed;
  }

  private async createSafetyPackage(): Promise<BackupPackage> {
    const tables = await this.repository.exportTables();
    const photos: BackupPhoto[] = [];
    for (const row of tables.item_photos) {
      const contentBase64 = await this.files.readBase64(String(row.uri));
      photos.push({ photoId: Number(row.id), stableId: String(row.stable_id), fileName: String(row.file_name), mimeType: String(row.mime_type), contentBase64, checksum: await this.platform.digest(contentBase64) });
    }
    const createdAt = this.platform.now();
    const base = { format: BACKUP_FORMAT, version: BACKUP_VERSION, schemaVersion: BACKUP_SCHEMA_VERSION, createdAt, tables, photos } as const;
    const backup: BackupPackage = { ...base, checksum: await this.platform.digest(serialized(base)) };
    const uri = await this.platform.writePackage(`safety-before-restore-${createdAt.replace(/[:.]/g, "-")}.medusa-backup`, JSON.stringify(backup));
    await this.repository.recordBackup({ stableId: `SAFETY-${this.platform.randomId()}`, uri, checksum: backup.checksum, ...counts(backup), status: "created" });
    return backup;
  }
}
