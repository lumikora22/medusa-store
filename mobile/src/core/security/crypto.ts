import * as Crypto from "expo-crypto";

import type { CryptoPort } from "./exhibition-lock";

/** Production adapter: Expo Crypto works on native and web, unlike bare Web Crypto in React Native. */
export const expoCryptoPort: CryptoPort = {
  randomBytes: (count) => Crypto.getRandomBytes(count),
  sha256Hex: (input) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
};
