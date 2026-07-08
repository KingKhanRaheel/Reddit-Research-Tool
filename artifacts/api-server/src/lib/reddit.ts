import { logger } from "./logger";

export interface RedditPost {
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

export interface RedditComment {
  id: string;
  body: string;
  score: number;
  author: string;
}

// Reddit requires a proper bot-style User-Agent (not a browser UA).
// Format: <platform>:<appId>:<version> (by /u/<username>)
const REDDIT_UA = "script:reddit-research-ai:v1.0 (public research tool)";

// PullPush is a publicly accessible Reddit data archive — no auth required.
const PULLPUSH_BASE = "https://api.pullpush.io";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeFetch(url: string, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": REDDIT_UA,
      Accept: "application/json",
      ...headers,
    },
  });
}

// ── Reddit direct API (works on some hosting IPs) ────────────────────────────

async function tryRedditDirect(
  keyword: string,
  options: { subreddit?: string; timeRange?: string; maxPosts?: number },
): Promise<RedditPost[] | null> {
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
    if (!res.ok) return null; // fall through to archive

    const data = (await res.json()) as {
      data?: { children?: Array<{ data: RedditPost }> };
    };
    return data?.data?.children?.map((c) => c.data).filter(Boolean) ?? null;
  } catch {
    return null;
  }
}

// ── PullPush archive API (no auth, always accessible) ────────────────────────

function timeRangeToPullPush(timeRange?: string): { after?: number } {
  const now = Math.floor(Date.now() / 1000);
  const map: Record<string, number> = {
    day: 86400,
    week: 604800,
    month: 2592000,
    year: 31536000,
  };
  const secs = timeRange ? map[timeRange] : map.month;
  return secs ? { after: now - secs } : {};
}

async function fetchViaPullPush(
  keyword: string,
  options: { subreddit?: string; timeRange?: string; maxPosts?: number },
): Promise<RedditPost[]> {
  const { subreddit, timeRange, maxPosts = 25 } = options;
  const limit = Math.min(maxPosts, 100);
  const timeFilter = timeRangeToPullPush(timeRange);

  const params = new URLSearchParams({
    q: keyword,
    limit: limit.toString(),
    sort_type: "score",
    sort: "desc",
    ...(subreddit ? { subreddit } : {}),
    ...(timeFilter.after ? { after: String(timeFilter.after) } : {}),
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
      if (res.status >= 500 && attempt < 2) { attempt++; continue; }
      throw new Error(`PullPush API error ${res.status}: ${res.statusText}`);
    }

    const data = (await res.json()) as {
      data?: Array<Partial<RedditPost>>;
    };

    return (data?.data ?? [])
      .filter((p): p is RedditPost => Boolean(p.id && p.title))
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

  throw new Error("PullPush API unavailable after retries. Please try again shortly.");
}

async function fetchCommentsViaPullPush(
  postId: string,
  maxComments: number,
): Promise<RedditComment[]> {
  const params = new URLSearchParams({
    link_id: `t3_${postId}`,
    limit: Math.min(maxComments, 100).toString(),
    sort_type: "score",
    sort: "desc",
  });

  try {
    const res = await safeFetch(
      `${PULLPUSH_BASE}/reddit/search/comment/?${params}`,
    );
    if (!res.ok) return [];

    const data = (await res.json()) as {
      data?: Array<{ id?: string; body?: string; score?: number; author?: string }>;
    };

    return (data?.data ?? [])
      .filter(
        (c) => c.body && c.body !== "[deleted]" && c.body !== "[removed]",
      )
      .slice(0, maxComments)
      .map((c) => ({
        id: c.id ?? "",
        body: (c.body ?? "").slice(0, 1000),
        score: c.score ?? 0,
        author: c.author ?? "",
      }));
  } catch {
    return [];
  }
}

// ── Bounded concurrency ───────────────────────────────────────────────────────

async function mapBounded<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchRedditPosts(
  keyword: string,
  options: { subreddit?: string; timeRange?: string; maxPosts?: number } = {},
): Promise<RedditPost[]> {
  // Try direct Reddit API first (faster, richer data)
  const direct = await tryRedditDirect(keyword, options);
  if (direct && direct.length > 0) {
    logger.info({ keyword, count: direct.length, source: "reddit-direct" }, "Fetched Reddit posts");
    return direct;
  }

  // Fall back to PullPush archive
  logger.info({ keyword }, "Reddit direct blocked — using PullPush archive");
  const posts = await fetchViaPullPush(keyword, options);
  logger.info({ keyword, count: posts.length, source: "pullpush" }, "Fetched Reddit posts");
  return posts;
}

export async function fetchPostComments(
  post: RedditPost,
  maxComments = 50,
): Promise<RedditComment[]> {
  // Try direct Reddit API first
  const cleanPath = post.permalink.startsWith("/") ? post.permalink : `/${post.permalink}`;
  const url = `https://www.reddit.com${cleanPath}.json?limit=${Math.min(maxComments, 100)}&sort=top`;

  try {
    const res = await safeFetch(url);
    if (res.ok) {
      const data = (await res.json()) as Array<{
        data?: { children?: Array<{ kind: string; data: RedditComment & { body?: string } }> };
      }>;
      if (Array.isArray(data) && data.length >= 2) {
        const comments: RedditComment[] = [];
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

  // Fall back to PullPush for comments
  return fetchCommentsViaPullPush(post.id, maxComments);
}

export async function collectRedditData(
  keyword: string,
  options: { subreddit?: string; timeRange?: string; maxPosts?: number; maxComments?: number } = {},
): Promise<{ posts: RedditPost[]; commentsMap: Map<string, RedditComment[]> }> {
  const { maxComments = 50 } = options;
  const posts = await fetchRedditPosts(keyword, options);

  const commentsMap = new Map<string, RedditComment[]>();
  const postsForComments = posts.slice(0, 10);

  await mapBounded(postsForComments, 3, async (post) => {
    const comments = await fetchPostComments(post, maxComments);
    commentsMap.set(post.id, comments);
  });

  return { posts, commentsMap };
}

export function buildTextCorpus(
  posts: RedditPost[],
  commentsMap: Map<string, RedditComment[]>,
): string {
  const parts: string[] = [];

  for (const post of posts) {
    parts.push(`## POST: "${post.title}"`);
    const link = post.permalink.startsWith("http")
      ? post.permalink
      : `https://reddit.com${post.permalink}`;
    parts.push(`URL: ${link}`);
    parts.push(
      `Score: ${post.score} | Comments: ${post.num_comments} | Subreddit: r/${post.subreddit}`,
    );
    if (post.selftext && post.selftext.length > 0) {
      parts.push(`Content: ${post.selftext.slice(0, 500)}`);
    }

    const comments = commentsMap.get(post.id) ?? [];
    if (comments.length > 0) {
      parts.push("Top comments:");
      for (const comment of comments.slice(0, 15)) {
        parts.push(`  - [${comment.score}] ${comment.body.slice(0, 300)}`);
      }
    }
    parts.push("");
  }

  return parts.join("\n");
}
