import type { Source } from "@curator/core";
import type { D1DatabaseLike } from "../client";

export class SourcesRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findById(id: string): Promise<Source | null> {
    return this.db.prepare("SELECT * FROM sources WHERE id = ?").bind(id).first<Source>();
  }

  async listActive(): Promise<Source[]> {
    const result = await this.db.prepare("SELECT * FROM sources WHERE status = 'active'").all<Source>();
    return result.results ?? [];
  }

  async updateWatermark(): Promise<never> {
    throw new Error("SourcesRepository.updateWatermark is intentionally deferred beyond Phase 1");
  }
}
