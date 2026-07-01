import { api, getApiToken, setApiToken } from "./client";

export const TOKEN_STORAGE_KEY = "medusa_store_api_token";

export type TokenStorage = {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
};

export type Credentials = {
  username: string;
  password: string;
};

export async function bootstrapSession(storage: TokenStorage): Promise<string | null> {
  const currentToken = getApiToken();
  if (currentToken) {
    return currentToken;
  }

  try {
    const storedToken = await storage.getItemAsync(TOKEN_STORAGE_KEY);
    if (storedToken) {
      setApiToken(storedToken);
    }
    return storedToken;
  } catch {
    return null;
  }
}

export async function saveSessionToken(token: string, storage: TokenStorage): Promise<void> {
  setApiToken(token);
  try {
    await storage.setItemAsync(TOKEN_STORAGE_KEY, token);
  } catch {
    // Keep the token for this app session even if secure persistence is unavailable.
  }
}

export async function loginSession(credentials: Credentials, storage: TokenStorage): Promise<string> {
  const response = await api.login(credentials);
  if (!response.token) {
    throw new Error("Login response did not include a token.");
  }

  await saveSessionToken(response.token, storage);
  return response.token;
}

export async function logoutSession(storage: TokenStorage): Promise<void> {
  setApiToken(null);
  try {
    await storage.deleteItemAsync(TOKEN_STORAGE_KEY);
  } catch {
    // Nothing else is required for session logout.
  }
}
