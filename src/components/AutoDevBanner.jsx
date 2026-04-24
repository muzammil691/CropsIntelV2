// CropsIntel V2 — Auto Dev Mode · Live Banner
// 2026-04-25 · Mini-Phase 0 + 1
//
// Reads from public.autodev_live view (RLS-gated; visible only to admin + maxons_team).
// Polls every 10s. Shows state, current task, heartbeat age, open blocking questions.

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const STATE_COLORS = {
  working:  { dot: 'bg-emerald-500', text: 'text-emerald-300',  ring: 'ring-emerald-500/30',  label: 'Working' },
  waiting:  { dot: 'bg-amber-400',   text: 'text-amber-300',    ring: 'ring-amber-400/30',    label: 'Waiting for you' },
  blocked:  { dot: 'bg-rose-500',    text: 'text-rose-300',     ring: 'ring-rose-500/30',     label: 'Blocked' },
  error:    { dot: 'bg-red-600',     text: 'text-red-300',      ring: 'ring-red-500/40',      label: 'Error' },
  idle:     { dot: 'bg-slate-400',   text: 'text-slate-300',    ring: 'ring-slate-500/20',    label: 'Idle' },
};

function formatHeartbeat(seconds) {
  if (seconds == null) return 'unknown';
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default function AutoDevBanner() {
  const [live, setLive] = useState(null);
  const [openQs, setOpenQs] = useState([]);
  const [error, setError] = useState(null);

  const load = async () => {
    try {
      const [{ data: liveRow, error: lErr }, { data: qRows }] = await Promise.all([
        supabase.from('autodev_live').select('*').maybeSingle(),
        supabase.from('autodev_questions')
          .select('id, question, suggestion, options, priority, asked_at, category')
          .eq('status', 'open')
          .order('asked_at', { ascending: false })
          .limit(5),
      ]);
      if (lErr && lErr.code !== 'PGRST116') setError(lErr.message);
      else setError(null);
      setLive(liveRow || null);
      setOpenQs(qRows || []);
    } catch (e) {
      setError(e?.message || String(e));
    }
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  if (error && !live) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-500">
        Auto Dev Mode · {error.includes('permission') || error.includes('policy') ? 'Admin-only view' : error}
      </div>
    );
  }

  if (!live) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 animate-pulse">
        Auto Dev Mode · loading live state…
      </div>
    );
  }

  const sc = STATE_COLORS[live.state] || STATE_COLORS.idle;

  return (
    <div className={`relative bg-gradient-to-r from-slate-900 via-slate-900/80 to-slate-950 border border-slate-800 rounded-xl p-4 shadow-xl shadow-black/20 ring-1 ${sc.ring}`}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className={`w-2.5 h-2.5 rounded-full ${sc.dot} animate-pulse`} />
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide font-mono">
              <span className={sc.text}>● {sc.label}</span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">{live.worker_type}</span>
            </div>
            <div className="text-sm text-white font-medium truncate mt-0.5">
              {live.current_task_title || <span className="text-slate-500 italic">No active task</span>}
            </div>
            {live.current_task_detail && (
              <div className="text-xs text-slate-400 truncate mt-0.5">
                {live.current_task_detail}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-400 flex-shrink-0">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-600">Heartbeat</span>
            <span className="text-slate-300 font-mono">{formatHeartbeat(live.seconds_since_heartbeat)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-600">Done</span>
            <span className="text-slate-300 font-mono">{live.total_tasks_completed || 0}</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase tracking-wide text-slate-600">Open Q</span>
            <span className={`font-mono ${live.open_questions_count > 0 ? 'text-amber-300' : 'text-slate-300'}`}>
              {live.open_questions_count || 0}
            </span>
          </div>
        </div>
      </div>

      {openQs.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-mono">Open questions</div>
          {openQs.map(q => (
            <div key={q.id} className="bg-slate-950/50 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                  q.priority === 'blocking' ? 'bg-rose-500/20 text-rose-300' :
                  q.priority === 'high'     ? 'bg-amber-500/20 text-amber-300' :
                                              'bg-slate-700/50 text-slate-400'
                }`}>{q.priority}</span>
                {q.category && (
                  <span className="text-[9px] uppercase tracking-wide text-slate-500 font-mono">{q.category}</span>
                )}
                <span className="text-[10px] text-slate-600 ml-auto">{new Date(q.asked_at).toLocaleTimeString()}</span>
              </div>
              <div className="text-xs text-slate-200">{q.question}</div>
              {q.suggestion && (
                <div className="text-[11px] text-slate-400 mt-1 italic">💡 {q.suggestion}</div>
              )}
              {Array.isArray(q.options) && q.options.length > 0 && (
                <div className="mt-2 space-y-1">
                  {q.options.map((opt, i) => (
                    <div key={i} className="text-[11px] text-slate-400 pl-3">
                      <span className="text-slate-500 font-mono">{i + 1})</span> {opt.label}
                      {opt.is_recommended && <span className="text-emerald-400 ml-1">⭐</span>}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-slate-600 font-mono mt-2">
                WhatsApp admin to reply · ref {String(q.id).slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
