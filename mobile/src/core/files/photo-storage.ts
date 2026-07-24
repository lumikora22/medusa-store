import { DomainError } from "../../domain/errors";
import type { PhotoAsset } from "../../domain/models";

export type PersistedPhoto = { stableId: string; uri: string; fileName: string; mimeType: string };

async function directories() {
  const FileSystem = await import("expo-file-system/legacy");
  return { FileSystem, photos: `${FileSystem.documentDirectory}medusa-store/photos/`, restore: `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}medusa-store/restore-staging/` };
}

export type PhotoPromotion = { liveUri: string; previousUri: string | null };

function extensionFor(asset: PhotoAsset): string {
  const candidate = asset.fileName?.split(".").pop() ?? asset.uri.split(".").pop() ?? "jpg";
  return candidate.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";
}

export class PhotoStorage {
  isAvailable(): boolean {
    return process.env.EXPO_OS !== "web";
  }

  async liveUri(fileName: string): Promise<string> {
    const { photos } = await directories();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    return `${photos}${safeName}`;
  }

  async persist(asset: PhotoAsset): Promise<PersistedPhoto> {
    const { FileSystem, photos } = await directories();
    if (!FileSystem.documentDirectory) throw new DomainError("El almacenamiento de fotos no está disponible en esta plataforma.", "photo_storage_unavailable");
    await FileSystem.makeDirectoryAsync(photos, { intermediates: true });
    const stableId = `PHOTO-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const fileName = `${stableId}.${extensionFor(asset)}`;
    const destination = `${photos}${fileName}`;
    try {
      await FileSystem.copyAsync({ from: asset.uri, to: destination });
    } catch {
      throw new DomainError("No pudimos copiar la foto al almacenamiento seguro de la aplicación.", "photo_copy_failed");
    }
    return { stableId, uri: destination, fileName, mimeType: asset.mimeType ?? "image/jpeg" };
  }

  async remove(uri: string): Promise<void> {
    const { FileSystem } = await directories();
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }

  /** Development helper: removes every stored photo file. */
  async clearAllPhotos(): Promise<void> {
    if (!this.isAvailable()) return;
    const { FileSystem, photos } = await directories();
    await FileSystem.deleteAsync(photos, { idempotent: true });
  }

  async readBase64(uri: string): Promise<string> {
    const { FileSystem } = await directories();
    return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  }

  async writeBase64(fileName: string, content: string): Promise<string> {
    const { FileSystem, photos } = await directories();
    await FileSystem.makeDirectoryAsync(photos, { intermediates: true });
    const destination = `${photos}${fileName}`;
    await FileSystem.writeAsStringAsync(destination, content, { encoding: FileSystem.EncodingType.Base64 });
    return destination;
  }

  async createRestoreStage(id: string): Promise<string> {
    const { FileSystem, restore } = await directories();
    const uri = `${restore}${id}/`;
    await FileSystem.deleteAsync(uri, { idempotent: true });
    await FileSystem.makeDirectoryAsync(`${uri}incoming/`, { intermediates: true });
    await FileSystem.makeDirectoryAsync(`${uri}previous/`, { intermediates: true });
    return uri;
  }

  async writeStageManifest(stageUri: string, content: string): Promise<void> {
    const { FileSystem } = await directories();
    await FileSystem.writeAsStringAsync(`${stageUri}manifest.json`, content, { encoding: FileSystem.EncodingType.UTF8 });
  }

  async stagePhoto(stageUri: string, fileName: string, content: string): Promise<string> {
    const { FileSystem } = await directories();
    const destination = `${stageUri}incoming/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await FileSystem.writeAsStringAsync(destination, content, { encoding: FileSystem.EncodingType.Base64 });
    return destination;
  }

  async promotePhoto(stageUri: string, stagedUri: string, fileName: string): Promise<PhotoPromotion> {
    const { FileSystem, photos } = await directories();
    await FileSystem.makeDirectoryAsync(photos, { intermediates: true });
    const liveUri = `${photos}${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const info = await FileSystem.getInfoAsync(liveUri);
    const previousUri = info.exists ? `${stageUri}previous/${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}` : null;
    if (previousUri) await FileSystem.copyAsync({ from: liveUri, to: previousUri });
    try {
      await FileSystem.copyAsync({ from: stagedUri, to: liveUri });
    } catch (error) {
      if (previousUri) await FileSystem.copyAsync({ from: previousUri, to: liveUri }).catch(() => undefined);
      else await FileSystem.deleteAsync(liveUri, { idempotent: true }).catch(() => undefined);
      throw error;
    }
    return { liveUri, previousUri };
  }

  async rollbackPromotion(promotion: PhotoPromotion): Promise<void> {
    const { FileSystem } = await directories();
    if (promotion.previousUri) {
      await FileSystem.copyAsync({ from: promotion.previousUri, to: promotion.liveUri });
    } else {
      await FileSystem.deleteAsync(promotion.liveUri, { idempotent: true });
    }
  }

  async cleanupRestoreStage(stageUri: string): Promise<void> {
    const { FileSystem } = await directories();
    await FileSystem.deleteAsync(stageUri, { idempotent: true });
  }
}
