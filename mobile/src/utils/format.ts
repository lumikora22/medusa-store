import type { EventType, ItemStatus, LocationType, PrecisionMode } from "../domain/models";

const moneyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 });
const dateFormatter = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export function formatMoney(value: string | number | null): string {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? moneyFormatter.format(numeric) : String(value ?? "");
}

export function formatDate(value: string | null): string {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

export function locationTypeLabel(type: LocationType): string {
  const labels: Record<LocationType, string> = { box: "Caja", bag: "Bolsa", rack: "Rack", shelf: "Estante", display: "Zona de exhibición", transition: "En transición", other: "Otra" };
  return labels[type];
}

export function precisionLabel(value: PrecisionMode): string {
  return value === "strict" ? "Ubicación exacta" : "Ubicación flexible";
}

/** Storage-oriented icons (box, bag, rack…) rather than a map pin. */
export function locationTypeIcon(type: LocationType): "package-variant-closed" | "shopping-outline" | "hanger" | "bookshelf" | "storefront-outline" | "swap-horizontal" | "archive-outline" {
  const icons = { box: "package-variant-closed", bag: "shopping-outline", rack: "hanger", shelf: "bookshelf", display: "storefront-outline", transition: "swap-horizontal", other: "archive-outline" } as const;
  return icons[type];
}

export function itemStatusLabel(status: ItemStatus): string {
  return { active: "Disponible", sold: "Vendida", archived: "Archivada" }[status];
}

export function eventTypeLabel(type: EventType): string {
  const labels: Record<EventType, string> = {
    item_created: "Creación", item_updated: "Edición", item_archived: "Archivo", photo_added: "Foto agregada", photo_removed: "Foto eliminada",
    photos_reordered: "Fotos ordenadas", item_moved: "Movimiento", batch_moved: "Traslado", batch_undone: "Traslado deshecho", item_sold: "Venta",
    sale_restored: "Venta restaurada", location_created: "Ubicación creada", location_updated: "Ubicación editada",
    physical_count_started: "Conteo iniciado", physical_count_completed: "Conteo finalizado", physical_count_cancelled: "Conteo cancelado",
  };
  return labels[type];
}
