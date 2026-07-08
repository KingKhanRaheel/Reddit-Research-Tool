import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reportsTable = pgTable("reports", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  keyword: text("keyword").notNull(),
  subreddit: text("subreddit"),
  timeRange: text("time_range"),
  maxPosts: integer("max_posts"),
  maxComments: integer("max_comments"),
  status: text("status").notNull().default("pending"),
  progress: integer("progress"),
  progressMessage: text("progress_message"),
  result: jsonb("result"),
  errorMessage: text("error_message"),
  postsAnalyzed: integer("posts_analyzed"),
  commentsAnalyzed: integer("comments_analyzed"),
  aiProvider: text("ai_provider"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
