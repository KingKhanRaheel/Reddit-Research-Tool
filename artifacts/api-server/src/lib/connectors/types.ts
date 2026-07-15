// Shared types for the modular data-source connector system.
// To add a new source (Product Hunt, G2, Trustpilot, App Store, X, etc.):
//   1. Create connectors/<source>.ts implementing the `Connector` interface below.
//   2. Register it in connectors/index.ts's `CONNECTORS` array.
// That's it — the orchestrator, progress reporting, and report generation
// automatically pick it up.

export interface SourceItem {
  id: string;
  title: string;
  body: string;
  url: string;
  score: number;
  numComments: number;
  author: string;
  createdUtc: number; // unix seconds
  platform: string;
}

export interface SourceComment {
  id: string;
  body: string;
  score: number;
  author: string;
}

export interface CollectOptions {
  keyword: string;
  subreddit?: string;
  timeRange?: string;
  maxItems?: number;
  maxComments?: number;
}

export interface SourceResult {
  platform: string;
  label: string;
  status: "success" | "failed" | "skipped" | "no_results";
  items: SourceItem[];
  commentsMap: Map<string, SourceComment[]>;
  itemCount: number;
  commentCount: number;
  error?: string;
  actualTimeRange?: string;
}

export interface Connector {
  /** Stable machine id, e.g. "reddit" */
  id: string;
  /** Human readable label, e.g. "Reddit" */
  label: string;
  /** Whether this connector can currently run (e.g. required secrets present) */
  isAvailable(): boolean;
  /** Fetch items + comments for the given keyword. Must never throw — catch internally and return a "failed" SourceResult. */
  collect(options: CollectOptions): Promise<SourceResult>;
}

export function emptyResult(
  platform: string,
  label: string,
  status: SourceResult["status"],
  error?: string,
): SourceResult {
  return {
    platform,
    label,
    status,
    items: [],
    commentsMap: new Map(),
    itemCount: 0,
    commentCount: 0,
    error,
  };
}
