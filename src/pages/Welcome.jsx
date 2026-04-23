import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

/* ── Animated counter hook ── */
function useCounter(end, duration = 2000, startDelay = 0) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const runCounter = () => {
      if (started.current) return;
      started.current = true;
      setTimeout(() => {
        const start = performance.now();
        const step = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setCount(Math.floor(eased * end));
          if (progress < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }, startDelay);
    };

    // Check if already in viewport on mount
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      runCounter();
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { runCounter(); obs.disconnect(); } },
      { threshold: 0.01 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration, startDelay]);

  return [count, ref];
}

/* ── Fade-in on scroll (below-the-fold sections) ── */
// 2026-04-24 launch-audit fix: if the element is ALREADY within (or above)
// the viewport at mount, reveal immediately instead of waiting for the
// IntersectionObserver to fire. Previously, content above the viewport at
// mount stayed invisible permanently — the rest of the Welcome page below
// the hero was rendering as a blank screen for real visitors.
function FadeIn({ children, className = '', delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // If element is already within or above the viewport on mount, reveal now.
    const rect = el.getBoundingClientRect();
    const alreadyReady = rect.top < window.innerHeight && rect.bottom > -200;
    if (alreadyReady) { setVisible(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true); },
      { threshold: 0.05, rootMargin: '0px 0px -5% 0px' }
    );
    obs.observe(el);
    // Failsafe: reveal after 1.5s regardless so Welcome is never blank.
    const t = setTimeout(() => setVisible(true), 1500);
    return () => { obs.disconnect(); clearTimeout(t); };
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ── Hero entrance animation (fires on mount, no scroll needed) ── */
function HeroReveal({ children, className = '', delay = 0 }) {
  return (
    <div
      className={`animate-heroReveal ${className}`}
      style={{ animationDelay: `${delay}ms`, animationFillMode: 'both' }}
    >
      {children}
    </div>
  );
}

/* ── Demo chat messages ── */
const DEMO_CHAT = [
  { role: 'user', text: 'When is the right time to buy Nonpareil this year?' },
  { role: 'zyra', text: 'Based on 10 years of ABC position data and current 2025/26 supply trends, the Q2 window (April-May) historically offers 6-12% price dips. With uncommitted inventory at 763M lbs and shipments accelerating, mid-April to early May looks like the strongest buying opportunity.' },
  { role: 'user', text: 'What about India demand — is it holding up?' },
  { role: 'zyra', text: 'India remains the #1 export destination at 26% of total shipments. YoY export commitments to India are up +3.2%, and the Diwali season procurement cycle typically begins in June. Strong signal for sustained demand.' },
];

/* ── Stakeholder roles ── */
const ROLES = [
  { icon: '\u{1F331}', title: 'Growers', desc: 'Orchard insights, harvest timing, and crop receipt tracking across 11 crop years.' },
  { icon: '\u{1F3ED}', title: 'Handlers', desc: 'Processing volumes, quality mix analysis, and handler-level position data.' },
  { icon: '\u{1F4CA}', title: 'Traders', desc: 'Market timing signals, deal analytics, and AI trade prescriptions.' },
  { icon: '\u{1F6D2}', title: 'Buyers', desc: 'Sourcing strategies, price alerts, and personalized market briefs.' },
  { icon: '\u{1F91D}', title: 'Brokers', desc: 'Cross-market arbitrage intel, destination flow trends, and offer building.' },
  { icon: '\u{1F4C8}', title: 'Analysts', desc: 'Conference-ready trend reports with 10+ years of verified position data.' },
];

/* ── Data sources ── */
const DATA_SOURCES = [
  { name: 'Almond Board of California', desc: 'Monthly position reports', badge: 'Official' },
  { name: 'USDA NASS', desc: 'Crop forecasts & acreage', badge: 'Government' },
  { name: 'Strata Markets', desc: 'Live almond pricing', badge: 'Real-time' },
  { name: 'MAXONS Trading', desc: '10+ years expertise', badge: 'Proprietary' },
];

/* ── Three pillars ── */
const PILLARS = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Verified Data',
    desc: 'Every number traced to its source PDF. 106 monthly ABC position reports spanning 11 crop years, independently verified.',
    bg: 'from-green-500/20 to-green-500/5 border-green-500/20',
    iconBg: 'bg-green-500/10',
    iconColor: 'text-green-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    title: 'Verified Stakeholders',
    desc: 'Real people in the almond supply chain. Every user is verified — no anonymous accounts, no fake profiles.',
    bg: 'from-amber-500/20 to-amber-500/5 border-amber-500/20',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-400',
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    title: 'AI Intelligence',
    desc: 'Zyra analyzes every data point for YOUR markets. Voice-first, multilingual, powered by MAXONS trading wisdom.',
    bg: 'from-purple-500/20 to-purple-500/5 border-purple-500/20',
    iconBg: 'bg-purple-500/10',
    iconColor: 'text-purple-400',
  },
];

/* ── Capabilities ── */
const CAPABILITIES = [
  { title: 'Supply & Demand', desc: '10+ years of position reports with carry-in, receipts, commitments, shipments, and uncommitted inventory.', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { title: 'Global Trade Flow', desc: 'Shipments to 45+ destination markets with YoY comparison and emerging market detection.', icon: 'M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { title: 'Live Pricing', desc: 'Real-time Strata market prices with MAXONS 3% competitive margin on every variety and grade.', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  { title: 'Crop Forecasts', desc: 'USDA subjective and objective estimates, bearing acreage trends, and yield projections.', icon: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' },
  { title: 'AI News Analysis', desc: 'Auto-scraped industry news analyzed by AI for sentiment and market impact scoring.', icon: 'M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z' },
  { title: 'Trade Intelligence', desc: 'AI-powered trade signals, buy/wait prescriptions, and risk assessment with confidence scores.', icon: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
];

export default function Welcome() {
  const [yearsCount, yearsRef] = useCounter(10, 1800, 800);
  const [reportsCount, reportsRef] = useCounter(106, 2200, 900);
  const [countriesCount, countriesRef] = useCounter(45, 2000, 1000);
  const [cropYearsCount, cropYearsRef] = useCounter(11, 1600, 1100);
  const [chatStep, setChatStep] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setChatStep(prev => (prev + 1) % (DEMO_CHAT.length + 1));
    }, 3500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 overflow-x-hidden">
      {/* ─── HERO ─── */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-green-900/15 via-gray-950 to-gray-950" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-green-500/5 rounded-full blur-[100px]" />
        <div className="absolute top-20 right-0 w-[400px] h-[400px] bg-emerald-500/3 rounded-full blur-[80px]" />

        <div className="relative max-w-6xl mx-auto px-5 pt-12 sm:pt-16 pb-16 sm:pb-24">
          {/* Nav bar */}
          <HeroReveal>
            <div className="flex items-center justify-between mb-10 sm:mb-14">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-green-500/20">
                  CI
                </div>
                <div>
                  <h1 className="text-lg font-bold text-white leading-tight">CropsIntel</h1>
                  <p className="text-[9px] text-gray-500 tracking-[0.2em] uppercase">Autonomous Intelligence</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link to="/login" className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-xs font-semibold transition-all shadow-md shadow-green-500/20">
                  Sign In
                </Link>
                <Link to="/register" className="px-4 py-2 bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-lg text-xs font-medium transition-colors border border-gray-700 hidden sm:block">
                  Register
                </Link>
              </div>
            </div>
          </HeroReveal>

          {/* Hero content */}
          <div className="text-center max-w-4xl mx-auto">
            <HeroReveal delay={100}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] text-green-400 font-medium">BETA — Now Live at cropsintel.com</span>
              </div>
            </HeroReveal>

            <HeroReveal delay={200}>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-bold text-white leading-[1.1] tracking-tight">
                The World's Most Complete{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400">
                  Almond Market
                </span>{' '}
                Intelligence
              </h2>
            </HeroReveal>

            <HeroReveal delay={350}>
              <p className="text-base sm:text-lg text-gray-400 mt-5 sm:mt-6 max-w-2xl mx-auto leading-relaxed">
                Real verified data. Real verified people. Powered by MAXONS' decade-plus
                global trading expertise — combined with AI that speaks, thinks, and advises
                like a senior trader on your team.
              </p>
            </HeroReveal>

            <HeroReveal delay={450}>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
                <Link
                  to="/login"
                  className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-green-500/20 hover:shadow-green-500/30"
                >
                  Sign In to Your Account
                </Link>
                <Link
                  to="/register"
                  className="w-full sm:w-auto px-8 py-3.5 bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-xl text-sm font-medium transition-colors border border-gray-700/80"
                >
                  Create Free Account
                </Link>
                <Link
                  to="/dashboard"
                  className="w-full sm:w-auto px-6 py-3 text-gray-500 hover:text-gray-300 text-sm transition-colors"
                >
                  Preview as Guest
                </Link>
              </div>
            </HeroReveal>

            {/* Animated stats */}
            <HeroReveal delay={550}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-12 sm:mt-16 max-w-3xl mx-auto">
                <div ref={yearsRef} className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 sm:p-5">
                  <p className="text-2xl sm:text-3xl font-bold text-white">{yearsCount}+</p>
                  <p className="text-[11px] text-gray-500 mt-1">Years of Data</p>
                </div>
                <div ref={reportsRef} className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 sm:p-5">
                  <p className="text-2xl sm:text-3xl font-bold text-white">{reportsCount}</p>
                  <p className="text-[11px] text-gray-500 mt-1">Position Reports</p>
                </div>
                <div ref={cropYearsRef} className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 sm:p-5">
                  <p className="text-2xl sm:text-3xl font-bold text-white">{cropYearsCount}</p>
                  <p className="text-[11px] text-gray-500 mt-1">Crop Years</p>
                </div>
                <div ref={countriesRef} className="bg-gray-900/60 border border-gray-800/60 rounded-xl p-4 sm:p-5">
                  <p className="text-2xl sm:text-3xl font-bold text-white">{countriesCount}+</p>
                  <p className="text-[11px] text-gray-500 mt-1">Export Markets</p>
                </div>
              </div>
            </HeroReveal>
          </div>
        </div>
      </div>

      {/* ─── THREE PILLARS ─── */}
      <div className="max-w-6xl mx-auto px-5 pb-16 sm:pb-24">
        <FadeIn>
          <div className="text-center mb-10">
            <p className="text-[10px] text-green-400 uppercase tracking-[0.2em] mb-2">Foundation</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-white">Three Pillars of Trust</h3>
            <p className="text-sm text-gray-500 mt-2 max-w-xl mx-auto">
              Every insight on CropsIntel is built on verified data, verified people, and intelligent AI — not guesswork.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {PILLARS.map((p, i) => (
            <FadeIn key={p.title} delay={i * 120}>
              <div className={`relative bg-gradient-to-b ${p.bg} border rounded-2xl p-6 sm:p-7 h-full`}>
                <div className={`w-12 h-12 rounded-xl ${p.iconBg} flex items-center justify-center ${p.iconColor} mb-4`}>
                  {p.icon}
                </div>
                <h4 className="text-lg font-bold text-white mb-2">{p.title}</h4>
                <p className="text-sm text-gray-400 leading-relaxed">{p.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* ─── MEET ZYRA ─── */}
      <div className="relative">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-purple-950/10 to-gray-950" />
        <div className="relative max-w-6xl mx-auto px-5 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left: Zyra info */}
            <FadeIn>
              <div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-green-500/30">
                    Z
                  </div>
                  <div>
                    <p className="text-[10px] text-green-400 uppercase tracking-[0.15em]">AI Market Assistant</p>
                    <h3 className="text-2xl sm:text-3xl font-bold text-white">Meet Zyra</h3>
                  </div>
                </div>
                <p className="text-base text-gray-400 leading-relaxed mb-6">
                  Zyra is your AI trading intelligence assistant. She analyzes every ABC position report,
                  tracks live pricing, monitors global trade flows, and delivers actionable insights — in
                  your language, at your level.
                </p>

                <div className="space-y-3 mb-6">
                  {[
                    { color: 'green', title: 'Voice-First Intelligence', desc: 'Ask by voice or text. Zyra speaks back with ElevenLabs human-like voice.', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
                    { color: 'amber', title: 'Multilingual', desc: 'Arabic, Hindi, Turkish, Spanish and more — trade in your language.', icon: 'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129' },
                    { color: 'purple', title: 'Data-Grounded', desc: 'Every answer backed by real ABC data — not hallucinated market analysis.', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
                  ].map(f => (
                    <div key={f.title} className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-lg bg-${f.color}-500/10 flex items-center justify-center shrink-0 mt-0.5`}>
                        <svg className={`w-4 h-4 text-${f.color}-400`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} />
                        </svg>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{f.title}</p>
                        <p className="text-xs text-gray-500">{f.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-green-600/20 hover:bg-green-600/30 text-green-400 rounded-lg text-sm font-medium transition-colors border border-green-500/20"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  Try Zyra Now — Free
                </Link>
              </div>
            </FadeIn>

            {/* Right: Demo chat */}
            <FadeIn delay={200}>
              <div className="bg-gray-900/70 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl shadow-black/30">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800/80 bg-gray-900/50">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">
                    Z
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Zyra</p>
                    <p className="text-[10px] text-gray-500">Market Assistant</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">Live</span>
                    <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15.536a5 5 0 010-7.072m-2.828 9.9a9 9 0 010-12.728" />
                    </svg>
                  </div>
                </div>

                <div className="p-4 space-y-3 min-h-[300px]">
                  {DEMO_CHAT.slice(0, chatStep + 1).map((msg, i) => (
                    <div
                      key={i}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      style={{ animation: i === chatStep ? 'fadeSlideUp 0.4s ease-out' : 'none' }}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-green-600/20 text-green-100 rounded-br-md'
                            : 'bg-gray-800/80 text-gray-300 rounded-bl-md'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {chatStep >= DEMO_CHAT.length && (
                    <div className="text-center pt-2">
                      <span className="text-[10px] text-gray-600 italic">Demo restarting...</span>
                    </div>
                  )}
                </div>

                <div className="px-4 pb-4">
                  <div className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-xl px-4 py-2.5">
                    <svg className="w-4 h-4 text-gray-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    <span className="text-xs text-gray-600">Ask about prices, supply, forecasts...</span>
                    <div className="ml-auto w-7 h-7 rounded-lg bg-green-600/30 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </FadeIn>
          </div>
        </div>
      </div>

      {/* ─── CAPABILITIES GRID ─── */}
      <div className="max-w-6xl mx-auto px-5 pb-16 sm:pb-24">
        <FadeIn>
          <div className="text-center mb-10">
            <p className="text-[10px] text-green-400 uppercase tracking-[0.2em] mb-2">Platform Capabilities</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-white">Everything You Need to Trade Smarter</h3>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {CAPABILITIES.map((cap, i) => (
            <FadeIn key={cap.title} delay={i * 80}>
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 hover:border-green-500/20 transition-all duration-300 group h-full">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-400 mb-3 group-hover:bg-green-500/15 transition-colors">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={cap.icon} />
                  </svg>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1.5">{cap.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{cap.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* ─── WHO IS THIS FOR ─── */}
      <div className="max-w-6xl mx-auto px-5 pb-16 sm:pb-24">
        <FadeIn>
          <div className="text-center mb-10">
            <p className="text-[10px] text-amber-400 uppercase tracking-[0.2em] mb-2">Built For</p>
            <h3 className="text-2xl sm:text-3xl font-bold text-white">Every Player in the Almond Supply Chain</h3>
          </div>
        </FadeIn>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ROLES.map((role, i) => (
            <FadeIn key={role.title} delay={i * 70}>
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 text-center hover:border-gray-700 transition-colors h-full">
                <span className="text-2xl block mb-2">{role.icon}</span>
                <p className="text-sm font-semibold text-white mb-1">{role.title}</p>
                <p className="text-[10px] text-gray-500 leading-relaxed">{role.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* ─── DATA SOURCES ─── */}
      <div className="max-w-6xl mx-auto px-5 pb-16 sm:pb-24">
        <FadeIn>
          <div className="bg-gray-900/40 border border-gray-800 rounded-2xl p-6 sm:p-10">
            <div className="text-center mb-8">
              <p className="text-[10px] text-green-400 uppercase tracking-[0.2em] mb-2">Trusted Sources</p>
              <h3 className="text-xl sm:text-2xl font-bold text-white">Data You Can Verify</h3>
              <p className="text-sm text-gray-500 mt-2">
                Every number on CropsIntel is traceable to its official source. No estimates. No guesswork.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {DATA_SOURCES.map((src) => (
                <div key={src.name} className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium ${
                      src.badge === 'Official' ? 'bg-blue-500/20 text-blue-400' :
                      src.badge === 'Government' ? 'bg-amber-500/20 text-amber-400' :
                      src.badge === 'Real-time' ? 'bg-green-500/20 text-green-400' :
                      'bg-purple-500/20 text-purple-400'
                    }`}>
                      {src.badge}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-white">{src.name}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{src.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </FadeIn>
      </div>

      {/* ─── MAXONS SECTION ─── */}
      <div className="max-w-6xl mx-auto px-5 pb-16 sm:pb-24">
        <FadeIn>
          <div className="bg-gradient-to-br from-gray-900 via-gray-900/90 to-green-900/10 border border-gray-800 rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-green-500/3 rounded-full blur-[80px]" />
            <div className="relative">
              <p className="text-[10px] text-amber-400 uppercase tracking-[0.2em] mb-3">Powered By</p>
              <h3 className="text-2xl sm:text-3xl font-bold text-white mb-4">MAXONS International Trading</h3>
              <p className="text-sm text-gray-400 max-w-2xl mx-auto leading-relaxed mb-6">
                CropsIntel is the intelligence backbone of MAXONS — connecting California almond data
                with global trade corridors across the Middle East, Europe, and Asia.
                A decade of trading expertise, encoded into AI that works for you 24/7.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 text-xs text-gray-500">
                {['Dubai, UAE', 'California, USA', 'Europe', 'Asia Pacific'].map((loc, i) => (
                  <div key={loc} className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      ['bg-amber-500/60', 'bg-green-500/60', 'bg-blue-500/60', 'bg-purple-500/60'][i]
                    }`} />
                    <span>{loc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* ─── FINAL CTA ─── */}
      <div className="max-w-6xl mx-auto px-5 pb-16 sm:pb-24">
        <FadeIn>
          <div className="text-center">
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Ready to Trade Smarter?</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-lg mx-auto">
              Join MAXONS and the world's most informed almond traders. Sign in with your existing account or create a new one.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                to="/login"
                className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-green-500/20"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="w-full sm:w-auto px-8 py-3.5 bg-gray-800/80 hover:bg-gray-700/80 text-gray-300 rounded-xl text-sm font-medium transition-colors border border-gray-700"
              >
                Create Free Account
              </Link>
            </div>
          </div>
        </FadeIn>
      </div>

      {/* ─── FOOTER ─── */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-6xl mx-auto px-5">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="w-5 h-5 rounded bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-[8px]">
                CI
              </div>
              <span>CropsIntel — Powered by Zyra AI</span>
              <span className="text-gray-700">|</span>
              <span>A MAXONS Platform</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-gray-600">
              <Link to="/login" className="hover:text-gray-400 transition-colors">Sign In</Link>
              <Link to="/register" className="hover:text-gray-400 transition-colors">Register</Link>
              <Link to="/dashboard" className="hover:text-gray-400 transition-colors">Dashboard</Link>
            </div>
          </div>
          <p className="text-center text-[10px] text-gray-700 mt-4">
            Market data shown are approximate indications only. This platform is in beta — always verify with official sources before making trading decisions.
          </p>
          <p className="text-center text-[10px] text-gray-700 mt-1">
            &copy; 2025–2026 CropsIntel &middot; MAXONS General Trading LLC, Dubai, UAE
          </p>
        </div>
      </footer>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes heroReveal {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-heroReveal {
          animation: heroReveal 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>
  );
}
