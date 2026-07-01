import { api, type CreateItemPayload, type PhotoUploadAsset } from "./client";
import type { Item, ItemPhoto } from "../types";

type PhotoUploadApi = Pick<typeof api, "createItem" | "uploadItemPhoto">;

export type CreateItemWithPhotosResult = {
  item: Item;
  failedPhotoUploads: number;
};

export async function createItemWithPhotos(
  payload: CreateItemPayload,
  photos: PhotoUploadAsset[],
  photoApi: PhotoUploadApi = api,
): Promise<CreateItemWithPhotosResult> {
  const item = await photoApi.createItem(payload);
  const uploadedPhotos: ItemPhoto[] = [];
  let failedPhotoUploads = 0;

  for (const photo of photos) {
    try {
      uploadedPhotos.push(await photoApi.uploadItemPhoto(item.id, photo));
    } catch {
      failedPhotoUploads += 1;
    }
  }

  return {
    item: { ...item, photos: uploadedPhotos },
    failedPhotoUploads,
  };
}
