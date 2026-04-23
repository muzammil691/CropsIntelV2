// PersonaInsights — role-specific numeric insight row below PersonaBanner.
//
// Phase D2 / D3: where PersonaBanner is curated shortcuts, PersonaInsights
// surfaces real numbers relevant to the logged-in user's role. Pulls from
// abc_position_reports + abc_crop_receipts via supabase and shapes three
// live stat cards per persona.
//
// Roles handled inline: grower, supplier (handler/packer), processor,
// broker, buyer, trader, admin/maxons_team. Unknown roles render nothing.

import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { toNum } from '../lib/utils';

function Stat({ label, value, sub, accent = 'green' }) {
  const colorMap = {
    green:  'text-green-400',
    blue:   'text-blue-400',
    amber:  'text-amber-400',
    cyan:   'text-cyan-400',
    purple: 'text-purple-400',
    emerald:'text-emerald-400',
    red:    'text-red-400',
  };
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      <p className={`text-lg font-bold ${colorMap[accent] || colorMap.green}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function fmtM(n) {
  const v = toNum(n);
  if (!v) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(0) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'K';
  return v.toLocaleString();
}

export default function PersonaInsights() {
  const { profile } = useAuth();
  const [latest, setLatest] = useState(null);
  const [priorYearLatest, setPriorYearLatest] = useState(null);
  const [varieties, setVarieties] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: positions } = await supabase
          .from('abc_position_reports')
          .select('*')
          .order('report_year', { ascending: false })
          .order('report_month', { ascending: false })
          .limit(24);
        if (cancelled) return;
        if (positions && positions.length) {
          setLatest(positions[0]);
          const prior = positions.find(p =>
            p.report_month === positions[0].report_month &&
            p.report_year === positions[0].report_year - 1
          );
          setPriorYearLatest(prior || null);
        }
        const { data: receipts } = await supabase
          .from('abc_crop_receipts')
          .select('variety, receipts_lbs, crop_year')
          .limit(200);
        if (cancelled) return;
        if (receipts) setVarieties(receipts);
      } catch {
        /* render empty — persona banner is still useful */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading || !latest) return null;

  const role = profile?.role || 'buyer';
  const tier = profile?.access_tier || profile?.tier;
  const isInternal = tier === 'admin' || tier === 'maxons_team';

  const soldPct = toNum(latest.total_supply_lbs) > 0
    ? ((toNum(latest.total_supply_lbs) - toNum(latest.uncommitted_lbs)) / toNum(latest.total_supply_lbs)) * 100
    : null;

  const shipYoY = priorYearLatest && toNum(priorYearLatest.total_shipped_lbs) > 0
    ? ((toNum(latest.total_shipped_lbs) - toNum(priorYearLatest.total_shipped_lbs)) / toNum(priorYearLatest.total_shipped_lbs)) * 100
    : null;

  // Top variety for grower + packer cards
  const latestCY = latest.crop_year;
  const cyReceipts = varieties.filter(v => v.crop_year === latestCY);
  const byVariety = {};
  cyReceipts.forEach(r => {
    byVariety[r.variety] = (byVariety[r.variety] || 0) + toNum(r.receipts_lbs);
  });
  const topVariety = Object.entries(byVariety).sort((a, b) => b[1] - a[1])[0] || ['—', 0];
  const totalReceipts = Object.values(byVariety).reduce((s, v) => s + v, 0);
  const topVarietyPct = totalReceipts > 0 ? (topVariety[1] / totalReceipts) * 100 : 0;

  // Build stat set per role
  let heading = '';
  let stats = [];

  if (role === 'grower') {
    heading = 'Your orchard snapshot — real numbers, not averages';
    stats = [
      { label: 'Latest receipts (crop)',    value: fmtM(latest.receipts_lbs),       sub: `${latestCY} · month ${latest.report_month}`,        accent: 'emerald' },
      { label: 'Top variety share',         value: topVariety[0],                   sub: `${topVarietyPct.toFixed(0)}% of ${latestCY} receipts`,  accent: 'green' },
      { label: 'Industry sold rate',        value: soldPct != null ? soldPct.toFixed(1) + '%' : '—', sub: 'tighter = better for growers',   accent: 'blue' },
    ];
  } else if (role === 'supplier' || role === 'processor') {
    heading = role === 'supplier' ? 'Packer / handler position snapshot' : 'Processor inbound position';
    stats = [
      { label: 'Uncommitted inventory',     value: fmtM(latest.uncommitted_lbs),    sub: `${latestCY} industry total`,                         accent: 'amber' },
      { label: 'Sold % (committed + ship)', value: soldPct != null ? soldPct.toFixed(1) + '%' : '—', sub: 'higher = stronger pricing power', accent: 'green' },
      { label: 'Top variety in receipts',   value: topVariety[0],                   sub: `${fmtM(topVariety[1])} lbs · ${topVarietyPct.toFixed(0)}%`, accent: 'blue' },
    ];
  } else if (role === 'broker') {
    heading = 'Arbitrage signals — where the flow is heading';
    stats = [
      { label: 'Export shipped (latest)',   value: fmtM(latest.export_shipped_lbs), sub: `${latestCY} · month ${latest.report_month}`,        accent: 'amber' },
      { label: 'Shipment YoY',              value: shipYoY != null ? (shipYoY >= 0 ? '+' : '') + shipYoY.toFixed(1) + '%' : '—', sub: 'vs same month prior year',                  accent: shipYoY >= 0 ? 'green' : 'red' },
      { label: 'New export commitments',    value: fmtM(latest.export_new_commitments_lbs), sub: 'signals buying pressure',                   accent: 'cyan' },
    ];
  } else if (role === 'buyer' || role === 'trader') {
    heading = 'Buy-side timing signals';
    stats = [
      { label: 'Uncommitted supply',        value: fmtM(latest.uncommitted_lbs),    sub: 'what is still on offer',                            accent: 'amber' },
      { label: 'Sold %',                    value: soldPct != null ? soldPct.toFixed(1) + '%' : '—', sub: soldPct > 70 ? 'tight market — firm prices' : 'room to negotiate', accent: soldPct > 70 ? 'red' : 'green' },
      { label: 'Export shipment YoY',       value: shipYoY != null ? (shipYoY >= 0 ? '+' : '') + shipYoY.toFixed(1) + '%' : '—', sub: 'demand velocity',                           accent: shipYoY >= 0 ? 'green' : 'amber' },
    ];
  } else if (isInternal) {
    heading = 'MAXONS internal — full position view';
    stats = [
      { label: 'Uncommitted',               value: fmtM(latest.uncommitted_lbs),    sub: 'sellable inventory',                                 accent: 'amber' },
      { label: 'Total shipped (latest)',    value: fmtM(latest.total_shipped_lbs),  sub: `${latestCY} · M${latest.report_month}`,              accent: 'blue' },
      { label: 'Top variety · receipts',    value: topVariety[0],                   sub: `${topVarietyPct.toFixed(0)}% of ${latestCY}`,        accent: 'purple' },
    ];
  }

  if (stats.length === 0) return null;

  return (
    <div className="mb-6">
      <p className="text-[11px] uppercase tracking-wider text-gray-500 mb-2 ml-1">{heading}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {stats.map(s => <Stat key={s.label} {...s} />)}
      </div>
    </div>
  );
}
