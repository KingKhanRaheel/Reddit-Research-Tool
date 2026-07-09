import { logger } from "../logger";
import { emptyResult, type Connector, type CollectOptions, type SourceResult, type SourceItem, type SourceComment } from "./types";

const GH_BASE = "https://api.github.com";

interface GhIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  comments: number;
  reactions?: { total_count?: number };
  user: { login: string } | null;
  created_at: string;
  repository_url: string;
}

function ghHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "customer-intel-ai",
  };
  // Optional: an unauthenticated token raises the rate limit from 10/min to 30/min if provided.
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return headers;
}

async function fetchIssueComments(issue: GhIssue, maxComments: number): Promise<SourceComment[]> {
  try {
    const [, , , , owner, repo] = issue.repository_url.split("/");
    const url = `${GH_BASE}/repos/${owner}/${repo}/issues/${issue.number}/comments?per_page=${Math.min(maxComments, 30)}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ id: number; body?: string; user?: { login: string } | null }>;
    return data
      .filter((c) => c.body)
      .slice(0, maxComments)
      .map((c) => ({ id: String(c.id), body: (c.body ?? "").slice(0, 1000), score: 0, author: c.user?.login ?? "unknown" }));
  } catch {
    return [];
  }
}

export const githubConnector: Connector = {
  id: "github",
  label: "GitHub",
  isAvailable() {
    return true;
  },
  async collect(options: CollectOptions): Promise<SourceResult> {
    const { keyword, maxItems = 25, maxComments = 50 } = options;
    try {
      const params = new URLSearchParams({
        q: `${keyword} in:title,body`,
        sort: "comments",
        order: "desc",
        per_page: Math.min(maxItems, 50).toString(),
      });
      const res = await fetch(`${GH_BASE}/search/issues?${params}`, { headers: ghHeaders() });
      if (!res.ok) {
        if (res.status === 403 || res.status === 429) {
          throw new Error("GitHub search rate limit reached — try again shortly.");
        }
        throw new Error(`GitHub API error ${res.status}: ${res.statusText}`);
      }

      const data = (await res.json()) as { items?: GhIssue[] };
      const issues = data.items ?? [];

      if (issues.length === 0) {
        return emptyResult("github", "GitHub", "no_results");
      }

      const items: SourceItem[] = issues.map((i) => ({
        id: String(i.id),
        title: i.title,
        body: (i.body ?? "").slice(0, 1000),
        url: i.html_url,
        score: i.reactions?.total_count ?? 0,
        numComments: i.comments,
        author: i.user?.login ?? "unknown",
        createdUtc: Math.floor(new Date(i.created_at).getTime() / 1000),
        platform: "github",
      }));

      const commentsMap = new Map<string, SourceComment[]>();
      const topIssues = issues.slice(0, 8).filter((i) => i.comments > 0);
      await Promise.all(
        topIssues.map(async (issue) => {
          commentsMap.set(String(issue.id), await fetchIssueComments(issue, maxComments));
        }),
      );

      const totalComments = [...commentsMap.values()].reduce((s, c) => s + c.length, 0);
      logger.info({ keyword, count: items.length }, "Fetched GitHub issues/discussions");

      return {
        platform: "github",
        label: "GitHub",
        status: "success",
        items,
        commentsMap,
        itemCount: items.length,
        commentCount: totalComments,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, keyword }, "GitHub connector failed");
      return emptyResult("github", "GitHub", "failed", message);
    }
  },
};
