import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, reportsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";
import { CONNECTORS } from "../lib/connectors";

const router: IRouter = Router();

interface SourceStatEntry {
  platform: string;
  label: string;
  status: string;
  itemCount: number;
  commentCount: number;
  error?: string | null;
}

router.get("/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);

  const [stats, recentReports, keywordRows] = await Promise.all([
    // Aggregate stats
    db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) filter (where status = 'completed')::int`,
        pending: sql<number>`count(*) filter (where status in ('pending', 'running'))::int`,
        failed: sql<number>`count(*) filter (where status = 'failed')::int`,
      })
      .from(reportsTable)
      .where(eq(reportsTable.userId, userId))
      .then((rows) => rows[0]),

    // Recent 5 reports
    db
      .select()
      .from(reportsTable)
      .where(eq(reportsTable.userId, userId))
      .orderBy(desc(reportsTable.createdAt))
      .limit(5),

    // Top keywords
    db
      .select({
        keyword: reportsTable.keyword,
        count: sql<number>`count(*)::int`,
      })
      .from(reportsTable)
      .where(eq(reportsTable.userId, userId))
      .groupBy(reportsTable.keyword)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ]);

  // Aggregate lifetime discussions-analyzed count per platform from completed reports.
  const completedRows = await db
    .select({ sourceStats: reportsTable.sourceStats })
    .from(reportsTable)
    .where(eq(reportsTable.userId, userId));

  const totalsByPlatform = new Map<string, { label: string; discussionsAnalyzed: number }>();
  for (const row of completedRows) {
    const entries = (row.sourceStats as SourceStatEntry[] | null) ?? [];
    for (const entry of entries) {
      const existing = totalsByPlatform.get(entry.platform) ?? { label: entry.label, discussionsAnalyzed: 0 };
      existing.discussionsAnalyzed += entry.itemCount ?? 0;
      existing.label = entry.label;
      totalsByPlatform.set(entry.platform, existing);
    }
  }

  const sources = CONNECTORS.map((connector) => {
    const totals = totalsByPlatform.get(connector.id);
    return {
      platform: connector.id,
      label: connector.label,
      status: connector.isAvailable() ? "available" : "unavailable",
      discussionsAnalyzed: totals?.discussionsAnalyzed ?? 0,
    };
  });

  res.json({
    totalReports: stats?.total ?? 0,
    completedReports: stats?.completed ?? 0,
    pendingReports: stats?.pending ?? 0,
    failedReports: stats?.failed ?? 0,
    recentReports,
    topKeywords: keywordRows,
    sources,
  });
});

export default router;
