import assert from "node:assert/strict";
import { randomFillSync, webcrypto } from "node:crypto";
import { describe, it } from "node:test";

import { type CryptoPort, ExhibitionLock, isValidPin, PIN_LENGTH } from "./exhibition-lock";

const nodeCryptoPort: CryptoPort = {
  randomBytes: (count) => randomFillSync(new Uint8Array(count)),
  sha256Hex: async (input) => {
    const digest = await webcrypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  },
};

const lock = new ExhibitionLock(nodeCryptoPort);

describe("exhibition lock", () => {
  it("accepts only fixed-length numeric PINs", () => {
    assert.equal(isValidPin("1234"), true);
    assert.equal(isValidPin("0000"), true);
    assert.equal(isValidPin("123"), false);
    assert.equal(isValidPin("12345"), false);
    assert.equal(isValidPin("12a4"), false);
    assert.equal(isValidPin(" 1234"), false);
    assert.equal(isValidPin(""), false);
  });

  it("refuses to store a PIN that does not meet the rule", async () => {
    await assert.rejects(() => lock.createRecord("12"), new RegExp(`${PIN_LENGTH} d`));
  });

  it("never stores the PIN in clear text and salts every record", async () => {
    const first = await lock.createRecord("2468");
    const second = await lock.createRecord("2468");
    assert.ok(!first.includes("2468"));
    assert.notEqual(first, second, "the same PIN must produce different records");
    assert.equal(await lock.verify(first, "2468"), true);
    assert.equal(await lock.verify(second, "2468"), true);
  });

  it("rejects a wrong PIN and any malformed record", async () => {
    const record = await lock.createRecord("1357");
    assert.equal(await lock.verify(record, "1358"), false);
    assert.equal(await lock.verify(record, "135"), false);
    assert.equal(await lock.verify(null, "1357"), false);
    assert.equal(await lock.verify("", "1357"), false);
    assert.equal(await lock.verify("nosalt", "1357"), false);
    assert.equal(await lock.verify(":onlyhash", "1357"), false);
    assert.equal(await lock.verify("onlysalt:", "1357"), false);
  });
});
