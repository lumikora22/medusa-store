import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { assertValidCode, generatedItemCode, generatedLocationCode, normalizeCode, normalizeMoney, parseTags, stableItemCode, stableLocationCode } from "./codes";

describe("inventory code rules", () => {
  it("normalizes and validates human-entered codes", () => {
    assert.equal(normalizeCode("  caja norte  2 "), "CAJA-NORTE-2");
    assert.equal(assertValidCode(" item 42 "), "ITEM-42");
    assert.throws(() => assertValidCode("a"), /3 y 40/);
    assert.throws(() => assertValidCode("ITEM_42"), /letras, números y guiones/);
  });

  it("normalizes money without losing decimal precision", () => {
    assert.equal(normalizeMoney(" 12,5 "), "12.50");
    assert.equal(normalizeMoney("0", true), "0.00");
    assert.throws(() => normalizeMoney("0"), /importe válido/);
    assert.throws(() => normalizeMoney("12.345"), /dos decimales/);
  });

  it("generates stable and human-facing identifiers", () => {
    assert.equal(stableItemCode(42), "MSI-000042");
    assert.equal(stableLocationCode(-1), "LOC-UNASSIGNED");
    assert.equal(generatedItemCode(9), "ITEM-000009");
    assert.equal(generatedLocationCode("rack", 3), "RACK-0003");
    assert.equal(generatedLocationCode("unknown", 3), "LOC-0003");
  });

  it("deduplicates normalized tags while preserving order", () => {
    assert.deepEqual(parseTags(" Denim, azul, denim, , AZUL "), ["denim", "azul"]);
  });
});
