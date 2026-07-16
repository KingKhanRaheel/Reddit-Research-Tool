import { type Connector, type CollectOptions, type SourceResult, type SourceItem } from "./types";
import { logger } from "../logger";

// Helper to sanitize HTML tags
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>?/gm, "").trim();
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...init?.headers,
    },
    ...init,
  });
  return res;
}

// Keyless search via DuckDuckGo HTML
async function searchDuckDuckGo(query: string, timeRange?: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  try {
    // Map timeRange parameter for DuckDuckGo:
    // df = d (day), w (week), m (month), y (year)
    let df = "";
    if (timeRange === "day") df = "d";
    else if (timeRange === "week") df = "w";
    else if (timeRange === "month") df = "m";
    else if (timeRange === "year") df = "y";

    const params = new URLSearchParams({
      q: query,
      kl: "us-en",
    });
    if (df) {
      params.set("df", df);
    }

    const url = `https://html.duckduckgo.com/html/?${params}`;
    const res = await safeFetch(url);
    if (!res.ok) {
      throw new Error(`DuckDuckGo request failed with status: ${res.status}`);
    }

    const html = await res.text();
    const matches: Array<{ title: string; url: string; snippet: string }> = [];
    
    // DDG HTML results are inside elements with class 'result__snippet' and 'result__a'
    const resultBlockRegex = /<div class="result[^"]*">([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    while ((match = resultBlockRegex.exec(html)) !== null) {
      const block = match[1];
      const linkMatch = /<a class="result__a" href="([^"]+)">([\s\S]*?)<\/a>/i.exec(block);
      const snippetMatch = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      
      if (linkMatch) {
        let rawUrl = linkMatch[1];
        if (rawUrl.startsWith("//duckduckgo.com/l/?uddg=")) {
          const matchUrl = /uddg=([^&]+)/.exec(rawUrl);
          if (matchUrl) {
            rawUrl = decodeURIComponent(matchUrl[1]);
          }
        }
        
        const title = stripHtml(linkMatch[2]);
        const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
        matches.push({ title, url: rawUrl, snippet });
      }
    }
    return matches;
  } catch (err) {
    logger.warn({ err, query }, "DuckDuckGo search failed");
    return [];
  }
}

// Serper API search (if key exists)
async function searchSerper(query: string, timeRange?: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) return [];

  try {
    let tbs = "";
    if (timeRange === "day") tbs = "qdr:d";
    else if (timeRange === "week") tbs = "qdr:w";
    else if (timeRange === "month") tbs = "qdr:m";
    else if (timeRange === "year") tbs = "qdr:y";

    const body: Record<string, unknown> = { q: query };
    if (tbs) {
      body.tbs = tbs;
    }

    const res = await safeFetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Serper API failed: ${res.status}`);
    const data = await res.json() as { organic?: Array<{ title: string; link: string; snippet?: string }> };
    return (data.organic || []).map((item) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet || "",
    }));
  } catch (err) {
    logger.warn({ err, query }, "Serper search failed");
    return [];
  }
}

// Tavily search (if key exists)
async function searchTavily(query: string): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  try {
    const res = await safeFetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query: query,
        search_depth: "basic",
      }),
    });

    if (!res.ok) throw new Error(`Tavily API failed: ${res.status}`);
    const data = await res.json() as { results?: Array<{ title: string; url: string; content?: string }> };
    return (data.results || []).map((item) => ({
      title: item.title,
      url: item.url,
      snippet: item.content || "",
    }));
  } catch (err) {
    logger.warn({ err, query }, "Tavily search failed");
    return [];
  }
}

export const webConnector: Connector = {
  id: "web",
  label: "Web Search",
  isAvailable() {
    return true; // Make it run so we can return configuration warning if keys are missing
  },
  async collect(options: CollectOptions): Promise<SourceResult> {
    const { keyword, timeRange, maxItems = 15 } = options;

    if (!process.env.SERPER_API_KEY && !process.env.TAVILY_API_KEY) {
      return {
        platform: "web",
        label: "Web Search",
        status: "failed",
        items: [],
        commentsMap: new Map(),
        itemCount: 0,
        commentCount: 0,
        error: "Please configure SERPER_API_KEY or TAVILY_API_KEY in Render environment variables to enable general web search.",
      };
    }
    
    // Define the dorking queries
    const queries = [
      `"${keyword}" site:producthunt.com`,
      `"${keyword}" site:indiehackers.com`,
      `"${keyword}" site:g2.com OR site:capterra.com`,
      `"${keyword}" forum OR discussion OR thread`,
    ];

    const allResultsMap = new Map<string, { title: string; url: string; snippet: string }>();

    for (const query of queries) {
      let results: Array<{ title: string; url: string; snippet: string }> = [];
      if (process.env.SERPER_API_KEY) {
        results = await searchSerper(query, timeRange);
      } else if (process.env.TAVILY_API_KEY) {
        results = await searchTavily(query);
      }
      for (const r of results) {
        allResultsMap.set(r.url, r);
      }
    }

    const uniqueResults = Array.from(allResultsMap.values()).slice(0, maxItems);
    const items: SourceItem[] = uniqueResults.map((r, i) => ({
      id: `web-${i}`,
      title: r.title,
      body: r.snippet,
      url: r.url,
      score: 1,
      numComments: 0,
      author: "web_crawler",
      createdUtc: Math.floor(Date.now() / 1000),
      platform: "web",
    }));

    return {
      platform: "web",
      label: "Web Search",
      status: items.length > 0 ? "success" : "no_results",
      items,
      commentsMap: new Map(),
      itemCount: items.length,
      commentCount: 0,
    };
  }
};
