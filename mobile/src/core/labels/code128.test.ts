import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { code128Bars, code128Svg } from "./code128";

describe("Code 128 rendering", () => {
  it("renders a Code 128 B symbol with quiet zones and stop pattern", () => {
    const barcode = code128Bars("A", 1, 40);
    assert.equal(barcode.width, 66);
    assert.equal(barcode.height, 40);
    assert.equal(barcode.bars.length, 13);
    assert.equal(barcode.bars[0]?.x, 10);
    assert.ok(barcode.bars.every((bar) => bar.width > 0));
  });

  it("normalizes letters and emits self-contained SVG", () => {
    assert.deepEqual(code128Bars("item-1"), code128Bars("ITEM-1"));
    const svg = code128Svg("ITEM-1");
    assert.match(svg, /^<svg xmlns=/);
    assert.match(svg, /<rect /);
    assert.match(svg, /fill="#0D1B2A"/);
  });

  it("rejects characters outside printable ASCII", () => {
    assert.throws(() => code128Bars("NIÑO"), /printable ASCII/);
  });
});
