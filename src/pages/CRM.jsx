import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

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

const TIER_COLORS = {
  guest: 'bg-gray-500/20 text-gray-400',
  registered: 'bg-blue-500/20 text-blue-400',
  verified: 'bg-green-500/20 text-green-400',
  maxons_team: 'bg-purple-500/20 text-purple-400',
  admin: 'bg-red-500/20 text-red-400',
};

const ROLE_OPTIONS = [
  { value: 'buyer', label: 'Buyer' },
  { value: 'supplier', label: 'Supplier' },
  { value: 'broker', label: 'Broker' },
  { value: 'admin', label: 'Admin' },
  { value: 'trader', label: 'Trader' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'logistics', label: 'Logistics' },
  { value: 'finance', label: 'Finance' },
];

export default function CRM() {
  const { user, profile } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [deals, setDeals] = useState([]);
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('pipeline');
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvResult, setCsvResult] = useState(null);
  const csvFileRef = useRef(null);

  useEffect(() => { loadCRM(); loadUsers(); }, []);

  async function loadCRM() {
    setLoading(true);
    try {
      const [cRes, dRes, aRes] = await Promise.all([
        supabase.from('crm_contacts').select('*').order('relationship_score', { ascending: false }).limit(100),
        supabase.from('crm_deals').select('*').order('updated_at', { ascending: false }).limit(100),
        supabase.from('crm_activities').select('*').order('created_at', { ascending: false }).limit(50),
      ]);

      setContacts(!cRes.error && cRes.data?.length > 0 ? cRes.data : []);
      setDeals(!dRes.error && dRes.data?.length > 0 ? dRes.data : []);
      setActivities(!aRes.error && aRes.data?.length > 0 ? aRes.data : []);
    } catch {
      setContacts([]);
      setDeals([]);
      setActivities([]);
    }
    setLoading(false);
  }

  async function loadUsers() {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setUsers(data);
    } catch { /* table may not exist */ }
  }

  async function handleCSVImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvImporting(true);
    setCsvResult(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
      const rows = lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const obj = {};
        headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
        return obj;
      });

      // Map CSV columns to CRM contacts
      let imported = 0;
      let skipped = 0;
      for (const row of rows) {
        const name = row.name || row.company_name || row.contact_name || '';
        const email = row.email || row.email_address || '';
        const company = row.company || row.company_name || '';
        if (!name && !email) { skipped++; continue; }

        const { error } = await supabase.from('crm_contacts').upsert({
          company_name: company || name,
          contact_name: name,
          email: email,
          phone: row.phone || row.phone_number || '',
          country: row.country || '',
          city: row.city || '',
          contact_type: row.type || row.contact_type || 'buyer',
          relationship_score: parseInt(row.score || row.relationship_score || '50') || 50,
          notes: row.notes || '',
          whatsapp: row.whatsapp || row.whatsapp_number || '',
        }, { onConflict: 'email' });

        if (!error) imported++;
        else skipped++;
      }

      setCsvResult({ imported, skipped, total: rows.length });
      loadCRM(); // Refresh contacts
    } catch (err) {
      setCsvResult({ error: err.message });
    }
    setCsvImporting(false);
    if (csvFileRef.current) csvFileRef.current.value = '';
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
        {['pipeline', 'contacts', 'activity', 'users'].map(tab => (
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

      {/* Users & Admin Panel */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          {/* Import & Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors">
                {csvImporting ? 'Importing...' : 'Import CSV'}
                <input
                  ref={csvFileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVImport}
                  disabled={csvImporting}
                />
              </label>
              <span className="text-[10px] text-gray-500">Upload customer list (name, email, company, country, type)</span>
            </div>
            {csvResult && (
              <span className={`text-xs ${csvResult.error ? 'text-red-400' : 'text-green-400'}`}>
                {csvResult.error || `Imported ${csvResult.imported} of ${csvResult.total} (${csvResult.skipped} skipped)`}
              </span>
            )}
          </div>

          {/* Registered Users */}
          <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Registered Users ({users.length})</h3>
              <div className="flex items-center gap-2">
                {['all', 'maxons_team', 'verified', 'registered'].map(t => (
                  <button key={t} className="text-[10px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors capitalize">
                    {t === 'all' ? 'All' : t.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            {users.length > 0 ? (
              <div className="divide-y divide-gray-800">
                {users.map(u => (
                  <div key={u.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-800/30 transition-colors">
                    {/* Avatar */}
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-600/30 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-green-400">
                        {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm text-white font-medium truncate">{u.full_name || 'No Name'}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${TIER_COLORS[u.tier] || TIER_COLORS.registered}`}>
                          {(u.tier || 'registered').replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-500 truncate">{u.email}</p>
                    </div>

                    {/* Role & Company */}
                    <div className="hidden md:block text-right">
                      <p className="text-xs text-gray-400 capitalize">{u.role || '—'}</p>
                      <p className="text-[10px] text-gray-600">{u.company || '—'}</p>
                    </div>

                    {/* Country */}
                    <div className="hidden lg:block">
                      <p className="text-xs text-gray-400">{u.country || '—'}</p>
                    </div>

                    {/* Joined */}
                    <div className="hidden sm:block text-right">
                      <p className="text-[10px] text-gray-600">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-5 py-12 text-center">
                <p className="text-gray-500 text-sm">No registered users yet</p>
                <p className="text-xs text-gray-600 mt-1">Users who register on the app will appear here. Import a CSV to add contacts to the CRM.</p>
              </div>
            )}
          </div>

          {/* Invitation Flow Info */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-white mb-2">Invitation Flow</h3>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg mb-1">1</p>
                <p className="text-[10px] text-gray-400">Upload CSV</p>
                <p className="text-[9px] text-gray-600">Import customer list</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg mb-1">2</p>
                <p className="text-[10px] text-gray-400">Send Invites</p>
                <p className="text-[9px] text-gray-600">WhatsApp + Email</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg mb-1">3</p>
                <p className="text-[10px] text-gray-400">Register</p>
                <p className="text-[9px] text-gray-600">App, email link, or WhatsApp</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-lg mb-1">4</p>
                <p className="text-[10px] text-gray-400">Personalize</p>
                <p className="text-[9px] text-gray-600">AI tailors insights to profile</p>
              </div>
            </div>
          </div>
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
