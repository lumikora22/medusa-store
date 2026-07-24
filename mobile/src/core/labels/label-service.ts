import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import QRCode from "qrcode";

import type { Item, LocationSummary } from "../../domain/models";
import { code128Svg } from "./code128";

export type LabelSize = "item-small" | "location-large" | "sheet";
export type LabelRecord = { kind: "item"; item: Item } | { kind: "location"; location: LocationSummary };

/** Compact Medusa mark inlined so labels carry the brand without external assets. */
const MEDUSA_MARK = `<svg viewBox="0 0 200 260" class="mark"><g fill="#14263D">
<path d="M96 18C65 23 39 51 24 93c9 8 21 10 34 3 19-10 33-43 38-78Z"/><path d="M101 18c-3 27-11 56-26 74 8 8 17 12 26 12s18-4 26-12c-15-18-23-47-26-74Z"/><path d="M106 18c31 5 57 33 72 75-9 8-21 10-34 3-19-10-33-43-38-78Z"/><path d="M56 105c17 18 8 37 1 54-9 21-6 40 3 53-15-10-22-26-18-44 4-18 22-37 17-52-1-5-2-8-3-11Z"/><path d="M72 105c15 22 5 43-2 61-8 23-3 47 13 62-11-25-2-44 9-63 13-23 8-45-4-60H72Z"/><path d="M94 106c3 29-10 50-8 78 2 23 11 44 15 57 8-15 16-31 15-51-1-28-11-55-8-84H94Z"/><path d="M130 105c-15 22-5 43 2 61 8 23 3 47-13 62 11-25 2-44-9-63-13-23-8-45 4-60h16Z"/><path d="M146 105c-17 18-8 37-1 54 9 21 6 40-3 53 15-10 22-26 18-44-4-18-22-37-17-52 1-5 2-8 3-11Z"/>
</g></svg>`;

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

async function itemLabel(item: Item): Promise<string> {
  const qr = await QRCode.toString(item.machineCode, { type: "svg", margin: 0, width: 120, color: { dark: "#14263D", light: "#FFFDF8" } });
  const barcode = code128Svg(item.machineCode, 1.2, 40);
  const tags = item.tags.slice(0, 3).map(escapeHtml).join(" · ");
  return `<article class="label item">
    <div class="head">${MEDUSA_MARK}<span class="brand">MEDUSA STORE</span><span class="price">$${escapeHtml(item.price)}</span></div>
    <div class="main"><div class="txt"><strong>${escapeHtml(item.code)}</strong>${tags ? `<span class="meta">${tags}</span>` : ""}<small>${escapeHtml(item.machineCode)}</small></div><div class="qr">${qr}</div></div>
    <div class="bar">${barcode}</div>
  </article>`;
}

async function locationLabel(location: LocationSummary): Promise<string> {
  const qr = await QRCode.toString(location.machineCode, { type: "svg", margin: 0, width: 200, color: { dark: "#14263D", light: "#FFFDF8" } });
  const barcode = code128Svg(location.machineCode, 1.6, 56);
  return `<article class="label loc">
    <div class="head">${MEDUSA_MARK}<span class="brand">MEDUSA STORE · UBICACIÓN</span></div>
    <div class="main"><div class="txt"><strong>${escapeHtml(location.name)}</strong><span class="meta">${escapeHtml(location.code)} · ${escapeHtml(location.type)}</span></div><div class="qr big">${qr}</div></div>
    <div class="bar">${barcode}</div>
  </article>`;
}

function labelHtml(record: LabelRecord): Promise<string> {
  return record.kind === "item" ? itemLabel(record.item) : locationLabel(record.location);
}

export class LabelService {
  async createHtml(records: LabelRecord[], size: LabelSize, quantity = 1): Promise<string> {
    const copies = records.flatMap((record) => Array.from({ length: Math.max(1, quantity) }, () => record));
    const labels = await Promise.all(copies.map(labelHtml));
    const dimensions = size === "item-small" ? "width:45mm;height:30mm" : size === "location-large" ? "width:90mm;height:60mm" : "width:38mm;height:26mm";
    const barHeight = size === "location-large" ? "12mm" : "8mm";
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      @page{margin:6mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#14263D;display:flex;flex-wrap:wrap;gap:3mm;align-content:flex-start}
      .label{${dimensions};display:flex;flex-direction:column;gap:1mm;border:0.4mm solid #14263D;border-radius:2mm;padding:2mm;page-break-inside:avoid;background:#FFFDF8;overflow:hidden}
      .head{display:flex;align-items:center;gap:1.4mm;border-bottom:0.3mm solid #D9D0C2;padding-bottom:1mm}
      .mark{width:4mm;height:5mm;flex:none}
      .brand{font-size:6.5px;font-weight:800;letter-spacing:0.5px;color:#14263D;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .price{font-size:11px;font-weight:900;color:#52705B}
      .main{flex:1;display:flex;justify-content:space-between;align-items:center;gap:2mm;min-height:0}
      .txt{display:flex;flex-direction:column;gap:0.4mm;min-width:0;flex:1}
      .txt strong{font-size:13px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .txt .meta{font-size:8px;color:#36516F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .txt small{font-size:6.5px;color:#687382}
      .qr svg{width:12mm;height:12mm}.qr.big svg{width:22mm;height:22mm}
      .loc .txt strong{font-size:15px}
      .bar{display:flex;justify-content:center}.bar svg{max-width:100%;height:${barHeight}}
    </style></head><body>${labels.join("")}</body></html>`;
  }

  async print(records: LabelRecord[], size: LabelSize, quantity = 1): Promise<void> {
    await Print.printAsync({ html: await this.createHtml(records, size, quantity) });
  }

  async createAndSharePdf(records: LabelRecord[], size: LabelSize, quantity = 1): Promise<string> {
    const result = await Print.printToFileAsync({ html: await this.createHtml(records, size, quantity), margins: { top: 20, right: 20, bottom: 20, left: 20 } });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(result.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: "Compartir etiquetas" });
    return result.uri;
  }
}
