// CropsIntel V2 — Data Hub
// W7 (2026-04-27): graduated from /v3-preview/data-hub to /data-hub.
// V3 framing dropped (no purple, no V3PreviewLayout) — this page now
// renders inside the regular V2 shell with the green accent palette.
//
// Addresses verbatim user pain (2026-04-25): "i dont know where to upload
// report".
//
// Three tabs:
//   1. Upload   — drag-drop PDF/CSV, source-type picker, audit row in data_uploads
//   2. Coverage — per-source-type-per-crop-year completeness grid (live from DB)
//   3. Sources  — scraper health list (last-run, rows added) — placeholder until
//                 a scraper_runs table lands; uses static config + table counts
//
// Backed by:
//   - supabase/migrations/20260425_data_uploads.sql (audit table + bucket + RLS)
//   - Reuses existing tables: abc_position_reports, abc_shipment_reports,
//     abc_crop_receipts, abc_forecasts, abc_acreage, industry_news, strata_prices

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

const SOURCE_TYPES = [
  { value: 'abc_position_report',    label: 'ABC Position Report (PDF)',     icon: '📊', backend: 'parsePositionReport',  table: 'abc_position_reports' },
  { value: 'abc_shipment_report',    label: 'ABC Shipment Report (PDF)',     icon: '🚢', backend: 'parseShipmentReport',  table: 'abc_shipment_reports' },
  { value: 'abc_crop_receipts',      label: 'ABC Crop Receipts (PDF)',       icon: '🌰', backend: 'parseCropReceipts',    table: 'abc_crop_receipts' },
  { value: 'abc_subjective_forecast',label: 'ABC Subjective Forecast (PDF)', icon: '🔮', backend: 'parseSubjForecast',    table: 'abc_forecasts' },
  { value: 'abc_objective_forecast', label: 'ABC Objective Forecast (PDF)',  icon: '🎯', backend: 'parseObjForecast',     table: 'abc_forecasts' },
  { value: 'abc_almanac',            label: 'ABC Almanac (PDF)',             icon: '📚', backend: 'parseAlmanac',         table: 'abc_almanac' },
  { value: 'manual_correction',      label: 'Manual data correction (CSV/JSON)', icon: '✏️', backend: 'applyManualPatch', table: '*' },
  { value: 'supplier_offer_sheet',   label: 'Supplier offer sheet (PDF)',    icon: '📋', backend: 'parseSupplierOffer',   table: 'offers_raw' },
  { value: 'freight_rate_sheet',     label: 'Freight rate sheet (CSV) — Phase 7', icon: '🚚', backend: null,              table: null, futurePhase: true },
  { value: 'contract_document',      label: 'Contract document (PDF) — Phase 7',  icon: '📄', backend: null,              table: null, futurePhase: true },
  { value: 'other',                  label: 'Other / unsorted',              icon: '📦', backend: null,                   table: null },
];

const COVERAGE_TARGETS = [
  { source: 'abc_position_report',  table: 'abc_position_reports',  yearCol: 'crop_year',     expectedYears: 11, expectedPerYear: 12, label: 'ABC Position Reports' },
  { source: 'abc_shipment_report',  table: 'abc_shipment_reports',  yearCol: 'crop_year',     expectedYears: 11, expectedPerYear: 12, label: 'ABC Shipment Reports' },
  { source: 'abc_crop_receipts',    table: 'abc_crop_receipts',     yearCol: 'crop_year',     expectedYears: 11, expectedPerYear: 12, label: 'ABC Crop Receipts' },
  { source: 'abc_forecasts',        table: 'abc_forecasts',         yearCol: 'forecast_year', expectedYears: 11, expectedPerYear: 2,  label: 'ABC Forecasts (subj+obj)' },
  { source: 'abc_acreage',          table: 'abc_acreage',           yearCol: 'crop_year',     expectedYears: 11, expectedPerYear: 1,  label: 'ABC Acreage' },
  { source: 'abc_almanac',          table: 'abc_almanac',           yearCol: 'crop_year',     expectedYears: 11, expectedPerYear: 1,  label: 'ABC Almanac' },
];

const SCRAPER_HEALTH = [
  { name: 'abc-scraper.js',       script: 'src/scrapers/abc-scraper.js',       cadence: 'on push to main + manual', tables: ['abc_position_reports','abc_forecasts'], status: 'active' },
  { name: 'shipment-parser.js',   script: 'src/scrapers/shipment-parser.js',   cadence: 'on push to main',           tables: ['abc_shipment_reports'],                  status: 'active' },
  { name: 'receipts-parser.js',   script: 'src/scrapers/receipts-parser.js',   cadence: 'on push to main',           tables: ['abc_crop_receipts'],                     status: 'active' },
  { name: 'news-scraper.js',      script: 'src/scrapers/news-scraper.js',      cadence: 'daily cron',                tables: ['industry_news'],                         status: 'active' },
  { name: 'strata-scraper.js',    script: 'src/scrapers/strata-scraper.js',    cadence: 'manual',                    tables: ['strata_prices'],                         status: 'active' },
  { name: 'bountiful-scraper.js', script: 'src/scrapers/bountiful-scraper.js', cadence: 'manual',                    tables: [],                                        status: 'dormant' },
];

export default function DataHub() {
  const [tab, setTab] = useState('coverage');

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white mb-1">Data Hub</h1>
        <p className="text-sm text-gray-400">
          One place for everything that flows into CropsIntel — uploads, coverage, scraper health.
        </p>
      </div>

      {/* Tab strip */}
      <div className="flex items-center gap-1 mb-6 border-b border-gray-800">
        {[
          { key: 'upload',   label: 'Upload',   icon: '📥', desc: 'Drag-drop a report' },
          { key: 'coverage', label: 'Coverage', icon: '🗂️', desc: 'See what we have vs what we should' },
          { key: 'sources',  label: 'Sources',  icon: '🩺', desc: 'Scraper health' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'text-green-300 border-green-500'
                : 'text-gray-500 border-transparent hover:text-gray-300'
            }`}
          >
            <span className="mr-2">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && <UploadTab />}
      {tab === 'coverage' && <CoverageTab />}
      {tab === 'sources' && <SourcesTab />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Upload tab
// ═══════════════════════════════════════════════════════════════════
function UploadTab() {
  const { user, profile } = useAuth();
  const [sourceType, setSourceType] = useState('abc_position_report');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [recent, setRecent] = useState([]);
  const [dragActive, setDragActive] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);

  const meta = useMemo(() => SOURCE_TYPES.find(s => s.value === sourceType) || SOURCE_TYPES[0], [sourceType]);

  const loadRecent = useCallback(async () => {
    const { data, error } = await supabase
      .from('data_uploads')
      .select('id, source_type, file_name, status, uploaded_at, uploaded_by_email, file_size_bytes')
      .order('uploaded_at', { ascending: false })
      .limit(15);
    if (error) {
      // PostgREST returns PGRST205 / "Could not find the table" when the
      // 20260425_data_uploads.sql migration hasn't been applied yet. Surface
      // a clear actionable banner instead of a silent failure.
      if (error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message || '')) {
        setMigrationPending(true);
      }
      return;
    }
    if (data) setRecent(data);
  }, []);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  const handleFile = useCallback(async (file) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const path = `${sourceType}/${ts}-${safeName}`;

      // 1. Upload to Storage bucket
      const { error: upErr } = await supabase.storage
        .from('data-uploads')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      // 2. Insert audit row
      const { data: rowData, error: rowErr } = await supabase
        .from('data_uploads')
        .insert({
          uploaded_by: user?.id ?? null,
          uploaded_by_email: user?.email ?? profile?.email ?? null,
          source_type: sourceType,
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          storage_path: path,
          status: meta.futurePhase ? 'archived' : 'uploaded',
          notes: notes || null,
          metadata: { client_uploaded_at: new Date().toISOString() },
        })
        .select('id, source_type, file_name, status, uploaded_at')
        .single();
      if (rowErr) throw new Error(`Audit row failed: ${rowErr.message}`);

      setSuccess({
        file: file.name,
        size: file.size,
        path,
        sourceType,
        futurePhase: !!meta.futurePhase,
        rowId: rowData?.id,
      });
      setNotes('');
      await loadRecent();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }, [sourceType, notes, user, profile, meta, loadRecent]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onPick = useCallback((e) => {
    const file = e.target?.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Migration banner (only shown if data_uploads table is missing) */}
      {migrationPending && (
        <div className="lg:col-span-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-sm font-semibold text-amber-300 mb-1">Migration pending — uploads gated</p>
          <p className="text-xs text-amber-200/80 mb-2">
            The <code className="text-amber-100">data_uploads</code> audit table doesn't exist yet on prod.
            Apply <code className="text-amber-100">supabase/migrations/20260425_data_uploads.sql</code> in the
            Supabase SQL editor (Dashboard → SQL Editor → paste the file → Run). After it lands the Upload
            tab works without a redeploy.
          </p>
          <p className="text-[11px] text-amber-200/60">
            Coverage and Sources tabs work fine right now — Upload alone needs the migration.
          </p>
        </div>
      )}

      {/* Left: source picker + drop zone */}
      <div className="lg:col-span-2 space-y-5">
        {/* Source type picker */}
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
            What are you uploading?
          </label>
          <select
            value={sourceType}
            onChange={(e) => setSourceType(e.target.value)}
            className="w-full bg-gray-950 border border-gray-700 text-white text-sm rounded-lg px-3 py-2.5 focus:border-green-500 focus:outline-none"
          >
            {SOURCE_TYPES.map(s => (
              <option key={s.value} value={s.value}>{s.icon}  {s.label}</option>
            ))}
          </select>
          {meta.futurePhase && (
            <p className="mt-2 text-[11px] text-amber-400">
              ⚠️ This source type is Phase 7+ scope. We'll archive your file safely; backend parsing lands in a future push.
            </p>
          )}
          {meta.backend && (
            <p className="mt-2 text-[11px] text-gray-500">
              Backend parser: <code className="text-green-300">{meta.backend}</code> · target table: <code className="text-green-300">{meta.table}</code>
            </p>
          )}
        </div>

        {/* Drop zone */}
        <label
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          className={`block cursor-pointer border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
            dragActive
              ? 'border-green-400 bg-green-500/5'
              : 'border-gray-700 hover:border-green-600 bg-gray-900/40'
          }`}
        >
          <input
            type="file"
            className="hidden"
            onChange={onPick}
            accept=".pdf,.csv,.xls,.xlsx,.json,.txt"
            disabled={busy}
          />
          <div className="text-5xl mb-3">{meta.icon}</div>
          <p className="text-base font-medium text-white mb-1">
            {busy ? 'Uploading…' : dragActive ? 'Drop to upload' : 'Drag a file here or click to pick'}
          </p>
          <p className="text-xs text-gray-500">
            PDF, CSV, XLS, JSON, or TXT · max 100 MB
          </p>
        </label>

        {/* Notes */}
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
          <label className="block text-xs uppercase tracking-wider text-gray-500 mb-2 font-semibold">
            Notes (optional — helps the next person know why you uploaded this)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="e.g. November 2025 position report — March 2026 download from almonds.org"
            className="w-full bg-gray-950 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:border-green-500 focus:outline-none placeholder-gray-600"
          />
        </div>

        {/* Status */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            <p className="font-semibold mb-1">Upload failed</p>
            <p className="text-red-200/80">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-sm text-green-300">
            <p className="font-semibold mb-1">✓ Uploaded</p>
            <p className="text-green-200/80">
              {success.file} ({(success.size / 1024).toFixed(1)} KB) → <code className="text-green-200">{success.path}</code>
            </p>
            {success.futurePhase ? (
              <p className="text-amber-300/80 text-xs mt-1">Archived. Backend parser lands in Phase 7+.</p>
            ) : (
              <p className="text-green-200/60 text-xs mt-1">Status: <code>uploaded</code> · queued for backend parser on next scraper run.</p>
            )}
          </div>
        )}
      </div>

      {/* Right: recent uploads */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3 flex items-center justify-between">
          Recent uploads
          <span className="text-[10px] text-gray-500 font-normal">{recent.length} shown</span>
        </h3>
        {recent.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No uploads yet. Yours will appear here.
          </p>
        ) : (
          <ul className="space-y-2 max-h-[500px] overflow-y-auto">
            {recent.map(r => {
              const src = SOURCE_TYPES.find(s => s.value === r.source_type) || SOURCE_TYPES.at(-1);
              return (
                <li key={r.id} className="text-xs bg-gray-950/50 border border-gray-800 rounded-lg p-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span>{src.icon}</span>
                    <span className="font-medium text-gray-200 truncate flex-1">{r.file_name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                      r.status === 'parsed' ? 'bg-green-500/15 text-green-300 border border-green-500/30' :
                      r.status === 'failed' ? 'bg-red-500/15 text-red-300 border border-red-500/30' :
                      r.status === 'archived' ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30' :
                      'bg-green-500/15 text-green-300 border border-green-500/30'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                  <p className="text-gray-500 text-[10px]">
                    {new Date(r.uploaded_at).toLocaleString()} · {r.uploaded_by_email || 'unknown'} · {r.file_size_bytes ? `${(r.file_size_bytes/1024).toFixed(1)} KB` : ''}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Coverage tab
// ═══════════════════════════════════════════════════════════════════
function CoverageTab() {
  const [coverage, setCoverage] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    async function load() {
      const result = {};
      for (const target of COVERAGE_TARGETS) {
        try {
          const { data, error } = await supabase
            .from(target.table)
            .select(target.yearCol, { count: 'exact', head: false })
            .limit(2000);
          if (error) throw error;
          const rows = data || [];
          const yearCounts = {};
          for (const r of rows) {
            const y = r[target.yearCol];
            if (y == null) continue;
            yearCounts[y] = (yearCounts[y] || 0) + 1;
          }
          const years = Object.keys(yearCounts).map(Number).sort((a, b) => a - b);
          result[target.source] = {
            target,
            totalRows: rows.length,
            yearCounts,
            distinctYears: years.length,
            firstYear: years[0],
            lastYear: years.at(-1),
            error: null,
          };
        } catch (e) {
          result[target.source] = { target, totalRows: 0, yearCounts: {}, distinctYears: 0, error: e.message };
        }
      }
      if (alive) {
        setCoverage(result);
        setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return <div className="text-sm text-gray-500">Reading coverage from {COVERAGE_TARGETS.length} tables…</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Each row is a data source. Columns are crop years. Green = full month coverage. Amber = partial. Gray = empty.
        Click a hole → jump to Upload tab to fix it.
      </p>
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 px-2 font-semibold">Source</th>
              <th className="text-right py-2 px-2 font-semibold">Rows</th>
              <th className="text-right py-2 px-2 font-semibold">Years</th>
              <th className="text-right py-2 px-2 font-semibold">Span</th>
              <th className="text-right py-2 px-2 font-semibold">Health</th>
            </tr>
          </thead>
          <tbody>
            {COVERAGE_TARGETS.map(target => {
              const c = coverage[target.source];
              if (!c) return null;
              const expectedTotal = target.expectedYears * target.expectedPerYear;
              const completeness = expectedTotal > 0 ? Math.min(100, Math.round((c.totalRows / expectedTotal) * 100)) : 0;
              const healthClass = c.error ? 'text-red-400' : completeness >= 80 ? 'text-green-400' : completeness >= 30 ? 'text-amber-400' : 'text-gray-500';
              return (
                <tr key={target.source} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                  <td className="py-2 px-2 text-gray-200">
                    <div>{target.label}</div>
                    <div className="text-[10px] text-gray-600 font-mono">{target.table}</div>
                  </td>
                  <td className="py-2 px-2 text-right text-gray-300 font-mono">{c.totalRows.toLocaleString()}</td>
                  <td className="py-2 px-2 text-right text-gray-300 font-mono">{c.distinctYears} / {target.expectedYears}</td>
                  <td className="py-2 px-2 text-right text-gray-500 font-mono">
                    {c.firstYear ? `${c.firstYear}→${c.lastYear}` : '—'}
                  </td>
                  <td className={`py-2 px-2 text-right font-mono ${healthClass}`}>
                    {c.error ? 'ERR' : `${completeness}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Year detail strip */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-3">Year-by-year detail</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-500 border-b border-gray-800">
                <th className="text-left py-1.5 px-2">Source</th>
                {Array.from({length: 11}, (_, i) => 2015 + i).map(y => (
                  <th key={y} className="text-center py-1.5 px-1 font-mono">{String(y).slice(-2)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COVERAGE_TARGETS.map(target => {
                const c = coverage[target.source];
                if (!c) return null;
                return (
                  <tr key={target.source} className="border-b border-gray-800/30">
                    <td className="py-1.5 px-2 text-gray-300 truncate">{target.label}</td>
                    {Array.from({length: 11}, (_, i) => 2015 + i).map(y => {
                      const count = c.yearCounts[y] || 0;
                      const filled = count >= target.expectedPerYear;
                      const partial = count > 0 && !filled;
                      return (
                        <td key={y} className="py-1 px-0.5 text-center">
                          <div
                            title={`${target.label} ${y}: ${count} rows (expected ${target.expectedPerYear})`}
                            className={`mx-auto w-5 h-5 rounded-sm ${
                              filled ? 'bg-green-500/60' :
                              partial ? 'bg-amber-500/60' :
                              'bg-gray-800/80 border border-gray-700/50'
                            }`}
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sources tab
// ═══════════════════════════════════════════════════════════════════
function SourcesTab() {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        Server-side scrapers that feed CropsIntel. "Last run" data comes from
        a <code>scraper_runs</code> table that doesn't exist yet — added in the
        next push. For now this lists the scripts and their target tables.
      </p>
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500 border-b border-gray-800">
              <th className="text-left py-2 px-2 font-semibold">Scraper</th>
              <th className="text-left py-2 px-2 font-semibold">Cadence</th>
              <th className="text-left py-2 px-2 font-semibold">Writes to</th>
              <th className="text-right py-2 px-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {SCRAPER_HEALTH.map(s => (
              <tr key={s.name} className="border-b border-gray-800/50 hover:bg-gray-800/20">
                <td className="py-2 px-2">
                  <div className="text-gray-200 font-medium">{s.name}</div>
                  <div className="text-[10px] text-gray-600 font-mono">{s.script}</div>
                </td>
                <td className="py-2 px-2 text-gray-400">{s.cadence}</td>
                <td className="py-2 px-2 text-gray-400 font-mono text-[11px]">
                  {s.tables.join(', ') || '—'}
                </td>
                <td className="py-2 px-2 text-right">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                    s.status === 'active' ? 'bg-green-500/15 text-green-300 border border-green-500/30' :
                    'bg-gray-700/30 text-gray-400 border border-gray-700/50'
                  }`}>
                    {s.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-xs text-amber-300/80">
        <p className="font-semibold mb-1">Coming next push:</p>
        <ul className="list-disc list-inside space-y-0.5 text-amber-300/70">
          <li><code>scraper_runs</code> table to capture every cron + manual run with rows-added/errors</li>
          <li>"Trigger now" button per scraper (admin-gated)</li>
          <li>Real "last run" timestamp + duration + diff</li>
        </ul>
      </div>
    </div>
  );
}
