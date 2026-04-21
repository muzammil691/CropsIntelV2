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

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
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
      const [forecastRes, acreageRes, sentimentRes] = await Promise.all([
        supabase.from('abc_forecasts').select('*').order('forecast_year', { ascending: true }),
        supabase.from('abc_acreage_reports').select('*').order('report_year', { ascending: true }),
        supabase.from('ai_analyses').select('*').eq('analysis_type', 'market_sentiment').order('created_at', { ascending: false }).limit(10),
      ]);

      setForecasts(forecastRes.data || []);
      setAcreage(acreageRes.data || []);
      setSentiment(sentimentRes.data || []);
    } catch (err) {
      console.error('Load error:', err);
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
        <ChartCard title="Crop Forecast History" subtitle="Subjective (May) vs Objective (July) vs Community estimates">
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
        <ChartCard title="Bearing Acreage Trends" subtitle="USDA-NASS + Land IQ reports over time">
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
        <ChartCard title="Market Sentiment Timeline" subtitle="AI-analyzed sentiment from Bountiful.ag community estimates">
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
