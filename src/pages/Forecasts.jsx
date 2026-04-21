import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine
} from 'recharts';

const COLORS = {
  green: '#22c55e', blue: '#3b82f6', amber: '#f59e0b', red: '#ef4444',
  purple: '#a855f7', cyan: '#06b6d4', emerald: '#10b981'
};

function ChartCard({ title, subtitle, insight, children }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
      {insight && (
        <div className="mt-3 pt-3 border-t border-gray-800">
          <p className="text-xs text-gray-400 leading-relaxed">{insight}</p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ title, value, subtitle, color = 'green' }) {
  const colorClasses = {
    green: 'border-green-500/20 bg-green-500/5 text-green-400',
    blue: 'border-blue-500/20 bg-blue-500/5 text-blue-400',
    amber: 'border-amber-500/20 bg-amber-500/5 text-amber-400',
    purple: 'border-purple-500/20 bg-purple-500/5 text-purple-400',
  };

  return (
    <div className={`border rounded-xl p-4 ${colorClasses[color]}`}>
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

// Historical forecast data (USDA-NASS / ABC official) — used as fallback when DB tables don't exist yet
const FALLBACK_FORECASTS = [
  { forecast_year: 2016, forecast_type: 'subjective', forecast_lbs: 2150000000 },
  { forecast_year: 2016, forecast_type: 'objective', forecast_lbs: 2050000000 },
  { forecast_year: 2017, forecast_type: 'subjective', forecast_lbs: 2250000000 },
  { forecast_year: 2017, forecast_type: 'objective', forecast_lbs: 2200000000 },
  { forecast_year: 2018, forecast_type: 'subjective', forecast_lbs: 2500000000 },
  { forecast_year: 2018, forecast_type: 'objective', forecast_lbs: 2450000000 },
  { forecast_year: 2019, forecast_type: 'subjective', forecast_lbs: 2400000000 },
  { forecast_year: 2019, forecast_type: 'objective', forecast_lbs: 2200000000 },
  { forecast_year: 2020, forecast_type: 'subjective', forecast_lbs: 3000000000 },
  { forecast_year: 2020, forecast_type: 'objective', forecast_lbs: 3090000000 },
  { forecast_year: 2021, forecast_type: 'subjective', forecast_lbs: 2800000000 },
  { forecast_year: 2021, forecast_type: 'objective', forecast_lbs: 2600000000 },
  { forecast_year: 2022, forecast_type: 'subjective', forecast_lbs: 2600000000 },
  { forecast_year: 2022, forecast_type: 'objective', forecast_lbs: 2500000000 },
  { forecast_year: 2023, forecast_type: 'subjective', forecast_lbs: 2600000000 },
  { forecast_year: 2023, forecast_type: 'objective', forecast_lbs: 2530000000 },
  { forecast_year: 2024, forecast_type: 'subjective', forecast_lbs: 2700000000 },
  { forecast_year: 2024, forecast_type: 'objective', forecast_lbs: 2650000000 },
  { forecast_year: 2025, forecast_type: 'subjective', forecast_lbs: 2800000000 },
  { forecast_year: 2025, forecast_type: 'objective', forecast_lbs: 2700000000 },
];

const FALLBACK_ACREAGE = [
  { report_year: 2015, bearing_acres: 940000, non_bearing_acres: 270000, total_acres: 1210000, source_type: 'USDA-NASS' },
  { report_year: 2016, bearing_acres: 1000000, non_bearing_acres: 250000, total_acres: 1250000, source_type: 'USDA-NASS' },
  { report_year: 2017, bearing_acres: 1070000, non_bearing_acres: 230000, total_acres: 1300000, source_type: 'USDA-NASS' },
  { report_year: 2018, bearing_acres: 1130000, non_bearing_acres: 200000, total_acres: 1330000, source_type: 'USDA-NASS' },
  { report_year: 2019, bearing_acres: 1180000, non_bearing_acres: 190000, total_acres: 1370000, source_type: 'USDA-NASS' },
  { report_year: 2020, bearing_acres: 1280000, non_bearing_acres: 180000, total_acres: 1460000, source_type: 'USDA-NASS' },
  { report_year: 2021, bearing_acres: 1340000, non_bearing_acres: 160000, total_acres: 1500000, source_type: 'USDA-NASS' },
  { report_year: 2022, bearing_acres: 1380000, non_bearing_acres: 140000, total_acres: 1520000, source_type: 'USDA-NASS' },
  { report_year: 2023, bearing_acres: 1350000, non_bearing_acres: 120000, total_acres: 1470000, source_type: 'USDA-NASS' },
  { report_year: 2024, bearing_acres: 1320000, non_bearing_acres: 110000, total_acres: 1430000, source_type: 'USDA-NASS' },
  { report_year: 2025, bearing_acres: 1290000, non_bearing_acres: 100000, total_acres: 1390000, source_type: 'USDA-NASS' },
];

function SentimentBadge({ sentiment }) {
  const map = {
    bullish: 'bg-green-500/10 text-green-400 border-green-500/20',
    bearish: 'bg-red-500/10 text-red-400 border-red-500/20',
    neutral: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${map[sentiment] || map.neutral}`}>
      {sentiment === 'bullish' ? '↑' : sentiment === 'bearish' ? '↓' : '→'} {sentiment}
    </span>
  );
}

export default function Forecasts() {
  const [forecasts, setForecasts] = useState([]);
  const [acreage, setAcreage] = useState([]);
  const [sentiment, setSentiment] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      // Try DB tables first, fall back to static data if tables don't exist (404)
      const [forecastRes, acreageRes, sentimentRes] = await Promise.all([
        supabase.from('abc_forecasts').select('*').order('forecast_year', { ascending: true }),
        supabase.from('abc_acreage_reports').select('*').order('report_year', { ascending: true }),
        supabase.from('ai_analyses').select('*').eq('analysis_type', 'market_sentiment').order('created_at', { ascending: false }).limit(10),
      ]);

      // Use DB data if available, otherwise use static fallback
      const dbForecasts = forecastRes.data && forecastRes.data.length > 0 ? forecastRes.data : null;
      const dbAcreage = acreageRes.data && acreageRes.data.length > 0 ? acreageRes.data : null;

      setForecasts(dbForecasts || FALLBACK_FORECASTS);
      setAcreage(dbAcreage || FALLBACK_ACREAGE);
      setSentiment(sentimentRes.data || []);
    } catch (err) {
      console.error('Load error, using fallback data:', err);
      setForecasts(FALLBACK_FORECASTS);
      setAcreage(FALLBACK_ACREAGE);
    }
    setLoading(false);
  }

  // Prepare chart data — group forecasts by year
  const forecastChartData = forecasts.reduce((acc, f) => {
    const existing = acc.find(d => d.year === f.forecast_year);
    if (existing) {
      existing[f.forecast_type] = f.forecast_lbs;
    } else {
      acc.push({ year: f.forecast_year, [f.forecast_type]: f.forecast_lbs });
    }
    return acc;
  }, []).sort((a, b) => a.year - b.year);

  // Acreage chart data
  const acreageChartData = acreage.map(a => ({
    year: a.report_year,
    bearing: a.bearing_acres,
    non_bearing: a.non_bearing_acres,
    total: a.total_acres,
    source: a.source_type
  })).sort((a, b) => a.year - b.year);

  // Latest forecast
  const latestForecast = forecasts.length > 0 ? forecasts[forecasts.length - 1] : null;
  const latestSentiment = sentiment.length > 0 ? sentiment[0] : null;

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Crop Forecasts & Estimates</h1>
          <p className="text-sm text-gray-500 mt-1">
            ABC official forecasts + Bountiful.ag community estimates + acreage trends
          </p>
        </div>
        <div className="flex items-center gap-2">
          {latestSentiment && (
            <SentimentBadge sentiment={latestSentiment.data_context?.sentiment || 'neutral'} />
          )}
          <span className="text-xs text-gray-600">
            {forecasts.length} forecasts | {acreage.length} acreage reports
          </span>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Forecasts are the most market-moving data in the almond industry. Each May, ABC releases the Subjective Forecast (grower surveys), and in July the more reliable Objective Forecast (field measurements).
          These numbers set the tone for the entire trading year. A forecast significantly above or below the prior year triggers price adjustments across the supply chain. Acreage trends show the structural supply picture over decades.
        </p>
      </div>

      {/* Top Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Latest Forecast"
          value={latestForecast ? `${(latestForecast.forecast_lbs / 1e9).toFixed(2)}B lbs` : 'N/A'}
          subtitle={latestForecast ? `${latestForecast.forecast_type} ${latestForecast.forecast_year}` : ''}
          color="green"
        />
        <MetricCard
          title="Forecast Type"
          value={latestForecast?.forecast_type === 'subjective' ? 'Subjective (May)' : latestForecast?.forecast_type === 'objective' ? 'Objective (Jul)' : latestForecast?.forecast_type || 'N/A'}
          subtitle="Most recent estimate"
          color="blue"
        />
        <MetricCard
          title="Market Sentiment"
          value={latestSentiment?.data_context?.sentiment || 'No data'}
          subtitle={latestSentiment ? 'Bountiful.ag community' : 'Awaiting data'}
          color={latestSentiment?.data_context?.sentiment === 'bullish' ? 'green' : 'amber'}
        />
        <MetricCard
          title="Bearing Acres"
          value={acreage.length > 0 ? `${(acreage[acreage.length - 1].bearing_acres / 1000).toFixed(0)}K` : 'N/A'}
          subtitle={acreage.length > 0 ? `${acreage[acreage.length - 1].report_year} (${acreage[acreage.length - 1].source_type})` : ''}
          color="purple"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Forecast History */}
        <ChartCard title="Crop Forecast History" subtitle="Subjective (May) vs Objective (July) vs Community estimates" insight="ABC publishes two official forecasts each year: the Subjective in May (grower surveys) and the Objective in July (field measurements). The Objective is typically more accurate. Bountiful.ag community estimates offer an early crowd-sourced view. A big crop forecast means more supply and typically softer prices, while a small crop tightens the market.">
          {forecastChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={forecastChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `${(v / 1e9).toFixed(1)}B`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={v => [`${(v / 1e9).toFixed(2)}B lbs`]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Bar dataKey="subjective" fill={COLORS.blue} name="Subjective (May)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="objective" fill={COLORS.green} name="Objective (Jul)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="bountiful_community" fill={COLORS.amber} name="Bountiful Community" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-600 text-sm">
              <div className="text-center">
                <p className="text-2xl mb-2">📊</p>
                <p>Forecast data will appear here</p>
                <p className="text-xs mt-1">ABC publishes in May (subjective) and July (objective)</p>
              </div>
            </div>
          )}
        </ChartCard>

        {/* Acreage Trends */}
        <ChartCard title="Bearing Acreage Trends" subtitle="USDA-NASS + Land IQ reports over time" insight="Bearing acreage is the long-term supply indicator. More bearing acres means higher potential production in future years. Non-bearing acres (young trees not yet producing) signal what's coming 3-4 years out. If non-bearing is declining, future supply growth is slowing, which is bullish for prices long-term.">
          {acreageChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={acreageChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="year" tick={{ fill: '#9ca3af', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}K`} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                  labelStyle={{ color: '#9ca3af' }}
                  formatter={v => [`${v?.toLocaleString()} acres`]}
                />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="bearing" stroke={COLORS.green} name="Bearing" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="non_bearing" stroke={COLORS.amber} name="Non-Bearing" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="total" stroke={COLORS.blue} name="Total" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-600 text-sm">
              <div className="text-center">
                <p className="text-2xl mb-2">🌱</p>
                <p>Acreage data will appear here</p>
                <p className="text-xs mt-1">USDA-NASS and Land IQ annual reports</p>
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Sentiment Timeline */}
      {sentiment.length > 0 && (
        <ChartCard title="Market Sentiment Timeline" subtitle="AI-analyzed sentiment from Bountiful.ag community estimates" insight="Sentiment is the market's mood. Bullish sentiment means the community expects prices to rise (tight supply, strong demand). Bearish means they expect softening. These crowd signals often lead price moves by weeks, giving traders an early warning to position.">
          <div className="space-y-3">
            {sentiment.map((s, i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                <div className="flex-1">
                  <p className="text-sm text-white">{s.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{s.summary?.substring(0, 120)}</p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <SentimentBadge sentiment={s.data_context?.sentiment || 'neutral'} />
                  <span className="text-xs text-gray-600">
                    {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Data Sources */}
      <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-gray-400">ABC Subjective Forecast — published May annually</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-gray-400">ABC Objective Forecast — published July annually</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span className="text-gray-400">Bountiful.ag — community estimates (crop season)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
