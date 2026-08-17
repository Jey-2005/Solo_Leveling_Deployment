/**
 * Gemini client.
 *
 * Design notes
 * ------------
 * - One place owns the API key, the model registry, retries and token accounting.
 *   Nothing else in the codebase talks to Google directly.
 * - Every call uses structured output (responseMimeType + responseSchema) so the
 *   caller gets a typed object, never prose it has to regex. That removes the
 *   single biggest source of retries.
 * - Sampling params (temperature / topP / topK) are deprecated on Gemini 3.x and
 *   are omitted by default. Set GEMINI_SEND_SAMPLING=1 to send them anyway.
 */

const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Task -> model routing. Cheap work stays on Flash-Lite; only genuinely
 * hard reasoning is allowed to escalate. Override any of these with env vars
 * without touching code.
 *
 * gemini-3.1-flash-lite is the default because it is the cost-efficient
 * workhorse. gemini-3.5-flash-lite is its newer equivalent — swapping is a
 * one-line env change.
 */
export const MODELS = {
  fast:      process.env.GEMINI_MODEL_FAST      || 'gemini-3.1-flash-lite',
  reasoning: process.env.GEMINI_MODEL_REASONING || process.env.GEMINI_MODEL_FAST || 'gemini-3.1-flash-lite',
};

export class GeminiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
    this.detail = detail;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Strip markdown fences a model occasionally emits despite JSON mode. */
function parseJson(text) {
  if (!text) throw new GeminiError('Empty model response', 502);
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // last resort: grab the outermost JSON object/array
    const m = cleaned.match(/[[{][\s\S]*[\]}]/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* fall through */ }
    }
    throw new GeminiError('Model did not return valid JSON', 502, cleaned.slice(0, 400));
  }
}

/**
 * Call Gemini and return { data, usage, model, latencyMs }.
 *
 * @param {object}  o
 * @param {string}  o.system        system instruction
 * @param {string}  o.prompt        user content
 * @param {object}  o.schema        responseSchema (OpenAPI subset)
 * @param {'fast'|'reasoning'} o.tier
 * @param {number}  o.maxTokens
 * @param {'minimal'|'low'|'medium'|'high'} o.thinking
 */
export async function generate({
  system,
  prompt,
  schema,
  tier = 'fast',
  maxTokens = 2048,
  thinking = 'low',
  retries = 2,
  timeoutMs = 45000,
} = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError('GEMINI_API_KEY is not configured', 500);

  const model = MODELS[tier] || MODELS.fast;

  const generationConfig = {
    maxOutputTokens: maxTokens,
    responseMimeType: 'application/json',
  };
  if (schema) generationConfig.responseSchema = schema;
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking };
  if (process.env.GEMINI_SEND_SAMPLING === '1') {
    generationConfig.temperature = 0.7;
    generationConfig.topP = 0.95;
  }

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig,
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };

  const started = Date.now();
  let lastErr;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        // 429 / 5xx are worth retrying; 4xx client errors are not.
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await sleep(600 * Math.pow(2, attempt) + Math.random() * 300);
          continue;
        }
        throw new GeminiError(`Gemini returned ${res.status}`, res.status, detail.slice(0, 500));
      }

      const json = await res.json();
      const cand = json.candidates?.[0];

      if (cand?.finishReason === 'MAX_TOKENS') {
        throw new GeminiError('Response truncated — raise maxTokens', 502);
      }
      if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') {
        throw new GeminiError('Response blocked by safety filters', 400);
      }

      const text = (cand?.content?.parts || []).map((p) => p.text || '').join('');
      const data = parseJson(text);
      const u = json.usageMetadata || {};

      return {
        data,
        model,
        latencyMs: Date.now() - started,
        usage: {
          in: u.promptTokenCount || 0,
          out: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
        },
      };
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const retryable =
        err.name === 'AbortError' ||
        (err instanceof GeminiError && (err.status === 429 || err.status >= 500)) ||
        err.message === 'Model did not return valid JSON';
      if (attempt < retries && retryable) {
        await sleep(600 * Math.pow(2, attempt) + Math.random() * 300);
        continue;
      }
      break;
    }
  }
  throw lastErr instanceof GeminiError
    ? lastErr
    : new GeminiError(lastErr?.message || 'Gemini request failed', 502);
}

/* ------------------------------------------------------------------ *
 * Schema helpers — keeps the prompt file readable
 * ------------------------------------------------------------------ */
export const S = {
  str: (description, extra = {}) => ({ type: 'string', description, ...extra }),
  num: (description, extra = {}) => ({ type: 'number', description, ...extra }),
  int: (description, extra = {}) => ({ type: 'integer', description, ...extra }),
  bool: (description) => ({ type: 'boolean', description }),
  enum: (values, description) => ({ type: 'string', enum: values, description }),
  arr: (items, description) => ({ type: 'array', items, description }),
  obj: (properties, required = []) => ({
    type: 'object',
    properties,
    required: required.length ? required : Object.keys(properties),
  }),
};
