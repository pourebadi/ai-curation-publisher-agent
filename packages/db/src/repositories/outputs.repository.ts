import type { GeneratedOutput, OutputTarget } from "@curator/core";
import type { D1DatabaseLike } from "../client";

export class OutputsRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findLatestForItem(itemId: string, target: OutputTarget): Promise<GeneratedOutput | null> {
    return this.db.prepare("SELECT * FROM outputs WHERE item_id = ? AND target = ? ORDER BY created_at DESC LIMIT 1").bind(itemId, target).first<GeneratedOutput>();
  }

  async saveGeneratedOutput(): Promise<never> {
    throw new Error("OutputsRepository.saveGeneratedOutput is intentionally deferred beyond Phase 1");
  }
}
