import { Router, type IRouter } from "express";
import { eq, sql, desc } from "drizzle-orm";
import { db, reportsTable } from "@workspace/db";
import { requireAuth, getUserId } from "../lib/auth";

const router: IRouter = Router();

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

  res.json({
    totalReports: stats?.total ?? 0,
    completedReports: stats?.completed ?? 0,
    pendingReports: stats?.pending ?? 0,
    failedReports: stats?.failed ?? 0,
    recentReports,
    topKeywords: keywordRows,
  });
});

export default router;
