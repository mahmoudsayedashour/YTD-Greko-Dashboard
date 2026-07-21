// api/chat.js — Secure Gemini proxy
// Frontend calls POST /api/chat  →  this calls Gemini  →  returns AI text
// API key must be set in Vercel Project Settings → Environment Variables as GEMINI_API_KEY

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

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
      ? fullData.customer_data.slice(0, 50)
      : undefined;
  }
  if (isGeneric || needs.channels)   out.channel_data  = fullData.channel_data;
  if (isGeneric || needs.categories) out.category_data = fullData.category_data;
  if (isGeneric || needs.products) {
    out.product_data = Array.isArray(fullData.product_data)
      ? fullData.product_data.slice(0, 80)
      : undefined;
  }
  if (needs.returns) {
    out.category_data = out.category_data || fullData.category_data;
    out.channel_data  = out.channel_data  || fullData.channel_data;
    if (!out.product_data) {
      out.product_data = Array.isArray(fullData.product_data)
        ? fullData.product_data.slice(0, 80) : undefined;
    }
  }

  return out;
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async function handler(req, res) {

  // ── GET: diagnostics endpoint (safe — no sensitive data exposed) ──
  if (req.method === 'GET') {
    const hasKey = !!process.env.GEMINI_API_KEY;
    console.log('[chat.js] Diagnostics check. GEMINI_API_KEY present:', hasKey);
    return res.status(200).json({
      status:    hasKey ? 'configured' : 'missing_key',
      hasKey,
      runtime:   process.version,
      message:   hasKey
        ? 'API key is loaded. POST to this endpoint to use the AI.'
        : 'GEMINI_API_KEY is not set. Add it in Vercel Project Settings → Environment Variables, then redeploy.',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // ── Detailed error: key missing ──────────────────────────────
  if (!apiKey) {
    console.error('[chat.js] GEMINI_API_KEY is not set in environment variables.');
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured on the server. ' +
             'Please add it in Vercel Project Settings → Environment Variables ' +
             'and trigger a redeployment.',
    });
  }

  console.log('[chat.js] GEMINI_API_KEY is present. Processing request.');

  try {
    const { message, history = [], fullData, filters = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message field is required and must be a string.' });
    }

    const relevantData   = fullData ? extractRelevantData(message, fullData) : {};
    const systemPrompt   = buildSystemPrompt(filters);

    // Build Gemini contents array
    const contents = [];

    // Conversation history (last 10 turns)
    for (const turn of (history || []).slice(-10)) {
      if (turn.role && turn.text) {
        contents.push({ role: turn.role, parts: [{ text: turn.text }] });
      }
    }

    // Attach data context to the user message
    const dataJson    = Object.keys(relevantData).length > 1
      ? '\n\n[DASHBOARD DATA]\n' + JSON.stringify(relevantData) + '\n[/DASHBOARD DATA]'
      : '';

    contents.push({
      role:  'user',
      parts: [{ text: message + dataJson }],
    });

    // ── Call Gemini ──────────────────────────────────────────
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature:     0.3,
          topP:            0.8,
          maxOutputTokens: 2048,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
        ],
      }),
    });

    // ── Relay actual Gemini error ─────────────────────────────
    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('[chat.js] Gemini error:', geminiRes.status, errBody);
      return res.status(502).json({
        error:      `Gemini API error (${geminiRes.status})`,
        geminiStatus: geminiRes.status,
        geminiBody: errBody,          // visible in browser/logs for debugging
      });
    }

    const json = await geminiRes.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      console.error('[chat.js] Gemini returned no text. Full response:', JSON.stringify(json));
      return res.status(502).json({
        error:    'Gemini returned an empty response.',
        raw:      json,
      });
    }

    return res.status(200).json({ reply: text });

  } catch (err) {
    console.error('[chat.js] Unhandled exception:', err);
    return res.status(500).json({ error: `Internal error: ${err.message}` });
  }
};
