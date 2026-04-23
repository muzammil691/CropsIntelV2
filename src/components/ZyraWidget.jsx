// CropsIntelV2 — Zyra AI Widget
// Interactive AI assistant panel for the Dashboard
// Real Claude API conversations grounded in knowledge base + market data
// Role-aware responses based on user tier (Guest/Registered/Verified/MAXONS)
// Foundation for ElevenLabs voice integration

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../lib/auth';
import { askClaude, loadAPIKeys, textToSpeech } from '../lib/ai-engine';
import { getLatestInsights, getKnowledgeStats } from '../lib/intel-processor';
import { supabase } from '../lib/supabase';
import {
  generateSessionId, logConversation, logError, trackQuestionPattern,
  detectTopics, detectConversationSentiment, getFullLearningContext, categorizeQuery
} from '../lib/zyra-memory';
import { recordFeedback, getFeedbackStats, buildCorrectionContext } from '../lib/zyra-trainer';
// Wave 3 (2026-04-24): prompt construction (role-lens, multilingual, system
// prompt, quick-topics) moved to src/lib/zyra-prompts.js so the full-page
// /intelligence Zyra and any future surface get the same behaviour.
import {
  QUICK_TOPICS, ROLE_LENS, LANG_INSTRUCTION,
  detectLanguage, buildZyraSystemPrompt, resolveUserTier,
} from '../lib/zyra-prompts';

// ─── Message bubble component ───────────────────────────────────────
function MessageBubble({ message, isTyping, onRate, trainable = false, rating = null, correctionOpen = false, onOpenCorrection = null, onSubmitCorrection = null }) {
  const isUser = message.role === 'user';
  const [correctionInput, setCorrectionInput] = React.useState('');

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      {!isUser && (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shrink-0 mr-2 mt-1">
          <span className="text-[10px] font-bold text-white">Z</span>
        </div>
      )}
      <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
        isUser
          ? 'bg-green-500/20 border border-green-500/30 text-green-100'
          : 'bg-gray-800/80 border border-gray-700/50 text-gray-200'
      }`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        {isTyping && (
          <span className="inline-flex gap-1 ml-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        {!isUser && message.sentiment && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700/50">
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${
              message.sentiment === 'bullish' ? 'bg-green-500/20 text-green-400' :
              message.sentiment === 'bearish' ? 'bg-red-500/20 text-red-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {message.sentiment}
            </span>
            {message.confidence && (
              <span className="text-[9px] text-gray-500">
                {(message.confidence * 100).toFixed(0)}% confidence
              </span>
            )}
          </div>
        )}
        {/* Trainer loop: thumbs up / down + correction capture on assistant replies only */}
        {!isUser && trainable && !isTyping && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-700/50">
            <button
              onClick={() => onRate?.('up')}
              title="Good answer — helps train Zyra"
              className={`text-[11px] leading-none px-2 py-1 rounded-md transition-colors ${
                rating === 'up'
                  ? 'bg-green-500/20 text-green-300 border border-green-500/40'
                  : 'text-gray-500 hover:text-green-400 border border-transparent hover:border-green-500/30'
              }`}
            >
              👍
            </button>
            <button
              onClick={() => onOpenCorrection?.()}
              title="Needs correction — teach Zyra the right answer"
              className={`text-[11px] leading-none px-2 py-1 rounded-md transition-colors ${
                rating === 'down'
                  ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                  : 'text-gray-500 hover:text-red-400 border border-transparent hover:border-red-500/30'
              }`}
            >
              👎
            </button>
            {rating === 'up' && <span className="text-[9px] text-green-400/70">Saved to training</span>}
            {rating === 'down' && !correctionOpen && <span className="text-[9px] text-red-400/70">Correction saved</span>}
          </div>
        )}
        {correctionOpen && (
          <div className="mt-2 pt-2 border-t border-gray-700/50">
            <textarea
              value={correctionInput}
              onChange={(e) => setCorrectionInput(e.target.value)}
              rows={2}
              autoFocus
              placeholder="What should Zyra have said? (e.g., 'Nonpareil Supreme NPX 23/25 is the MAXONS standard grade, not Carmel')"
              className="w-full bg-gray-900 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-red-400/50"
            />
            <div className="flex items-center justify-end gap-2 mt-1.5">
              <button
                onClick={() => { onSubmitCorrection?.(null); setCorrectionInput(''); }}
                className="text-[10px] text-gray-500 hover:text-gray-300 px-2 py-1"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (correctionInput.trim()) {
                    onSubmitCorrection?.(correctionInput.trim());
                    setCorrectionInput('');
                  }
                }}
                disabled={!correctionInput.trim()}
                className="text-[10px] px-2 py-1 rounded bg-red-500/20 border border-red-500/40 text-red-300 hover:bg-red-500/30 disabled:opacity-50"
              >
                Save correction
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Zyra Widget Component ─────────────────────────────────────
export default function ZyraWidget() {
  const { user, profile } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [marketContext, setMarketContext] = useState('');
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [pulseAnimation, setPulseAnimation] = useState(true);
  const [learningContext, setLearningContext] = useState('');
  const [sessionId] = useState(() => generateSessionId());
  // Trainer loop: feedback map keyed by message index → { rating, correction }
  const [feedback, setFeedback] = useState({});
  const [openCorrectionIdx, setOpenCorrectionIdx] = useState(null);
  const sessionStartRef = useRef(Date.now());
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const audioRef = useRef(null);

  // Determine user tier
  const userTier = resolveUserTier(user, profile);
  const quickTopics = QUICK_TOPICS[userTier] || QUICK_TOPICS.guest;

  // Load market context on mount
  useEffect(() => {
    async function loadContext() {
      try {
        await loadAPIKeys();

        // Load Zyra's learned knowledge from past conversations
        try {
          const learned = await getFullLearningContext();
          if (learned) setLearningContext(learned);
        } catch (e) { /* learning tables may not exist yet */ }

        // Get latest position report data
        const { data: reports } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false })
          .limit(2);

        // Get latest prices
        const { data: prices } = await supabase
          .from('strata_prices')
          .select('variety,grade,price_usd_per_lb,maxons_price_per_lb,price_date')
          .order('price_date', { ascending: false })
          .limit(10);

        // Get knowledge base facts
        let knowledgeFacts = [];
        try {
          const { data: kb } = await supabase
            .from('knowledge_base')
            .select('category,fact,context')
            .order('created_at', { ascending: false })
            .limit(15);
          if (kb) knowledgeFacts = kb;
        } catch (e) { /* table may not exist */ }

        // Get latest intel insights
        let insights = [];
        try {
          insights = await getLatestInsights(5) || [];
        } catch (e) { /* table may not exist */ }

        // Build context string
        let ctx = '';

        if (reports?.length) {
          const r = reports[0];
          const totalSold = (r.total_supply_lbs || 0) - (r.uncommitted_lbs || 0);
          const soldPct = r.total_supply_lbs > 0 ? (totalSold / r.total_supply_lbs * 100).toFixed(1) : 0;
          ctx += `LATEST ABC POSITION REPORT (${r.crop_year}, ${r.report_year}/${String(r.report_month).padStart(2,'0')}):\n`;
          ctx += `- Total Supply: ${(r.total_supply_lbs / 1e6).toFixed(0)}M lbs\n`;
          ctx += `- Total Shipped: ${(r.total_shipped_lbs / 1e6).toFixed(0)}M lbs (Dom: ${(r.domestic_shipped_lbs / 1e6).toFixed(0)}M / Exp: ${(r.export_shipped_lbs / 1e6).toFixed(0)}M)\n`;
          ctx += `- Committed: ${(r.total_committed_lbs / 1e6).toFixed(0)}M lbs\n`;
          ctx += `- Uncommitted: ${(r.uncommitted_lbs / 1e6).toFixed(0)}M lbs\n`;
          ctx += `- Sold: ${soldPct}% of total supply\n`;
          if (reports[1]) {
            const py = reports[1];
            const pySold = (py.total_supply_lbs || 0) - (py.uncommitted_lbs || 0);
            const pySoldPct = py.total_supply_lbs > 0 ? (pySold / py.total_supply_lbs * 100).toFixed(1) : 0;
            ctx += `- Prior Year Sold: ${pySoldPct}% (${py.crop_year})\n`;
          }
          ctx += '\n';
        }

        if (prices?.length) {
          ctx += 'CURRENT STRATA PRICES:\n';
          const byVariety = {};
          prices.forEach(p => { if (!byVariety[p.variety]) byVariety[p.variety] = p; });
          Object.values(byVariety).forEach(p => {
            ctx += `- ${p.variety} ${p.grade || ''}: $${parseFloat(p.price_usd_per_lb).toFixed(2)}/lb (MAXONS: $${parseFloat(p.maxons_price_per_lb || p.price_usd_per_lb * 1.03).toFixed(2)})\n`;
          });
          ctx += '\n';
        }

        if (knowledgeFacts.length) {
          ctx += 'KNOWLEDGE BASE (recent intelligence):\n';
          knowledgeFacts.forEach(f => {
            ctx += `- [${f.category}] ${f.fact}\n`;
          });
          ctx += '\n';
        }

        if (insights.length) {
          ctx += 'LATEST MARKET INTEL:\n';
          insights.forEach(i => {
            ctx += `- [${i.sentiment?.toUpperCase()}] ${i.title}: ${i.summary?.substring(0, 100)}\n`;
          });
        }

        setMarketContext(ctx);
      } catch (err) {
        console.warn('Zyra context load:', err.message);
        setMarketContext('Market data is currently loading. Provide general almond market knowledge.');
      }
    }
    loadContext();
  }, []);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  // Stop pulse after first open
  useEffect(() => {
    if (isOpen) setPulseAnimation(false);
  }, [isOpen]);

  // Log conversation when widget closes (if there were real exchanges)
  useEffect(() => {
    if (!isOpen && messages.length >= 2) {
      // Non-blocking: save conversation to learning system
      const userMessages = messages.filter(m => m.role === 'user');
      if (userMessages.length > 0) {
        const topics = detectTopics(messages);
        const sentiment = detectConversationSentiment(messages);
        const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);

        logConversation({
          sessionId,
          channel: 'web',
          userId: user?.id || null,
          userTier,
          pageContext: window.location.pathname,
          messages,
          topics,
          sentiment,
          hadError: messages.some(m => m.content?.includes('trouble connecting')),
          durationSeconds: duration,
        });
      }
    }
  }, [isOpen]);

  // Welcome message on first open
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessages = {
        guest: "Hello! I'm Zyra, your almond market intelligence assistant. I can give you a quick overview of the California almond market. Register for free to unlock deeper insights!",
        registered: `Welcome back! I'm Zyra, your market intelligence assistant. I have the latest ABC position data and pricing loaded. Ask me anything about the almond market.`,
        verified: `Hi${profile?.full_name ? ' ' + profile.full_name.split(' ')[0] : ''}! Zyra here with your personalized market brief ready. I've loaded the latest data for your markets. What would you like to know?`,
        maxons: `${profile?.full_name ? profile.full_name.split(' ')[0] : 'Team'}, Zyra online with full MAXONS intelligence. Market data, CRM insights, and pricing engine loaded. Ready for your command.`,
      };
      setMessages([{
        role: 'assistant',
        content: welcomeMessages[userTier] || welcomeMessages.guest,
        timestamp: Date.now(),
      }]);
    }
  }, [isOpen]);

  // Send message to Claude
  const sendMessage = useCallback(async (text) => {
    if (!text?.trim() || isLoading) return;

    const userMsg = { role: 'user', content: text.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    // Build conversation history for Claude
    const history = [...messages, userMsg]
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .slice(-8) // Keep last 8 messages for context
      .map(m => ({ role: m.role, content: m.content }));

    // Track question pattern (async, non-blocking)
    trackQuestionPattern(text, categorizeQuery(text));

    try {
      const correctionContext = buildCorrectionContext();
      const detectedLang = detectLanguage(text);
      const systemPrompt = buildZyraSystemPrompt(userTier, profile, marketContext, {
        learningContext, correctionContext, detectedLang,
      });

      const result = await askClaude(text, {
        system: systemPrompt,
        history: history.slice(0, -1), // Exclude current message (it's the user prompt)
        maxTokens: 500,
      });

      if (result.error || result.fallback) {
        throw new Error(result.error || 'AI not available');
      }

      const responseText = result.text || result;

      // Try to extract sentiment/confidence if the response mentions it
      let sentiment = null;
      let confidence = null;
      const lower = (typeof responseText === 'string' ? responseText : '').toLowerCase();
      if (lower.includes('bullish') && !lower.includes('bearish')) sentiment = 'bullish';
      else if (lower.includes('bearish') && !lower.includes('bullish')) sentiment = 'bearish';
      if (lower.includes('high confidence')) confidence = 0.85;
      else if (lower.includes('moderate confidence')) confidence = 0.65;

      const assistantMsg = {
        role: 'assistant',
        content: responseText,
        sentiment,
        confidence,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Auto-speak if voice enabled
      if (voiceEnabled) {
        speakResponse(responseText);
      }
    } catch (err) {
      console.error('Zyra error:', err);

      // Log error for learning
      logError({
        errorType: 'api_failure',
        errorMessage: err.message,
        userQuery: text,
        channel: 'web',
      });

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'I apologize — I\'m having trouble connecting to my intelligence systems right now. Please try again in a moment.',
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, userTier, profile, marketContext, learningContext, voiceEnabled]);

  // ElevenLabs voice output
  const speakResponse = useCallback(async (text) => {
    try {
      setIsSpeaking(true);
      const audioBlob = await textToSpeech(text.substring(0, 500)); // Limit to 500 chars
      if (audioBlob) {
        const url = URL.createObjectURL(audioBlob);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.onended = () => {
            setIsSpeaking(false);
            URL.revokeObjectURL(url);
          };
          audioRef.current.play().catch(() => setIsSpeaking(false));
        }
      } else {
        setIsSpeaking(false);
      }
    } catch (err) {
      console.warn('Voice error:', err.message);
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setIsSpeaking(false);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <>
      {/* Hidden audio element for TTS */}
      <audio ref={audioRef} className="hidden" />

      {/* Floating Zyra bubble */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-50 w-14 h-14 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 shadow-lg shadow-green-500/25 flex items-center justify-center transition-all hover:scale-110 hover:shadow-green-500/40 ${
            pulseAnimation ? 'animate-pulse' : ''
          }`}
          title="Ask Zyra"
        >
          <span className="text-white font-bold text-lg">Z</span>
          {/* Notification dot */}
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 border-2 border-gray-950 flex items-center justify-center">
            <span className="text-[8px] font-bold text-gray-900">AI</span>
          </span>
        </button>
      )}

      {/* Expanded chat panel */}
      {isOpen && (
        <div className="fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[400px] max-h-[100vh] sm:max-h-[600px] flex flex-col bg-gray-950 border border-gray-800 sm:rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
          style={{ maxHeight: 'calc(100vh - 60px)' }}>

          {/* Header */}
          <div className="bg-gradient-to-r from-green-500/10 via-emerald-500/5 to-transparent border-b border-gray-800 px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className={`w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center ${isSpeaking ? 'animate-pulse' : ''}`}>
                  <span className="text-white font-bold text-sm">Z</span>
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-gray-950" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Zyra</h3>
                <p className="text-[10px] text-gray-500">
                  {userTier === 'maxons' ? 'MAXONS Intelligence' :
                   userTier === 'verified' ? 'Personalized Insights' :
                   userTier === 'registered' ? 'Market Assistant' :
                   'Market Overview'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Voice toggle */}
              <button
                onClick={() => {
                  if (isSpeaking) stopSpeaking();
                  setVoiceEnabled(!voiceEnabled);
                }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                  voiceEnabled
                    ? 'bg-green-500/20 text-green-400'
                    : 'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}
                title={voiceEnabled ? 'Disable voice' : 'Enable voice'}
              >
                {isSpeaking ? (
                  <svg className="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                  </svg>
                )}
              </button>
              {/* Close */}
              <button
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-lg bg-gray-800 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1 min-h-[200px] max-h-[350px]">
            {messages.map((msg, i) => {
              // Previous user message is what this assistant reply answered
              const prevUser = msg.role === 'assistant'
                ? [...messages.slice(0, i)].reverse().find(m => m.role === 'user')
                : null;
              // Don't show thumbs on the welcome message (index 0, before any user turn)
              const trainable = msg.role === 'assistant' && !!prevUser;
              const fb = feedback[i];
              return (
                <MessageBubble
                  key={i}
                  message={msg}
                  isTyping={false}
                  trainable={trainable}
                  rating={fb?.rating || null}
                  correctionOpen={openCorrectionIdx === i}
                  onRate={async (rating) => {
                    if (fb?.rating) return; // one vote per message
                    setFeedback(prev => ({ ...prev, [i]: { rating } }));
                    await recordFeedback({
                      sessionId,
                      userId: user?.id || null,
                      userQuery: prevUser?.content || '',
                      assistantReply: msg.content || '',
                      rating,
                      pageContext: typeof window !== 'undefined' ? window.location?.pathname : null,
                      userTier,
                    });
                  }}
                  onOpenCorrection={() => setOpenCorrectionIdx(i)}
                  onSubmitCorrection={async (correction) => {
                    setOpenCorrectionIdx(null);
                    if (!correction) return; // cancel
                    setFeedback(prev => ({ ...prev, [i]: { rating: 'down', correction } }));
                    await recordFeedback({
                      sessionId,
                      userId: user?.id || null,
                      userQuery: prevUser?.content || '',
                      assistantReply: msg.content || '',
                      rating: 'down',
                      correction,
                      pageContext: typeof window !== 'undefined' ? window.location?.pathname : null,
                      userTier,
                    });
                  }}
                />
              );
            })}
            {isLoading && (
              <MessageBubble
                message={{ role: 'assistant', content: '' }}
                isTyping={true}
              />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick topics */}
          {messages.length <= 1 && (
            <div className="px-4 pb-2 shrink-0">
              <p className="text-[10px] text-gray-500 mb-2">Quick ask:</p>
              <div className="flex flex-wrap gap-1.5">
                {quickTopics.map((topic) => (
                  <button
                    key={topic.label}
                    onClick={() => sendMessage(topic.prompt)}
                    disabled={isLoading}
                    className="text-[11px] px-2.5 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-gray-300 hover:bg-green-500/10 hover:border-green-500/30 hover:text-green-400 transition-all disabled:opacity-50"
                  >
                    {topic.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="border-t border-gray-800 px-4 py-3 shrink-0">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  userTier === 'guest' ? 'Ask about the almond market...' :
                  userTier === 'maxons' ? 'Command Zyra...' :
                  'Ask Zyra anything...'
                }
                disabled={isLoading}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-green-500/50 transition-colors disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={isLoading || !input.trim()}
                className="w-10 h-10 rounded-xl bg-green-500 hover:bg-green-400 disabled:bg-gray-700 disabled:text-gray-500 text-white flex items-center justify-center transition-colors shrink-0"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-gray-600">
                {userTier === 'guest' ? 'Guest Mode' :
                 userTier === 'maxons' ? 'MAXONS Intelligence' :
                 userTier === 'verified' ? 'Full Access' :
                 'Basic Access'} — Powered by AI
              </span>
              {voiceEnabled && (
                <span className="text-[9px] text-green-500/70 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Voice Active
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
