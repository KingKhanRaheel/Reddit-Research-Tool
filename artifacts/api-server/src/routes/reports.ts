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
import { collectAllSources, buildMultiSourceCorpus, type SourceResult, type SourceItem, type SourceComment } from "../lib/connectors";
import { generateReport, analyzeQuery, type LLMProvider } from "../lib/llm";
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

  const { keyword, apiKeyId, subreddit, timeRange, maxPosts, maxComments, detailLevel } = parsed.data;

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
      detailLevel: detailLevel ?? "standard",
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
    detailLevel: detailLevel ?? "standard",
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
      detailLevel: original.detailLevel,
    })
    .returning();

  const decryptedKey = safeDecrypt(apiKey.encryptedKey);
  void runReportGeneration(newReport.id, decryptedKey, apiKey.provider as LLMProvider, {
    keyword: original.keyword,
    subreddit: original.subreddit ?? undefined,
    timeRange: original.timeRange ?? undefined,
    maxPosts: original.maxPosts ?? undefined,
    maxComments: original.maxComments ?? undefined,
    detailLevel: original.detailLevel,
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

function mergeConnectorResults(results: SourceResult[]): SourceResult {
  if (results.length === 0) {
    throw new Error("No results to merge");
  }
  const first = results[0];
  const platform = first.platform;
  const label = first.label;

  const succeeded = results.filter((r) => r.status === "success");
  const failed = results.filter((r) => r.status === "failed");
  const empty = results.filter((r) => r.status === "no_results");

  let status: SourceResult["status"] = "no_results";
  let error: string | undefined = undefined;

  if (succeeded.length > 0) {
    status = "success";
  } else if (failed.length > 0) {
    status = "failed";
    error = failed.map((f) => f.error).filter(Boolean).join("; ");
  } else if (empty.length > 0) {
    status = "no_results";
  }

  const seenItems = new Set<string>();
  const mergedItems: SourceItem[] = [];
  const mergedCommentsMap = new Map<string, SourceComment[]>();

  for (const r of results) {
    for (const item of r.items) {
      if (!seenItems.has(item.id)) {
        seenItems.add(item.id);
        mergedItems.push(item);
      }

      const comments = r.commentsMap.get(item.id);
      if (comments) {
        const existingComments = mergedCommentsMap.get(item.id) || [];
        const seenComments = new Set(existingComments.map((c) => c.id));
        const newComments = comments.filter((c) => !seenComments.has(c.id));
        mergedCommentsMap.set(item.id, [...existingComments, ...newComments]);
      }
    }
  }

  const itemCount = mergedItems.length;
  let commentCount = 0;
  for (const comments of mergedCommentsMap.values()) {
    commentCount += comments.length;
  }

  return {
    platform,
    label,
    status,
    items: mergedItems,
    commentsMap: mergedCommentsMap,
    itemCount,
    commentCount,
    error,
  };
}

function getHumanReportType(type: string): string {
  switch (type) {
    case "product_analysis":
      return "Product Analysis";
    case "feature_research":
      return "Feature Research";
    case "comparison":
      return "Comparison Report";
    case "recommendation":
      return "Recommendation Report";
    case "problem_discovery":
      return "Problem Discovery";
    case "trend":
      return "Trend Report";
    case "market_validation":
      return "Market Validation";
    default:
      return "Product Analysis";
  }
}

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
    detailLevel?: string;
  },
): Promise<void> {
  const { keyword, subreddit, timeRange, maxPosts, maxComments, detailLevel } = options;

  try {
    await updateReportProgress(reportId, 2, "🧠 Analyzing query intent...");

    const analysis = await analyzeQuery(provider, apiKey, keyword, timeRange);

    const humanType = getHumanReportType(analysis.bestReportType);
    const strategyMsg = `Research Type:\n${humanType}\n\nResearch Strategy:\nSearching for ${analysis.optimizedSearchQueries.join(", ")}...\n\nGenerating ${humanType}...`;

    await updateReportProgress(reportId, RESEARCH_START, strategyMsg);

    const queryResultsMap = new Map<string, SourceResult[]>();
    let queriesCompleted = 0;
    const totalQueries = analysis.optimizedSearchQueries.length;

    for (const query of analysis.optimizedSearchQueries) {
      const currentPct = Math.round(
        RESEARCH_START + ((RESEARCH_END - RESEARCH_START) * queriesCompleted) / totalQueries,
      );

      const queryProgressMsg = `Research Type:\n${humanType}\n\nResearch Strategy:\nSearching for ${analysis.optimizedSearchQueries.join(", ")}...\n\n🔍 Gathering data for "${query}"...\n\nGenerating ${humanType}...`;
      await updateReportProgress(reportId, currentPct, queryProgressMsg);

      const queryAggregated = await collectAllSources(
        { keyword: query, subreddit, timeRange, maxItems: maxPosts ?? 25, maxComments: maxComments ?? 50 },
        () => {
          // Silent callback during loop
        },
      );

      for (const res of queryAggregated.results) {
        if (!queryResultsMap.has(res.platform)) {
          queryResultsMap.set(res.platform, []);
        }
        queryResultsMap.get(res.platform)!.push(res);
      }

      queriesCompleted++;
    }

    const mergedResults: SourceResult[] = [];
    for (const [platform, results] of queryResultsMap.entries()) {
      mergedResults.push(mergeConnectorResults(results));
    }

    let earliestUtc: number | null = null;
    let latestUtc: number | null = null;
    for (const r of mergedResults) {
      for (const item of r.items) {
        if (!item.createdUtc) continue;
        if (earliestUtc === null || item.createdUtc < earliestUtc) earliestUtc = item.createdUtc;
        if (latestUtc === null || item.createdUtc > latestUtc) latestUtc = item.createdUtc;
      }
    }

    const aggregated = {
      results: mergedResults,
      totalItems: mergedResults.reduce((s, r) => s + r.itemCount, 0),
      totalComments: mergedResults.reduce((s, r) => s + r.commentCount, 0),
      platformsSearched: mergedResults.map((r) => r.platform),
      platformsSucceeded: mergedResults.filter((r) => r.status === "success").map((r) => r.platform),
      earliestUtc,
      latestUtc,
    };

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

    const finalStrategyMsg = `Research Type:\n${humanType}\n\nResearch Strategy:\nSearching for ${analysis.optimizedSearchQueries.join(", ")}...\n\n🧹 Cleaning & deduplicating data...\n\nGenerating ${humanType}...`;
    await updateReportProgress(reportId, CLEAN_PROGRESS, finalStrategyMsg);
    const corpus = buildMultiSourceCorpus(aggregated.results);

    const aiProgressMsg = `Research Type:\n${humanType}\n\nResearch Strategy:\nSearching for ${analysis.optimizedSearchQueries.join(", ")}...\n\n🧠 AI analyzing ${aggregated.totalItems} items and ${aggregated.totalComments} comments...\n\nGenerating ${humanType}...`;
    await updateReportProgress(reportId, AI_PROGRESS, aiProgressMsg);

    const result = await generateReport(
      provider,
      apiKey,
      keyword,
      corpus,
      analysis.bestReportType,
      aggregated.results.filter((r) => r.status === "success").map((r) => r.label),
      timeRange,
      detailLevel || "standard",
    );

    result.reportType = analysis.bestReportType;
    result.searchQueries = analysis.optimizedSearchQueries;

    const generatingReportMsg = `Research Type:\n${humanType}\n\nResearch Strategy:\nSearching for ${analysis.optimizedSearchQueries.join(", ")}...\n\n📄 Generating report...\n\nGenerating ${humanType}...`;
    await updateReportProgress(reportId, 95, generatingReportMsg);

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
