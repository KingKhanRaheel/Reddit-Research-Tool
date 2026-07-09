import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, reportsTable, apiKeysTable } from "@workspace/db";
import {
  CreateReportBody,
  GetReportParams,
  DeleteReportParams,
  RerunReportParams,
  GetReportStatusParams,
} from "@workspace/api-zod";
import { requireAuth, getUserId } from "../lib/auth";
import { collectAllSources, buildMultiSourceCorpus, type SourceResult } from "../lib/connectors";
import { generateReport, type LLMProvider } from "../lib/llm";
import { safeDecrypt } from "../lib/encryption";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// List reports
router.get("/reports", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const reports = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.userId, userId))
    .orderBy(desc(reportsTable.createdAt));
  res.json(reports);
});

// Create report
router.post("/reports", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateReportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { keyword, apiKeyId, subreddit, timeRange, maxPosts, maxComments } = parsed.data;

  // Verify the apiKey belongs to this user
  const [apiKey] = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.id, apiKeyId), eq(apiKeysTable.userId, userId)));

  if (!apiKey) {
    res.status(400).json({ error: "API key not found" });
    return;
  }

  const [report] = await db
    .insert(reportsTable)
    .values({
      userId,
      keyword,
      subreddit: subreddit ?? null,
      timeRange: timeRange ?? null,
      maxPosts: maxPosts ?? null,
      maxComments: maxComments ?? null,
      status: "pending",
      aiProvider: apiKey.provider,
    })
    .returning();

  // Fire and forget — run async in background
  const decryptedKey = safeDecrypt(apiKey.encryptedKey);
  void runReportGeneration(report.id, decryptedKey, apiKey.provider as LLMProvider, {
    keyword,
    subreddit,
    timeRange,
    maxPosts,
    maxComments,
  });

  res.status(201).json(report);
});

// Get report
router.get("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [report] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, params.data.id), eq(reportsTable.userId, userId)));

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json(report);
});

// Delete report
router.delete("/reports/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = DeleteReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [report] = await db
    .delete(reportsTable)
    .where(and(eq(reportsTable.id, params.data.id), eq(reportsTable.userId, userId)))
    .returning();

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.sendStatus(204);
});

// Re-run report — use same provider key, fall back to any active key
router.post("/reports/:id/rerun", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = RerunReportParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [original] = await db
    .select()
    .from(reportsTable)
    .where(and(eq(reportsTable.id, params.data.id), eq(reportsTable.userId, userId)));

  if (!original) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  // Prefer same provider key; fall back to any active key
  const activeKeys = await db
    .select()
    .from(apiKeysTable)
    .where(and(eq(apiKeysTable.userId, userId), eq(apiKeysTable.isActive, true)));

  if (activeKeys.length === 0) {
    res.status(400).json({ error: "No active API key found. Please add an API key first." });
    return;
  }

  const sameProviderKey = original.aiProvider
    ? activeKeys.find((k) => k.provider === original.aiProvider)
    : undefined;
  const apiKey = sameProviderKey ?? activeKeys[0];

  const [newReport] = await db
    .insert(reportsTable)
    .values({
      userId,
      keyword: original.keyword,
      subreddit: original.subreddit,
      timeRange: original.timeRange,
      maxPosts: original.maxPosts,
      maxComments: original.maxComments,
      status: "pending",
      aiProvider: apiKey.provider,
    })
    .returning();

  const decryptedKey = safeDecrypt(apiKey.encryptedKey);
  void runReportGeneration(newReport.id, decryptedKey, apiKey.provider as LLMProvider, {
    keyword: original.keyword,
    subreddit: original.subreddit ?? undefined,
    timeRange: original.timeRange ?? undefined,
    maxPosts: original.maxPosts ?? undefined,
    maxComments: original.maxComments ?? undefined,
  });

  res.status(201).json(newReport);
});

// Get report status (for polling)
router.get("/reports/:id/status", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const params = GetReportStatusParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [report] = await db
    .select({
      id: reportsTable.id,
      status: reportsTable.status,
      progress: reportsTable.progress,
      progressMessage: reportsTable.progressMessage,
      errorMessage: reportsTable.errorMessage,
    })
    .from(reportsTable)
    .where(and(eq(reportsTable.id, params.data.id), eq(reportsTable.userId, userId)));

  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  res.json(report);
});

// ── Background report generation ─────────────────────────────────────────────

async function updateReportProgress(
  id: number,
  progress: number,
  message: string,
): Promise<void> {
  await db
    .update(reportsTable)
    .set({ status: "running", progress, progressMessage: message, updatedAt: new Date() })
    .where(eq(reportsTable.id, id));
}

/**
 * Serializes progress writes for a report so concurrent connector callbacks
 * cannot race and overwrite each other (or a later terminal state) out of order.
 */
function createProgressQueue(reportId: number) {
  let chain: Promise<void> = Promise.resolve();
  return {
    enqueue(progress: number, message: string): void {
      chain = chain.then(() => updateReportProgress(reportId, progress, message));
    },
    async drain(): Promise<void> {
      await chain;
    },
  };
}

// Weights for the fixed pipeline phases; each connector shares the "research" slice.
const RESEARCH_START = 5;
const RESEARCH_END = 55;
const CLEAN_PROGRESS = 60;
const AI_PROGRESS = 65;

async function runReportGeneration(
  reportId: number,
  apiKey: string,
  provider: LLMProvider,
  options: {
    keyword: string;
    subreddit?: string;
    timeRange?: string;
    maxPosts?: number;
    maxComments?: number;
  },
): Promise<void> {
  const { keyword, subreddit, timeRange, maxPosts, maxComments } = options;

  try {
    await updateReportProgress(reportId, RESEARCH_START, "Starting research...");

    let connectorsStarted = 0;
    let connectorsDone = 0;
    let totalConnectors = 0;
    const progressQueue = createProgressQueue(reportId);

    const aggregated = await collectAllSources(
      { keyword, subreddit, timeRange, maxItems: maxPosts ?? 25, maxComments: maxComments ?? 50 },
      (_platform, label, phase, result) => {
        if (phase === "start") {
          connectorsStarted++;
          totalConnectors = Math.max(totalConnectors, connectorsStarted);
          progressQueue.enqueue(RESEARCH_START, `🔍 Researching ${label}...`);
        } else {
          connectorsDone++;
          const pct = Math.round(
            RESEARCH_START + ((RESEARCH_END - RESEARCH_START) * connectorsDone) / Math.max(totalConnectors, 1),
          );
          const summary =
            result?.status === "success"
              ? `✓ ${label}: ${result.itemCount} items, ${result.commentCount} comments`
              : result?.status === "no_results"
                ? `– ${label}: no results found`
                : `✗ ${label}: unavailable`;
          progressQueue.enqueue(pct, summary);
        }
      },
    );

    // Ensure every queued progress write from connector callbacks has landed
    // before we write any subsequent (and eventually terminal) state.
    await progressQueue.drain();

    if (aggregated.totalItems === 0) {
      const failures = aggregated.results
        .filter((r) => r.status === "failed")
        .map((r) => `${r.label} (${r.error ?? "failed"})`)
        .join(", ");
      await db
        .update(reportsTable)
        .set({
          status: "failed",
          errorMessage: failures
            ? `No results found across any source for this keyword. Errors: ${failures}`
            : "No results found for this keyword across any source. Try a broader search term.",
          sourceStats: serializeSourceStats(aggregated.results),
          updatedAt: new Date(),
        })
        .where(eq(reportsTable.id, reportId));
      return;
    }

    await updateReportProgress(reportId, CLEAN_PROGRESS, "🧹 Cleaning & deduplicating data...");
    const corpus = buildMultiSourceCorpus(aggregated.results);

    await updateReportProgress(
      reportId,
      AI_PROGRESS,
      `🧠 AI analyzing ${aggregated.totalItems} items and ${aggregated.totalComments} comments across ${aggregated.platformsSucceeded.length} platform(s)...`,
    );
    const result = await generateReport(
      provider,
      apiKey,
      keyword,
      corpus,
      aggregated.results.filter((r) => r.status === "success").map((r) => r.label),
    );

    await updateReportProgress(reportId, 95, "📄 Generating report...");

    await db
      .update(reportsTable)
      .set({
        status: "completed",
        progress: 100,
        progressMessage: "Report complete",
        result,
        postsAnalyzed: aggregated.totalItems,
        commentsAnalyzed: aggregated.totalComments,
        sourceStats: serializeSourceStats(aggregated.results),
        dateRangeStart: aggregated.earliestUtc ? new Date(aggregated.earliestUtc * 1000) : null,
        dateRangeEnd: aggregated.latestUtc ? new Date(aggregated.latestUtc * 1000) : null,
        updatedAt: new Date(),
      })
      .where(eq(reportsTable.id, reportId));

    logger.info(
      { reportId, keyword, items: aggregated.totalItems, platforms: aggregated.platformsSucceeded },
      "Report generation completed",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error occurred";
    logger.error({ err, reportId }, "Report generation failed");
    await db
      .update(reportsTable)
      .set({
        status: "failed",
        errorMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(reportsTable.id, reportId));
  }
}

function serializeSourceStats(results: SourceResult[]): Array<Record<string, unknown>> {
  return results.map((r) => ({
    platform: r.platform,
    label: r.label,
    status: r.status,
    itemCount: r.itemCount,
    commentCount: r.commentCount,
    error: r.error ?? null,
  }));
}

export default router;
