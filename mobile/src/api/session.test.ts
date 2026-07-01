import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { getApiToken, setApiToken } from "./client";
import { bootstrapSession, loginSession, logoutSession, TOKEN_STORAGE_KEY, type TokenStorage } from "./session";

const originalFetch = globalThis.fetch;

function createStorage(initialToken: string | null = null): TokenStorage & { savedToken: string | null; deletedKeys: string[] } {
  return {
    savedToken: initialToken,
    deletedKeys: [],
    async getItemAsync() {
      return this.savedToken;
    },
    async setItemAsync(_key, value) {
      this.savedToken = value;
    },
    async deleteItemAsync(key) {
      this.deletedKeys.push(key);
      this.savedToken = null;
    },
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  setApiToken(null);
});

test("bootstraps the stored token into the API client", async () => {
  const storage = createStorage("stored-token");

  const token = await bootstrapSession(storage);

  assert.equal(token, "stored-token");
  assert.equal(getApiToken(), "stored-token");
});

test("bootstraps to a logged-out state when secure storage fails", async () => {
  const storage = createStorage();
  storage.getItemAsync = async () => {
    throw new Error("Secure storage unavailable");
  };

  const token = await bootstrapSession(storage);

  assert.equal(token, null);
  assert.equal(getApiToken(), null);
});

test("logs in, stores the returned token, and activates it for later requests", async () => {
  const storage = createStorage();
  globalThis.fetch = async () => new Response(JSON.stringify({ token: "login-token" }), { status: 200 });

  const token = await loginSession({ username: "admin", password: "test-pass" }, storage);

  assert.equal(token, "login-token");
  assert.equal(storage.savedToken, "login-token");
  assert.equal(getApiToken(), "login-token");
});

test("login failure does not store or activate a token", async () => {
  const storage = createStorage();
  globalThis.fetch = async () => new Response(JSON.stringify({ detail: "Unable to log in with provided credentials." }), { status: 400 });

  await assert.rejects(loginSession({ username: "admin", password: "wrong" }, storage), /Unable to log in/);

  assert.equal(storage.savedToken, null);
  assert.equal(getApiToken(), null);
});

test("logout clears the active token and secure storage", async () => {
  const storage = createStorage("stored-token");
  setApiToken("stored-token");

  await logoutSession(storage);

  assert.equal(getApiToken(), null);
  assert.equal(storage.savedToken, null);
  assert.deepEqual(storage.deletedKeys, [TOKEN_STORAGE_KEY]);
});
