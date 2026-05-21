import type { Item, ItemStatus } from "@curator/core";
import type { D1DatabaseLike } from "../client";

export class ItemsRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async findById(id: string): Promise<Item | null> {
    return this.db.prepare("SELECT * FROM items WHERE id = ?").bind(id).first<Item>();
  }

  async updateStatus(id: string, status: ItemStatus): Promise<void> {
    await this.db.prepare("UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(status, id).run();
  }

  async createFromNormalizedPost(): Promise<never> {
    throw new Error("ItemsRepository.createFromNormalizedPost is intentionally deferred beyond Phase 1");
  }
}
