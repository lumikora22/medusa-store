import type { Container, InventoryStatus } from "../types";

export function formatMoney(value: string | number): string {
  const numericValue = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numericValue)) {
    return `$${value}`;
  }
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(numericValue);
}

export function getContainerTypeLabel(type: Container["type"]): string {
  const labels: Record<Container["type"], string> = {
    box: "Caja",
    bag: "Bolsa",
    other: "Otro",
  };
  return labels[type] ?? type;
}

export function getStatusLabel(status: InventoryStatus): string {
  const labels: Record<InventoryStatus, string> = {
    active: "Activo",
    sold: "Vendido",
    archived: "Archivado",
  };
  return labels[status] ?? status;
}

export function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
