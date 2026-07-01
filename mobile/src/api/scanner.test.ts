import assert from "node:assert/strict";
import { test } from "node:test";

import { ApiError } from "./client";
import { resolveScannedCode } from "./scanner";
import type { Item } from "../types";

const item: Item = {
  id: 1,
  code: "ITEM-0001",
  qr_value: "ITEM-0001",
  container: 1,
  container_code: "BOX-0001",
  status: "active",
  price: "25.00",
  description: "Vintage jacket",
  tags: [],
  sold_at: null,
  photos: [],
};

test("resolves an item code without scanning containers", async () => {
  let containerScanCount = 0;

  const result = await resolveScannedCode("ITEM-0001", {
    scanItem: async () => item,
    scanContainer: async () => {
      containerScanCount += 1;
      return { container: { id: 1, code: "BOX-0001", qr_value: "BOX-0001", type: "box", status: "active", notes: "" }, items: [] };
    },
  });

  assert.equal(result.type, "item");
  assert.equal(containerScanCount, 0);
});

test("falls back to container scan only after item scan returns 404", async () => {
  const result = await resolveScannedCode("BOX-0001", {
    scanItem: async () => {
      throw new ApiError("Not found.", 404);
    },
    scanContainer: async () => ({
      container: { id: 1, code: "BOX-0001", qr_value: "BOX-0001", type: "box", status: "active", notes: "" },
      items: [item],
    }),
  });

  assert.equal(result.type, "container");
  assert.deepEqual(result.items.map((containerItem) => containerItem.code), ["ITEM-0001"]);
});

test("does not fall back to container scan for auth failures", async () => {
  let containerScanCount = 0;

  await assert.rejects(
    resolveScannedCode("ITEM-0001", {
      scanItem: async () => {
        throw new ApiError("Authentication credentials were not provided.", 401);
      },
      scanContainer: async () => {
        containerScanCount += 1;
        return { container: { id: 1, code: "BOX-0001", qr_value: "BOX-0001", type: "box", status: "active", notes: "" }, items: [] };
      },
    }),
    /Authentication credentials were not provided/,
  );
  assert.equal(containerScanCount, 0);
});

test("does not fall back to container scan for network or malformed-response failures", async () => {
  let containerScanCount = 0;

  await assert.rejects(
    resolveScannedCode("ITEM-0001", {
      scanItem: async () => {
        throw new SyntaxError("Unexpected token in JSON");
      },
      scanContainer: async () => {
        containerScanCount += 1;
        return { container: { id: 1, code: "BOX-0001", qr_value: "BOX-0001", type: "box", status: "active", notes: "" }, items: [] };
      },
    }),
    /Unexpected token/,
  );

  await assert.rejects(
    resolveScannedCode("ITEM-0001", {
      scanItem: async () => {
        throw new TypeError("Network request failed");
      },
      scanContainer: async () => {
        containerScanCount += 1;
        return { container: { id: 1, code: "BOX-0001", qr_value: "BOX-0001", type: "box", status: "active", notes: "" }, items: [] };
      },
    }),
    /Network request failed/,
  );

  assert.equal(containerScanCount, 0);
});

test("surfaces container scan errors after a real item 404", async () => {
  await assert.rejects(
    resolveScannedCode("MISSING", {
      scanItem: async () => {
        throw new ApiError("Item not found.", 404);
      },
      scanContainer: async () => {
        throw new ApiError("Container not found.", 404);
      },
    }),
    /Container not found/,
  );
});
