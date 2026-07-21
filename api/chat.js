// api/chat.js — Secure Gemini proxy
// Frontend calls /api/chat  →  this function calls Gemini  →  returns AI text
// The GEMINI_API_KEY environment variable is set in Vercel project settings.

const GEMINI_API_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

// System prompt: shapes how Gemini responds
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
7. Format monetary/volume values with commas (e.g., 1,234.5 Ton).
8. Respond in the same language the user uses (English or Arabic).
9. Always contextualize findings (e.g., mention if something is above/below target, growing/declining).
10. Do not repeat the raw data back to the user — synthesize it into business insights.`;
}

// Extract the minimal dataset slice needed for the question
function extractRelevantData(question, fullData) {
  const q = question.toLowerCase();

  const needs = {
    executive: /summary|overview|executive|total|performance|dashboard|kpi|overall|situation/i.test(question),
    customers:  /customer|client|account|buyer|top.*client|client.*top/i.test(question),
    channels:   /channel|ka|kr|online|b2b|tt|dis|retail|key account|traditional/i.test(question),
    categories: /category|categor|cream|cheese|butter|yogurt|dairy|product.*group|segment/i.test(question),
    products:   /sku|product|item|brand|specific.*product|product.*specific|which.*product|exceed.*target|target.*exceed/i.test(question),
    returns:    /return|refund|rejected|partial|rinv/i.test(question),
    growth:     /growth|grow|trend|increas|decreas|compare|2025.*2026|2026.*2025|vs|versus/i.test(question),
  };

  // If nothing specific detected or it's a broad question, include everything
  const isGeneric = !Object.values(needs).some(Boolean);

  const out = {
    meta:          fullData.meta,
    period:        fullData.meta?.period,
    monthlyTrend:  fullData.monthly_data?.slice(0, 12),  // always lightweight
  };

  if (isGeneric || needs.executive || needs.growth) {
    out.meta          = fullData.meta;
    out.monthly_data  = fullData.monthly_data;
    out.category_data = fullData.category_data;
    out.channel_data  = fullData.channel_data;
  }
  if (isGeneric || needs.customers) {
    out.customer_data = fullData.customer_data
      ? fullData.customer_data.slice(0, 50)  // top 50 customers
      : undefined;
  }
  if (isGeneric || needs.channels) {
    out.channel_data = fullData.channel_data;
  }
  if (isGeneric || needs.categories) {
    out.category_data = fullData.category_data;
  }
  if (isGeneric || needs.products) {
    out.product_data = fullData.product_data
      ? fullData.product_data.slice(0, 80)   // top 80 SKUs
      : undefined;
  }
  if (isGeneric || needs.returns) {
    out.category_data = out.category_data || fullData.category_data;
    out.product_data  = out.product_data  || (fullData.product_data ? fullData.product_data.slice(0, 80) : undefined);
    out.channel_data  = out.channel_data  || fullData.channel_data;
  }

  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service is not configured. Please contact the administrator.' });
  }

  try {
    const { message, history = [], fullData, filters = {} } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required.' });
    }

    // Build the minimal data payload
    const relevantData = fullData ? extractRelevantData(message, fullData) : {};

    // Build Gemini conversation contents
    const systemPrompt = buildSystemPrompt(filters);

    const contents = [];

    // Add conversation history (last 8 turns to stay within token limits)
    const recentHistory = history.slice(-8);
    for (const turn of recentHistory) {
      contents.push({ role: turn.role, parts: [{ text: turn.text }] });
    }

    // Add the new user message with data context
    const dataContext = Object.keys(relevantData).length > 1
      ? `\n\n[DASHBOARD DATA CONTEXT]\n${JSON.stringify(relevantData, null, 0)}\n[END DATA]`
      : '';

    contents.push({
      role: 'user',
      parts: [{ text: message + dataContext }]
    });

    // Call Gemini
    const geminiRes = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
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
        ]
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      return res.status(502).json({ error: 'AI model returned an error. Please try again.' });
    }

    const geminiJson = await geminiRes.json();
    const text = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'AI returned an empty response. Please try again.' });
    }

    return res.status(200).json({ reply: text });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: 'Internal server error. Please try again.' });
  }
};
