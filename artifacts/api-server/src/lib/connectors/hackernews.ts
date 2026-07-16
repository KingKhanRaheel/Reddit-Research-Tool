import { logger } from "../logger";
import { emptyResult, type Connector, type CollectOptions, type SourceResult, type SourceItem, type SourceComment } from "./types";
import { getCutoffTimestamp } from "./reddit";

const HN_BASE = "https://hn.algolia.com/api/v1";

interface HnHit {
  objectID: string;
  title?: string;
  story_title?: string;
  story_text?: string;
  comment_text?: string;
  url?: string;
  story_url?: string;
  points?: number;
  num_comments?: number;
  author: string;
  created_at_i: number;
}

async function fetchComments(storyId: string, maxComments: number): Promise<SourceComment[]> {
  try {
    const params = new URLSearchParams({
      tags: `comment,story_${storyId}`,
      hitsPerPage: Math.min(maxComments, 100).toString(),
    });
    const res = await fetch(`${HN_BASE}/search?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { hits?: HnHit[] };
    return (data.hits ?? [])
      .filter((h) => h.comment_text)
      .slice(0, maxComments)
      .map((h) => ({
        id: h.objectID,
        body: (h.comment_text ?? "").replace(/<[^>]+>/g, "").slice(0, 1000),
        score: h.points ?? 0,
        author: h.author,
      }));
  } catch {
    return [];
  }
}

export const hackernewsConnector: Connector = {
  id: "hackernews",
  label: "Hacker News",
  isAvailable() {
    return true;
  },
  async collect(options: CollectOptions): Promise<SourceResult> {
    const { keyword, timeRange, maxItems = 25, maxComments = 50 } = options;
    try {
      const cutoff = getCutoffTimestamp(timeRange);
      const hits: HnHit[] = [];
      let page = 0;
      let hasMore = true;

      while (hits.length < maxItems && hasMore) {
        const hitsPerPage = Math.min(maxItems - hits.length, 100);
        const params = new URLSearchParams({
          query: keyword,
          tags: "story",
          hitsPerPage: hitsPerPage.toString(),
          page: page.toString(),
          ...(cutoff ? { numericFilters: `created_at_i>=${cutoff}` } : {}),
        });

        const res = await fetch(`${HN_BASE}/search?${params}`);
        if (!res.ok) {
          break;
        }

        const data = (await res.json()) as { hits?: HnHit[]; nbPages?: number };
        const pageHits = (data.hits ?? []).filter((h) => h.title);

        if (pageHits.length === 0) {
          hasMore = false;
          break;
        }

        hits.push(...pageHits);
        page++;

        if (data.nbPages && page >= data.nbPages) {
          hasMore = false;
        }
      }

      let filteredHits = hits;
      if (cutoff) {
        filteredHits = filteredHits.filter((h) => h.created_at_i >= cutoff);
      }

      if (filteredHits.length === 0) {
        return emptyResult("hackernews", "Hacker News", "no_results");
      }

      const items: SourceItem[] = hits.map((h) => ({
        id: h.objectID,
        title: h.title ?? h.story_title ?? "",
        body: (h.story_text ?? "").replace(/<[^>]+>/g, "").slice(0, 1000),
        url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
        score: h.points ?? 0,
        numComments: h.num_comments ?? 0,
        author: h.author,
        createdUtc: h.created_at_i,
        platform: "hackernews",
      }));

      const commentsMap = new Map<string, SourceComment[]>();
      const topItems = items.slice(0, 8);
      await Promise.all(
        topItems.map(async (item) => {
          commentsMap.set(item.id, await fetchComments(item.id, maxComments));
        }),
      );

      const totalComments = [...commentsMap.values()].reduce((s, c) => s + c.length, 0);
      logger.info({ keyword, count: items.length }, "Fetched Hacker News stories");

      return {
        platform: "hackernews",
        label: "Hacker News",
        status: "success",
        items,
        commentsMap,
        itemCount: items.length,
        commentCount: totalComments,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, keyword }, "Hacker News connector failed");
      return emptyResult("hackernews", "Hacker News", "failed", message);
    }
  },
};
