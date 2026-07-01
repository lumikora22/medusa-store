import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { api, fetchAllPaginated, getApiToken, setApiToken } from "./client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  setApiToken(null);
});

test("does not bootstrap a token from public Expo environment", () => {
  process.env.EXPO_PUBLIC_API_TOKEN = "public-token";

  assert.equal(getApiToken(), null);

  delete process.env.EXPO_PUBLIC_API_TOKEN;
});

test("sends the active session API token", async () => {
  setApiToken("test-token");
  let authorizationHeader: string | undefined;

  globalThis.fetch = async (_input, init) => {
    authorizationHeader = (init?.headers as Record<string, string>).Authorization;
    return new Response(JSON.stringify({ count: 0, next: null, previous: null, results: [] }), { status: 200 });
  };

  await api.listItems();

  assert.equal(authorizationHeader, "Token test-token");
});

test("surfaces API detail errors", async () => {
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ detail: "Authentication credentials were not provided." }), { status: 401 });

  await assert.rejects(api.listItems(), /Authentication credentials were not provided/);
});

test("fetches every paginated result page", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    if (String(input).includes("page=2")) {
      return new Response(
        JSON.stringify({ count: 3, next: null, previous: "/items/", results: [{ id: 3 }] }),
        { status: 200 },
      );
    }

    return new Response(
      JSON.stringify({ count: 3, next: "http://api.test/items/?page=2", previous: null, results: [{ id: 1 }, { id: 2 }] }),
      { status: 200 },
    );
  };

  const results = await fetchAllPaginated<{ id: number }>("/items/");

  assert.deepEqual(results.map((result) => result.id), [1, 2, 3]);
  assert.equal(requestedUrls.length, 2);
});

test("fetches a single active inventory page without draining all pages", async () => {
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input) => {
    requestedUrls.push(String(input));
    return new Response(
      JSON.stringify({ count: 30, next: "http://api.test/items/?page=2", previous: null, results: [{ id: 1 }] }),
      { status: 200 },
    );
  };

  const page = await api.listItemsPage();

  assert.equal(page.count, 30);
  assert.equal(page.results.length, 1);
  assert.equal(requestedUrls.length, 1);
});

test("creates items without a custom code so the backend can generate it", async () => {
  let body = "";

  globalThis.fetch = async (_input, init) => {
    body = String(init?.body);
    return new Response(
      JSON.stringify({ id: 1, code: "ITEM-20260630-123456", qr_value: "ITEM-20260630-123456" }),
      { status: 200 },
    );
  };

  await api.createItem({ container: 1, price: "12.00", description: "", tags: [] });

  assert.equal(JSON.parse(body).code, undefined);
});

test("does not set a JSON content type for photo uploads", async () => {
  let contentType: string | undefined;

  globalThis.fetch = async (_input, init) => {
    contentType = (init?.headers as Record<string, string>)["Content-Type"];
    return new Response(JSON.stringify({ id: 1, item: 1, image: "photo.jpg", image_url: null, alt_text: "" }), { status: 200 });
  };

  await api.uploadItemPhoto(1, { uri: "file:///photo.jpg", fileName: "photo.jpg", mimeType: "image/jpeg" });

  assert.equal(contentType, undefined);
});
