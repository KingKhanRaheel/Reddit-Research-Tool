import { logger } from "../logger";
import { redditConnector } from "./reddit";
import { youtubeConnector } from "./youtube";
import { githubConnector } from "./github";
import { hackernewsConnector } from "./hackernews";
import { webConnector } from "./web";
import type { Connector, CollectOptions, SourceResult, SourceItem, SourceComment } from "./types";

export * from "./types";

// ── Connector registry ────────────────────────────────────────────────────────
// To add a new source: implement the `Connector` interface in its own file
// and append it here. Everything else (progress UI, report merging, stats)
// picks it up automatically.
export const CONNECTORS: Connector[] = [redditConnector, youtubeConnector, githubConnector, hackernewsConnector, webConnector];

export interface AggregatedData {
  results: SourceResult[];
  totalItems: number;
  totalComments: number;
  platformsSearched: string[];
  platformsSucceeded: string[];
  earliestUtc: number | null;
  latestUtc: number | null;
}

/**
 * Runs every available connector in parallel, reporting progress for each
 * one as it starts and finishes via `onProgress`. Failures in one connector
 * never block the others — each source is isolated.
 */
export async function collectAllSources(
  options: CollectOptions,
  onProgress: (platform: string, label: string, phase: "start" | "done", result?: SourceResult) => void,
): Promise<AggregatedData> {
  const available = CONNECTORS.filter((c) => c.isAvailable());

  const results = await Promise.all(
    available.map(async (connector) => {
      onProgress(connector.id, connector.label, "start");
      try {
        let currentOptions = { ...options };
        let result = await connector.collect(currentOptions);
        result.actualTimeRange = currentOptions.timeRange || "all";

        const ranges = ["day", "week", "month", "year", "all"];
        let currentRangeIndex = ranges.indexOf(options.timeRange || "all");

        while (
          (result.status === "no_results" || result.items.length === 0) &&
          currentRangeIndex !== -1 &&
          currentRangeIndex < ranges.length - 1
        ) {
          currentRangeIndex++;
          const nextRange = ranges[currentRangeIndex];
          logger.info(
            { platform: connector.id, keyword: options.keyword, triedRange: currentOptions.timeRange, nextRange },
            "No results found for time range, expanding search window"
          );
          currentOptions = { ...currentOptions, timeRange: nextRange };
          result = await connector.collect(currentOptions);
          result.actualTimeRange = nextRange;
        }

        onProgress(connector.id, connector.label, "done", result);
        return result;
      } catch (err) {
        // Connectors are expected to catch internally, but guard anyway so
        // one misbehaving source can never take down the whole run.
        logger.error({ err, connector: connector.id }, "Connector threw unexpectedly");
        const failed: SourceResult = {
          platform: connector.id,
          label: connector.label,
          status: "failed",
          items: [],
          commentsMap: new Map(),
          itemCount: 0,
          commentCount: 0,
          error: err instanceof Error ? err.message : "Unknown error",
        };
        onProgress(connector.id, connector.label, "done", failed);
        return failed;
      }
    }),
  );

  let earliestUtc: number | null = null;
  let latestUtc: number | null = null;
  for (const r of results) {
    for (const item of r.items) {
      if (!item.createdUtc) continue;
      if (earliestUtc === null || item.createdUtc < earliestUtc) earliestUtc = item.createdUtc;
      if (latestUtc === null || item.createdUtc > latestUtc) latestUtc = item.createdUtc;
    }
  }

  return {
    results,
    totalItems: results.reduce((s, r) => s + r.itemCount, 0),
    totalComments: results.reduce((s, r) => s + r.commentCount, 0),
    platformsSearched: results.map((r) => r.platform),
    platformsSucceeded: results.filter((r) => r.status === "success").map((r) => r.platform),
    earliestUtc,
    latestUtc,
  };
}

/**
 * Builds a single text corpus from all sources, tagging each item with its
 * originating platform so the LLM can attribute insights back to sources.
 */
export function buildMultiSourceCorpus(results: SourceResult[]): string {
  const parts: string[] = [];

  for (const result of results) {
    if (result.status !== "success" || result.items.length === 0) continue;

    parts.push(`\n\n========== SOURCE: ${result.label.toUpperCase()} ==========`);

    for (const item of result.items) {
      parts.push(`## [${result.label}] "${item.title}"`);
      parts.push(`URL: ${item.url}`);
      parts.push(`Score/Views: ${item.score} | Comments: ${item.numComments} | Author: ${item.author}`);
      if (item.body) parts.push(`Content: ${item.body.slice(0, 500)}`);

      const comments = result.commentsMap.get(item.id) ?? [];
      if (comments.length > 0) {
        parts.push("Top comments:");
        for (const comment of comments.slice(0, 15)) {
          parts.push(`  - [${comment.score}] ${comment.body.slice(0, 300)}`);
        }
      }
      parts.push("");
    }
  }

  return parts.join("\n");
}

export type { Connector, CollectOptions, SourceResult, SourceItem, SourceComment };
