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

      if (!error) setNews(data || []);
    } catch (err) {
      console.error('Load error:', err);
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
