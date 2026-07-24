import { normalizeCode } from "../../domain/codes";
import { getDatabase } from "../sqlite/database";

export type CodeOwner = { entityType: "item" | "location"; entityId: number; kind: "display" | "machine" | "legacy" };

export class CodeRepository {
  async resolve(value: string): Promise<CodeOwner | null> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ entity_type: CodeOwner["entityType"]; entity_id: number; kind: CodeOwner["kind"] }>(
      "SELECT entity_type, entity_id, kind FROM code_registry WHERE value = ? COLLATE NOCASE",
      normalizeCode(value),
    );
    return row ? { entityType: row.entity_type, entityId: Number(row.entity_id), kind: row.kind } : null;
  }
}
