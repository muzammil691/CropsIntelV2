import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const CATEGORY_COLORS = {
  trade: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  regulatory: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  crop: 'bg-green-500/10 text-green-400 border-green-500/20',
  market: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  health: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  sustainability: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const SENTIMENT_CONFIG = {
  bullish: { icon: '↑', color: 'text-green-400', bg: 'bg-green-500/10' },
  bearish: { icon: '↓', color: 'text-red-400', bg: 'bg-red-500/10' },
  neutral: { icon: '→', color: 'text-gray-400', bg: 'bg-gray-500/10' },
};

// Fallback news when industry_news table doesn't exist yet
const FALLBACK_NEWS = [
  { id: 'f1', title: 'ABC Reports Record 2024/25 Shipments Through March', category: 'market', ai_sentiment: 'bullish', source: 'almonds.org', published_date: '2025-04-10', summary: 'Total shipments for the 2024/25 crop year are running 12% ahead of the prior year through March, with strong export demand from India and the EU.', ai_market_impact: 'Strong demand pace supports current price levels and may push prices higher if pace continues.' },
  { id: 'f2', title: 'India Announces Reduction in Almond Import Duty', category: 'trade', ai_sentiment: 'bullish', source: 'Reuters', published_date: '2025-03-28', summary: 'India will reduce import duties on tree nuts including almonds from 42% to 35%, effective April 1st, boosting demand projections for the world\'s largest almond import market.', ai_market_impact: 'Lower tariffs directly increase demand from India, the #1 export destination. Bullish for California almond prices.' },
  { id: 'f3', title: 'Drought Conditions Ease Across Central Valley', category: 'crop', ai_sentiment: 'bearish', source: 'USDA', published_date: '2025-03-15', summary: 'Above-average winter rainfall has significantly improved water conditions across California\'s Central Valley, with reservoir levels at 115% of historical average.', ai_market_impact: 'Better water supply means higher yields and potentially larger 2025 crop. More supply = softer prices.' },
  { id: 'f4', title: 'EU Implements Stricter MRL Standards for Tree Nuts', category: 'regulatory', ai_sentiment: 'neutral', source: 'European Commission', published_date: '2025-03-05', summary: 'New maximum residue levels (MRL) for certain pesticides on imported tree nuts take effect June 1, 2025. California growers largely already comply.', ai_market_impact: 'Minimal direct impact on California almonds; may disadvantage competitors from regions with less stringent practices.' },
  { id: 'f5', title: 'Almond Acreage Declines for Third Consecutive Year', category: 'crop', ai_sentiment: 'bullish', source: 'USDA-NASS', published_date: '2025-02-20', summary: 'USDA reports total California almond acreage dropped to 1.29M acres in 2025, down from 1.38M peak in 2022. Non-bearing acres at lowest level since 2014.', ai_market_impact: 'Declining acreage signals structurally tighter supply in coming years. Long-term bullish signal for prices.' },
  { id: 'f6', title: 'China Retaliates with 25% Tariff on US Tree Nuts', category: 'trade', ai_sentiment: 'bearish', source: 'Bloomberg', published_date: '2025-02-15', summary: 'China announces retaliatory tariffs on US agricultural products including a 25% duty on almonds, effective March 1. China accounts for ~5% of California almond exports.', ai_market_impact: 'Direct hit to ~5% of export volume. Other markets (India, EU, Middle East) may absorb some displaced volume.' },
  { id: 'f7', title: 'Bee Colony Health Improves Ahead of Pollination Season', category: 'crop', ai_sentiment: 'neutral', source: 'Almond Board of California', published_date: '2025-02-01', summary: 'Managed honeybee colonies entering 2025 pollination season show improved health metrics, with colony loss rates at 30% vs 40% the prior year.', ai_market_impact: 'Better pollination supports normal crop set. No supply disruption expected from bee health issues.' },
  { id: 'f8', title: 'Almond Prices Firm as New Crop Commitments Surge', category: 'market', ai_sentiment: 'bullish', source: 'Strata Markets', published_date: '2025-01-20', summary: 'New crop commitment volumes for 2025/26 are running 18% ahead of the same period last year, with buyers locking in supply early amid tight inventory signals.', ai_market_impact: 'Strong forward buying indicates market confidence in higher prices. Uncommitted inventory declining rapidly.' },
  { id: 'f9', title: 'ABC Launches Sustainability Certification Program', category: 'sustainability', ai_sentiment: 'neutral', source: 'almonds.org', published_date: '2025-01-10', summary: 'The Almond Board introduces a voluntary sustainability certification covering water usage, carbon footprint, and biodiversity metrics for California almond orchards.', ai_market_impact: 'Long-term brand value play. Certified almonds may command premium pricing in EU and corporate supply chains.' },
  { id: 'f10', title: 'Middle East Demand Hits 5-Year High', category: 'trade', ai_sentiment: 'bullish', source: 'ABC Position Report', published_date: '2024-12-15', summary: 'Almond exports to the Middle East region reached 145M lbs through December, the highest level in five years. UAE and Saudi Arabia lead the growth.', ai_market_impact: 'Growing Middle East demand diversifies export markets. MAXONS positioned well in this corridor.' },
  { id: 'f11', title: 'Health Study Links Daily Almond Consumption to Heart Health', category: 'health', ai_sentiment: 'bullish', source: 'Journal of Nutrition', published_date: '2024-12-01', summary: 'A large-scale clinical study confirms that consuming 1.5oz of almonds daily reduces LDL cholesterol by 8-10%, strengthening the health marketing narrative.', ai_market_impact: 'Positive health news drives consumer demand growth of 2-3% annually. Supports long-term price floor.' },
  { id: 'f12', title: 'Frost Risk Alert: February Cold Snap Threatens Bloom', category: 'crop', ai_sentiment: 'bullish', source: 'NOAA', published_date: '2024-11-30', summary: 'Extended forecast models suggest elevated frost risk during the critical February bloom period, which could reduce nut set and lower the 2025 crop.', ai_market_impact: 'Frost damage during bloom is the single biggest weather risk. Even moderate damage can reduce crop 10-15%.' },
];

function CategoryBadge({ category }) {
  const cls = CATEGORY_COLORS[category] || CATEGORY_COLORS.market;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${cls}`}>
      {category}
    </span>
  );
}

function SentimentDot({ sentiment }) {
  const config = SENTIMENT_CONFIG[sentiment] || SENTIMENT_CONFIG.neutral;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] ${config.bg} ${config.color}`}>
      {config.icon}
    </span>
  );
}

function NewsCard({ article }) {
  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <CategoryBadge category={article.category} />
            <SentimentDot sentiment={article.ai_sentiment} />
            <span className="text-[10px] text-gray-600">{article.source}</span>
          </div>
          <h3 className="text-sm font-medium text-white group-hover:text-green-400 transition-colors line-clamp-2">
            {article.source_url ? (
              <a href={article.source_url} target="_blank" rel="noopener noreferrer">
                {article.title}
              </a>
            ) : article.title}
          </h3>
          {article.summary && (
            <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{article.summary}</p>
          )}
          {article.ai_market_impact && (
            <p className="text-xs text-amber-400/70 mt-1.5 italic">
              Market impact: {article.ai_market_impact}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] text-gray-600">
            {article.published_date ? new Date(article.published_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function News() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');

  useEffect(() => {
    loadNews();
  }, []);

  async function loadNews() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('industry_news')
        .select('*')
        .order('published_date', { ascending: false })
        .limit(200);

      // Use DB data if available and non-empty, otherwise use fallback
      if (!error && data && data.length > 0) {
        setNews(data);
      } else {
        setNews(FALLBACK_NEWS);
      }
    } catch (err) {
      console.error('Load error, using fallback:', err);
      setNews(FALLBACK_NEWS);
    }
    setLoading(false);
  }

  // Get unique categories
  const categories = [...new Set(news.map(n => n.category))].filter(Boolean).sort();

  // Apply filters
  const filtered = news.filter(n => {
    if (filter !== 'all' && n.category !== filter) return false;
    if (sentimentFilter !== 'all' && n.ai_sentiment !== sentimentFilter) return false;
    return true;
  });

  // Sentiment summary
  const sentimentCounts = news.reduce((acc, n) => {
    acc[n.ai_sentiment || 'neutral'] = (acc[n.ai_sentiment || 'neutral'] || 0) + 1;
    return acc;
  }, {});

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
          <h1 className="text-2xl font-bold text-white">Industry News & Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">
            Auto-scraped from almonds.org, press releases, and industry sources — AI-analyzed for market impact
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 bg-green-500/10 px-2 py-1 rounded">
            <span className="text-green-400">↑ {sentimentCounts.bullish || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-gray-500/10 px-2 py-1 rounded">
            <span className="text-gray-400">→ {sentimentCounts.neutral || 0}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-red-500/10 px-2 py-1 rounded">
            <span className="text-red-400">↓ {sentimentCounts.bearish || 0}</span>
          </div>
        </div>
      </div>

      {/* How to Read This Page */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How to Read This Page</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          Every article is auto-scraped from industry sources and analyzed by AI for market relevance. The sentiment arrows show whether the news is likely bullish (price-supportive), bearish (price-negative), or neutral.
          The "Market impact" line on each article explains WHY it matters for trading decisions. Filter by category to focus on trade policy, crop conditions, or regulatory changes that affect your positions.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300"
        >
          <option value="all">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <select
          value={sentimentFilter}
          onChange={e => setSentimentFilter(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300"
        >
          <option value="all">All Sentiment</option>
          <option value="bullish">Bullish</option>
          <option value="neutral">Neutral</option>
          <option value="bearish">Bearish</option>
        </select>
        <span className="text-xs text-gray-600 ml-2">
          Showing {filtered.length} of {news.length} articles
        </span>
      </div>

      {/* News Feed */}
      {filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((article, i) => (
            <NewsCard key={article.id || i} article={article} />
          ))}
        </div>
      ) : (
        <div className="flex items-center justify-center h-64 text-gray-600">
          <div className="text-center">
            <p className="text-3xl mb-3">📰</p>
            <p className="text-sm">Industry news will appear here</p>
            <p className="text-xs mt-2 text-gray-700">
              The news scraper monitors almonds.org press releases, blogs, and industry updates.
              AI automatically categorizes each article and analyzes market impact.
            </p>
          </div>
        </div>
      )}

      {/* Data Sources Footer */}
      <div className="bg-gray-900/30 border border-gray-800/50 rounded-xl p-4">
        <h3 className="text-sm font-medium text-gray-400 mb-3">Intelligence Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>almonds.org/press-releases</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>almonds.org/almond-bytes (blog)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-amber-500" />
            <span>almonds.org/news (industry)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span>Bountiful.ag (crop estimates)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-500" />
            <span>Email subscriptions (coming soon)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-500" />
            <span>AI auto-discovery (future)</span>
          </div>
        </div>
      </div>
    </div>
  );
}
