import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { isAdminUser } from '../lib/permissions';
import { ingestReport, getLatestInsights, getKnowledgeStats } from '../lib/intel-processor';

function StatusBadge({ status }) {
  const colors = {
    success: 'bg-green-500/20 text-green-400',
    parsed: 'bg-green-500/20 text-green-400',
    no_data: 'bg-gray-500/20 text-gray-400',
    failed: 'bg-red-500/20 text-red-400',
    started: 'bg-yellow-500/20 text-yellow-400 animate-pulse',
    skipped: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    running: 'bg-blue-500/20 text-blue-400 animate-pulse',
    completed: 'bg-green-500/20 text-green-400',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full ${colors[status] || colors.skipped}`}>
      {status}
    </span>
  );
}

// ─── Source Catalog (drives the Last-Pipeline-Run table) ─────────
const SCRAPER_CATALOG = [
  {
    key: 'abc-position', label: 'ABC position + ship + receipt + forecasts + acreage + almanac',
    secret: null, source_url: 'almonds.org',
  },
  { key: 'strata-scraper', label: 'Strata pricing', secret: 'STRATA_USERNAME / STRATA_PASSWORD', source_url: 'online.stratamarkets.com' },
  { key: 'bountiful-scraper', label: 'Bountiful estimates', secret: null, source_url: 'bountiful.ag' },
  { key: 'news-scraper', label: 'Industry news', secret: null, source_url: 'almonds.org/about-us/press-room' },
  { key: 'imap-reader-poll', label: 'IMAP intel inbox', secret: 'INTEL_EMAIL / INTEL_EMAIL_PASSWORD', source_url: 'intel@cropsintel.com' },
];

function fmtTimeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleString();
}

// ─── Source Presets ───────────────────────────────────────────────
const SOURCE_PRESETS = {
  'Blue Diamond': { type: 'handler', icon: '💎' },
  'Treehouse': { type: 'handler', icon: '🌳' },
  'Select Harvest': { type: 'handler', icon: '🌾' },
  'Olam': { type: 'handler', icon: '🏢' },
  'The Nut Graph': { type: 'trade_press', icon: '📊' },
  'Mintec': { type: 'trade_press', icon: '📈' },
  'Fastmarkets': { type: 'trade_press', icon: '⚡' },
  'INC': { type: 'trade_press', icon: '🌐' },
  'ABC': { type: 'industry_body', icon: '🏛️' },
  'USDA': { type: 'government', icon: '🇺🇸' },
  'Other': { type: 'other', icon: '📄' },
};

// ─── Last Pipeline Run (per-source status from pipeline_runs.steps_completed) ──
function LastPipelineRunPanel({ run, polling, logs }) {
  // Build a per-scraper view. Prefer `run.steps_completed` (canonical: that's what the
  // GH Actions cycle-summary step writes). Fall back to recent `scraping_logs` rows if
  // steps_completed is empty (e.g. on first migration before any cycle has run yet).
  const stepsByScraper = new Map();
  const stepsArr = Array.isArray(run?.steps_completed) ? run.steps_completed : [];
  for (const s of stepsArr) {
    stepsByScraper.set(s.scraper, s);
  }
  // Logs fallback — pick the latest entry per scraper_name from the last 24h
  if (stepsByScraper.size === 0 && Array.isArray(logs)) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const l of logs) {
      const t = new Date(l.started_at || l.completed_at || 0).getTime();
      if (t < cutoff) continue;
      if (!stepsByScraper.has(l.scraper_name)) {
        stepsByScraper.set(l.scraper_name, {
          scraper: l.scraper_name,
          status: l.status,
          records_inserted: l.records_inserted,
          records_found: l.records_found,
          duration_ms: l.duration_ms,
          error: l.error_message,
        });
      }
    }
  }

  const overallStatus = run?.status || (polling ? 'running' : 'idle');
  const overallSummary = run?.summary || (polling ? 'Cycle running on GitHub Actions…' : 'No pipeline run recorded yet — first run lands when the 15th-monthly cron fires (or when you click Trigger Full Cycle).');

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold text-white">Last Pipeline Run</h3>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {run ? (
              <>
                Run <code className="text-gray-300">#{run.id}</code> · {run.trigger_source || 'scheduled'} ·
                started {fmtTimeAgo(run.started_at)}
                {run.completed_at && <> · completed {fmtTimeAgo(run.completed_at)}</>}
              </>
            ) : 'awaiting first cycle'}
          </p>
        </div>
        <StatusBadge status={overallStatus} />
      </div>

      {polling && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 mb-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <p className="text-xs text-blue-300">
            Cycle running on GitHub Actions — polling pipeline_runs every 15s. The table below auto-updates as each step completes.
          </p>
        </div>
      )}

      {overallSummary && (
        <p className="text-xs text-gray-400 mb-3">{overallSummary}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-800">
              <th className="py-2 pr-3 font-medium">Source</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium text-right">Records</th>
              <th className="py-2 pr-3 font-medium text-right">Duration</th>
              <th className="py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {SCRAPER_CATALOG.map((cat) => {
              const step = stepsByScraper.get(cat.key);
              const status = step?.status || (polling ? 'running' : 'pending');
              const inserted = step?.records_inserted || 0;
              const found = step?.records_found || 0;
              const duration = step?.duration_ms ? `${(step.duration_ms / 1000).toFixed(1)}s` : '—';
              const note = step?.error
                ? <span className="text-red-300">⚠ {step.error.substring(0, 80)}</span>
                : status === 'skipped' && cat.secret
                  ? <span className="text-amber-400/90">Add <code className="text-amber-300">{cat.secret}</code> to GH Actions secrets to activate</span>
                  : status === 'pending'
                    ? <span className="text-gray-600">awaiting next cycle</span>
                    : <span className="text-gray-500">{cat.source_url}</span>;
              return (
                <tr key={cat.key} className="border-b border-gray-900/50 last:border-b-0">
                  <td className="py-2 pr-3 text-gray-300">{cat.label}</td>
                  <td className="py-2 pr-3"><StatusBadge status={status} /></td>
                  <td className="py-2 pr-3 text-right text-gray-300">
                    {inserted > 0 ? `+${inserted.toLocaleString()}` : found > 0 ? `${found.toLocaleString()} found` : '—'}
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-400">{duration}</td>
                  <td className="py-2 text-gray-400">{note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {Array.isArray(run?.errors) && run.errors.length > 0 && (
        <div className="mt-3 bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <p className="text-[11px] text-red-400 font-medium mb-1">Cycle errors ({run.errors.length})</p>
          <ul className="space-y-1">
            {run.errors.slice(0, 3).map((e, i) => (
              <li key={i} className="text-[11px] text-red-300/90">
                <code className="text-red-200">{e.scraper}</code>: {String(e.error).substring(0, 200)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Intel Upload Panel ──────────────────────────────────────────
function IntelUploadPanel({ onIngested }) {
  const [tab, setTab] = useState('paste'); // paste | file | url
  const [source, setSource] = useState('Other');
  const [title, setTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [urlText, setUrlText] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const reset = () => {
    setTitle(''); setPasteText(''); setFileText(''); setFileName('');
    setArticleUrl(''); setUrlText(''); setResult(null); setError(null);
  };

  // Extract text from uploaded file
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError(null);

    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      setFileText(await file.text());
    } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
      setFileText(await file.text());
    } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      try {
        // Use pdf.js from CDN for browser-based PDF text extraction
        if (!window.pdfjsLib) {
          const script = document.createElement('script');
          script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
          document.head.appendChild(script);
          await new Promise((resolve, reject) => { script.onload = resolve; script.onerror = reject; });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          text += content.items.map(item => item.str).join(' ') + '\n';
        }
        setFileText(text.trim());
      } catch (err) {
        setError(`PDF extraction failed: ${err.message}`);
      }
    } else {
      setError('Unsupported file type — use PDF, TXT, CSV, or paste the content directly');
    }
  };

  // Fetch article text from URL (simple proxy-free extraction)
  const fetchArticle = async () => {
    if (!articleUrl) return;
    setError(null);
    try {
      setUrlText('Fetching article...');
      // Try to fetch via a CORS proxy or direct
      const res = await fetch(articleUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      // Extract text from HTML (basic: strip tags)
      const doc = new DOMParser().parseFromString(html, 'text/html');
      // Try to find article body
      const article = doc.querySelector('article') || doc.querySelector('[role="main"]') || doc.querySelector('.content') || doc.body;
      const text = article?.innerText || article?.textContent || '';
      if (text.length < 50) throw new Error('Could not extract meaningful text from URL');
      setUrlText(text.substring(0, 15000));
    } catch (err) {
      setError(`URL fetch failed (CORS): paste the article text instead`);
      setUrlText('');
      setTab('paste');
    }
  };

  const getReportText = () => {
    if (tab === 'paste') return pasteText;
    if (tab === 'file') return fileText;
    if (tab === 'url') return urlText;
    return '';
  };

  const canSubmit = () => {
    const text = getReportText();
    return text.length > 50 && !processing;
  };

  const handleIngest = async () => {
    setProcessing(true);
    setError(null);
    setResult(null);
    const preset = SOURCE_PRESETS[source] || SOURCE_PRESETS['Other'];
    const reportText = getReportText();

    try {
      const res = await ingestReport({
        title: title || `${source} Report — ${new Date().toLocaleDateString()}`,
        source_name: source,
        source_type: preset.type,
        format: tab === 'file' ? (fileName.endsWith('.pdf') ? 'pdf' : 'text') : tab === 'url' ? 'article' : 'text',
        raw_text: reportText,
        original_url: tab === 'url' ? articleUrl : null,
        original_filename: tab === 'file' ? fileName : null,
        report_date: new Date().toISOString().split('T')[0],
      });
      setResult(res);
      if (onIngested) onIngested(res);
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <span className="text-lg">🧠</span> Intel Ingestion
          </h3>
          <p className="text-[10px] text-gray-500 mt-0.5">Feed market reports → AI analysis → Dashboard alerts + knowledge base</p>
        </div>
        {result && (
          <button onClick={reset} className="text-[10px] text-gray-500 hover:text-white transition-colors">
            + New Report
          </button>
        )}
      </div>

      {result ? (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
          <p className="text-green-400 text-sm font-medium mb-1">✓ Report processed successfully</p>
          <p className="text-gray-300 text-xs">{result.insight?.title}</p>
          <p className="text-gray-500 text-[10px] mt-1">
            Sentiment: {result.insight?.sentiment} · Urgency: {result.insight?.urgency} · Impact: {result.insight?.price_impact}
          </p>
          <p className="text-gray-600 text-[10px] mt-2">Alert card now visible on Dashboard</p>
        </div>
      ) : (
        <>
          {/* Source selector */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {Object.entries(SOURCE_PRESETS).map(([name, { icon }]) => (
              <button
                key={name}
                onClick={() => setSource(name)}
                className={`text-[10px] px-2.5 py-1 rounded-full border transition-all ${
                  source === name
                    ? 'bg-green-500/20 border-green-500/40 text-green-400'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600'
                }`}
              >
                {icon} {name}
              </button>
            ))}
          </div>

          {/* Title */}
          <input
            type="text"
            placeholder="Report title (optional — AI will generate one)"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 mb-3 focus:outline-none focus:border-green-500/50"
          />

          {/* Input tabs */}
          <div className="flex gap-1 mb-3">
            {[
              { id: 'paste', label: 'Paste Text', icon: '📋' },
              { id: 'file', label: 'Upload File', icon: '📎' },
              { id: 'url', label: 'Article URL', icon: '🔗' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-all ${
                  tab === t.id
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* Input area */}
          {tab === 'paste' && (
            <textarea
              placeholder="Paste market report, email body, or news article text here..."
              value={pasteText}
              onChange={e => setPasteText(e.target.value)}
              rows={6}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-green-500/50 font-mono"
            />
          )}
          {tab === 'file' && (
            <div className="border border-dashed border-gray-700 rounded-lg p-6 text-center">
              <input type="file" accept=".pdf,.txt,.csv,.md" onChange={handleFile} className="hidden" id="intel-file-input" />
              <label htmlFor="intel-file-input" className="cursor-pointer">
                {fileName ? (
                  <div>
                    <p className="text-sm text-green-400">📄 {fileName}</p>
                    <p className="text-[10px] text-gray-500 mt-1">{fileText.length.toLocaleString()} chars extracted</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-gray-500 text-sm">Drop PDF, TXT, or CSV</p>
                    <p className="text-gray-600 text-[10px] mt-1">Click to browse</p>
                  </div>
                )}
              </label>
            </div>
          )}
          {tab === 'url' && (
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://example.com/article..."
                value={articleUrl}
                onChange={e => setArticleUrl(e.target.value)}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
              />
              <button
                onClick={fetchArticle}
                disabled={!articleUrl}
                className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-xs hover:bg-gray-600 disabled:opacity-30"
              >
                Fetch
              </button>
            </div>
          )}

          {/* Text preview for file/url */}
          {(tab === 'file' && fileText) && (
            <div className="mt-2 bg-gray-950 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-[10px] text-gray-500 mb-1">Extracted text preview:</p>
              <p className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap">{fileText.substring(0, 500)}...</p>
            </div>
          )}
          {(tab === 'url' && urlText && !urlText.startsWith('Fetching')) && (
            <div className="mt-2 bg-gray-950 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-[10px] text-gray-500 mb-1">Article preview:</p>
              <p className="text-[10px] text-gray-400 font-mono whitespace-pre-wrap">{urlText.substring(0, 500)}...</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-[10px] text-gray-600">
              {getReportText().length > 0 ? `${getReportText().length.toLocaleString()} chars ready` : 'Waiting for content...'}
            </p>
            <button
              onClick={handleIngest}
              disabled={!canSubmit()}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
                canSubmit()
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
                  : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border border-green-400 border-t-transparent rounded-full animate-spin" />
                  AI Processing...
                </span>
              ) : (
                '🧠 Analyze & Publish'
              )}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function Autonomous() {
  const { profile: authProfile } = useAuth();
  const isAdmin = isAdminUser(authProfile);

  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({});
  const [reportCount, setReportCount] = useState(0);
  const [analysisCount, setAnalysisCount] = useState(0);
  const [intelCount, setIntelCount] = useState(0);
  const [knowledgeFacts, setKnowledgeFacts] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [runLog, setRunLog] = useState([]);

  // ─── Real cycle (GitHub Actions via edge fn) ────────────────────
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState(null);
  const [triggerSuccess, setTriggerSuccess] = useState(null);
  const [latestPipelineRun, setLatestPipelineRun] = useState(null);
  const [polling, setPolling] = useState(false);
  const pollTimeoutRef = useRef(null);

  const loadData = useCallback(async () => {
    const [logRes, configRes, reportRes, analysisRes, pipelineRes] = await Promise.all([
      supabase.from('scraping_logs').select('*').order('started_at', { ascending: false }).limit(20),
      supabase.from('system_config').select('*'),
      supabase.from('abc_position_reports').select('id', { count: 'exact', head: true }),
      supabase.from('ai_analyses').select('id', { count: 'exact', head: true }),
      supabase.from('pipeline_runs').select('*').eq('run_type', 'autonomous_cycle').order('started_at', { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (logRes.data) setLogs(logRes.data);
    if (configRes.data) {
      const m = {};
      configRes.data.forEach(c => { m[c.key] = c.value; });
      setConfig(m);
    }
    setReportCount(reportRes.count || 0);
    setAnalysisCount(analysisRes.count || 0);
    setLatestPipelineRun(pipelineRes.data || null);

    // Load intel system stats (graceful if tables don't exist yet)
    try {
      const insights = await getLatestInsights(100);
      setIntelCount(insights?.length || 0);
      const kStats = await getKnowledgeStats();
      setKnowledgeFacts(kStats?.total || 0);
    } catch { /* tables may not exist yet */ }

    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Polling: while a manual cycle is running, refresh pipeline_runs every 15s ──
  // Caps at 40 ticks (10 min) so a stuck row doesn't poll forever.
  useEffect(() => {
    if (!polling || !latestPipelineRun?.id) return;
    let ticks = 0;
    const tick = async () => {
      ticks++;
      const { data } = await supabase
        .from('pipeline_runs')
        .select('*')
        .eq('id', latestPipelineRun.id)
        .maybeSingle();
      if (data) setLatestPipelineRun(data);
      // Stop when terminal or after ~10 min
      if (data && (data.status === 'completed' || data.status === 'failed') || ticks >= 40) {
        setPolling(false);
        loadData(); // pull fresh scraping_logs + counts
        return;
      }
      pollTimeoutRef.current = setTimeout(tick, 15000);
    };
    pollTimeoutRef.current = setTimeout(tick, 15000);
    return () => {
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
    };
  }, [polling, latestPipelineRun?.id, loadData]);

  // ─── Trigger Full Cycle: REAL scraping via edge fn → GH Actions ──
  const triggerFullCycle = async () => {
    setTriggering(true);
    setTriggerError(null);
    setTriggerSuccess(null);
    try {
      const { data, error } = await supabase.functions.invoke('trigger-scrape-cycle', {
        body: {},
      });
      if (error) throw new Error(error.message || 'Edge function error');
      if (data?.error) throw new Error(`${data.error}: ${data.detail || data.hint || ''}`);

      setTriggerSuccess({
        message: `Cycle queued — running on GitHub Actions (ETA ~${data.eta_minutes || 8} min). Watch the table below for live updates.`,
        runId: data.pipeline_run_id,
        runsUrl: data.workflow_runs_url,
      });
      // Refresh pipeline_runs so the new 'running' row becomes the latest, then start polling.
      await loadData();
      setPolling(true);
    } catch (err) {
      setTriggerError(err.message || String(err));
    } finally {
      setTriggering(false);
    }
  };

  const log = (msg) => setRunLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  // ─── Recompute Analyses: browser-side YoY/anomaly math on EXISTING data ──
  // (Renamed from runCycle. Does NOT scrape new data — just re-derives insights.)
  const recomputeAnalyses = async () => {
    setRecomputing(true);
    setRunLog([]);
    const startTime = Date.now();

    try {
      log('Starting autonomous cycle...');
      await supabase.from('scraping_logs').insert({ scraper_name: 'browser-autonomous', status: 'started', metadata: { trigger: 'manual' } });

      // Step 1: Try to scrape ABC
      log('Step 1: Checking ABC industry data page...');
      let pdfCount = 0;
      try {
        const pageRes = await fetch('https://www.almonds.org/processors/industry-reports', { headers: { 'Accept': 'text/html' } });
        if (pageRes.ok) {
          const html = await pageRes.text();
          const pdfs = [...html.matchAll(/href="([^"]*\.pdf[^"]*)"/gi)].map(m => m[1]);
          pdfCount = pdfs.filter(u => /position/i.test(u)).length;
          log(`Found ${pdfs.length} PDFs (${pdfCount} position reports)`);
        } else {
          log(`ABC page returned HTTP ${pageRes.status}`);
        }
      } catch (err) {
        log(`ABC fetch skipped (CORS) — scraping runs via GitHub Actions`);
      }

      // Step 2: Process existing data
      log('Step 2: Processing data — calculating YoY, anomalies, trade signals...');

      const { data: allReports } = await supabase
        .from('abc_position_reports')
        .select('*')
        .order('report_year', { ascending: true })
        .order('report_month', { ascending: true });

      if (!allReports?.length) { log('No reports found — run scraper first'); return; }
      log(`Loaded ${allReports.length} position reports`);

      // Clear old analyses
      await supabase.from('ai_analyses').delete().gt('id', 0);
      log('Cleared old analyses');

      const M = 1e6;
      const pct = (c, p) => p > 0 ? ((c - p) / p * 100).toFixed(1) : null;
      const analyses = [];

      // YoY comparisons
      for (const cur of allReports) {
        const prior = allReports.find(r => r.report_month === cur.report_month && r.report_year === cur.report_year - 1);
        if (!prior) continue;
        analyses.push({
          analysis_type: 'yoy_comparison',
          title: `YoY ${cur.report_year}/${String(cur.report_month).padStart(2, '0')} vs ${prior.report_year}`,
          summary: `Shipments ${pct(cur.total_shipped_lbs, prior.total_shipped_lbs)}% | Committed ${pct(cur.total_committed_lbs, prior.total_committed_lbs)}% | Supply ${pct(cur.total_supply_lbs, prior.total_supply_lbs)}%`,
          confidence: 0.95,
          data_context: { report_year: cur.report_year, report_month: cur.report_month, crop_year: cur.crop_year },
          tags: ['yoy'], is_actionable: false
        });
      }
      log(`Generated ${analyses.length} YoY comparisons`);

      // Trade signal from latest data
      const latest = allReports[allReports.length - 1];
      const prev = allReports[allReports.length - 2];
      if (latest && prev) {
        const shipUp = latest.total_shipped_lbs > prev.total_shipped_lbs;
        const commitDown = latest.total_committed_lbs < prev.total_committed_lbs;
        const newCommitUp = latest.total_new_commitments_lbs > prev.total_new_commitments_lbs;
        let signal = 'neutral', reason = '', conf = 0.55;
        if (shipUp && !commitDown) { signal = 'bullish'; reason = 'Shipments and commitments both trending up. Strong demand.'; conf = 0.72; }
        else if (!shipUp && commitDown) { signal = 'bearish'; reason = 'Shipments down and commitments declining. Weakening demand.'; conf = 0.70; }
        else if (shipUp && commitDown) { signal = 'bearish'; reason = 'Shipments up but commitments declining — may be peaking.'; conf = 0.65; }
        else { reason = 'Mixed signals across key metrics.'; }
        if (newCommitUp) conf = Math.min(0.95, conf + 0.08);
        analyses.push({ analysis_type: 'trade_signal', title: `Trade Signal: ${signal.toUpperCase()} — ${latest.crop_year}`, summary: reason, confidence: conf, data_context: { signal, report_year: latest.report_year, report_month: latest.report_month }, tags: ['signal', 'actionable'], is_actionable: true });
        log(`Trade signal: ${signal.toUpperCase()}`);
      }

      // Monthly brief
      if (latest) {
        const fm = v => (v / M).toFixed(0) + 'M';
        const soldPct = ((latest.total_supply_lbs - (latest.uncommitted_lbs || 0)) / latest.total_supply_lbs * 100).toFixed(1);
        analyses.push({ analysis_type: 'monthly_brief', title: `Monthly Brief: ${latest.crop_year} (${latest.report_year}/${String(latest.report_month).padStart(2, '0')})`, summary: `Supply: ${fm(latest.total_supply_lbs)} lbs | Shipped: ${fm(latest.total_shipped_lbs)} | Committed: ${fm(latest.total_committed_lbs)} | Uncommitted: ${fm(latest.uncommitted_lbs)}. ${soldPct}% of supply sold or committed.`, confidence: 0.98, data_context: {}, tags: ['brief'], is_actionable: false });
      }

      // Crop year summaries
      const cropYears = [...new Set(allReports.map(r => r.crop_year))];
      for (const cy of cropYears) {
        const cyR = allReports.filter(r => r.crop_year === cy);
        const last = cyR[cyR.length - 1];
        analyses.push({ analysis_type: 'monthly_brief', title: `Crop Summary: ${cy}`, summary: `Final supply: ${(last.total_supply_lbs / M).toFixed(0)}M lbs (carry-in ${(last.carry_in_lbs / M).toFixed(0)}M + receipts ${(last.receipts_lbs / M).toFixed(0)}M). Peak shipments: ${Math.max(...cyR.map(r => r.total_shipped_lbs / M)).toFixed(0)}M/mo. ${cyR.length} months reported.`, confidence: 0.98, data_context: { crop_year: cy }, tags: ['summary', 'crop-year'], is_actionable: false });
      }

      // Anomaly detection
      const shipments = allReports.map(r => r.total_shipped_lbs);
      const mean = shipments.reduce((a, b) => a + b, 0) / shipments.length;
      const std = Math.sqrt(shipments.reduce((a, b) => a + (b - mean) ** 2, 0) / shipments.length);
      let anomalyCount = 0;
      for (const r of allReports) {
        const z = (r.total_shipped_lbs - mean) / std;
        if (Math.abs(z) > 1.8) {
          analyses.push({ analysis_type: 'anomaly', title: `${z > 0 ? 'High' : 'Low'} Shipments: ${r.report_year}/${String(r.report_month).padStart(2, '0')}`, summary: `${(r.total_shipped_lbs / M).toFixed(0)}M lbs — ${Math.abs(z).toFixed(1)} std devs ${z > 0 ? 'above' : 'below'} 10-year avg (${(mean / M).toFixed(0)}M).`, confidence: 0.85, data_context: { z_score: z.toFixed(2) }, tags: ['anomaly'], is_actionable: Math.abs(z) > 2 });
          anomalyCount++;
        }
      }
      log(`Detected ${anomalyCount} anomalies`);

      // Insert all analyses in batches
      let inserted = 0;
      for (let i = 0; i < analyses.length; i += 50) {
        const batch = analyses.slice(i, i + 50);
        const { error } = await supabase.from('ai_analyses').insert(batch);
        if (!error) inserted += batch.length;
        else log(`Batch insert error: ${error.message}`);
      }
      log(`Inserted ${inserted} analyses total`);

      const duration = Date.now() - startTime;
      log(`Autonomous cycle complete in ${(duration / 1000).toFixed(1)}s`);

      await supabase.from('scraping_logs').insert({
        scraper_name: 'browser-autonomous', status: 'success',
        records_found: allReports.length, records_inserted: inserted,
        duration_ms: duration, metadata: { trigger: 'manual', analyses: inserted, anomalies: anomalyCount, pdfs_found: pdfCount },
        completed_at: new Date().toISOString()
      });

    } catch (err) {
      log(`ERROR: ${err.message}`);
      await supabase.from('scraping_logs').insert({
        scraper_name: 'browser-autonomous', status: 'failed',
        error_message: err.message, completed_at: new Date().toISOString()
      });
    } finally {
      setRecomputing(false);
      loadData();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-white">Autonomous Systems</h2>
          <p className="text-gray-500 text-sm mt-1">Multi-source data pipeline — ABC + Strata + Bountiful + News + IMAP intel</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={triggerFullCycle}
              disabled={triggering || polling}
              title="Triggers GitHub Actions to run every scraper end-to-end. Real scraping — not browser math."
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                triggering || polling
                  ? 'bg-blue-500/20 text-blue-400 cursor-wait'
                  : 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30'
              }`}
            >
              {triggering ? 'Queueing…' : polling ? 'Cycle running…' : '⚡ Trigger Full Cycle'}
            </button>
            <button
              onClick={recomputeAnalyses}
              disabled={recomputing}
              title="Re-derives YoY + anomaly insights from data ALREADY in the DB. Does NOT scrape new data."
              className={`px-4 py-2.5 rounded-lg text-xs font-medium transition-all ${
                recomputing
                  ? 'bg-gray-700 text-gray-400 cursor-wait'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {recomputing ? 'Recomputing…' : '🧮 Recompute Analyses'}
            </button>
          </div>
        )}
      </div>

      {/* Trigger feedback */}
      {triggerError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-red-400">Trigger failed</p>
          <p className="text-xs text-red-300 mt-1 break-words">{triggerError}</p>
          {triggerError.includes('not_configured') || triggerError.includes('GITHUB_DISPATCH_TOKEN') ? (
            <p className="text-[11px] text-red-400/80 mt-2">
              Setup needed: add a fine-grained GitHub PAT (actions:write) as <code className="text-amber-300">GITHUB_DISPATCH_TOKEN</code> in
              Supabase Dashboard → Project Settings → Edge Functions → Secrets.
            </p>
          ) : null}
        </div>
      )}
      {triggerSuccess && !triggerError && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
          <p className="text-sm font-medium text-green-400">{triggerSuccess.message}</p>
          {triggerSuccess.runsUrl && (
            <p className="text-[11px] text-green-300 mt-1">
              Workflow runs:{' '}
              <a href={triggerSuccess.runsUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-green-200">
                {triggerSuccess.runsUrl}
              </a>
            </p>
          )}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Position Reports</p>
          <p className="text-xl font-bold text-white">{reportCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">AI Analyses</p>
          <p className="text-xl font-bold text-white">{analysisCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Intel Reports</p>
          <p className="text-xl font-bold text-white">{intelCount}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Knowledge Facts</p>
          <p className="text-xl font-bold text-white">{knowledgeFacts}</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Scrape Schedule</p>
          <p className="text-sm font-medium text-green-400">15th monthly</p>
          <p className="text-[10px] text-gray-600">via GitHub Actions</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-500">Auto-Analysis</p>
          <p className="text-sm font-medium text-green-400">Enabled</p>
          <p className="text-[10px] text-gray-600">YoY + anomalies + signals</p>
        </div>
      </div>

      {/* ─── Last Pipeline Run (per-source status table) ─── */}
      <LastPipelineRunPanel run={latestPipelineRun} polling={polling} logs={logs} />

      {/* Intel Ingestion */}
      <IntelUploadPanel onIngested={() => loadData()} />

      {/* Pipeline Architecture */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-semibold text-white mb-3">Data Pipelines</h3>

        {/* Pipeline 1: ABC Position Reports */}
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">ABC Position Reports</p>
        <div className="flex items-center gap-2 text-xs overflow-x-auto pb-3 mb-3 border-b border-gray-800">
          {[
            { label: 'ABC Website', sub: 'almonds.org', cls: 'bg-blue-500/10 border-blue-500/20' },
            { label: 'PDF Scraper', sub: 'Auto-detect new', cls: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'PDF Parser', sub: 'Extract numbers', cls: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Supabase', sub: `${reportCount} reports`, cls: 'bg-green-500/10 border-green-500/20' },
            { label: 'Processor', sub: 'YoY + anomalies', cls: 'bg-cyan-500/10 border-cyan-500/20' },
            { label: 'Dashboard', sub: 'cropsintel.com', cls: 'bg-green-500/10 border-green-500/20' },
          ].map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-600 shrink-0">&rarr;</span>}
              <div className={`border rounded-lg px-3 py-2 shrink-0 ${step.cls}`}>
                <p className="text-white font-medium">{step.label}</p>
                <p className="text-gray-500 text-[10px]">{step.sub}</p>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Pipeline 2: Market Intel Ingestion */}
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Market Intel Ingestion</p>
        <div className="flex items-center gap-2 text-xs overflow-x-auto pb-2">
          {[
            { label: 'Market Reports', sub: 'Handlers, press, USDA', cls: 'bg-orange-500/10 border-orange-500/20' },
            { label: 'Upload / Email', sub: 'PDF, text, URL', cls: 'bg-purple-500/10 border-purple-500/20' },
            { label: 'Claude AI', sub: 'Deep analysis', cls: 'bg-violet-500/10 border-violet-500/20' },
            { label: 'Intel DB', sub: `${intelCount} insights`, cls: 'bg-green-500/10 border-green-500/20' },
            { label: 'Knowledge', sub: `${knowledgeFacts} facts`, cls: 'bg-amber-500/10 border-amber-500/20' },
            { label: 'Alert Cards', sub: 'Dashboard', cls: 'bg-green-500/10 border-green-500/20' },
          ].map((step, i) => (
            <React.Fragment key={i}>
              {i > 0 && <span className="text-gray-600 shrink-0">&rarr;</span>}
              <div className={`border rounded-lg px-3 py-2 shrink-0 ${step.cls}`}>
                <p className="text-white font-medium">{step.label}</p>
                <p className="text-gray-500 text-[10px]">{step.sub}</p>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Run Log (live output for Recompute Analyses) */}
      {runLog.length > 0 && (
        <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 mb-6 font-mono text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-[10px] uppercase tracking-wider">Recompute Output</span>
            {recomputing && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
          </div>
          <div className="max-h-48 overflow-y-auto space-y-0.5">
            {runLog.map((line, i) => (
              <p key={i} className={line.includes('ERROR') ? 'text-red-400' : 'text-green-400/80'}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {/* Activity Log */}
      <h3 className="text-lg font-semibold text-white mb-3">Activity Log</h3>
      {logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  log.status === 'success' ? 'bg-green-500' :
                  log.status === 'failed' ? 'bg-red-500' :
                  log.status === 'started' ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-500'
                }`} />
                <div>
                  <p className="text-sm text-white">{log.scraper_name}</p>
                  <p className="text-[10px] text-gray-600">
                    {new Date(log.started_at).toLocaleString()}
                    {log.duration_ms && ` (${(log.duration_ms / 1000).toFixed(1)}s)`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {log.records_inserted > 0 && (
                  <span className="text-[10px] text-gray-500">+{log.records_inserted} records</span>
                )}
                <StatusBadge status={log.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500">No activity yet</p>
          <p className="text-xs text-gray-600 mt-1">
            {isAdmin
              ? 'Click "Trigger Full Cycle" to run all scrapers via GitHub Actions'
              : 'Scheduled cycles run on the 15th of each month and every Monday'}
          </p>
        </div>
      )}

      {/* Infrastructure Info */}
      <div className="mt-6 bg-gray-900/30 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-white mb-3">Infrastructure</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <p className="text-gray-500 mb-1">Hosting</p>
            <p className="text-gray-300">GitHub Pages (cropsintel.com)</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Database</p>
            <p className="text-gray-300">Supabase (Tokyo region)</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Scheduled Jobs</p>
            <p className="text-gray-300">GitHub Actions (15th monthly + weekly Monday)</p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Data Source</p>
            <p className="text-gray-300">Almond Board of California (almonds.org)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
