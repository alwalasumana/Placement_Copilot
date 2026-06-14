/**
 * aiService (geminiService.js)
 *
 * Text generation  → Groq API (free LLaMA inference) — uses GROK_API_KEY
 * Embeddings       → Gemini                           — uses GEMINI_API_KEY
 *
 * Groq API is fully OpenAI-compatible. Free tier: 14,400 req/day.
 * Get a free key at: https://console.groq.com/
 */

// ─── Groq Config ──────────────────────────────────────────────────────────────

const GROK_URL    = 'https://api.groq.com/openai/v1/chat/completions';
// Groq models (fast, free LLaMA inference)
const GROK_MODELS = [
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
  'openai/gpt-oss-20b'
];

const getGrokKey = () => {
  const key = process.env.GROK_API_KEY;
  if (!key || key.includes('YOUR_GROK')) {
    throw new Error('GROK_API_KEY is not set in server/.env — get one free at https://console.groq.com/');
  }
  return key;
};

// ─── Text Generation (Grok) ───────────────────────────────────────────────────

// ─── Text Generation (Grok) ───────────────────────────────────────────────────

const generateTextGroq = async (prompt, options = {}) => {
  const { temperature = 0.3, maxOutputTokens = 8192 } = options;
  const key = getGrokKey();

  let lastError;

  for (const model of GROK_MODELS) {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const res = await fetch(GROK_URL, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages:    [{ role: 'user', content: prompt }],
            temperature,
            max_tokens:  Math.min(maxOutputTokens, 8192),
          }),
          signal: AbortSignal.timeout(90_000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          lastError = new Error(`Grok ${model} → ${res.status}: ${errText.substring(0, 200)}`);

          // Rate limit or server error → retry or try next
          if (res.status === 429 || res.status === 503 || res.status === 529) {
            attempts++;
            if (attempts < 3) {
              const delay = attempts * 2000;
              console.warn(`⚠️  Grok model ${model} rate limited (${res.status}). Retrying attempt ${attempts}/3 in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            console.warn(`⚠️  Grok model ${model} rate limit attempts exhausted. Trying next model...`);
            break; // Try next model in the outer loop
          }
          // Auth error or other bad request → fail fast
          throw lastError;
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty response from Grok');
        return text;

      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        if (msg.includes('429') || msg.includes('503') || msg.includes('rate limit')) {
          attempts++;
          if (attempts < 3) {
            const delay = attempts * 2000;
            console.warn(`⚠️  Grok model ${model} error: ${msg}. Retrying attempt ${attempts}/3 in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        break; // break to try next model
      }
    }
  }

  throw new Error(
    `All Grok models failed. Last error: ${lastError?.message}. ` +
    `Check your GROK_API_KEY at https://console.x.ai/`
  );
};

// ─── JSON Generation (Grok) ───────────────────────────────────────────────────

const generateJSONGroq = async (prompt, options = {}) => {
  const key = getGrokKey();
  const { temperature = 0.1, maxOutputTokens = 8192 } = options;

  const jsonPrompt = `${prompt}

CRITICAL: Respond ONLY with valid JSON. No markdown, no code blocks, no explanation.
Start your response directly with { or [`;

  let lastError;

  for (const model of GROK_MODELS) {
    let attempts = 0;
    while (attempts < 3) {
      try {
        const res = await fetch(GROK_URL, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages:        [{ role: 'user', content: jsonPrompt }],
            temperature,
            max_tokens:      Math.min(maxOutputTokens, 8192),
          }),
          signal: AbortSignal.timeout(90_000),
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          lastError = new Error(`Grok ${model} → ${res.status}: ${errText.substring(0, 200)}`);
          if (res.status === 429 || res.status === 503) {
            attempts++;
            if (attempts < 3) {
              const delay = attempts * 2000;
              console.warn(`⚠️  Grok model ${model} rate limited (${res.status}). Retrying JSON attempt ${attempts}/3 in ${delay}ms...`);
              await new Promise(r => setTimeout(r, delay));
              continue;
            }
            break;
          }
          throw lastError;
        }

        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (!text) throw new Error('Empty JSON response from Grok');

        // Parse JSON
        try {
          return JSON.parse(text);
        } catch {
          const repair = (str) => {
            return str
              .replace(/^```json\s*/i, '')
              .replace(/^```\s*/i, '')
              .replace(/\s*```$/i, '')
              .replace(/'(\w+)'\s*:/g, '"$1":')     // repair single-quoted keys
              .replace(/:\s*'([^']*)'/g, ': "$1"')    // repair single-quoted values
              .replace(/,\s*([\]}])/g, '$1')         // repair trailing commas
              .trim();
          };

          const cleaned = repair(text);
          try {
            return JSON.parse(cleaned);
          } catch {
            // Extract JSON object or array from anywhere in the response
            try {
              const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
              if (match) return JSON.parse(repair(match[1]));
            } catch (matchErr) {
              console.error('⚠️  Failed to parse extracted JSON match block:', matchErr.message);
            }
            console.error('⚠️  Grok JSON Parse Failure. Raw text was:\n', text);
            throw new Error('Could not parse JSON from Grok response');
          }
        }

      } catch (err) {
        lastError = err;
        const msg = err.message || '';
        if (msg.includes('429') || msg.includes('503') || msg.includes('rate limit') || msg.includes('parse')) {
          attempts++;
          if (attempts < 3) {
            const delay = attempts * 2000;
            console.warn(`⚠️  Grok model ${model} JSON error: ${msg}. Retrying attempt ${attempts}/3 in ${delay}ms...`);
            await new Promise(r => setTimeout(r, delay));
            continue;
          }
        }
        break;
      }
    }
  }

  throw new Error(`All Grok models failed for JSON: ${lastError?.message}`);
};

// ─── Gemini Fallback REST direct call ──────────────────────────────────────────

const geminiTextREST = async (prompt, model = 'gemini-2.0-flash', options = {}, isJSON = false) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('PASTE') || key.includes('YOUR')) {
    throw new Error('GEMINI_API_KEY not set in server/.env');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  
  const requestBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options.temperature ?? 0.3,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
    }
  };

  if (isJSON) {
    requestBody.generationConfig.responseMimeType = "application/json";
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(90_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${model} → ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(`${model}: empty text returned`);
  return text;
};

// ─── Public Fallback Interfaces ───────────────────────────────────────────────

export const generateText = async (prompt, options = {}) => {
  try {
    return await generateTextGroq(prompt, options);
  } catch (groqErr) {
    console.warn(`⚠️  Groq generateText failed (${groqErr.message}). Falling back to Gemini...`);
    let lastGeminiErr;
    for (const model of ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']) {
      try {
        console.log(`Trying Gemini fallback model: ${model}`);
        return await geminiTextREST(prompt, model, options, false);
      } catch (geminiErr) {
        lastGeminiErr = geminiErr;
        console.warn(`⚠️  Gemini model ${model} fallback failed: ${geminiErr.message}`);
      }
    }
    throw new Error(`Text generation failed. Groq error: ${groqErr.message}. Gemini fallback error: ${lastGeminiErr?.message}`);
  }
};

export const generateJSON = async (prompt, options = {}) => {
  try {
    return await generateJSONGroq(prompt, options);
  } catch (groqErr) {
    console.warn(`⚠️  Groq generateJSON failed (${groqErr.message}). Falling back to Gemini...`);
    let lastGeminiErr;
    for (const model of ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.1-flash-lite']) {
      try {
        console.log(`Trying Gemini fallback JSON model: ${model}`);
        const text = await geminiTextREST(prompt, model, options, true);
        return JSON.parse(text);
      } catch (geminiErr) {
        lastGeminiErr = geminiErr;
        console.warn(`⚠️  Gemini JSON model ${model} fallback failed: ${geminiErr.message}`);
      }
    }
    throw new Error(`JSON generation failed. Groq error: ${groqErr.message}. Gemini fallback error: ${lastGeminiErr?.message}`);
  }
};

// ─── Embeddings (Gemini REST — direct v1 API, no npm client) ──────────────────
//
// We use raw fetch so we control the API version (v1, not v1beta).
// Tries text-embedding-004 first, falls back to embedding-001.
// Gemini API keys from aistudio.google.com start with "AIza..."
// Get one free at: https://aistudio.google.com/app/apikey
//

const EMBED_MODELS = ['gemini-embedding-2', 'gemini-embedding-001', 'text-embedding-004', 'embedding-001'];

const geminiEmbedREST = async (text, model) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('PASTE') || key.includes('YOUR')) {
    throw new Error('GEMINI_API_KEY not set — get a free key at https://aistudio.google.com/app/apikey');
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:embedContent?key=${key}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:   `models/${model}`,
      content: { parts: [{ text: text.substring(0, 2048) }] },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`${model} → ${res.status}: ${err.substring(0, 200)}`);
  }

  const data = await res.json();
  const values = data?.embedding?.values;
  if (!values?.length) throw new Error(`${model}: empty embedding returned`);
  return values;
};

export const generateEmbedding = async (text) => {
  let lastErr;
  for (const model of EMBED_MODELS) {
    try {
      return await geminiEmbedREST(text, model);
    } catch (err) {
      lastErr = err;
      console.warn(`⚠️  Embedding model ${model} failed: ${err.message}`);
    }
  }
  throw new Error(`All embedding models failed. Last error: ${lastErr?.message}. ` +
    `Make sure GEMINI_API_KEY starts with "AIza" — get one free at https://aistudio.google.com/app/apikey`);
};

export const generateEmbeddingsBatch = async (texts) => {
  const embeddings = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchEmbeddings = await Promise.all(batch.map(generateEmbedding));
    embeddings.push(...batchEmbeddings);
    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return embeddings;
};

// ─── Health check / validation ────────────────────────────────────────────────

export const validateGrokKey = async () => {
  try {
    const result = await generateText('Say OK in one word.', { maxOutputTokens: 10 });
    return { valid: true, model: 'groq', response: result.trim() };
  } catch (err) {
    return { valid: false, error: err.message };
  }
};

/** Kept for backward compatibility with /health/gemini endpoint */
export const validateGeminiKey = validateGrokKey;
