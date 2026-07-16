import { logger } from "./logger";

export type LLMProvider =
  | "openai"
  | "anthropic"
  | "gemini"
  | "perplexity"
  | "openrouter"
  | "groq"
  | "mistral"
  | "deepseek"
  | "cohere"
  | "xai";

interface OpenAICompatibleConfig {
  baseURL: string;
  model: string;
}

const OPENAI_COMPATIBLE: Record<string, OpenAICompatibleConfig> = {
  openai: { baseURL: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  perplexity: {
    baseURL: "https://api.perplexity.ai",
    model: "llama-3.1-sonar-small-128k-online",
  },
  openrouter: {
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  groq: { baseURL: "https://api.groq.com/openai/v1", model: "llama-3.1-8b-instant" },
  mistral: { baseURL: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  deepseek: { baseURL: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  xai: { baseURL: "https://api.x.ai/v1", model: "grok-beta" },
};

// ── Provider implementations ──────────────────────────────────────────────────

async function callOpenAICompatible(
  apiKey: string,
  provider: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const config = OPENAI_COMPATIBLE[provider];
  if (!config) throw new Error(`Unknown provider: ${provider}`);

  const res = await fetch(`${config.baseURL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 8192,
      response_format: { type: "json_object" },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${provider} API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return data?.choices?.[0]?.message?.content ?? "";
}

async function callAnthropic(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userContent }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlock = data?.content?.find((b) => b.type === "text");
  return textBlock?.text ?? "";
}

async function callGemini(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\n${userContent}` }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

async function callCohere(
  apiKey: string,
  systemPrompt: string,
  userContent: string,
): Promise<string> {
  const res = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "command-r",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 4096,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Cohere API error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    message?: { content?: Array<{ type: string; text?: string }> };
    text?: string;
  };
  // v2 chat returns message.content array; fall back to top-level text
  const textBlock = data?.message?.content?.find((b) => b.type === "text");
  return textBlock?.text ?? data?.text ?? "";
}

function repairJson(jsonStr: string): string {
  let inString = false;
  let isEscaped = false;
  const stack: string[] = [];

  const str = jsonStr.trim();
  let repaired = "";

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    repaired += char;

    if (isEscaped) {
      isEscaped = false;
      continue;
    }

    if (char === "\\") {
      isEscaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === "{") {
        stack.push("}");
      } else if (char === "[") {
        stack.push("]");
      } else if (char === "}") {
        if (stack[stack.length - 1] === "}") {
          stack.pop();
        }
      } else if (char === "]") {
        if (stack[stack.length - 1] === "]") {
          stack.pop();
        }
      }
    }
  }

  if (inString) {
    repaired += '"';
  }

  // Clean trailing commas if any
  repaired = repaired.trim().replace(/,\s*$/, "");

  // Auto-close open brackets and braces in reverse order
  while (stack.length > 0) {
    const closing = stack.pop();
    repaired += closing;
  }

  return repaired;
}

// ── JSON extraction with multiple fallback strategies ─────────────────────────

function extractJson(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();

  // Strategy 1: direct parse
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // continue
  }

  // Strategy 2: strip markdown code fences
  const fenceMatch =
    trimmed.match(/```json\s*([\s\S]*?)```/i) ??
    trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  // Strategy 3: find first { ... } block
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  // Strategy 4: Try to repair truncated JSON (if it was cut off due to max_tokens)
  if (firstBrace !== -1) {
    try {
      const repaired = repairJson(trimmed.slice(firstBrace));
      return JSON.parse(repaired) as Record<string, unknown>;
    } catch {
      // continue
    }
  }

  throw new Error("LLM returned non-JSON response — could not extract structured data");
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface QueryAnalysis {
  researchIntent: string;
  mainProductOrCompany: string;
  featuresMentioned: string[];
  competitorsMentioned: string[];
  industryOrCategory: string;
  additionalKeywordsOrSynonyms: string[];
  bestSearchStrategy: string;
  bestReportType:
    | "product_analysis"
    | "feature_research"
    | "comparison"
    | "recommendation"
    | "problem_discovery"
    | "trend"
    | "market_validation";
  optimizedSearchQueries: string[];
}

export async function analyzeQuery(
  provider: LLMProvider,
  apiKey: string,
  query: string,
  timeRange?: string,
  detailLevel: string = "standard",
): Promise<QueryAnalysis> {
  const systemPrompt = `You are an expert AI search engineer and customer intelligence analyst.
Analyze the user's research query and determine the intent, entities, search strategy, and best report type.
${
  detailLevel === "detailed"
    ? `Also generate 5 to 8 distinct, semantically diverse, optimized search queries for search engines (like Reddit, YouTube, GitHub, Hacker News) that target high-signal user discussions.`
    : `Also generate 2 to 4 optimized search queries for search engines (like Reddit, YouTube, GitHub, Hacker News) that target high-signal user discussions.`
}

The current date is July 15, 2026.

Available Report Types:
1. "product_analysis" - For general research about a single product/company.
2. "feature_research" - For queries about a specific feature of a product (e.g. "Interactive Canvas ChatGPT", "Notion databases").
3. "comparison" - For comparing two or more products (e.g. "X vs Y", "A or B", "compare CRM").
4. "recommendation" - For finding recommendations in a category (e.g. "best CRM", "best AI tools", "best laptop").
5. "problem_discovery" - For finding complaints, bugs, or reasons users leave (e.g. "why people hate Notion", "Cursor complaints", "why users leave X").
6. "trend" - For high-level trends, emerging topics, or technologies (e.g. "AI coding assistants", "MCP", "Agentic AI").
7. "market_validation" - For validating startup ideas or new products (e.g. "AI resume builder", "startup idea personal CRM").

Time Range Bias:
The user has specified a time range preference: "${timeRange || "all"}"
If this is not "all", you MUST bias at least one of the optimized search queries toward recency by including terms like "recent", "latest", or the current years "2026"/"2025".

Return ONLY a valid JSON object matching this schema:
{
  "researchIntent": "Brief description of what the user is trying to learn",
  "mainProductOrCompany": "Name of the main product or company (if applicable)",
  "featuresMentioned": ["array", "of", "features", "mentioned"],
  "competitorsMentioned": ["array", "of", "competitors", "mentioned"],
  "industryOrCategory": "The industry or category",
  "additionalKeywordsOrSynonyms": ["synonyms", "or", "related", "keywords"],
  "bestSearchStrategy": "Brief description of the search strategy",
  "bestReportType": "one of the 7 report types listed above",
  "optimizedSearchQueries": ["query 1", "query 2", "query 3"]
}`;

  const userContent = `User query: "${query}"`;

  let responseText: string;
  if (provider === "anthropic") {
    responseText = await callAnthropic(apiKey, systemPrompt, userContent);
  } else if (provider === "gemini") {
    responseText = await callGemini(apiKey, systemPrompt, userContent);
  } else if (provider === "cohere") {
    responseText = await callCohere(apiKey, systemPrompt, userContent);
  } else {
    responseText = await callOpenAICompatible(apiKey, provider, systemPrompt, userContent);
  }

  try {
    const parsed = extractJson(responseText) as unknown as QueryAnalysis;
    // Validate report type fallback
    const validTypes = [
      "product_analysis",
      "feature_research",
      "comparison",
      "recommendation",
      "problem_discovery",
      "trend",
      "market_validation",
    ];
    if (!validTypes.includes(parsed.bestReportType)) {
      parsed.bestReportType = "product_analysis";
    }
    if (!Array.isArray(parsed.optimizedSearchQueries) || parsed.optimizedSearchQueries.length === 0) {
      parsed.optimizedSearchQueries = [query];
    }
    return parsed;
  } catch (err) {
    logger.error({ err, responseText }, "Failed to parse query analysis JSON");
    // Graceful fallback
    return {
      researchIntent: `Analyze query: ${query}`,
      mainProductOrCompany: query,
      featuresMentioned: [],
      competitorsMentioned: [],
      industryOrCategory: "",
      additionalKeywordsOrSynonyms: [],
      bestSearchStrategy: `Search for keyword: ${query}`,
      bestReportType: "product_analysis",
      optimizedSearchQueries: [query],
    };
  }
}

export async function generateReport(
  provider: LLMProvider,
  apiKey: string,
  keyword: string,
  textCorpus: string,
  reportType: string,
  platformsSearched: string[] = [],
  timeRangePreference?: string,
  detailLevel: string = "standard",
): Promise<Record<string, unknown>> {
  const platformsList = platformsSearched.length > 0 ? platformsSearched.join(", ") : "the sources below";

  let systemPrompt = `You are a customer intelligence analyst. Analyze discussions gathered from multiple online communities (Reddit, YouTube, GitHub, Hacker News, etc.) and produce a structured JSON customer intelligence report that merges insights across all sources.
Return ONLY valid JSON — no markdown, no explanation, just the raw JSON object.`;

  if (detailLevel === "detailed") {
    systemPrompt += ` Generate an extremely comprehensive, exhaustive, and detailed deep-dive market research report. Every section must have thorough details, granular customer feedback analysis, deep competitor comparisons, and specific, step-by-step actionable recommendations. While standard reports contain 3-5 entries per list, in detailed mode you should perform a deep dive and generate as many items as possible (targeting 10-15 detailed entries per list if the data contains enough signal) with exhaustive descriptions for each entry, capturing all details and nuances present in the raw data without artificial limits. Do not summarize or keep points brief; write extensive details for every entry.`;
  }

  let userContent = `Analyze these discussions about "${keyword}" gathered from ${platformsList} and produce a comprehensive, MERGED customer intelligence report of type "${reportType}" as JSON. Each source is clearly marked with "SOURCE: <platform>" headers in the data below — use these to attribute insights.

Every insight or point in this report MUST be backed by evidence in the data. You must include these fields for each insight/point where requested:
- 'platforms': array of source platforms where it was actually observed (e.g. ["Reddit", "GitHub"])
- 'supportingDiscussionsCount': integer number of discussions/posts/comments supporting this specific insight
- 'confidenceScore': integer from 1 to 10 indicating the strength/clarity of evidence in the data

Time Range Soft Filter Handling:
The user has specified a time range preference: "${timeRangePreference || "all"}"
Because database filtering across sources is unreliable, the data may include mixed time periods.
- You MUST indicate in the 'executiveSummary' if the data appears to include mixed/older time periods.
- Avoid making definitive, over-confident claims about recent trends if time filtering is weak.
- Prefer phrasing insights like "recent discussions suggest..." or "users have recently mentioned..." rather than definitive time-bound conclusions.

Return a JSON object matching the appropriate schema for the report type "${reportType}":\n\n`;

  if (reportType === "feature_research") {
    userContent += `Schema:
{
  "reportType": "feature_research",
  "executiveSummary": "2-3 paragraph summary of findings, including notes on recency/time-filtering limitations",
  "featureOverview": "Brief summary of the feature, its purpose, and scope",
  "userFeedback": [
    { "feedback": "Brief feedback point", "sentiment": "positive|negative|neutral", "platforms": ["Reddit"], "supportingDiscussionsCount": 3, "confidenceScore": 8 }
  ],
  "advantages": [
    { "title": "Pros title", "description": "Details", "platforms": ["..."], "supportingDiscussionsCount": 2, "confidenceScore": 9 }
  ],
  "limitations": [
    { "title": "Cons/limitations title", "description": "Details", "platforms": ["..."], "supportingDiscussionsCount": 4, "confidenceScore": 7 }
  ],
  "commonUseCases": [
    { "useCase": "Title of use case", "description": "Details", "platforms": ["..."], "supportingDiscussionsCount": 1, "confidenceScore": 6 }
  ],
  "requestedImprovements": [
    { "improvement": "Requested improvement", "description": "Details", "urgency": "high|medium|low", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 8 }
  ],
  "opportunityScore": {
    "score": 8,
    "explanation": "Rationale for the opportunity score (1-10)"
  },
  "keyThreads": [
    { "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }
  ]
}`;
  } else if (reportType === "comparison") {
    userContent += `Schema:
{
  "reportType": "comparison",
  "executiveSummary": "2-3 paragraph summary of findings, including notes on recency/time-filtering limitations",
  "featureComparison": [
    { "feature": "Feature name", "productA": "Availability/details in product A", "productB": "Availability/details in product B", "comparison": "Short comparative analysis" }
  ],
  "pricing": {
    "comparison": "Comparative analysis of pricing plans and value for money",
    "details": [
      { "product": "Product name", "priceModel": "Pricing model (e.g. freemium, subscription, usage-based)" }
    ]
  },
  "strengths": [
    { "product": "Product name", "strength": "Brief strength", "details": "Description", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 8 }
  ],
  "weaknesses": [
    { "product": "Product name", "weakness": "Brief weakness", "details": "Description", "platforms": ["..."], "supportingDiscussionsCount": 2, "confidenceScore": 7 }
  ],
  "userPreference": {
    "preferredProduct": "Name of preferred product",
    "breakdownPercent": [
      { "product": "Product name", "percent": 60 }
    ],
    "details": "Explanation of community preference based on discussions"
  },
  "switchingReasons": [
    { "fromProduct": "Product A", "toProduct": "Product B", "reason": "Reason title", "details": "Details", "platforms": ["..."], "supportingDiscussionsCount": 4, "confidenceScore": 9 }
  ],
  "bestFor": [
    { "product": "Product name", "scenario": "Ideal scenario/persona best suited for" }
  ],
  "finalVerdict": "Overall conclusion and summary recommendations for decision makers",
  "keyThreads": [
    { "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }
  ]
}`;
  } else if (reportType === "recommendation") {
    userContent += `Schema:
{
  "reportType": "recommendation",
  "executiveSummary": "2-3 paragraph summary of findings, including notes on recency/time-filtering limitations",
  "rankedList": [
    { "rank": 1, "name": "Product name", "description": "Details", "bestFor": "Best use case", "score": 9.5, "pricing": "Pricing overview" }
  ],
  "prosAndCons": [
    { "product": "Product name", "pros": ["Pro 1", "Pro 2"], "cons": ["Con 1", "Con 2"] }
  ],
  "bestFor": [
    { "scenario": "Scenario details", "recommendedProduct": "Product name", "rationale": "Why it's recommended" }
  ],
  "pricing": {
    "summary": "Pricing landscape overview",
    "comparison": [
      { "product": "Product name", "details": "Pricing details" }
    ]
  },
  "communityConsensus": {
    "generalOpinion": "Summary of what the community generally thinks",
    "majorAgreements": ["Point of agreement 1"],
    "majorDisagreements": ["Point of disagreement/controversy 1"]
  },
  "finalRecommendation": "Clear, actionable recommendation for which to choose",
  "keyThreads": [
    { "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }
  ]
}`;
  } else if (reportType === "problem_discovery") {
    userContent += `Schema:
{
  "reportType": "problem_discovery",
  "executiveSummary": "2-3 paragraph summary of findings, including notes on recency/time-filtering limitations",
  "biggestComplaints": [
    { "complaint": "Title of complaint", "description": "Details", "severity": "critical|major|minor", "frequency": 8, "platforms": ["..."], "supportingDiscussionsCount": 5, "confidenceScore": 9 }
  ],
  "rootCauses": [
    { "cause": "Root cause", "complaint": "Related complaint", "explanation": "Detailed explanation", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 8 }
  ],
  "severityBreakdown": {
    "critical": 30,
    "major": 50,
    "minor": 20
  },
  "frequencyTrend": "rising|static|decreasing",
  "suggestedImprovements": [
    { "improvement": "Suggested improvement", "description": "Details", "priority": "high|medium|low", "platforms": ["..."], "supportingDiscussionsCount": 4, "confidenceScore": 8 }
  ],
  "keyThreads": [
    { "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }
  ]
}`;
  } else if (reportType === "trend") {
    userContent += `Schema:
{
  "reportType": "trend",
  "executiveSummary": "2-3 paragraph summary of findings, including notes on recency/time-filtering limitations",
  "growthTrends": [
    { "trend": "Trend description", "description": "Detailed notes", "direction": "up|down|stable", "momentum": "high|medium|low", "platforms": ["..."], "supportingDiscussionsCount": 4, "confidenceScore": 8 }
  ],
  "popularProducts": [
    { "name": "Product/Topic name", "description": "Role in this trend", "growthIndicator": "Why it's growing/mentioned", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 9 }
  ],
  "emergingTopics": [
    { "topic": "Topic title", "relevance": "Details", "platforms": ["..."], "supportingDiscussionsCount": 2, "confidenceScore": 7 }
  ],
  "communityDiscussions": [
    { "theme": "General discussion theme", "generalSentiment": "positive|neutral|negative", "keyQuotesOrOpinions": ["Quote/opinion 1"] }
  ],
  "opportunities": [
    { "opportunity": "Opportunity description", "description": "Details", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 8 }
  ],
  "keyThreads": [
    { "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }
  ]
}`;
  } else if (reportType === "market_validation") {
    userContent += `Schema:
{
  "reportType": "market_validation",
  "executiveSummary": "2-3 paragraph summary of findings, including notes on recency/time-filtering limitations",
  "demandSignals": [
    { "signal": "Demand signal description", "description": "Details", "strength": "strong|moderate|weak", "platforms": ["..."], "supportingDiscussionsCount": 5, "confidenceScore": 9 }
  ],
  "existingCompetitors": [
    { "name": "Competitor name", "positioning": "Product positioning", "weaknessesToExploit": "Weaknesses/gaps in competitor", "platforms": ["..."] }
  ],
  "painPoints": [
    { "painPoint": "Pain point description", "description": "Details", "severity": "high|medium|low", "platforms": ["..."], "supportingDiscussionsCount": 4, "confidenceScore": 8 }
  ],
  "marketGaps": [
    { "gap": "Identified gap", "description": "Details", "sizeEstimate": "large|medium|small", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 7 }
  ],
  "customerPersonas": [
    { "persona": "Persona name", "characteristics": ["Characteristic 1"], "needs": ["Need 1"] }
  ],
  "opportunityScore": {
    "score": 7.5,
    "rationale": "Opportunity rationale"
  },
  "buildRecommendation": {
    "verdict": "build|pivot|do_not_build",
    "reasoning": "Recommendation reasoning",
    "recommendedMVPFeatures": ["Feature 1", "Feature 2"]
  },
  "keyThreads": [
    { "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }
  ]
}`;
  } else {
    // Default to Product Analysis
    userContent += `Schema:
{
  "reportType": "product_analysis",
  "executiveSummary": "2-3 paragraph summary of key findings across all platforms, including notes on recency/time-filtering limitations",
  "overallSentiment": {
    "score": 0.5,
    "label": "Positive",
    "breakdown": { "positive": 60, "neutral": 20, "negative": 20 }
  },
  "topPainPoints": [{ "title": "Pain point title", "description": "Description", "frequency": 8, "platforms": ["Reddit", "GitHub"], "supportingDiscussionsCount": 5, "confidenceScore": 8 }],
  "mostRequestedFeatures": [{ "title": "Requested feature title", "description": "Description", "votes": 9, "platforms": ["..."], "supportingDiscussionsCount": 4, "confidenceScore": 9 }],
  "mostLovedFeatures": [{ "title": "Loved feature title", "description": "Description", "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 9 }],
  "competitorsMentioned": [{ "name": "Competitor name", "sentiment": "positive|neutral|negative", "mentions": 5, "platforms": ["..."], "supportingDiscussionsCount": 2, "confidenceScore": 7 }],
  "customerPersonas": [{ "name": "Persona title", "description": "Description", "traits": ["Trait 1"], "platforms": ["..."] }],
  "buyingObjections": [{ "objection": "Objection details", "frequency": 7, "platforms": ["..."], "supportingDiscussionsCount": 3, "confidenceScore": 8 }],
  "opportunityGaps": [{ "gap": "Gap details", "description": "Description", "platforms": ["..."], "supportingDiscussionsCount": 2, "confidenceScore": 7 }],
  "keyThreads": [{ "title": "Thread title", "url": "Thread url", "platform": "Reddit", "score": 25, "commentCount": 12, "summary": "Thread summary" }],
  "actionableRecommendations": [{ "priority": "high|medium|low", "recommendation": "Recommendation text", "rationale": "Rationale", "supportingDiscussionsCount": 4, "confidenceScore": 8 }]
}`;
  }

  userContent += `\n\nEnsure that you extract relevant threads for the 'keyThreads' section from the discussion data. Return ONLY valid JSON matching the schema, with no additional markdown text or explanations.

Multi-source discussion data:
${textCorpus.slice(0, 300000)}`;

  let responseText: string;

  try {
    if (provider === "anthropic") {
      responseText = await callAnthropic(apiKey, systemPrompt, userContent);
    } else if (provider === "gemini") {
      responseText = await callGemini(apiKey, systemPrompt, userContent);
    } else if (provider === "cohere") {
      responseText = await callCohere(apiKey, systemPrompt, userContent);
    } else {
      responseText = await callOpenAICompatible(apiKey, provider, systemPrompt, userContent);
    }
  } catch (err) {
    logger.error({ err, provider, keyword }, "LLM API call failed");
    throw err;
  }

  try {
    return extractJson(responseText);
  } catch (err) {
    logger.error({ provider, keyword, responsePreview: responseText.slice(0, 200) }, "JSON extraction failed");
    throw new Error(
      `AI returned an unparseable response. This sometimes happens with complex queries — try again or switch providers.`,
    );
  }
}

export async function validateApiKey(provider: LLMProvider, apiKey: string): Promise<boolean> {
  try {
    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 5,
          messages: [{ role: "user", content: "ping" }],
        }),
      });
      return res.status !== 401 && res.status !== 403;
    }

    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      return res.ok;
    }

    if (provider === "cohere") {
      const res = await fetch("https://api.cohere.com/v2/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      return res.ok;
    }

    // All OpenAI-compatible providers
    const config = OPENAI_COMPATIBLE[provider];
    if (!config) return false;
    const res = await fetch(`${config.baseURL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
