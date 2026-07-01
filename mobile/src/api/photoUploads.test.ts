import assert from "node:assert/strict";
import { test } from "node:test";

import { createItemWithPhotos } from "./photoUploads";
import type { Item, ItemPhoto } from "../types";

function createItem(id = 1): Item {
  return {
    id,
    code: `ITEM-${String(id).padStart(4, "0")}`,
    qr_value: `ITEM-${String(id).padStart(4, "0")}`,
    container: 1,
    container_code: "BOX-0001",
    status: "active",
    price: "25.00",
    description: "Vintage jacket",
    tags: [],
    sold_at: null,
    photos: [],
  };
}

function createPhoto(id: number): ItemPhoto {
  return { id, item: 1, image: `photo-${id}.jpg`, image_url: null, alt_text: "" };
}

test("uploads selected photos after item creation", async () => {
  const uploadedUris: string[] = [];

  const result = await createItemWithPhotos(
    { code: "ITEM-0001", container: 1, price: "25.00", description: "", tags: [] },
    [{ uri: "file:///front.jpg" }, { uri: "file:///back.jpg" }],
    {
      createItem: async () => createItem(1),
      uploadItemPhoto: async (_itemId, photo) => {
        uploadedUris.push(photo.uri);
        return createPhoto(uploadedUris.length);
      },
    },
  );

  assert.deepEqual(uploadedUris, ["file:///front.jpg", "file:///back.jpg"]);
  assert.equal(result.failedPhotoUploads, 0);
  assert.deepEqual(result.item.photos.map((photo) => photo.image), ["photo-1.jpg", "photo-2.jpg"]);
});

test("reports partial photo upload failures while preserving successful uploads", async () => {
  const result = await createItemWithPhotos(
    { code: "ITEM-0001", container: 1, price: "25.00", description: "", tags: [] },
    [{ uri: "file:///front.jpg" }, { uri: "file:///back.jpg" }],
    {
      createItem: async () => createItem(1),
      uploadItemPhoto: async (_itemId, photo) => {
        if (photo.uri.includes("back")) {
          throw new Error("Upload failed");
        }
        return createPhoto(1);
      },
    },
  );

  assert.equal(result.failedPhotoUploads, 1);
  assert.deepEqual(result.item.photos.map((photo) => photo.image), ["photo-1.jpg"]);
});

test("does not upload photos when none were selected", async () => {
  let uploadCount = 0;

  const result = await createItemWithPhotos(
    { code: "ITEM-0001", container: 1, price: "25.00", description: "", tags: [] },
    [],
    {
      createItem: async () => createItem(1),
      uploadItemPhoto: async () => {
        uploadCount += 1;
        return createPhoto(1);
      },
    },
  );

  assert.equal(uploadCount, 0);
  assert.equal(result.failedPhotoUploads, 0);
  assert.deepEqual(result.item.photos, []);
});
