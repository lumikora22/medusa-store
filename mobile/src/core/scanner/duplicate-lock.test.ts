import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DuplicateScanLock } from "./duplicate-lock";

describe("DuplicateScanLock", () => {
  it("accepts a first scan at any timestamp", () => {
    const lock = new DuplicateScanLock(1_500);
    assert.equal(lock.accept("item-1", 0), true);
  });

  it("normalizes codes and suppresses only the lock window", () => {
    const lock = new DuplicateScanLock(1_500);
    assert.equal(lock.accept(" item-1 ", 10_000), true);
    assert.equal(lock.accept("ITEM-1", 11_499), false);
    assert.equal(lock.accept("ITEM-1", 11_500), true);
    assert.equal(lock.accept("ITEM-2", 11_500), true);
  });

  it("can be reset explicitly", () => {
    const lock = new DuplicateScanLock();
    assert.equal(lock.accept("ITEM-1", 10_000), true);
    lock.clear();
    assert.equal(lock.accept("ITEM-1", 10_001), true);
  });
});
