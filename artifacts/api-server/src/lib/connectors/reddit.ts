import { logger } from "../logger";
import { emptyResult, type Connector, type CollectOptions, type SourceResult, type SourceItem, type SourceComment } from "./types";

export function getCutoffTimestamp(timeRange?: string): number | null {
  if (!timeRange || timeRange === "all") return null;
  const nowSeconds = Math.floor(Date.now() / 1000);
  switch (timeRange) {
    case "day":
      return nowSeconds - 86400;
    case "week":
      return nowSeconds - 604800;
    case "month":
      return nowSeconds - 2592000;
    case "year":
      return nowSeconds - 31536000;
    default:
      return null;
  }
}

interface RedditPostRaw {
  id: string;
  title: string;
  selftext: string;
  url: string;
  permalink: string;
  score: number;
  num_comments: number;
  subreddit: string;
  created_utc: number;
  author: string;
}

// Reddit requires a proper bot-style User-Agent (not a browser UA).
const REDDIT_UA = "script:customer-intel-ai:v1.0 (public research tool)";
const PULLPUSH_BASE = "https://api.pullpush.io";

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    headers: { "User-Agent": REDDIT_UA, Accept: "application/json", ...headers },
  });
}

async function tryRedditDirect(
  keyword: string,
  options: { subreddit?: string; timeRange?: string; maxPosts?: number },
): Promise<RedditPostRaw[] | null> {
  const { subreddit, timeRange = "month", maxPosts = 25 } = options;
  const limit = Math.min(maxPosts, 100);

  const params = new URLSearchParams({
    q: keyword,
    limit: limit.toString(),
    t: timeRange,
    sort: "top",
    type: "link",
  });

  let url: string;
  if (subreddit) {
    params.set("restrict_sr", "on");
    url = `https://www.reddit.com/r/${subreddit}/search.json?${params}`;
  } else {
    url = `https://www.reddit.com/search.json?${params}`;
  }

  try {
    const res = await safeFetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { children?: Array<{ data: RedditPostRaw }> } };
    return data?.data?.children?.map((c) => c.data).filter(Boolean) ?? null;
  } catch {
    return null;
  }
}

const REDLIB_INSTANCES = [
  "https://safereddit.com",
  "https://redlib.ducks.party",
  "https://redlib.cats.lol",
  "https://redlib.tux.im"
];

async function tryRedlibDirect(
  keyword: string,
  options: { subreddit?: string; timeRange?: string; maxPosts?: number },
): Promise<RedditPostRaw[] | null> {
  const { subreddit, timeRange = "month", maxPosts = 25 } = options;
  const limit = Math.min(maxPosts, 100);

  const params = new URLSearchParams({
    q: keyword,
    limit: limit.toString(),
    t: timeRange,
    sort: "top",
    type: "link",
  });

  for (const base of REDLIB_INSTANCES) {
    try {
      let url: string;
      if (subreddit) {
        params.set("restrict_sr", "on");
        url = `${base}/r/${subreddit}/search.json?${params}`;
      } else {
        url = `${base}/search.json?${params}`;
      }
      
      const res = await safeFetch(url);
      if (res.ok) {
        const data = (await res.json()) as { data?: { children?: Array<{ data: RedditPostRaw }> } };
        const posts = data?.data?.children?.map((c) => c.data).filter(Boolean);
        if (posts && posts.length > 0) return posts;
      }
    } catch {
      // try next
    }
  }
  return null;
}

async function fetchViaPullPush(
  keyword: string,
  options: { subreddit?: string; maxPosts?: number; timeRange?: string },
): Promise<RedditPostRaw[]> {
  const { subreddit, maxPosts = 25, timeRange } = options;
  const limit = Math.min(maxPosts, 100);

  const cutoff = getCutoffTimestamp(timeRange);

  const params = new URLSearchParams({
    q: keyword,
    limit: limit.toString(),
    sort_type: cutoff ? "created_utc" : "score",
    sort: "desc",
    ...(subreddit ? { subreddit } : {}),
    ...(cutoff ? { after: cutoff.toString() } : {}),
  });

  const url = `${PULLPUSH_BASE}/reddit/search/submission/?${params}`;

  let attempt = 0;
  while (attempt < 3) {
    if (attempt > 0) await sleep(1000 * attempt);
    const res = await safeFetch(url);

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after") ?? 3);
      await sleep(retryAfter * 1000);
      attempt++;
      continue;
    }

    if (!res.ok) {
      if (res.status >= 500 && attempt < 2) {
        attempt++;
        continue;
      }
      throw new Error(`PullPush API error ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as { data?: Array<Partial<RedditPostRaw>> };
    return (data?.data ?? [])
      .filter((p): p is RedditPostRaw => Boolean(p.id && p.title))
      .map((p) => ({
        id: p.id!,
        title: p.title!,
        selftext: p.selftext ?? "",
        url: p.url ?? "",
        permalink: p.permalink ?? `/r/${p.subreddit}/comments/${p.id}/`,
        score: p.score ?? 0,
        num_comments: p.num_comments ?? 0,
        subreddit: p.subreddit ?? "",
        created_utc: p.created_utc ?? 0,
        author: p.author ?? "",
      }));
  }

  throw new Error("PullPush API unavailable after retries.");
}

async function fetchCommentsViaPullPush(postId: string, maxComments: number): Promise<SourceComment[]> {
  const params = new URLSearchParams({
    link_id: `t3_${postId}`,
    limit: Math.min(maxComments, 100).toString(),
    sort_type: "score",
    sort: "desc",
  });

  try {
    const res = await safeFetch(`${PULLPUSH_BASE}/reddit/search/comment/?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data?: Array<{ id?: string; body?: string; score?: number; author?: string }>;
    };
    return (data?.data ?? [])
      .filter((c) => c.body && c.body !== "[deleted]" && c.body !== "[removed]")
      .slice(0, maxComments)
      .map((c) => ({ id: c.id ?? "", body: (c.body ?? "").slice(0, 1000), score: c.score ?? 0, author: c.author ?? "" }));
  } catch {
    return [];
  }
}

async function fetchPostComments(post: RedditPostRaw, maxComments = 50): Promise<SourceComment[]> {
  const cleanPath = post.permalink.startsWith("/") ? post.permalink : `/${post.permalink}`;
  const url = `https://www.reddit.com${cleanPath}.json?limit=${Math.min(maxComments, 100)}&sort=top`;

  try {
    const res = await safeFetch(url);
    if (res.ok) {
      const data = (await res.json()) as Array<{
        data?: { children?: Array<{ kind: string; data: SourceComment & { body?: string } }> };
      }>;
      if (Array.isArray(data) && data.length >= 2) {
        const comments: SourceComment[] = [];
        for (const child of data[1]?.data?.children ?? []) {
          if (child?.data?.body && child.data.body !== "[deleted]" && child.data.body !== "[removed]") {
            comments.push({
              id: child.data.id,
              body: child.data.body.slice(0, 1000),
              score: child.data.score,
              author: child.data.author,
            });
            if (comments.length >= maxComments) break;
          }
        }
        if (comments.length > 0) return comments;
      }
    }
  } catch {
    // fall through
  }

  return fetchCommentsViaPullPush(post.id, maxComments);
}

async function mapBounded<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

function toItem(p: RedditPostRaw): SourceItem {
  const link = p.permalink.startsWith("http") ? p.permalink : `https://reddit.com${p.permalink}`;
  return {
    id: p.id,
    title: p.title,
    body: p.selftext ?? "",
    url: link,
    score: p.score ?? 0,
    numComments: p.num_comments ?? 0,
    author: p.author ?? "",
    createdUtc: p.created_utc ?? 0,
    platform: "reddit",
  };
}

export const redditConnector: Connector = {
  id: "reddit",
  label: "Reddit",
  isAvailable() {
    return true;
  },
  async collect(options: CollectOptions): Promise<SourceResult> {
    const { keyword, subreddit, timeRange, maxItems = 25, maxComments = 50 } = options;
    try {
      let posts = await tryRedditDirect(keyword, { subreddit, timeRange, maxPosts: maxItems });
      let sourceLabel = "reddit-direct";
      if (!posts || posts.length === 0) {
        posts = await tryRedlibDirect(keyword, { subreddit, timeRange, maxPosts: maxItems });
        sourceLabel = "redlib-direct";
      }
      if (!posts || posts.length === 0) {
        posts = await fetchViaPullPush(keyword, { subreddit, maxPosts: maxItems, timeRange });
        sourceLabel = "pullpush";
      }
      
      const cutoff = getCutoffTimestamp(timeRange);
      if (cutoff && posts && posts.length > 0) {
        posts = posts.filter((p) => p.created_utc >= cutoff);
      }

      logger.info({ keyword, count: posts?.length ?? 0, source: sourceLabel }, "Fetched Reddit posts");

      if (!posts || posts.length === 0) {
        return emptyResult("reddit", "Reddit", "no_results");
      }

      const commentsMap = new Map<string, SourceComment[]>();
      const postsForComments = posts.slice(0, 10);
      await mapBounded(postsForComments, 3, async (post) => {
        const comments = await fetchPostComments(post, maxComments);
        commentsMap.set(post.id, comments);
      });

      const totalComments = [...commentsMap.values()].reduce((s, c) => s + c.length, 0);

      return {
        platform: "reddit",
        label: "Reddit",
        status: "success",
        items: posts.map(toItem),
        commentsMap,
        itemCount: posts.length,
        commentCount: totalComments,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, keyword }, "Reddit connector failed");
      return emptyResult("reddit", "Reddit", "failed", message);
    }
  },
};
