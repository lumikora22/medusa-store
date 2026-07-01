import { api, isNotFoundError } from "./client";
import type { Item } from "../types";

type ScannerApi = Pick<typeof api, "scanItem" | "scanContainer">;

export type ScannedCodeResolution =
  | { type: "item"; item: Item }
  | { type: "container"; items: Item[] };

export async function resolveScannedCode(
  code: string,
  scannerApi: ScannerApi = api,
): Promise<ScannedCodeResolution> {
  try {
    const item = await scannerApi.scanItem(code);
    return { type: "item", item };
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const result = await scannerApi.scanContainer(code);
  return { type: "container", items: result.items };
}
