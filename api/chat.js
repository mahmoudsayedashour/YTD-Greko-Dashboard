// api/chat.js — Secure Gemini proxy using @google/generative-ai SDK
// Frontend → POST /api/chat → Gemini gemini-2.5-flash → response
// API key: set GeminiAPIKey in Vercel Project Settings → Environment Variables

const { GoogleGenerativeAI } = require('@google/generative-ai');

const MODEL_NAME = 'gemini-2.5-flash';

// ── System prompt ─────────────────────────────────────────────
function buildSystemPrompt(filters) {
  const period   = filters.period   || 'YTD';
  const measure  = filters.measure  || 'ton';
  const channel  = filters.channel  || 'All Channels';
  const category = filters.category || 'All Categories';

  return `You are a Senior Business Analyst for Greko Egypt, a leading dairy products company.
Your role is to analyze the company's sales performance data and provide professional, data-driven answers.

CURRENT DASHBOARD CONTEXT:
- Selected Period: ${period}
- Selected Measure: ${measure}
- Channel Filter: ${channel}
- Category Filter: ${category}

BEHAVIOR RULES:
1. Answer ONLY using the data provided in the user's message. Never invent or estimate values.
2. If the data for a requested metric is not provided, clearly say it is unavailable.
3. Always cite actual numbers, percentages, and rankings from the data.
4. Structure responses clearly using bullet points, bold text, and tables where helpful.
5. Write in an executive, professional tone — concise but insightful.
6. When making recommendations, base them purely on the provided data trends.
7. Format volume values with commas (e.g., 1,234.5 Ton).
8. Respond in the same language the user uses (English or Arabic).
9. Always contextualize findings (e.g., mention if something is above/below target, growing/declining).
10. Do not repeat the raw data back to the user — synthesize it into business insights.`;
}

// ── Retrieval: extract only the relevant data slice ───────────
function extractRelevantData(question, fullData) {
  if (!fullData || typeof fullData !== 'object') return {};

  const needs = {
    executive:  /summary|overview|executive|total|performance|dashboard|kpi|overall|situation|report/i.test(question),
    customers:  /customer|client|account|buyer/i.test(question),
    channels:   /channel|ka|kr|online|b2b|tt|dis|retail|key account|traditional|trade/i.test(question),
    categories: /category|categor|cream|cheese|butter|yogurt|dairy|segment/i.test(question),
    products:   /sku|product|item|brand|exceed.*target|target.*exceed/i.test(question),
    returns:    /return|refund|rejected|partial/i.test(question),
    growth:     /growth|grow|trend|increas|decreas|compare|2025|2026|vs|versus/i.test(question),
  };

  const isGeneric = !Object.values(needs).some(Boolean);
  const out = { meta: fullData.meta };

  if (isGeneric || needs.executive || needs.growth) {
    out.meta          = fullData.meta;
    out.monthly_data  = fullData.monthly_data;
    out.category_data = fullData.category_data;
    out.channel_data  = fullData.channel_data;
  }
  if (isGeneric || needs.customers) {
    out.customer_data = Array.isArray(fullData.customer_data)
      ? fullData.customer_data.slice(0, 50) : undefined;
  }
  if (isGeneric || needs.channels)   out.channel_data  = fullData.channel_data;
  if (isGeneric || needs.categories) out.category_data = fullData.category_data;
  if (isGeneric || needs.products) {
    out.product_data = Array.isArray(fullData.product_data)
      ? fullData.product_data.slice(0, 80) : undefined;
  }
  if (needs.returns) {
    out.category_data = out.category_data || fullData.category_data;
    out.channel_data  = out.channel_data  || fullData.channel_data;
    if (!out.product_data && Array.isArray(fullData.product_data)) {
      out.product_data = fullData.product_data.slice(0, 80);
    }
  }

  return out;
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async function handler(req, res) {

  // GET: safe diagnostics check
  if (req.method === 'GET') {
    const hasKey = !!process.env.GeminiAPIKey;
    console.log('[chat.js] Diagnostics. GeminiAPIKey present:', hasKey, '| Model:', MODEL_NAME);
    return res.status(200).json({
      status:  hasKey ? 'configured' : 'missing_key',
      hasKey,
      model:   MODEL_NAME,
      runtime: process.version,
      message: hasKey
        ? `API key loaded. Model: ${MODEL_NAME}. POST to this endpoint to use AI.`
        : 'GeminiAPIKey is not set. Add it in Vercel Project Settings → Environment Variables and redeploy.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GeminiAPIKey;
  if (!apiKey) {
    console.error('[chat.js] GeminiAPIKey env var is not set.');
    return res.status(500).json({
      error: 'GeminiAPIKey is not configured on the server. ' +
             'Please add it in Vercel Project Settings → Environment Variables and redeploy.',
    });
  }

  console.log('[chat.js] Key present. Starting Gemini request with model:', MODEL_NAME);

  try {
    const { message, history = [], fullData, filters = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message field is required.' });
    }

    // Build data context
    const relevantData = fullData ? extractRelevantData(message, fullData) : {};
    const dataContext  = Object.keys(relevantData).length > 1
      ? '\n\n[DASHBOARD DATA]\n' + JSON.stringify(relevantData) + '\n[/DASHBOARD DATA]'
      : '';

    // Initialise SDK
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: buildSystemPrompt(filters),
    });

    // Build chat history for multi-turn conversation
    const chatHistory = (history || []).slice(-10).map(turn => ({
      role:  turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    }));

    // Start a chat session with history
    const chat = model.startChat({ history: chatHistory });

    // Send the new user message (with data context appended)
    const result = await chat.sendMessage(message + dataContext);
    const text   = result.response.text();

    if (!text) {
      console.error('[chat.js] Gemini returned empty text. Response:', JSON.stringify(result.response));
      return res.status(502).json({ error: 'Gemini returned an empty response. Please try again.' });
    }

    console.log('[chat.js] Gemini responded successfully. Length:', text.length);
    return res.status(200).json({ reply: text });

  } catch (err) {
    // The SDK throws structured errors — expose them for debugging
    console.error('[chat.js] Error calling Gemini:', err.message || err);
    const status  = err.status || err.httpStatus || 500;
    const details = err.errorDetails || err.message || String(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error:   `Gemini error: ${err.message || 'Unknown error'}`,
      details,
      model:   MODEL_NAME,
    });
  }
};
