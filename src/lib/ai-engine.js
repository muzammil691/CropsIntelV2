// CropsIntelV2 — Multi-AI Intelligence Engine
// 4 AI systems working together for trading intelligence
//
// 1. Claude (Anthropic) — Primary brain: deep reasoning, document analysis, tool-use
// 2. GPT (OpenAI) — Fast factual checks, alternative perspectives
// 3. Gemini (Google) — Third perspective for consensus, creative analysis
// 4. ElevenLabs — Voice synthesis (TTS) + transcription (STT) for Zyra voice
// + AI Council — Multi-model consensus for high-stakes trade decisions (uses 1-3)
//
// Architecture:
// - Single model for fast user interactions (Claude primary)
// - Multi-model council for high-stakes analysis (all 3 LLMs vote)
// - ElevenLabs for voice layer on top of any text response

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// API keys will be loaded from Supabase system_config or environment
let apiKeys = {
  anthropic: null,  // ANTHROPIC_API_KEY
  openai: null,     // OPENAI_API_KEY
  gemini: null,     // GEMINI_API_KEY (Google AI Studio)
  elevenlabs: null,  // ELEVENLABS_API_KEY
};

// ─── Load API Keys from Supabase system_config + env vars fallback ──
export async function loadAPIKeys() {
  // 1. Try Supabase system_config first
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/system_config?key=in.(ai_api_keys)`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.[0]?.value) {
        const keys = typeof data[0].value === 'string' ? JSON.parse(data[0].value) : data[0].value;
        apiKeys = { ...apiKeys, ...keys };
      }
    }
  } catch (err) {
    console.warn('AI keys not loaded from config:', err.message);
  }

  // 2. Fill any missing keys from VITE_ env vars
  if (!apiKeys.anthropic) apiKeys.anthropic = import.meta.env.VITE_ANTHROPIC_API_KEY || null;
  if (!apiKeys.openai) apiKeys.openai = import.meta.env.VITE_OPENAI_API_KEY || null;
  if (!apiKeys.gemini) apiKeys.gemini = import.meta.env.VITE_GEMINI_API_KEY || null;
  if (!apiKeys.elevenlabs) apiKeys.elevenlabs = import.meta.env.VITE_ELEVENLABS_API_KEY || null;

  return apiKeys;
}

// ─── Claude (Anthropic) — Primary Brain ─────────────────────────
export async function askClaude(prompt, options = {}) {
  const { model = 'claude-sonnet-4-20250514', maxTokens = 1024, system = '', history = [] } = options;

  if (!apiKeys.anthropic) {
    return { provider: 'claude', error: 'API key not configured', fallback: true };
  }

  // Build messages array: conversation history + current user message
  const messages = [
    ...history.map(m => ({ role: m.role, content: m.content })),
    { role: 'user', content: prompt },
  ];

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKeys.anthropic,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: system || 'You are Zyra, an AI trading intelligence assistant for MAXONS International Trading. You specialize in California almond market analysis, pricing trends, supply/demand forecasting, and trade opportunity identification. Be concise, data-driven, and actionable.',
        messages,
      }),
    });

    if (!res.ok) throw new Error(`Claude API ${res.status}`);
    const data = await res.json();
    return {
      provider: 'claude',
      text: data.content?.[0]?.text || '',
      model,
      usage: data.usage,
    };
  } catch (err) {
    return { provider: 'claude', error: err.message, fallback: true };
  }
}

// ─── GPT (OpenAI) — Fast Factual + Alternative Perspective ──────
export async function askGPT(prompt, options = {}) {
  const { model = 'gpt-4o-mini', maxTokens = 1024, system = '' } = options;

  if (!apiKeys.openai) {
    return { provider: 'gpt', error: 'API key not configured', fallback: true };
  }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKeys.openai}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system || 'You are a commodities market analyst specializing in California almonds. Provide concise, data-driven analysis for a Dubai-based trading company (MAXONS). Focus on supply/demand, pricing trends, and actionable trade signals.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API ${res.status}`);
    const data = await res.json();
    return {
      provider: 'gpt',
      text: data.choices?.[0]?.message?.content || '',
      model,
      usage: data.usage,
    };
  } catch (err) {
    return { provider: 'gpt', error: err.message, fallback: true };
  }
}

// ─── Gemini (Google) — Third Perspective ────────────────────────
export async function askGemini(prompt, options = {}) {
  const { model = 'gemini-2.0-flash', maxTokens = 1024, system = '' } = options;

  if (!apiKeys.gemini) {
    return { provider: 'gemini', error: 'API key not configured', fallback: true };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKeys.gemini}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: (system ? system + '\n\n' : '') + prompt }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });

    if (!res.ok) throw new Error(`Gemini API ${res.status}`);
    const data = await res.json();
    return {
      provider: 'gemini',
      text: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      model,
    };
  } catch (err) {
    return { provider: 'gemini', error: err.message, fallback: true };
  }
}

// ─── ElevenLabs Voice — TTS + STT ──────────────────────────────
export async function textToSpeech(text, options = {}) {
  const { voiceId = 'EXAVITQu4vr4xnSDxMaL', model = 'eleven_multilingual_v2' } = options; // Sarah voice

  if (!apiKeys.elevenlabs) {
    return { provider: 'elevenlabs', error: 'API key not configured', fallback: true };
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKeys.elevenlabs,
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs API ${res.status}`);
    const audioBlob = await res.blob();
    return {
      provider: 'elevenlabs',
      audio: URL.createObjectURL(audioBlob),
      format: 'audio/mpeg',
    };
  } catch (err) {
    return { provider: 'elevenlabs', error: err.message, fallback: true };
  }
}

// ─── AI Council — Multi-Model Consensus for High-Stakes Decisions ──
// All 3 LLMs analyze the same question independently, then a final
// synthesis call combines their perspectives into a consensus view.
export async function aiCouncil(question, context = {}) {
  const systemPrompt = `You are analyzing almond market data for MAXONS International Trading (Dubai).
Context: ${JSON.stringify(context)}
Provide a clear, actionable assessment with confidence level (0-100).`;

  // Ask all 3 models in parallel
  const [claudeRes, gptRes, geminiRes] = await Promise.all([
    askClaude(question, { system: systemPrompt }),
    askGPT(question, { system: systemPrompt }),
    askGemini(question, { system: systemPrompt }),
  ]);

  const responses = [claudeRes, gptRes, geminiRes].filter(r => !r.fallback);

  // If at least 2 models responded, synthesize
  if (responses.length >= 2) {
    const synthesis = await askClaude(
      `You are the AI Council synthesizer. Three AI analysts gave independent assessments of this question: "${question}"

${responses.map(r => `**${r.provider.toUpperCase()}:** ${r.text}`).join('\n\n')}

Synthesize these perspectives into a single consensus view. Note where they agree (high confidence) and where they disagree (flag as uncertain). Provide a final recommendation with confidence score.`,
      { model: 'claude-sonnet-4-20250514', maxTokens: 1500 }
    );

    return {
      type: 'council',
      question,
      individual: responses,
      consensus: synthesis.text || synthesis.error,
      modelsUsed: responses.map(r => r.provider),
      unanimity: responses.length === 3 ? 'full' : 'partial',
    };
  }

  // Fallback: single model or no models
  if (responses.length === 1) {
    return {
      type: 'single',
      question,
      individual: responses,
      consensus: responses[0].text,
      modelsUsed: [responses[0].provider],
      unanimity: 'none',
    };
  }

  // No models available
  return {
    type: 'offline',
    question,
    individual: [],
    consensus: 'AI Council is offline. Please configure API keys in System Config.',
    modelsUsed: [],
    unanimity: 'none',
  };
}

// ─── Smart Router — Pick the right AI for the task ──────────────
// Fast queries → Claude alone
// High-stakes trade decisions → AI Council (all 3)
// Voice output → Any LLM + ElevenLabs
export async function smartQuery(query, options = {}) {
  const { mode = 'auto', voice = false } = options;

  let response;

  if (mode === 'council' || (mode === 'auto' && isHighStakes(query))) {
    response = await aiCouncil(query);
  } else if (mode === 'fast') {
    // Try Claude first, fallback to GPT, then Gemini
    response = await askClaude(query);
    if (response.fallback) response = await askGPT(query);
    if (response.fallback) response = await askGemini(query);
  } else {
    // Default: Claude primary
    response = await askClaude(query);
    if (response.fallback) response = await askGPT(query);
    if (response.fallback) response = await askGemini(query);
  }

  // Add voice if requested
  if (voice && !response.fallback) {
    const text = response.consensus || response.text;
    if (text) {
      const voiceRes = await textToSpeech(text);
      response.voice = voiceRes;
    }
  }

  return response;
}

// Detect high-stakes queries that warrant multi-model consensus
function isHighStakes(query) {
  const lower = query.toLowerCase();
  const signals = [
    'should i buy', 'should i sell', 'should we',
    'trade decision', 'trade signal', 'recommendation',
    'lock in', 'secure supply', 'commit', 'contract',
    'risk assessment', 'risk analysis',
    'forecast', 'prediction', 'outlook',
    'price target', 'fair value',
    'maxons action', 'what should maxons',
  ];
  return signals.some(s => lower.includes(s));
}

// ─── Status check — which AIs are connected ─────────────────────
export function getAIStatus() {
  return {
    anthropic: { connected: !!apiKeys.anthropic, role: 'Primary Brain', label: 'Claude' },
    openai: { connected: !!apiKeys.openai, role: 'Fast Factual', label: 'Gpt' },
    gemini: { connected: !!apiKeys.gemini, role: 'Third Perspective', label: 'Gemini' },
    elevenlabs: { connected: !!apiKeys.elevenlabs, role: 'Voice Layer', label: 'Elevenlabs' },
    council: {
      connected: [apiKeys.anthropic, apiKeys.openai, apiKeys.gemini].filter(Boolean).length >= 2,
      role: 'Multi-Model Consensus',
      modelsActive: [apiKeys.anthropic, apiKeys.openai, apiKeys.gemini].filter(Boolean).length,
    },
  };
}
