import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const DEAL_STAGES = ['inquiry', 'quoted', 'negotiation', 'agreed', 'contracted', 'shipped', 'completed', 'lost'];
const STAGE_COLORS = {
  inquiry: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  quoted: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  negotiation: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  agreed: 'bg-green-500/20 text-green-400 border-green-500/30',
  contracted: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  shipped: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  lost: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const CONTACT_TYPE_COLORS = {
  buyer: 'text-green-400',
  supplier: 'text-blue-400',
  broker: 'text-amber-400',
  logistics: 'text-cyan-400',
  industry: 'text-purple-400',
};

// Sample data for demonstration
const SAMPLE_CONTACTS = [
  { id: 1, contact_type: 'buyer', company_name: 'Al Rayyan Foods', contact_name: 'Ahmed Al-Rashid', email: 'ahmed@alrayyanfoods.ae', country: 'United Arab Emirates', region: 'middle_east', relationship_score: 85, total_volume_lbs: 2200000, total_interactions: 34, last_interaction_at: '2026-04-18T10:00:00Z', ai_next_action: 'Follow up on Q3 volume commitment', tags: ['premium', 'repeat'] },
  { id: 2, contact_type: 'buyer', company_name: 'Delhi Dry Fruits Co.', contact_name: 'Rajesh Kumar', email: 'rajesh@delhidryfruits.in', country: 'India', region: 'asia', relationship_score: 72, total_volume_lbs: 1500000, total_interactions: 18, last_interaction_at: '2026-04-15T14:00:00Z', ai_next_action: 'Send updated Nonpareil pricing for 2025/26', tags: ['growing'] },
  { id: 3, contact_type: 'supplier', company_name: 'Blue Diamond Growers', contact_name: 'Sarah Johnson', email: 'sarah@bdg.com', country: 'United States', region: 'americas', relationship_score: 90, total_volume_lbs: 5000000, total_interactions: 56, last_interaction_at: '2026-04-20T09:00:00Z', ai_next_action: 'Negotiate 2025/26 supply agreement', tags: ['key-supplier', 'california'] },
  { id: 4, contact_type: 'buyer', company_name: 'Europa Nuts GmbH', contact_name: 'Klaus Weber', email: 'klaus@europanuts.de', country: 'Germany', region: 'europe', relationship_score: 65, total_volume_lbs: 800000, total_interactions: 12, last_interaction_at: '2026-04-10T11:00:00Z', ai_next_action: 'Share EU MRL compliance docs', tags: ['eu-market'] },
  { id: 5, contact_type: 'broker', company_name: 'Pacific Trade Partners', contact_name: 'Michael Chen', email: 'mchen@pacifictrade.com', country: 'United States', region: 'americas', relationship_score: 78, total_volume_lbs: 3200000, total_interactions: 42, last_interaction_at: '2026-04-19T16:00:00Z', ai_next_action: 'Review Q3 spot offer for Carmel 25/27', tags: ['broker', 'spot'] },
  { id: 6, contact_type: 'buyer', company_name: 'Riyadh Food Industries', contact_name: 'Fahad Al-Dosari', email: 'fahad@riyadhfood.sa', country: 'Saudi Arabia', region: 'middle_east', relationship_score: 60, total_volume_lbs: 500000, total_interactions: 8, last_interaction_at: '2026-04-05T08:00:00Z', ai_next_action: 'Schedule intro call to explore blanched almond demand', tags: ['new-lead'] },
];

const SAMPLE_DEALS = [
  { id: 1, contact_id: 1, stage: 'negotiation', variety: 'Nonpareil', grade: '23/25', volume_lbs: 440000, volume_mt: 200, strata_base_price: 3.85, maxons_price: 3.97, margin_pct: 3, total_value_usd: 174680, incoterm: 'CIF', destination_country: 'UAE', confidence_pct: 75, priority: 'high', created_at: '2026-04-10T10:00:00Z', updated_at: '2026-04-18T10:00:00Z' },
  { id: 2, contact_id: 2, stage: 'quoted', variety: 'Nonpareil', grade: '25/27', volume_lbs: 220000, volume_mt: 100, strata_base_price: 3.60, maxons_price: 3.71, margin_pct: 3, total_value_usd: 81620, incoterm: 'CFR', destination_country: 'India', confidence_pct: 50, priority: 'normal', created_at: '2026-04-15T14:00:00Z', updated_at: '2026-04-15T14:00:00Z' },
  { id: 3, contact_id: 5, stage: 'agreed', variety: 'Carmel', grade: '25/27', volume_lbs: 330000, volume_mt: 150, strata_base_price: 3.20, maxons_price: 3.30, margin_pct: 3, total_value_usd: 108900, incoterm: 'FOB', destination_country: 'South Korea', confidence_pct: 90, priority: 'high', created_at: '2026-04-05T09:00:00Z', updated_at: '2026-04-19T16:00:00Z' },
  { id: 4, contact_id: 4, stage: 'inquiry', variety: 'Nonpareil', grade: '23/25', volume_lbs: 110000, volume_mt: 50, strata_base_price: 3.85, maxons_price: 3.97, margin_pct: 3, total_value_usd: 43670, incoterm: 'CIF', destination_country: 'Germany', confidence_pct: 30, priority: 'normal', created_at: '2026-04-20T11:00:00Z', updated_at: '2026-04-20T11:00:00Z' },
  { id: 5, contact_id: 1, stage: 'shipped', variety: 'Butte/Padres', grade: 'Extra #1', volume_lbs: 220000, volume_mt: 100, strata_base_price: 2.90, maxons_price: 2.99, margin_pct: 3, total_value_usd: 65780, incoterm: 'CIF', destination_country: 'UAE', confidence_pct: 95, priority: 'normal', created_at: '2026-03-01T10:00:00Z', updated_at: '2026-04-12T10:00:00Z' },
  { id: 6, contact_id: 6, stage: 'inquiry', variety: 'Nonpareil', grade: 'Blanched', volume_lbs: 55000, volume_mt: 25, strata_base_price: 4.10, maxons_price: 4.22, margin_pct: 3, total_value_usd: 23210, incoterm: 'CFR', destination_country: 'Saudi Arabia', confidence_pct: 20, priority: 'low', created_at: '2026-04-21T08:00:00Z', updated_at: '2026-04-21T08:00:00Z' },
  { id: 7, contact_id: 3, stage: 'contracted', variety: 'Mixed', grade: 'Various', volume_lbs: 1100000, volume_mt: 500, strata_base_price: 3.40, maxons_price: 3.50, margin_pct: 3, total_value_usd: 385000, incoterm: 'FOB', destination_country: 'United States', confidence_pct: 95, priority: 'high', created_at: '2026-02-15T09:00:00Z', updated_at: '2026-04-01T09:00:00Z' },
];

const SAMPLE_ACTIVITIES = [
  { id: 1, contact_id: 1, deal_id: 1, activity_type: 'whatsapp', subject: 'Price discussion for Q3 Nonpareil', outcome: 'positive', created_at: '2026-04-18T10:00:00Z' },
  { id: 2, contact_id: 5, deal_id: 3, activity_type: 'email', subject: 'Carmel 25/27 agreement terms finalized', outcome: 'positive', created_at: '2026-04-19T16:00:00Z' },
  { id: 3, contact_id: 3, deal_id: 7, activity_type: 'meeting', subject: 'Annual supply review + 2025/26 planning', outcome: 'positive', created_at: '2026-04-20T09:00:00Z' },
  { id: 4, contact_id: 4, deal_id: 4, activity_type: 'email', subject: 'Initial inquiry for Nonpareil 23/25', outcome: 'neutral', created_at: '2026-04-20T11:00:00Z' },
  { id: 5, contact_id: 2, deal_id: 2, activity_type: 'offer_sent', subject: 'Nonpareil 25/27 quote — $3.71/lb CFR Mumbai', outcome: 'neutral', created_at: '2026-04-15T14:00:00Z' },
  { id: 6, contact_id: 6, deal_id: 6, activity_type: 'call', subject: 'Introduction call — exploring blanched demand', outcome: 'positive', created_at: '2026-04-21T08:00:00Z' },
];

function fmtUSD(n) { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function fmtLbs(n) { return (n || 0).toLocaleString('en-US') + ' lbs'; }
function fmtDate(d) { return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'; }

function StageBadge({ stage }) {
  const cls = STAGE_COLORS[stage] || STAGE_COLORS.inquiry;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${cls}`}>{stage}</span>;
}

function ScoreBar({ score }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-amber-500' : score >= 40 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] text-gray-500">{score}</span>
    </div>
  );
}

function ActivityIcon({ type }) {
  const icons = {
    email: '📧', call: '📞', meeting: '🤝', whatsapp: '💬',
    offer_sent: '📤', offer_received: '📥', note: '📝', stage_change: '🔄',
  };
  return <span className="text-sm">{icons[type] || '📋'}</span>;
}

export default function CRM() {
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSample, setIsSample] = useState(false);
  const [activeTab, setActiveTab] = useState('pipeline');

  useEffect(() => { loadCRM(); }, []);

  async function loadCRM() {
    setLoading(true);
    try {
      const [cRes, dRes, aRes] = await Promise.all([
        supabase.from('crm_contacts').select('*').order('relationship_score', { ascending: false }).limit(100),
        supabase.from('crm_deals').select('*').order('updated_at', { ascending: false }).limit(100),
        supabase.from('crm_activities').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      const hasContacts = !cRes.error && cRes.data?.length > 0;
      const hasDeals = !dRes.error && dRes.data?.length > 0;

      if (hasContacts) {
        setContacts(cRes.data);
        setDeals(hasDeals ? dRes.data : SAMPLE_DEALS);
        setActivities(!aRes.error && aRes.data?.length > 0 ? aRes.data : SAMPLE_ACTIVITIES);
        setIsSample(!hasDeals);
      } else {
        setContacts(SAMPLE_CONTACTS);
        setDeals(SAMPLE_DEALS);
        setActivities(SAMPLE_ACTIVITIES);
        setIsSample(true);
      }
    } catch {
      setContacts(SAMPLE_CONTACTS);
      setDeals(SAMPLE_DEALS);
      setActivities(SAMPLE_ACTIVITIES);
      setIsSample(true);
    }
    setLoading(false);
  }

  // Pipeline stats
  const activeStages = ['inquiry', 'quoted', 'negotiation', 'agreed', 'contracted', 'shipped'];
  const activeDeals = deals.filter(d => activeStages.includes(d.stage));
  const totalPipelineValue = activeDeals.reduce((s, d) => s + (d.total_value_usd || 0), 0);
  const totalVolumeLbs = activeDeals.reduce((s, d) => s + (d.volume_lbs || 0), 0);
  const avgConfidence = activeDeals.length > 0
    ? Math.round(activeDeals.reduce((s, d) => s + (d.confidence_pct || 0), 0) / activeDeals.length)
    : 0;
  const weightedValue = activeDeals.reduce((s, d) => s + (d.total_value_usd || 0) * (d.confidence_pct || 0) / 100, 0);

  // Stage pipeline counts
  const stageCounts = {};
  const stageValues = {};
  DEAL_STAGES.forEach(s => { stageCounts[s] = 0; stageValues[s] = 0; });
  deals.forEach(d => {
    stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
    stageValues[d.stage] = (stageValues[d.stage] || 0) + (d.total_value_usd || 0);
  });

  // Contact type breakdown
  const typeCounts = {};
  contacts.forEach(c => { typeCounts[c.contact_type] = (typeCounts[c.contact_type] || 0) + 1; });

  // Lookup contact by id
  const contactMap = {};
  contacts.forEach(c => { contactMap[c.id] = c; });

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
          <h1 className="text-2xl font-bold text-white">
            CRM & Trade Pipeline
            {isSample && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-medium uppercase tracking-wider ml-2 align-middle">Sample Data</span>}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage contacts, track deals, and monitor your trade pipeline
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Pipeline Value</p>
          <p className="text-xl font-bold text-white mt-1">{fmtUSD(totalPipelineValue)}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">Weighted: {fmtUSD(weightedValue)}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Active Deals</p>
          <p className="text-xl font-bold text-white mt-1">{activeDeals.length}</p>
          <p className="text-[10px] text-gray-600 mt-0.5">{fmtLbs(totalVolumeLbs)}</p>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Avg Confidence</p>
          <p className="text-xl font-bold text-white mt-1">{avgConfidence}%</p>
          <div className="w-full h-1.5 bg-gray-800 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${avgConfidence}%` }} />
          </div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Total Contacts</p>
          <p className="text-xl font-bold text-white mt-1">{contacts.length}</p>
          <div className="flex items-center gap-2 mt-1">
            {Object.entries(typeCounts).map(([type, count]) => (
              <span key={type} className={`text-[10px] ${CONTACT_TYPE_COLORS[type] || 'text-gray-400'}`}>
                {count} {type}s
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
        {['pipeline', 'contacts', 'activity'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Pipeline View */}
      {activeTab === 'pipeline' && (
        <div className="space-y-4">
          {/* Stage funnel */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Deal Pipeline</h3>
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
              {DEAL_STAGES.map(stage => (
                <div key={stage} className="text-center">
                  <div className={`rounded-lg p-2 border ${STAGE_COLORS[stage]}`}>
                    <p className="text-lg font-bold">{stageCounts[stage]}</p>
                  </div>
                  <p className="text-[9px] text-gray-500 mt-1 capitalize">{stage}</p>
                  <p className="text-[9px] text-gray-600">{fmtUSD(stageValues[stage])}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Deal list */}
          <div className="space-y-2">
            {deals.filter(d => d.stage !== 'completed' && d.stage !== 'lost').map(deal => {
              const contact = contactMap[deal.contact_id];
              return (
                <div key={deal.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <StageBadge stage={deal.stage} />
                        {deal.priority === 'high' && <span className="text-[10px] text-red-400">HIGH</span>}
                        {deal.priority === 'urgent' && <span className="text-[10px] text-red-500 font-bold">URGENT</span>}
                      </div>
                      <h4 className="text-sm font-medium text-white">
                        {deal.variety} {deal.grade} — {deal.destination_country}
                      </h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {contact?.company_name || 'Unknown'} ({contact?.contact_name || '—'})
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-white">{fmtUSD(deal.total_value_usd)}</p>
                      <p className="text-[10px] text-gray-500">{deal.volume_mt} MT | {deal.incoterm}</p>
                      <p className="text-[10px] text-gray-600 mt-0.5">${deal.maxons_price}/lb</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-800/50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] text-gray-500">
                        <span>Confidence:</span>
                        <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${deal.confidence_pct}%` }} />
                        </div>
                        <span>{deal.confidence_pct}%</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-600">{fmtDate(deal.updated_at)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Contacts View */}
      {activeTab === 'contacts' && (
        <div className="space-y-2">
          {contacts.map(contact => (
            <div key={contact.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] font-medium capitalize ${CONTACT_TYPE_COLORS[contact.contact_type] || 'text-gray-400'}`}>
                      {contact.contact_type}
                    </span>
                    {contact.tags?.map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">{tag}</span>
                    ))}
                  </div>
                  <h4 className="text-sm font-medium text-white">{contact.company_name}</h4>
                  <p className="text-xs text-gray-500">{contact.contact_name} — {contact.country}</p>
                  {contact.ai_next_action && (
                    <p className="text-xs text-amber-400/70 mt-1.5 italic">
                      Next: {contact.ai_next_action}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0 space-y-1">
                  <ScoreBar score={contact.relationship_score} />
                  <p className="text-[10px] text-gray-500">{fmtLbs(contact.total_volume_lbs)} lifetime</p>
                  <p className="text-[10px] text-gray-600">{contact.total_interactions} interactions</p>
                  <p className="text-[10px] text-gray-600">Last: {fmtDate(contact.last_interaction_at)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Activity View */}
      {activeTab === 'activity' && (
        <div className="space-y-2">
          {activities.map(act => {
            const contact = contactMap[act.contact_id];
            return (
              <div key={act.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
                <div className="flex items-start gap-3">
                  <ActivityIcon type={act.activity_type} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[10px] text-gray-500 capitalize">{act.activity_type.replace('_', ' ')}</span>
                      {act.outcome && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          act.outcome === 'positive' ? 'bg-green-500/10 text-green-400' :
                          act.outcome === 'negative' ? 'bg-red-500/10 text-red-400' :
                          'bg-gray-500/10 text-gray-400'
                        }`}>
                          {act.outcome}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white">{act.subject}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {contact?.company_name || '—'} ({contact?.contact_name || '—'})
                    </p>
                  </div>
                  <span className="text-[10px] text-gray-600 shrink-0">{fmtDate(act.created_at)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How This CRM Works */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How This CRM Works</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          This CRM is built specifically for almond trading. Every contact is scored by relationship health (0-100),
          deals track from initial inquiry through shipment with real Strata pricing + MAXONS margin.
          AI analyzes each relationship and suggests next actions. As the platform grows,
          emails, WhatsApp messages, and trade documents will auto-feed into the activity log.
        </p>
      </div>
    </div>
  );
}
