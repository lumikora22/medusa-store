export type ContainerType = "box" | "bag" | "other";
export type InventoryStatus = "active" | "sold" | "archived";

export type Container = {
  id: number;
  code: string;
  qr_value: string;
  type: ContainerType;
  status: InventoryStatus;
  notes: string;
  active_items_count?: number;
};

export type ItemPhoto = {
  id: number;
  item: number;
  image: string;
  image_url: string | null;
  alt_text: string;
};

export type Item = {
  id: number;
  code: string;
  qr_value: string;
  container: number;
  container_code: string;
  status: InventoryStatus;
  price: string;
  description: string;
  tags: string[];
  sold_at: string | null;
  photos: ItemPhoto[];
};

export type Paginated<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type DashboardSummary = {
  active_items_count: number;
  sold_items_count: number;
  containers_count: number;
  active_inventory_value: string;
  sold_inventory_value: string;
};
