import { DomainError } from "./errors";

export function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "-");
}

export function assertValidCode(value: string): string {
  const code = normalizeCode(value);
  if (!/^[A-Z0-9][A-Z0-9-]{2,39}$/.test(code)) {
    throw new DomainError("Use entre 3 y 40 caracteres: letras, números y guiones.", "invalid_code");
  }
  return code;
}

export function normalizeMoney(value: string, allowZero = false): string {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new DomainError("Ingrese un importe válido con hasta dos decimales.", "invalid_money");
  }
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || (allowZero ? amount < 0 : amount <= 0)) {
    throw new DomainError("Ingrese un importe válido.", "invalid_money");
  }
  return amount.toFixed(2);
}

export function stableItemCode(id: number): string {
  return `MSI-${String(id).padStart(6, "0")}`;
}

export function stableLocationCode(id: number): string {
  return id === -1 ? "LOC-UNASSIGNED" : `LOC-${String(id).padStart(6, "0")}`;
}

export function generatedItemCode(sequence: number): string {
  return `ITEM-${String(sequence).padStart(6, "0")}`;
}

export function generatedLocationCode(type: string, sequence: number): string {
  const prefix: Record<string, string> = { box: "BOX", bag: "BAG", rack: "RACK", shelf: "SHELF", display: "ZONE", transition: "TRANS", other: "LOC" };
  return `${prefix[type] ?? "LOC"}-${String(sequence).padStart(4, "0")}`;
}

export function parseTags(value: string): string[] {
  return [...new Set(value.split(",").map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}
