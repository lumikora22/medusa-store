export type EntityId = number;
export type SyncStatus = "local" | "pending" | "synced" | "conflict";
export type ItemStatus = "active" | "sold" | "archived";
export type LocationStatus = "active" | "archived";
export type LocationType = "box" | "bag" | "rack" | "shelf" | "display" | "transition" | "other";
export type PrecisionMode = "strict" | "flexible";
export type CatalogStatusFilter = "all" | "active" | "sold" | "archived";
export type PhotoFilter = "all" | "with" | "without";
export type CatalogSort = "newest" | "updated" | "price-asc" | "price-desc" | "code";
export type CatalogView = "grid" | "list" | "quick";
export type EventType =
  | "item_created"
  | "item_updated"
  | "item_archived"
  | "photo_added"
  | "photo_removed"
  | "photos_reordered"
  | "item_moved"
  | "batch_moved"
  | "batch_undone"
  | "item_sold"
  | "sale_restored"
  | "location_created"
  | "location_updated"
  | "physical_count_started"
  | "physical_count_completed"
  | "physical_count_cancelled";

export type ItemPhoto = {
  id: EntityId;
  stableId: string;
  itemId: EntityId;
  uri: string;
  fileName: string;
  mimeType: string;
  altText: string;
  sortOrder: number;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type LocationSummary = {
  id: EntityId;
  stableId: string;
  code: string;
  machineCode: string;
  name: string;
  type: LocationType;
  precisionMode: PrecisionMode;
  status: LocationStatus;
  notes: string;
  favorite: boolean;
  isSystem: boolean;
  itemCount: number;
  totalValue: string;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
};

export type Item = {
  id: EntityId;
  stableId: string;
  code: string;
  machineCode: string;
  status: ItemStatus;
  price: string;
  /** Total pieces held by this record; every piece lives in the same location. */
  quantity: number;
  soldQuantity: number;
  availableQuantity: number;
  /** Price of the most recent sale, kept for display; each sale keeps its own in `item_sales`. */
  soldPrice: string | null;
  description: string;
  tags: string[];
  currentLocationId: EntityId | null;
  currentLocation: LocationSummary | null;
  lastLocationId: EntityId | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  syncStatus: SyncStatus;
  photos: ItemPhoto[];
};

/** One sale of `quantity` pieces; `restoredQuantity` tracks how many already came back. */
export type ItemSale = {
  id: EntityId;
  stableId: string;
  itemId: EntityId;
  quantity: number;
  restoredQuantity: number;
  restorableQuantity: number;
  soldPrice: string | null;
  soldAt: string;
  locationId: EntityId | null;
  createdAt: string;
};

export type CatalogFilters = {
  search: string;
  status: CatalogStatusFilter;
  photo: PhotoFilter;
  unassignedOnly: boolean;
  locationId: EntityId | null;
  locationType: LocationType | null;
  sort: CatalogSort;
};

export type Page<T> = {
  results: T[];
  total: number;
  nextOffset: number | null;
};

export type DashboardSummary = {
  activeCount: number;
  soldCount: number;
  locationCount: number;
  activeValue: string;
  soldValue: string;
  unassignedCount: number;
  withoutPhotoCount: number;
};

export type InventoryEvent = {
  id: EntityId;
  stableId: string;
  type: EventType;
  itemId: EntityId | null;
  itemCode: string | null;
  locationId: EntityId | null;
  locationCode: string | null;
  batchId: EntityId | null;
  reverseOfEventId: EntityId | null;
  summary: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

export type CreateItemInput = {
  code?: string;
  price: string;
  description: string;
  tags: string[];
  locationId: EntityId | null;
  /** Pieces held by the record; defaults to a single piece. */
  quantity?: number;
};

export type UpdateItemInput = Partial<Pick<CreateItemInput, "code" | "price" | "description" | "tags" | "locationId" | "quantity">>;

export type CreateLocationInput = {
  code?: string;
  name: string;
  type: LocationType;
  precisionMode: PrecisionMode;
  notes: string;
};

export type UpdateLocationInput = Partial<Omit<CreateLocationInput, "code">> & { code?: string; status?: LocationStatus; favorite?: boolean };

export type PhotoAsset = { uri: string; fileName?: string | null; mimeType?: string | null };

export type ScanResolution =
  | { type: "item"; item: Item }
  | { type: "location"; location: LocationSummary }
  | { type: "unknown"; code: string };

export type BatchCandidate = { item: Item; accepted: boolean; reason: string | null };

export type TransferResult = {
  batchId: EntityId;
  destination: LocationSummary;
  movedItems: Item[];
  expiresAt: string;
};

export type MultiSaleResult = { soldItems: Item[]; soldAt: string };

export type HistoryFilters = {
  from?: string;
  to?: string;
  itemId?: EntityId;
  originLocationId?: EntityId;
  destinationLocationId?: EntityId;
  type?: EventType;
  search?: string;
};

/** A record and how many of its pieces fell into a given count bucket. */
export type PhysicalCountLine = { item: Item; pieces: number };

export type PhysicalCountResult = {
  id: EntityId;
  locationId: EntityId;
  status: "open" | "completed" | "cancelled";
  /** Counts are in pieces, not records: a record with 5 pieces expects 5 reads. */
  expectedCount: number;
  scannedCount: number;
  matchedPieces: number;
  unexpectedPieces: number;
  missingPieces: number;
  matched: PhysicalCountLine[];
  unexpected: PhysicalCountLine[];
  missing: PhysicalCountLine[];
};

export type BackupSummary = {
  uri: string;
  createdAt: string;
  itemCount: number;
  locationCount: number;
  photoCount: number;
  checksum: string;
};

export type AppSettings = {
  backupReminderDays: number;
  largeInterface: boolean;
  scanSound: boolean;
  tutorialSeen: boolean;
  exhibitionMode: boolean;
  exhibitionPinSet: boolean;
  lastBackupAt: string | null;
  backupDue: boolean;
  backupDueInDays: number;
};

export const DEFAULT_CATALOG_FILTERS: CatalogFilters = {
  search: "",
  status: "active",
  photo: "all",
  unassignedOnly: false,
  locationId: null,
  locationType: null,
  sort: "newest",
};
