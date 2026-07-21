// api/chat.js — Secure Gemini proxy
// Uses @google/generative-ai SDK. Dynamically queries available models to ensure compatibility.
// Configure via Vercel Environment Variables:
//   GeminiAPIKey  — (required) your Google AI Studio API key
//   GeminiModel   — (optional) override model name, e.g. gemini-2.5-flash-lite

const { GoogleGenerativeAI } = require('@google/generative-ai');

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
1. Keep answers extremely concise and executive-level by default (3–8 bullet points maximum). Get straight to the answer without unnecessary introductions or conclusions. Suitable for executives who need quick insights in under 30 seconds.
2. Focus on the most important insights only, not every available metric.
3. When answering analytical questions, ALWAYS use this exact structure:
   - Key Insight: (Brief insight)
   - Supporting Numbers: (Only the most relevant metrics)
   - Recommendation: (1–2 actionable suggestions based on data)
4. Avoid long paragraphs UNLESS the user explicitly asks for an "Executive Report", "Detailed Analysis", "Full Report", or "Deep Dive", in which case provide a comprehensive response.
5. Answer ONLY using the data provided in the user's message. Never invent or estimate values.
6. Always cite actual numbers, percentages, and rankings from the data.
7. Format volume values with commas (e.g., 1,234.5 Ton).
8. Respond in the same language the user uses (English or Arabic).`;
}

// ── Retrieval: return only the data slice relevant to the question ─
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

// ── Try a single model; throws on any error ───────────────────
async function tryModel(genAI, modelName, systemPrompt, chatHistory, userMessage) {
  const model = genAI.getGenerativeModel({
    model: modelName.replace(/^models\//, ''), // Ensure we just use the name part
    systemInstruction: systemPrompt,
  });
  const chat   = model.startChat({ history: chatHistory });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

// ── Dynamically fetch available models ────────────────────────
async function getAvailableModels(apiKey) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      console.error('[chat.js] Failed to fetch models list. Status:', res.status);
      return [];
    }
    const data = await res.json();
    if (!data.models) return [];
    
    // Filter for models that support text generation (generateContent)
    const supported = data.models
      .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name.replace(/^models\//, '')); // Strip 'models/' prefix
      
    // Sort logic to prefer flash/lite models if we want, or just return as-is.
    // For safety, let's just return the list directly, putting anything with "flash" or "lite" at the top optionally.
    // However, the prompt says "automatically use the first available model" so we'll just return the array.
    
    // To ensure a good model is picked first if available, we'll sort flash to top
    return supported.sort((a, b) => {
      const aScore = (a.includes('flash') ? 2 : 0) + (a.includes('lite') ? 1 : 0) - (a.includes('vision') ? 10 : 0);
      const bScore = (b.includes('flash') ? 2 : 0) + (b.includes('lite') ? 1 : 0) - (b.includes('vision') ? 10 : 0);
      return bScore - aScore; // higher score first
    });
  } catch (err) {
    console.error('[chat.js] Error fetching models list:', err);
    return [];
  }
}

// ── Main handler ──────────────────────────────────────────────
module.exports = async function handler(req, res) {

  // GET: safe diagnostics check
  if (req.method === 'GET') {
    const hasKey       = !!process.env.GeminiAPIKey;
    const modelOverride = process.env.GeminiModel || null;
    return res.status(200).json({
      status:        hasKey ? 'configured' : 'missing_key',
      hasKey,
      modelOverride: modelOverride || '(none, will fetch dynamically)',
      runtime:       process.version,
      message:       hasKey
        ? `Key loaded. POST to this endpoint to use AI.`
        : 'GeminiAPIKey env var is missing. Add it in Vercel → Settings → Environment Variables, then redeploy.',
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
             'Add it in Vercel → Project Settings → Environment Variables and redeploy.',
    });
  }

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

    const systemPrompt = buildSystemPrompt(filters);
    const genAI        = new GoogleGenerativeAI(apiKey);

    // Build chat history
    let chatHistory = (history || []).slice(-10).map(turn => ({
      role:  turn.role === 'user' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    }));

    // Ensure first message is from 'user' (Gemini requirement)
    while (chatHistory.length > 0 && chatHistory[0].role === 'model') {
      chatHistory.shift();
    }

    const userMessage = message + dataContext;

    // Determine model: env override → or dynamically fetch
    const modelOverride = process.env.GeminiModel;
    let modelsToTry = [];
    
    if (modelOverride) {
      modelsToTry = [modelOverride];
    } else {
      modelsToTry = await getAvailableModels(apiKey);
      if (modelsToTry.length === 0) {
        // Fallback if the dynamic fetch fails for some reason
        modelsToTry = ['gemini-2.5-flash-lite', 'gemini-1.5-flash'];
      }
    }

    let text        = null;
    let usedModel   = null;
    const errors    = [];

    for (const modelName of modelsToTry) {
      try {
        console.log('[chat.js] Trying model:', modelName);
        text      = await tryModel(genAI, modelName, systemPrompt, chatHistory, userMessage);
        usedModel = modelName;
        console.log('[chat.js] Success with model:', modelName);
        break;
      } catch (err) {
        const status = err.status || err.httpStatus || 'Unknown HTTP Status';
        const msg = err.message || String(err);
        const details = err.errorDetails ? JSON.stringify(err.errorDetails) : msg;
        
        console.warn(`[chat.js] Model ${modelName} failed:`, msg);
        
        errors.push({
          model: modelName,
          status: status,
          message: msg,
          details: details
        });
        
        // Only continue to next model on availability/quota/404 errors
        const isRetryable = /not available|no longer|quota|404|503|unavailable|not found/i.test(msg);
        if (!isRetryable && modelOverride) {
            // If explicit model override fails with an unretryable error, stop.
            break; 
        }
        // If not retryable but we are iterating dynamically, we still try the next one
        // in case one model is completely broken but another works.
      }
    }

    if (!text) {
      console.error('[chat.js] All models failed.');
      
      // Format the error string exactly as requested by user
      let formattedErrors = "All Gemini models failed. Please try again later.\n\nError details:\n";
      errors.forEach(e => {
        formattedErrors += `\n${e.model}\n→ ${e.status}\n→ ${e.message}\n`;
        if (e.details && e.details !== e.message) {
            formattedErrors += `→ ${e.details}\n`;
        }
      });
      
      return res.status(502).json({
        error: formattedErrors,
        rawErrors: errors
      });
    }

    return res.status(200).json({ reply: text, model: usedModel });

  } catch (err) {
    console.error('[chat.js] Unhandled error:', err.message || err);
    return res.status(502).json({
      error:   `Gemini error: ${err.message || 'Unknown error'}`,
      details: err.errorDetails || err.message || String(err),
    });
  }
};
