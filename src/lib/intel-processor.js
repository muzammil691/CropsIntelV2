// CropsIntelV2 — Intel Processing Engine
// Reads market reports (PDF text, emails, articles) → AI analysis → structured insights
// Each processed report enriches the knowledge base, making CropsIntel smarter every day

import { askClaude, loadAPIKeys } from './ai-engine';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

function sbHeaders() {
  return {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

// ─── Core Analysis Prompt ─────────────────────────────────────────
function buildAnalysisPrompt(reportText, sourceInfo, knowledgeContext) {
  return `You are MAXONS Almond Market Intelligence Analyst. You analyze market reports for a large almond trading company based in Dubai.

CONTEXT: You have deep knowledge of the California almond market — ABC position reports, supply/demand dynamics, pricing by variety (Nonpareil, Carmel, Butte/Padres, etc.), global trade flows (India, EU, Middle East, China), and seasonal patterns.

${knowledgeContext ? `EXISTING KNOWLEDGE BASE:\n${knowledgeContext}\n` : ''}
SOURCE: ${sourceInfo.source_name} (${sourceInfo.source_type})
REPORT DATE: ${sourceInfo.report_date || 'Unknown'}
FORMAT: ${sourceInfo.format}

REPORT CONTENT:
---
${reportText.substring(0, 12000)}
---

Analyze this report and respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "title": "Short descriptive title (max 80 chars)",
  "summary": "2-3 sentence executive summary of what matters for almond trading",
  "key_takeaways": ["takeaway 1", "takeaway 2", "takeaway 3"],
  "trading_implication": "Specific actionable advice for MAXONS — what to do, which varieties, which markets",
  "insight_type": "one of: market_update, price_signal, supply_alert, demand_shift, trade_policy, quality_report",
  "sentiment": "one of: bullish, bearish, neutral, mixed",
  "confidence": 0.8,
  "urgency": "one of: low, normal, high, critical",
  "regions": ["array of relevant regions/countries mentioned"],
  "varieties": ["array of almond varieties mentioned"],
  "price_impact": "one of: up, down, stable, uncertain",
  "is_actionable": true,
  "new_facts": [
    {"category": "pricing|supply|demand|trade_flow|quality|regulation|relationship", "fact": "A specific new fact or data point learned", "context": "Supporting detail"}
  ]
}`;
}

// ─── Register a new report ────────────────────────────────────────
export async function registerReport({ title, source_name, source_type, format, raw_text, original_url, original_filename, report_date, source_email, metadata }) {
  const body = {
    title,
    source_name: source_name || 'Unknown Source',
    source_type: source_type || 'handler',
    format: format || 'text',
    raw_text: raw_text || '',
    original_url: original_url || null,
    original_filename: original_filename || null,
    report_date: report_date || null,
    source_email: source_email || null,
    file_size_bytes: raw_text ? new Blob([raw_text]).size : 0,
    status: 'pending',
    metadata: metadata || {},
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/intel_reports`, {
    method: 'POST',
    headers: sbHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`Failed to register report: ${res.status}`);
  const [report] = await res.json();
  return report;
}

// ─── Get existing knowledge for context ───────────────────────────
async function getKnowledgeContext() {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/knowledge_base?is_current=eq.true&order=times_confirmed.desc&limit=30`,
      { headers: sbHeaders() }
    );
    if (!res.ok) return '';
    const facts = await res.json();
    if (!facts.length) return '';
    return facts.map(f => `- [${f.category}] ${f.fact} (confirmed ${f.times_confirmed}x)`).join('\n');
  } catch {
    return '';
  }
}

// ─── Process a report with AI ─────────────────────────────────────
export async function processReport(reportId) {
  // 1. Fetch the report
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/intel_reports?id=eq.${reportId}`,
    { headers: sbHeaders() }
  );
  const [report] = await res.json();
  if (!report) throw new Error('Report not found');
  if (!report.raw_text) throw new Error('Report has no text content');

  // 2. Update status to processing
  await fetch(`${SUPABASE_URL}/rest/v1/intel_reports?id=eq.${reportId}`, {
    method: 'PATCH',
    headers: sbHeaders(),
    body: JSON.stringify({ status: 'processing' }),
  });

  try {
    // 3. Load API keys and get knowledge context
    await loadAPIKeys();
    const knowledgeContext = await getKnowledgeContext();

    // 4. Build prompt and call Claude
    const prompt = buildAnalysisPrompt(report.raw_text, report, knowledgeContext);
    const result = await askClaude(prompt, {
      maxTokens: 2048,
      system: 'You are an expert almond market analyst. Always respond with valid JSON only, no markdown formatting.',
    });

    if (result.error || result.fallback) {
      throw new Error(result.error || 'AI unavailable');
    }

    // 5. Parse the AI response
    const text = result.text || '';
    // Extract JSON from response (handle potential markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI returned non-JSON response');

    const analysis = JSON.parse(jsonMatch[0]);

    // 6. Save insight to intel_insights
    const insight = {
      report_id: reportId,
      title: analysis.title || report.title,
      summary: analysis.summary,
      key_takeaways: analysis.key_takeaways || [],
      trading_implication: analysis.trading_implication || '',
      insight_type: analysis.insight_type || 'market_update',
      sentiment: analysis.sentiment || 'neutral',
      confidence: analysis.confidence || 0.7,
      urgency: analysis.urgency || 'normal',
      regions: analysis.regions || [],
      varieties: analysis.varieties || [],
      price_impact: analysis.price_impact || 'uncertain',
      is_published: true,
      is_actionable: analysis.is_actionable || false,
      ai_model: 'claude',
    };

    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/intel_insights`, {
      method: 'POST',
      headers: sbHeaders(),
      body: JSON.stringify(insight),
    });

    if (!insRes.ok) throw new Error(`Failed to save insight: ${insRes.status}`);
    const [savedInsight] = await insRes.json();

    // 7. Save new facts to knowledge base
    if (analysis.new_facts?.length) {
      const facts = analysis.new_facts.map(f => ({
        category: f.category,
        fact: f.fact,
        context: f.context || '',
        source_report_ids: [reportId],
        confidence: analysis.confidence || 0.7,
        tags: [report.source_type, report.source_name.toLowerCase().replace(/\s+/g, '-')],
      }));

      await fetch(`${SUPABASE_URL}/rest/v1/knowledge_base`, {
        method: 'POST',
        headers: sbHeaders(),
        body: JSON.stringify(facts),
      });
    }

    // 8. Update report status
    await fetch(`${SUPABASE_URL}/rest/v1/intel_reports?id=eq.${reportId}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ status: 'analyzed', processed_at: new Date().toISOString() }),
    });

    return savedInsight;

  } catch (err) {
    // Mark as failed
    await fetch(`${SUPABASE_URL}/rest/v1/intel_reports?id=eq.${reportId}`, {
      method: 'PATCH',
      headers: sbHeaders(),
      body: JSON.stringify({ status: 'failed', error_message: err.message }),
    });
    throw err;
  }
}

// ─── Convenience: Register + Process in one call ──────────────────
export async function ingestReport(reportData) {
  const report = await registerReport(reportData);
  const insight = await processReport(report.id);
  return { report, insight };
}

// ─── Fetch latest intel insights for Dashboard ────────────────────
export async function getLatestInsights(limit = 5) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/intel_insights?is_published=eq.true&order=created_at.desc&limit=${limit}&select=*,intel_reports(source_name,source_type,format)`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return [];
  return res.json();
}

// ─── Get knowledge base stats ─────────────────────────────────────
export async function getKnowledgeStats() {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/knowledge_base?is_current=eq.true&select=category`,
    { headers: sbHeaders() }
  );
  if (!res.ok) return { total: 0, byCategory: {} };
  const facts = await res.json();
  const byCategory = {};
  facts.forEach(f => { byCategory[f.category] = (byCategory[f.category] || 0) + 1; });
  return { total: facts.length, byCategory };
}
