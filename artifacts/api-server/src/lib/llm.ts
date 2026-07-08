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
      max_tokens: 4096,
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
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
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

  throw new Error("LLM returned non-JSON response — could not extract structured data");
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function generateReport(
  provider: LLMProvider,
  apiKey: string,
  keyword: string,
  textCorpus: string,
): Promise<Record<string, unknown>> {
  const systemPrompt = `You are a market research analyst. Analyze Reddit discussions and produce a structured JSON market research report. Return ONLY valid JSON — no markdown, no explanation, just the raw JSON object.`;

  const userContent = `Analyze these Reddit discussions about "${keyword}" and produce a comprehensive market research report as JSON.

Return a JSON object with EXACTLY these fields:
{
  "executiveSummary": "2-3 paragraph summary of key findings",
  "overallSentiment": {
    "score": <number -1 to 1>,
    "label": <"Very Negative"|"Negative"|"Neutral"|"Positive"|"Very Positive">,
    "breakdown": { "positive": <0-100>, "neutral": <0-100>, "negative": <0-100> }
  },
  "topPainPoints": [{ "title": "...", "description": "...", "frequency": <1-10> }],
  "mostRequestedFeatures": [{ "title": "...", "description": "...", "votes": <1-10> }],
  "mostLovedFeatures": [{ "title": "...", "description": "..." }],
  "competitorsMentioned": [{ "name": "...", "sentiment": "positive|neutral|negative", "mentions": <count> }],
  "customerPersonas": [{ "name": "...", "description": "...", "traits": ["..."] }],
  "buyingObjections": [{ "objection": "...", "frequency": <1-10> }],
  "opportunityGaps": [{ "gap": "...", "description": "..." }],
  "keyThreads": [{ "title": "...", "url": "...", "score": <score>, "commentCount": <count>, "summary": "..." }],
  "actionableRecommendations": [{ "priority": "high|medium|low", "recommendation": "...", "rationale": "..." }]
}

Include at minimum: 3-5 pain points, 3-5 feature requests, 2-4 loved features, 2-5 competitors, 2-3 personas, 3-5 objections, 2-4 opportunity gaps, 3-5 key threads, 5-8 recommendations.

Reddit data:
${textCorpus.slice(0, 15000)}`;

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
