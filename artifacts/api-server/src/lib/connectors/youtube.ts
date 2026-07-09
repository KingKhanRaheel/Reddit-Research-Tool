import { logger } from "../logger";
import { emptyResult, type Connector, type CollectOptions, type SourceResult, type SourceItem, type SourceComment } from "./types";

// Uses Piped (https://github.com/TeamPiped/Piped) — an open-source, public,
// keyless JSON front-end for YouTube. No API key required. Public instances
// can be flaky, so we try a short list and fail soft if all are down.
const PIPED_INSTANCES = ["https://pipedapi.kavin.rocks", "https://api.piped.yt", "https://pipedapi.adminforge.de"];

interface PipedSearchItem {
  url?: string; // /watch?v=<id>
  title?: string;
  uploaderName?: string;
  uploaded?: number; // ms epoch
  views?: number;
  shortDescription?: string;
}

interface PipedComment {
  commentId?: string;
  commentText?: string;
  author?: string;
  likeCount?: number;
}

function videoIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/v=([\w-]{6,})/);
  return match ? match[1] : null;
}

async function tryInstances<T>(path: string): Promise<T | null> {
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // try next instance
    }
  }
  return null;
}

export const youtubeConnector: Connector = {
  id: "youtube",
  label: "YouTube",
  isAvailable() {
    return true;
  },
  async collect(options: CollectOptions): Promise<SourceResult> {
    const { keyword, maxItems = 25, maxComments = 50 } = options;
    try {
      const data = await tryInstances<{ items?: PipedSearchItem[] }>(
        `/search?q=${encodeURIComponent(keyword)}&filter=videos`,
      );

      if (!data) {
        throw new Error("YouTube search unavailable — all public instances unreachable.");
      }

      const rawItems = (data.items ?? []).filter((v) => v.url && v.title).slice(0, Math.min(maxItems, 25));

      if (rawItems.length === 0) {
        return emptyResult("youtube", "YouTube", "no_results");
      }

      const items: SourceItem[] = rawItems.map((v) => {
        const id = videoIdFromUrl(v.url) ?? v.url ?? "";
        return {
          id,
          title: v.title ?? "",
          body: (v.shortDescription ?? "").slice(0, 1000),
          url: `https://www.youtube.com/watch?v=${id}`,
          score: v.views ?? 0,
          numComments: 0,
          author: v.uploaderName ?? "unknown",
          createdUtc: v.uploaded ? Math.floor(v.uploaded / 1000) : 0,
          platform: "youtube",
        };
      });

      const commentsMap = new Map<string, SourceComment[]>();
      const topItems = items.slice(0, 8);
      await Promise.all(
        topItems.map(async (item) => {
          const commentData = await tryInstances<{ comments?: PipedComment[] }>(`/comments/${item.id}`);
          const comments = (commentData?.comments ?? [])
            .filter((c) => c.commentText)
            .slice(0, maxComments)
            .map((c) => ({
              id: c.commentId ?? "",
              body: (c.commentText ?? "").slice(0, 1000),
              score: c.likeCount ?? 0,
              author: c.author ?? "unknown",
            }));
          commentsMap.set(item.id, comments);
          item.numComments = comments.length;
        }),
      );

      const totalComments = [...commentsMap.values()].reduce((s, c) => s + c.length, 0);
      logger.info({ keyword, count: items.length }, "Fetched YouTube videos");

      return {
        platform: "youtube",
        label: "YouTube",
        status: "success",
        items,
        commentsMap,
        itemCount: items.length,
        commentCount: totalComments,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, keyword }, "YouTube connector failed");
      return emptyResult("youtube", "YouTube", "failed", message);
    }
  },
};
