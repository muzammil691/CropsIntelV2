import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { smartQuery, getAIStatus, loadAPIKeys, textToSpeech } from '../lib/ai-engine';

// ─── Sample AI analyses when table is empty ────────────────────
const SAMPLE_ANALYSES = [
  {
    id: 's1', analysis_type: 'trade_signal', title: 'Trade Signal: BULLISH — 2024/2025',
    summary: 'Shipments and new commitments both trending up month-over-month. Uncommitted inventory declining faster than prior year. Strong demand from India and Middle East. Recommend securing forward positions.',
    confidence: 0.78, tags: ['signal', 'actionable'], is_actionable: true, is_read: false,
    data_context: { signal: 'bullish' }, created_at: '2026-04-21T08:00:00Z',
  },
  {
    id: 's2', analysis_type: 'monthly_brief', title: 'Monthly Brief: 2024/2025 (Mar 2026)',
    summary: 'Supply: 3,050M lbs | Shipped: 1,820M | Committed: 680M | Uncommitted: 550M. 81.9% of supply sold or committed — tighter than prior year at same point (78.2%). Season pace running 12% ahead.',
    confidence: 0.98, tags: ['brief'], is_actionable: false, is_read: false,
    data_context: {}, created_at: '2026-04-20T06:00:00Z',
  },
  {
    id: 's3', analysis_type: 'anomaly', title: 'Anomaly: Record India Shipments — Feb 2026',
    summary: 'February shipments to India hit 45M lbs — 2.3 std devs above 10-year average (28M). Likely driven by India duty reduction and weak Australian crop. Volume may normalize in spring months.',
    confidence: 0.87, tags: ['anomaly'], is_actionable: true, is_read: false,
    data_context: { z_score: '2.31' }, created_at: '2026-04-18T10:00:00Z',
  },
  {
    id: 's4', analysis_type: 'trade_signal', title: 'Price Alert: Nonpareil 23/25 Firming',
    summary: 'Strata market data shows Nonpareil 23/25 prices up $0.12/lb over 30 days ($3.73 → $3.85). Volume-weighted average trending higher. New crop commitments running 18% ahead of prior year suggests further upside.',
    confidence: 0.72, tags: ['signal', 'price'], is_actionable: true, is_read: false,
    data_context: { signal: 'bullish' }, created_at: '2026-04-17T14:00:00Z',
  },
  {
    id: 's5', analysis_type: 'prescription', title: 'MAXONS Action: Secure Carmel 25/27 Supply',
    summary: 'Current Carmel 25/27 prices ($3.20/lb) are 8% below 3-year average. With declining acreage and strong Middle East demand for lower grades, prices likely to firm in Q3. Recommend locking 200-300 MT at current levels for Dubai/Saudi orders.',
    confidence: 0.68, tags: ['prescription', 'maxons'], is_actionable: true, is_read: false,
    data_context: { variety: 'Carmel', grade: '25/27' }, created_at: '2026-04-16T09:00:00Z',
  },
  {
    id: 's6', analysis_type: 'yoy_comparison', title: 'YoY: Export Shipments +14% Through March',
    summary: 'Total export shipments through March 2026 are 14.2% ahead of the same period in 2025. India (+28%), Middle East (+18%), and EU (+6%) lead the growth. China (-12%) dragged by tariffs.',
    confidence: 0.95, tags: ['yoy'], is_actionable: false, is_read: false,
    data_context: {}, created_at: '2026-04-15T07:00:00Z',
  },
  {
    id: 's7', analysis_type: 'anomaly', title: 'Alert: Acreage Decline Accelerating',
    summary: 'California almond bearing acreage down to 1.29M acres (2025), lowest since 2019. Non-bearing acres at 14-year low signals no rebound for 3-4 years. Structurally tighter supply ahead.',
    confidence: 0.90, tags: ['anomaly', 'supply'], is_actionable: true, is_read: false,
    data_context: {}, created_at: '2026-04-14T11:00:00Z',
  },
];

// ─── Zyra chat sample responses ────────────────────────────────
const ZYRA_RESPONSES = {
  default: "I'm Zyra, your AI trading intelligence assistant. I analyze almond market data, generate trade signals, and provide actionable insights for MAXONS. Ask me about market conditions, pricing trends, supply outlook, or specific trade opportunities.",
  price: "Based on current Strata market data, Nonpareil 23/25 is trading at $3.85/lb (MAXONS price: $3.97/lb with 3% margin). Prices have firmed $0.12 over the past 30 days. The tightening supply position and strong export pace support current levels. I'd watch for further upside if the April position report shows continued uncommitted inventory decline.",
  supply: "The 2024/2025 supply position shows 81.9% of marketable supply is sold or committed as of March — running about 3.7 percentage points tighter than the same month last year. Uncommitted inventory at 550M lbs is the lowest at this point in the season since 2021/2022. This supports a bullish bias for remaining uncommitted inventory.",
  india: "India shipments are running 28% ahead of prior year through March. The tariff reduction from 42% to 35% effective April 1 is the primary driver. India is now the #1 export destination by volume. For MAXONS, this creates opportunity in the CFR Mumbai corridor — recommend quoting Nonpareil 25/27 aggressively to your Delhi and Mumbai contacts.",
  forecast: "The 2025 crop outlook is mixed. Bee colony health improved (30% loss vs 40% prior year), supporting normal pollination. However, total bearing acreage declined to 1.29M acres. USDA subjective estimate (May) will be the key data point. My preliminary model suggests 2.6-2.8 billion lbs — below the 3-year average of 2.85B. A below-average crop on declining acreage would be strongly bullish.",
  maxons: "For MAXONS specifically, I recommend: (1) Secure 200-300 MT Carmel 25/27 at current $3.20/lb levels for Gulf region orders — prices likely to firm in Q3. (2) Follow up with Al Rayyan Foods on the Q3 Nonpareil commitment — they're your highest-scoring contact at 85/100. (3) Send updated pricing to Delhi Dry Fruits — India demand surge creates urgency. (4) Lock supply agreements with Blue Diamond for 2025/26 before crop estimate release.",
};

function getZyraResponse(msg) {
  const lower = msg.toLowerCase();
  if (lower.includes('price') || lower.includes('cost') || lower.includes('strata')) return ZYRA_RESPONSES.price;
  if (lower.includes('supply') || lower.includes('position') || lower.includes('inventory')) return ZYRA_RESPONSES.supply;
  if (lower.includes('india') || lower.includes('delhi') || lower.includes('mumbai')) return ZYRA_RESPONSES.india;
  if (lower.includes('forecast') || lower.includes('crop') || lower.includes('acreage')) return ZYRA_RESPONSES.forecast;
  if (lower.includes('maxon') || lower.includes('recommend') || lower.includes('action') || lower.includes('what should')) return ZYRA_RESPONSES.maxons;
  return ZYRA_RESPONSES.default;
}

const ANALYSIS_TYPE_CONFIG = {
  trade_signal: { icon: '📡', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  monthly_brief: { icon: '📊', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  anomaly: { icon: '⚠️', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  prescription: { icon: '💡', color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
  yoy_comparison: { icon: '📈', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
};

function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function Intelligence() {
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [filter, setFilter] = useState('all');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: ZYRA_RESPONSES.default, provider: 'zyra' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [councilMode, setCouncilMode] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [playingVoice, setPlayingVoice] = useState(null); // index of message being played
  const audioRef = useRef(null);
  const chatEndRef = useRef(null);

  // Load API keys and AI status on mount
  useEffect(() => {
    (async () => {
      await loadAPIKeys();
      setAiStatus(getAIStatus());
    })();
  }, []);

  useEffect(() => { loadAnalyses(); }, []);
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages]);

  async function loadAnalyses() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_analyses')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (!error && data?.length > 0) {
        setAnalyses(data);
        setIsSample(false);
      } else {
        setAnalyses(SAMPLE_ANALYSES);
        setIsSample(true);
      }
    } catch {
      setAnalyses(SAMPLE_ANALYSES);
      setIsSample(true);
    }
    setLoading(false);
  }

  async function sendChat(e) {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setChatInput('');
    setChatLoading(true);

    try {
      const mode = councilMode ? 'council' : 'auto';
      const result = await smartQuery(userMsg, { mode });

      // Check if we got a real response
      const text = result.consensus || result.text;
      if (text && !result.fallback && result.type !== 'offline') {
        // Real AI response
        const providerLabel = result.type === 'council'
          ? `AI Council (${result.modelsUsed?.join(', ')})`
          : result.provider || 'AI';
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          text,
          provider: providerLabel,
          isCouncil: result.type === 'council',
          unanimity: result.unanimity,
        }]);
      } else {
        // Fallback to sample responses
        const fallbackText = getZyraResponse(userMsg);
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          text: fallbackText,
          provider: 'zyra-offline',
        }]);
      }
    } catch (err) {
      // Network error — use sample responses
      const fallbackText = getZyraResponse(userMsg);
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: fallbackText,
        provider: 'zyra-offline',
      }]);
    }

    // Refresh AI status after each query
    setAiStatus(getAIStatus());
    setChatLoading(false);
  }

  async function playVoice(text, msgIndex) {
    // Stop if already playing
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (playingVoice === msgIndex) {
        setPlayingVoice(null);
        return;
      }
    }
    setPlayingVoice(msgIndex);
    try {
      const result = await textToSpeech(text);
      if (result.audio) {
        const audio = new Audio(result.audio);
        audioRef.current = audio;
        audio.onended = () => { setPlayingVoice(null); audioRef.current = null; };
        audio.play();
      } else {
        setPlayingVoice(null);
      }
    } catch {
      setPlayingVoice(null);
    }
  }

  const types = [...new Set(analyses.map(a => a.analysis_type))].filter(Boolean);
  const filtered = filter === 'all' ? analyses : analyses.filter(a => a.analysis_type === filter);
  const actionableCount = analyses.filter(a => a.is_actionable).length;
  const signalCount = analyses.filter(a => a.analysis_type === 'trade_signal').length;
  const avgConfidence = analyses.length > 0
    ? Math.round(analyses.reduce((s, a) => s + (a.confidence || 0), 0) / analyses.length * 100)
    : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">
            AI Intelligence
            {isSample && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium uppercase tracking-wider ml-2 align-middle">Sample Data</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Trade signals, market prescriptions, and Zyra AI assistant
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Insights</p>
          <p className="text-xl font-bold text-white mt-1">{analyses.length}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Trade Signals</p>
          <p className="text-xl font-bold text-green-400 mt-1">{signalCount}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Actionable</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{actionableCount}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Avg Confidence</p>
          <p className="text-xl font-bold text-white mt-1">{avgConfidence}%</p>
        </div>
      </div>

      {/* Two-column: Zyra Chat + Insights Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Zyra Chat — 2/5 width */}
        <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl flex flex-col h-[500px]">
          <div className="p-4 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white text-xs font-bold">
                Z
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Zyra</h3>
                <p className="text-[10px] text-gray-500">
                  {aiStatus?.council?.connected ? `${aiStatus.council.modelsActive} AI Models Active` : 'AI Trading Intelligence'}
                </p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                {/* Council Mode Toggle */}
                <button
                  onClick={() => setCouncilMode(!councilMode)}
                  title={councilMode ? 'Council Mode: All AIs vote' : 'Fast Mode: Primary AI only'}
                  className={`text-[9px] px-2 py-0.5 rounded-full border transition-colors ${
                    councilMode
                      ? 'bg-purple-500/20 border-purple-500/30 text-purple-400'
                      : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-400'
                  }`}
                >
                  {councilMode ? 'Council' : 'Fast'}
                </button>
                {/* AI Status Button */}
                <button
                  onClick={() => setShowAiPanel(!showAiPanel)}
                  className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                  title="AI Systems Status"
                >
                  {aiStatus?.council?.connected ? (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                      Live
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      Offline
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* AI Status Panel (collapsible) */}
            {showAiPanel && aiStatus && (
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {Object.entries(aiStatus).filter(([k]) => k !== 'council').map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5 bg-gray-800/50 rounded px-2 py-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${val.connected ? 'bg-green-500' : 'bg-gray-600'}`} />
                    <span className="text-[9px] text-gray-400 capitalize">{key}</span>
                    <span className={`text-[9px] ml-auto ${val.connected ? 'text-green-500' : 'text-gray-600'}`}>
                      {val.connected ? 'Ready' : 'No Key'}
                    </span>
                  </div>
                ))}
                {aiStatus.council && (
                  <div className="col-span-2 flex items-center gap-1.5 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-1">
                    <div className={`w-1.5 h-1.5 rounded-full ${aiStatus.council.connected ? 'bg-purple-400' : 'bg-gray-600'}`} />
                    <span className="text-[9px] text-purple-400">AI Council</span>
                    <span className={`text-[9px] ml-auto ${aiStatus.council.connected ? 'text-purple-400' : 'text-gray-600'}`}>
                      {aiStatus.council.connected ? `${aiStatus.council.modelsActive}/3 Models` : 'Need 2+ Keys'}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-green-600/20 text-green-100 border border-green-500/20'
                    : msg.isCouncil
                      ? 'bg-purple-900/30 text-gray-300 border border-purple-500/30'
                      : 'bg-gray-800/80 text-gray-300 border border-gray-700/50'
                }`}>
                  {msg.text}
                  {/* Provider badge + voice button */}
                  {msg.role === 'assistant' && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-700/30 flex items-center gap-1.5">
                      {msg.provider === 'zyra-offline' ? (
                        <span className="text-[9px] text-amber-500/60">Offline mode — sample response</span>
                      ) : msg.provider && msg.provider !== 'zyra' ? (
                        <>
                          <span className={`text-[9px] ${msg.isCouncil ? 'text-purple-400' : 'text-green-500/60'}`}>
                            {msg.isCouncil ? 'Council' : msg.provider}
                          </span>
                          {msg.unanimity && (
                            <span className={`text-[9px] px-1 rounded ${
                              msg.unanimity === 'full' ? 'bg-green-500/20 text-green-400' : 'bg-amber-500/20 text-amber-400'
                            }`}>
                              {msg.unanimity === 'full' ? 'Unanimous' : 'Partial'}
                            </span>
                          )}
                        </>
                      ) : null}
                      {/* Voice play button */}
                      <button
                        onClick={() => playVoice(msg.text, i)}
                        className={`ml-auto text-[9px] px-1.5 py-0.5 rounded transition-colors ${
                          playingVoice === i
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'text-gray-600 hover:text-gray-400'
                        }`}
                        title={playingVoice === i ? 'Stop' : 'Listen (Zyra voice)'}
                      >
                        {playingVoice === i ? 'Stop' : 'Listen'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-800/80 border border-gray-700/50 rounded-xl px-4 py-2">
                  <div className="flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendChat} className="p-3 border-t border-gray-800">
            <div className="flex gap-2">
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask about prices, supply, forecasts..."
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
              />
              <button
                type="submit"
                disabled={chatLoading || !chatInput.trim()}
                className="px-3 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['What should MAXONS do?', 'Price outlook?', 'Supply position?', 'India demand?', 'Risk assessment?', 'Trade signal?'].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setChatInput(q); }}
                  className="text-[10px] px-2 py-1 rounded bg-gray-800 border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* Insights Feed — 3/5 width */}
        <div className="lg:col-span-3 space-y-3">
          {/* Filter */}
          <div className="flex items-center gap-2">
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300"
            >
              <option value="all">All Types</option>
              {types.map(t => (
                <option key={t} value={t}>
                  {(ANALYSIS_TYPE_CONFIG[t]?.icon || '') + ' ' + t.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-600">{filtered.length} insights</span>
          </div>

          {/* Cards */}
          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {filtered.map(a => {
              const cfg = ANALYSIS_TYPE_CONFIG[a.analysis_type] || ANALYSIS_TYPE_CONFIG.monthly_brief;
              const signal = a.data_context?.signal;
              return (
                <div key={a.id} className={`bg-gray-900/50 border rounded-xl p-4 hover:border-gray-700 transition-colors ${cfg.bg}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm">{cfg.icon}</span>
                        <span className={`text-[10px] font-medium ${cfg.color}`}>
                          {a.analysis_type.replace('_', ' ').toUpperCase()}
                        </span>
                        {a.is_actionable && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            ACTION
                          </span>
                        )}
                        {signal && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                            signal === 'bullish' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {signal === 'bullish' ? '↑' : '↓'} {signal.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-medium text-white">{a.title}</h4>
                      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">{a.summary}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-gray-600">{fmtDate(a.created_at)}</p>
                      <div className="flex items-center gap-1 mt-1 justify-end">
                        <div className="w-10 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500/60 rounded-full" style={{ width: `${(a.confidence || 0) * 100}%` }} />
                        </div>
                        <span className="text-[9px] text-gray-600">{Math.round((a.confidence || 0) * 100)}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Multi-AI Architecture Info */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">4 AI Systems Working Together</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-orange-500/20 flex items-center justify-center text-[10px]">C</div>
              <span className="text-xs font-medium text-white">Claude</span>
            </div>
            <p className="text-[10px] text-gray-500">Primary brain. Deep reasoning, document analysis, trade synthesis.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center text-[10px]">G</div>
              <span className="text-xs font-medium text-white">GPT</span>
            </div>
            <p className="text-[10px] text-gray-500">Fast factual checks, alternative market perspectives.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center text-[10px]">Ge</div>
              <span className="text-xs font-medium text-white">Gemini</span>
            </div>
            <p className="text-[10px] text-gray-500">Third perspective for consensus, creative analysis.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center text-[10px]">11</div>
              <span className="text-xs font-medium text-white">ElevenLabs</span>
            </div>
            <p className="text-[10px] text-gray-500">Voice synthesis for Zyra. Speak any insight aloud.</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
          Fast Mode: Claude handles standard queries with GPT/Gemini fallback. Council Mode: all 3 LLMs analyze high-stakes
          trade decisions independently, then Claude synthesizes a consensus with confidence scoring.
        </p>
      </div>
    </div>
  );
}
