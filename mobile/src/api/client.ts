import type { Container, DashboardSummary, Item, ItemPhoto, Paginated } from "../types";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8000/api";
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

let sessionToken: string | null = null;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function setApiToken(token: string | null): void {
  sessionToken = token;
}

export function getApiToken(): string | null {
  return sessionToken;
}

function getRequestHeaders(options: RequestInit): Record<string, string> {
  const isMultipart = typeof FormData !== "undefined" && options.body instanceof FormData;
  return {
    Accept: "application/json",
    ...(isMultipart ? {} : { "Content-Type": "application/json" }),
    ...(sessionToken ? { Authorization: `Token ${sessionToken}` } : {}),
    ...(options.headers as Record<string, string> | undefined),
  };
}

function getRequestUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  return `${API_BASE_URL}${pathOrUrl}`;
}

async function getErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return `Request failed with ${response.status}`;
  }

  try {
    const data = JSON.parse(text) as {
      detail?: string;
      [key: string]: unknown;
    };
    if (typeof data.detail === "string") {
      return data.detail;
    }
    const fieldErrors = Object.values(data).flatMap((value) => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === "string");
      return [];
    });
    if (fieldErrors.length > 0) {
      return fieldErrors.join(" ");
    }
  } catch {
    // Fall back to the raw response body below.
  }

  return text;
}

function toQueryString(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value?.trim()) {
      query.set(key, value.trim());
    }
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(getRequestUrl(path), {
    ...options,
    headers: getRequestHeaders(options),
  });

  if (!response.ok) {
    throw new ApiError(await getErrorMessage(response), response.status);
  }

  return response.json() as Promise<T>;
}

function isPaginated<T>(data: Paginated<T> | T[]): data is Paginated<T> {
  return !Array.isArray(data) && Array.isArray(data.results);
}

export async function fetchAllPaginated<T>(path: string): Promise<T[]> {
  const firstPage = await request<Paginated<T> | T[]>(path);
  if (!isPaginated(firstPage)) {
    return firstPage;
  }

  const allResults = [...firstPage.results];
  let nextUrl = firstPage.next;
  const seenUrls = new Set<string>();

  while (nextUrl) {
    if (seenUrls.has(nextUrl)) {
      throw new Error("Paginated API returned a repeated next page URL.");
    }
    seenUrls.add(nextUrl);
    const page = await request<Paginated<T>>(nextUrl);
    allResults.push(...page.results);
    nextUrl = page.next;
  }

  return allResults;
}

export async function fetchPaginatedPage<T>(path: string): Promise<Paginated<T>> {
  const page = await request<Paginated<T> | T[]>(path);
  if (!isPaginated(page)) {
    return {
      count: page.length,
      next: null,
      previous: null,
      results: page,
    };
  }

  return page;
}

export type PhotoUploadAsset = {
  uri: string;
  fileName?: string | null;
  mimeType?: string | null;
};

export type CreateItemPayload = {
  code?: string;
  container: number;
  price: string;
  description: string;
  tags: string[];
};

export type UpdateItemPayload = Partial<Pick<Item, "price" | "description" | "tags">>;

function getPhotoFileName(photo: PhotoUploadAsset): string {
  if (photo.fileName) {
    return photo.fileName;
  }
  const uriName = photo.uri.split("/").pop();
  return uriName && uriName.includes(".") ? uriName : "item-photo.jpg";
}

export const api = {
  login: (payload: { username: string; password: string }) =>
    request<{ token: string }>("/auth/token/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  dashboardSummary: () => request<DashboardSummary>("/items/summary/"),
  listItems: () => fetchAllPaginated<Item>("/items/"),
  listItemsPage: (path = "/items/") => fetchPaginatedPage<Item>(path),
  listInventoryPage: (filters: { search?: string; containerCode?: string } = {}) =>
    fetchPaginatedPage<Item>(`/items/${toQueryString({ search: filters.search, container_code: filters.containerCode })}`),
  listSoldItemsPage: (path = "/items/?status=sold") => fetchPaginatedPage<Item>(path),
  createItem: (payload: CreateItemPayload) =>
    request<Item>("/items/", { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (id: number, payload: UpdateItemPayload) =>
    request<Item>(`/items/${id}/`, { method: "PATCH", body: JSON.stringify(payload) }),
  scanItem: (code: string) =>
    request<Item>(`/items/scan/${encodeURIComponent(code)}/`),
  markSold: (id: number) =>
    request<Item>(`/items/${id}/mark_sold/`, {
      method: "POST",
      body: JSON.stringify({}),
    }),
  moveItem: (id: number, containerCode: string) =>
    request<Item>(`/items/${id}/move/`, {
      method: "POST",
      body: JSON.stringify({ container_code: containerCode }),
    }),
  uploadItemPhoto: (itemId: number, photo: PhotoUploadAsset, altText = "") => {
    const formData = new FormData();
    formData.append("item", String(itemId));
    formData.append("alt_text", altText);
    formData.append("image", {
      uri: photo.uri,
      name: getPhotoFileName(photo),
      type: photo.mimeType ?? "image/jpeg",
    } as unknown as Blob);

    return request<ItemPhoto>("/photos/", {
      method: "POST",
      body: formData,
    });
  },
  listContainers: () => fetchAllPaginated<Container>("/containers/"),
  createContainer: (payload: {
    code: string;
    type: Container["type"];
    notes?: string;
  }) =>
    request<Container>("/containers/", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  scanContainer: (code: string) =>
    request<{ container: Container; items: Item[] }>(
      `/containers/scan/${encodeURIComponent(code)}/`,
    ),
};
