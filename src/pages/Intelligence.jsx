import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { seedAiAnalyses } from '../lib/seed-ai-analyses';
import { askClaude, smartQuery, getAIStatus, loadAPIKeys, textToSpeech } from '../lib/ai-engine';
// Wave 3 (2026-04-24): Intelligence.jsx was running a DEGRADED Zyra —
// no role-lens, no language detection, and a keyword-routing fallback that
// pattern-matched "india"/"supply"/"price" to return canned paragraphs. User
// explicitly flagged that as anti-human. Now uses the same prompt builder
// as the floating bubble.
import {
  detectLanguage, buildZyraSystemPrompt, resolveUserTier, zyraOfflineMessage,
} from '../lib/zyra-prompts';
import {
  generateSessionId, getFullLearningContext,
} from '../lib/zyra-memory';
import {
  recordFeedback, buildCorrectionContext,
} from '../lib/zyra-trainer';

/* Strip markdown formatting for clean card display */
function stripMd(text) {
  if (!text) return '';
  return text
    .replace(/#{1,6}\s+/g, '')      // headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1')     // italic
    .replace(/`([^`]+)`/g, '$1')       // inline code
    .replace(/\n{2,}/g, ' ')           // double newlines → space
    .replace(/\n/g, ' ')              // single newlines → space
    .trim();
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
  const { user, profile } = useAuth();
  const [analyses, setAnalyses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const userTier = resolveUserTier(user, profile);
  const welcomeByTier = {
    guest:      'Hi — I\u2019m Zyra. Register for deeper market intel; right now I can sketch out trends and answer general questions.',
    registered: 'Zyra here. Ask me about the market — supply, prices, destinations. Verified tier unlocks personalized prescriptions.',
    verified:   'Zyra here. Fully online. Ask for a market brief, price call, or destination deep-dive.',
    maxons:     'Zyra, MAXONS mode. Ready for internal strategy — margin, CRM priorities, council opinions.',
  };

  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: welcomeByTier[userTier] || welcomeByTier.guest, provider: 'zyra' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [councilMode, setCouncilMode] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [playingVoice, setPlayingVoice] = useState(null); // index of message being played
  const [feedback, setFeedback] = useState({}); // msgIdx → 'up' | 'down'
  const [learningContext, setLearningContext] = useState('');
  const [sessionId] = useState(() => generateSessionId());
  const audioRef = useRef(null);
  const chatEndRef = useRef(null);

  const [marketContext, setMarketContext] = useState('');

  // Load API keys, AI status, market context, and Zyra memory on mount
  useEffect(() => {
    (async () => {
      await loadAPIKeys();
      setAiStatus(getAIStatus());

      // Load past learning context from zyra-memory so the full-page chat
      // doesn't start "cold" relative to bubble conversations.
      try {
        if (user?.id) {
          const lc = await getFullLearningContext(user.id);
          if (lc) setLearningContext(lc);
        }
      } catch { /* graceful — memory table may not be ready */ }

      // Build market context for Zyra system prompt
      try {
        const { data: reports } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false })
          .limit(2);

        const { data: prices } = await supabase
          .from('strata_prices')
          .select('variety,grade,price_usd_per_lb,maxons_price_per_lb')
          .order('price_date', { ascending: false })
          .limit(10);

        let ctx = '';
        if (reports?.length) {
          const r = reports[0];
          const soldPct = r.total_supply_lbs > 0 ? (((r.total_supply_lbs - (r.uncommitted_lbs || 0)) / r.total_supply_lbs) * 100).toFixed(1) : 0;
          ctx += `ABC POSITION (${r.crop_year}, ${r.report_year}/${String(r.report_month).padStart(2,'0')}): Supply ${(r.total_supply_lbs/1e6).toFixed(0)}M | Shipped ${(r.total_shipped_lbs/1e6).toFixed(0)}M | Committed ${(r.total_committed_lbs/1e6).toFixed(0)}M | Uncommitted ${(r.uncommitted_lbs/1e6).toFixed(0)}M | ${soldPct}% sold\n`;
        }
        if (prices?.length) {
          const byV = {};
          prices.forEach(p => { if (!byV[p.variety]) byV[p.variety] = p; });
          ctx += 'PRICES: ' + Object.values(byV).map(p => `${p.variety} $${parseFloat(p.price_usd_per_lb).toFixed(2)}`).join(', ') + '\n';
        }
        setMarketContext(ctx);
      } catch (e) { /* graceful */ }
    })();
  }, [user?.id]);

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
      } else {
        // Auto-seed if table is empty
        const seeded = await seedAiAnalyses(supabase);
        if (seeded) {
          const { data: d2 } = await supabase
            .from('ai_analyses')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(50);
          setAnalyses(d2 || []);
        } else {
          setAnalyses([]);
        }
      }
    } catch {
      setAnalyses([]);
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

    // Build conversation history for multi-turn
    const history = chatMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map(m => ({ role: m.role, content: m.text }));

    // Build the SAME Zyra system prompt the floating bubble uses: role-lens
    // (grower/broker/buyer/trader/…), multilingual (ar/hi/tr/es/en),
    // learning + correction context from past conversations, page context.
    const detectedLang     = detectLanguage(userMsg);
    const correctionContext = buildCorrectionContext();
    const zyraSystem = buildZyraSystemPrompt(userTier, profile, marketContext, {
      learningContext, correctionContext, detectedLang, pageContext: 'intelligence',
    });

    try {
      let result;
      if (councilMode) {
        result = await smartQuery(userMsg, { mode: 'council', system: zyraSystem });
      } else {
        result = await askClaude(userMsg, {
          system: zyraSystem,
          history,
          maxTokens: 600,
        });
      }

      const text = result.consensus || result.text;
      if (text && !result.fallback && result.type !== 'offline') {
        const providerLabel = result.type === 'council'
          ? `AI Council (${result.modelsUsed?.join(', ')})`
          : result.provider || 'AI';
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          text,
          provider: providerLabel,
          isCouncil: result.type === 'council',
          unanimity: result.unanimity,
          detectedLang,
        }]);
      } else {
        // HONEST offline mode — no keyword-routed canned paragraphs. The user
        // flagged the old behaviour ("india" → pre-written canned response)
        // as anti-human. Show the real situation instead.
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          text: zyraOfflineMessage(detectedLang),
          provider: 'zyra-offline',
          detectedLang,
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        text: zyraOfflineMessage(detectedLang),
        provider: 'zyra-offline',
        detectedLang,
      }]);
    }

    setAiStatus(getAIStatus());
    setChatLoading(false);
  }

  // Trainer loop — thumbs up/down on assistant replies
  async function rateMessage(msgIdx, rating) {
    const msg = chatMessages[msgIdx];
    if (!msg || msg.role !== 'assistant') return;
    const prev = chatMessages[msgIdx - 1];
    const userQuery = prev?.role === 'user' ? prev.text : '';
    setFeedback(f => ({ ...f, [msgIdx]: rating }));
    try {
      await recordFeedback({
        sessionId,
        userId: user?.id || null,
        userQuery,
        assistantReply: msg.text,
        rating,
        pageContext: 'intelligence',
        userTier,
      });
    } catch { /* best-effort */ }
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
                  {aiStatus?.council?.connected
                    ? `${aiStatus.council.modelsActive} AI Models Active`
                    : '1 AI Model Active (Claude) · GPT + Gemini council on roadmap'}
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
                    <span className="text-[9px] text-gray-400 capitalize">{val.label || key}</span>
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
                        <span className="text-[9px] text-amber-500/60">Offline — AI backend unreachable</span>
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
                          {msg.detectedLang && msg.detectedLang !== 'en' && (
                            <span className="text-[9px] px-1 rounded bg-blue-500/20 text-blue-400">
                              {msg.detectedLang.toUpperCase()}
                            </span>
                          )}
                        </>
                      ) : null}
                      {/* Trainer loop — thumbs up/down */}
                      {msg.provider && msg.provider !== 'zyra-offline' && msg.provider !== 'zyra' && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={() => rateMessage(i, 'up')}
                            title="Good answer — helps train Zyra"
                            className={`text-[10px] leading-none px-1 py-0.5 rounded transition-colors ${
                              feedback[i] === 'up'
                                ? 'text-green-300'
                                : 'text-gray-600 hover:text-green-400'
                            }`}
                          >
                            👍
                          </button>
                          <button
                            onClick={() => rateMessage(i, 'down')}
                            title="Bad answer"
                            className={`text-[10px] leading-none px-1 py-0.5 rounded transition-colors ${
                              feedback[i] === 'down'
                                ? 'text-red-300'
                                : 'text-gray-600 hover:text-red-400'
                            }`}
                          >
                            👎
                          </button>
                        </div>
                      )}
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
                      <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
                        {(() => { const s = stripMd(a.summary); return s.length > 200 ? s.slice(0, 200) + '...' : s; })()}
                      </p>
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

      {/* AI Architecture — honest status */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">AI Stack — live vs on roadmap</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3 border border-green-500/30">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-orange-500/20 flex items-center justify-center text-[10px]">C</div>
              <span className="text-xs font-medium text-white">Claude</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">LIVE</span>
            </div>
            <p className="text-[10px] text-gray-500">Primary brain. Deep reasoning, document analysis, trade synthesis, Monthly Brief.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-green-500/30">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-purple-500/20 flex items-center justify-center text-[10px]">11</div>
              <span className="text-xs font-medium text-white">ElevenLabs</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">LIVE</span>
            </div>
            <p className="text-[10px] text-gray-500">Voice synthesis for Zyra. Speak any insight aloud.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-green-500/20 flex items-center justify-center text-[10px]">G</div>
              <span className="text-xs font-medium text-white">GPT</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">ROADMAP</span>
            </div>
            <p className="text-[10px] text-gray-500">ADELA router ready (src/lib/adela.js) — zyra-openai edge fn = Phase 8.</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3 border border-amber-500/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center text-[10px]">Ge</div>
              <span className="text-xs font-medium text-white">Gemini</span>
              <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">ROADMAP</span>
            </div>
            <p className="text-[10px] text-gray-500">Multimodal + council debate — zyra-gemini edge fn = Phase 8.</p>
          </div>
        </div>
        <p className="text-[10px] text-gray-500 mt-3 leading-relaxed">
          <strong className="text-gray-400">Today:</strong> Claude handles every query (chat, brief, analysis). ElevenLabs
          speaks Zyra's replies aloud.
          <strong className="text-gray-400"> Next (Phase 8):</strong> ADELA router auto-picks the right provider per task —
          multilingual → GPT, multimodal → Gemini, high-stakes decisions → 3-model council debate.
        </p>
      </div>
    </div>
  );
}
