import { pgTable, text, serial, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const apiKeysTable = pgTable("api_keys", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  keyPreview: text("key_preview").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertApiKeySchema = createInsertSchema(apiKeysTable).omit({
  id: true,
  createdAt: true,
});
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type ApiKey = typeof apiKeysTable.$inferSelect;
