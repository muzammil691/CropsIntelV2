import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { seedCRM } from '../lib/seed-crm';
import { sendWhatsAppMessage } from '../lib/whatsapp';
import { getV2UpgradeWhatsAppMessage, getV2UpgradeEmailHTML } from '../lib/notifications';
import CRMBulkInvite from '../components/CRMBulkInvite';
import FilterBar, { SingleSelectBar } from '../components/FilterBar';

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
  const [inviting, setInviting] = useState({}); // { contactId: 'sending'|'sent'|'error' }
  const [inviteMsg, setInviteMsg] = useState(null);
  const [bulkInviting, setBulkInviting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [selectedContact, setSelectedContact] = useState(null);
  const [addingNote, setAddingNote] = useState(false);
  const [noteText, setNoteText] = useState('');
  // Phase C5a: tier filter for Users tab + verify action state
  const [userTierFilter, setUserTierFilter] = useState('all');
  const [verifying, setVerifying] = useState({}); // { userId: 'pending'|'done'|'error' }
  // Phase C6: Pipeline stage-compare + period-compare filters
  const [stageFilter, setStageFilter] = useState(DEAL_STAGES.filter(s => s !== 'lost' && s !== 'completed')); // active stages by default
  const [periodFilter, setPeriodFilter] = useState('all');

  // Admin or team can verify users (raise their access_tier to 'verified')
  const canVerify = profile && ['admin', 'maxons_team'].includes(profile.access_tier)
                  || ['admin', 'analyst', 'broker', 'seller'].includes(profile?.role);

  useEffect(() => { loadCRM(); loadUsers(); }, []);

  async function verifyUser(userId) {
    setVerifying(v => ({ ...v, [userId]: 'pending' }));
    const target = users.find(u => u.id === userId);
    const existingMeta = target?.metadata || {};
    const { error } = await supabase
      .from('user_profiles')
      .update({
        access_tier: 'verified',
        metadata: {
          ...existingMeta,
          verified_at: new Date().toISOString(),
          verified_by: profile?.id || user?.id || null,
          verified_by_name: profile?.full_name || user?.email || null,
        },
      })
      .eq('id', userId);
    if (error) {
      setVerifying(v => ({ ...v, [userId]: 'error' }));
      console.error('Verify failed:', error);
    } else {
      setVerifying(v => ({ ...v, [userId]: 'done' }));
      await loadUsers();
    }
  }

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
      const hasActivities = !aRes.error && aRes.data?.length > 0;

      if (!hasContacts) {
        // Auto-seed if CRM is empty
        const seeded = await seedCRM(supabase);
        if (seeded) {
          // Reload after seeding
          const [c2, d2, a2] = await Promise.all([
            supabase.from('crm_contacts').select('*').order('relationship_score', { ascending: false }).limit(100),
            supabase.from('crm_deals').select('*').order('updated_at', { ascending: false }).limit(100),
            supabase.from('crm_activities').select('*').order('created_at', { ascending: false }).limit(50),
          ]);
          setContacts(c2.data || []);
          setDeals(d2.data || []);
          setActivities(a2.data || []);
        } else {
          setContacts([]);
          setDeals([]);
          setActivities([]);
        }
      } else {
        setContacts(cRes.data);
        setDeals(dRes.data || []);
        setActivities(aRes.data || []);
      }
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

  // ─── Invitation System ──────────────────────────────────────
  async function sendInviteWhatsApp(contact) {
    if (!contact.whatsapp && !contact.phone) {
      setInviteMsg({ type: 'error', text: `${contact.contact_name || contact.company_name} has no WhatsApp/phone number` });
      return;
    }
    const phone = contact.whatsapp || contact.phone;
    setInviting(prev => ({ ...prev, [contact.id]: 'sending' }));
    try {
      const msg = getV2UpgradeWhatsAppMessage(contact.contact_name || contact.company_name);
      await sendWhatsAppMessage(phone, msg);
      // Log activity
      await supabase.from('crm_activities').insert({
        contact_id: contact.id,
        activity_type: 'whatsapp',
        subject: 'V2 platform invitation sent via WhatsApp',
        outcome: 'positive',
      });
      setInviting(prev => ({ ...prev, [contact.id]: 'sent' }));
      setInviteMsg({ type: 'success', text: `Invitation sent to ${contact.contact_name || contact.company_name}` });
    } catch (err) {
      setInviting(prev => ({ ...prev, [contact.id]: 'error' }));
      setInviteMsg({ type: 'error', text: `Failed: ${err.message}` });
    }
  }

  async function sendInviteEmail(contact) {
    if (!contact.email) {
      setInviteMsg({ type: 'error', text: `${contact.contact_name || contact.company_name} has no email address` });
      return;
    }
    setInviting(prev => ({ ...prev, [contact.id]: 'sending' }));
    try {
      // Use Supabase edge function for email sending
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          to: contact.email,
          subject: 'CropsIntel V2 is Live — Your Almond Intelligence Platform',
          html: getV2UpgradeEmailHTML(contact.contact_name || contact.company_name),
        }),
      });
      const data = await res.json();
      if (!data.success && !res.ok) throw new Error(data.error || 'Email send failed');
      // Log activity
      await supabase.from('crm_activities').insert({
        contact_id: contact.id,
        activity_type: 'email',
        subject: 'V2 platform invitation sent via email',
        outcome: 'positive',
      });
      setInviting(prev => ({ ...prev, [contact.id]: 'sent' }));
      setInviteMsg({ type: 'success', text: `Email invitation sent to ${contact.contact_name || contact.company_name}` });
    } catch (err) {
      setInviting(prev => ({ ...prev, [contact.id]: 'error' }));
      setInviteMsg({ type: 'error', text: `Email failed: ${err.message}` });
    }
  }

  async function sendBulkInvites(method = 'whatsapp') {
    setBulkInviting(true);
    setBulkResult(null);
    let sent = 0, failed = 0, skipped = 0;
    for (const contact of contacts) {
      if (inviting[contact.id] === 'sent') { skipped++; continue; }
      if (method === 'whatsapp' && !contact.whatsapp && !contact.phone) { skipped++; continue; }
      if (method === 'email' && !contact.email) { skipped++; continue; }

      try {
        if (method === 'whatsapp') {
          const phone = contact.whatsapp || contact.phone;
          await sendWhatsAppMessage(phone, getV2UpgradeWhatsAppMessage(contact.contact_name || contact.company_name));
        } else {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            },
            body: JSON.stringify({
              to: contact.email,
              subject: 'CropsIntel V2 is Live — Your Almond Intelligence Platform',
              html: getV2UpgradeEmailHTML(contact.contact_name || contact.company_name),
            }),
          });
        }
        await supabase.from('crm_activities').insert({
          contact_id: contact.id,
          activity_type: method === 'whatsapp' ? 'whatsapp' : 'email',
          subject: `V2 platform invitation sent via ${method}`,
          outcome: 'positive',
        });
        setInviting(prev => ({ ...prev, [contact.id]: 'sent' }));
        sent++;
      } catch {
        setInviting(prev => ({ ...prev, [contact.id]: 'error' }));
        failed++;
      }
    }
    setBulkResult({ sent, failed, skipped });
    setBulkInviting(false);
  }

  async function addNote(contactId) {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await supabase.from('crm_activities').insert({
        contact_id: contactId,
        activity_type: 'note',
        subject: noteText.trim(),
        outcome: 'neutral',
      });
      setNoteText('');
      loadCRM(); // Refresh activities
    } catch { /* ignore */ }
    setAddingNote(false);
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
    ? Math.round(activeDeals.reduce((s, d) => s + ((d.ai_win_probability || 0) * 100), 0) / activeDeals.length)
    : 0;
  const weightedValue = activeDeals.reduce((s, d) => s + (d.total_value_usd || 0) * (d.ai_win_probability || 0), 0);

  // Phase C6: Period filter — clamp deals by updated_at to a rolling window
  const periodCutoffMs = (() => {
    const now = Date.now();
    if (periodFilter === '7d')  return now - 7  * 24 * 60 * 60 * 1000;
    if (periodFilter === '30d') return now - 30 * 24 * 60 * 60 * 1000;
    if (periodFilter === '90d') return now - 90 * 24 * 60 * 60 * 1000;
    if (periodFilter === 'ytd') return new Date(new Date().getFullYear(), 0, 1).getTime();
    return 0; // 'all'
  })();
  const withinPeriod = (d) => {
    if (periodFilter === 'all') return true;
    const ts = d.updated_at ? new Date(d.updated_at).getTime() : 0;
    return ts >= periodCutoffMs;
  };

  // Stage pipeline counts — respects both stage and period filter
  const stageCounts = {};
  const stageValues = {};
  DEAL_STAGES.forEach(s => { stageCounts[s] = 0; stageValues[s] = 0; });
  deals.filter(withinPeriod).forEach(d => {
    stageCounts[d.stage] = (stageCounts[d.stage] || 0) + 1;
    stageValues[d.stage] = (stageValues[d.stage] || 0) + (d.total_value_usd || 0);
  });

  // Previous period for compare (same duration, offset backward)
  const prevStageCounts = {};
  const prevStageValues = {};
  DEAL_STAGES.forEach(s => { prevStageCounts[s] = 0; prevStageValues[s] = 0; });
  if (periodFilter !== 'all' && periodCutoffMs > 0) {
    const windowMs = Date.now() - periodCutoffMs;
    const prevStart = periodCutoffMs - windowMs;
    const prevEnd = periodCutoffMs;
    deals.forEach(d => {
      const ts = d.updated_at ? new Date(d.updated_at).getTime() : 0;
      if (ts >= prevStart && ts < prevEnd) {
        prevStageCounts[d.stage] = (prevStageCounts[d.stage] || 0) + 1;
        prevStageValues[d.stage] = (prevStageValues[d.stage] || 0) + (d.total_value_usd || 0);
      }
    });
  }

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
            {Object.entries(typeCounts).map(([type, count]) => {
              // Pluralize properly: 'logistics' + 'industry' stay as-is;
              // other types get 's' only when count != 1. Fixes the
              // "1 logisticss" / "1 brokers" bug on /crm.
              const UNCOUNTABLE = ['logistics', 'industry'];
              const label = UNCOUNTABLE.includes(type)
                ? type
                : (count === 1 ? type : type + 's');
              return (
                <span key={type} className={`text-[10px] ${CONTACT_TYPE_COLORS[type] || 'text-gray-400'}`}>
                  {count} {label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit">
        {['pipeline', 'contacts', 'activity', 'users', 'invite'].map(tab => (
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
          {/* Phase C6: filter bar — stage multi-select + period single-select */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-white">Deal Pipeline</h3>
              <div className="text-[10px] text-gray-500">
                {deals.filter(withinPeriod).filter(d => stageFilter.includes(d.stage)).length} of {deals.length} deals match current filters
              </div>
            </div>
            <SingleSelectBar
              label="Period"
              options={[
                { value: 'all', label: 'All time',   color: '#6b7280' },
                { value: 'ytd', label: 'Year to date', color: '#3b82f6' },
                { value: '90d', label: 'Last 90 days', color: '#06b6d4' },
                { value: '30d', label: 'Last 30 days', color: '#22c55e' },
                { value: '7d',  label: 'Last 7 days',  color: '#f59e0b' },
              ]}
              value={periodFilter}
              onChange={setPeriodFilter}
            />
            <FilterBar
              label="Stages shown"
              options={DEAL_STAGES.map(s => ({
                value: s,
                label: s + (stageCounts[s] > 0 ? ` (${stageCounts[s]})` : ''),
                color: s === 'lost' ? '#ef4444'
                     : s === 'completed' ? '#6b7280'
                     : s === 'shipped' ? '#06b6d4'
                     : s === 'contracted' ? '#10b981'
                     : s === 'agreed' ? '#22c55e'
                     : s === 'negotiation' ? '#f59e0b'
                     : s === 'quoted' ? '#a855f7'
                     : '#3b82f6',
              }))}
              selected={stageFilter}
              onToggle={(v) => setStageFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v])}
              quickActions={[
                { label: 'Active only',   action: () => setStageFilter(DEAL_STAGES.filter(s => s !== 'lost' && s !== 'completed')) },
                { label: 'All stages',    action: () => setStageFilter([...DEAL_STAGES]) },
                { label: 'Closed only',   action: () => setStageFilter(['completed', 'lost']) },
                { label: 'At-risk',       action: () => setStageFilter(['negotiation', 'quoted']) },
              ]}
              emptyHint="Select at least one stage"
            />
          </div>

          {/* Stage funnel with period compare */}
          <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Funnel</h3>
              {periodFilter !== 'all' && (
                <span className="text-[10px] text-gray-500">
                  Current vs prior {periodFilter === 'ytd' ? 'year' : periodFilter} — delta shown below each stage
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 lg:grid-cols-8 gap-2">
              {DEAL_STAGES.filter(s => stageFilter.includes(s)).map(stage => {
                const curr = stageCounts[stage] || 0;
                const prev = prevStageCounts[stage] || 0;
                const delta = curr - prev;
                const deltaColor = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-500';
                return (
                  <div key={stage} className="text-center">
                    <div className={`rounded-lg p-2 border ${STAGE_COLORS[stage]}`}>
                      <p className="text-lg font-bold">{curr}</p>
                    </div>
                    <p className="text-[9px] text-gray-500 mt-1 capitalize">{stage}</p>
                    <p className="text-[9px] text-gray-600">{fmtUSD(stageValues[stage])}</p>
                    {periodFilter !== 'all' && (
                      <p className={`text-[9px] mt-0.5 ${deltaColor}`}>
                        {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta)} vs prior
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Deal list — honors both stage + period filter */}
          <div className="space-y-2">
            {deals.filter(withinPeriod).filter(d => stageFilter.includes(d.stage)).map(deal => {
              const contact = contactMap[deal.contact_id];
              return (
                <div key={deal.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer" onClick={() => contact && setSelectedContact(contact)}>
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
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((deal.ai_win_probability || 0) * 100)}%` }} />
                        </div>
                        <span>{Math.round((deal.ai_win_probability || 0) * 100)}%</span>
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-600">{fmtDate(deal.updated_at)}</span>
                  </div>
                </div>
              );
            })}
            {deals.filter(withinPeriod).filter(d => stageFilter.includes(d.stage)).length === 0 && (
              <div className="text-center py-12 text-sm text-gray-500 bg-gray-900/30 border border-gray-800/50 rounded-xl">
                No deals match your current filters.
                <div className="text-[11px] text-gray-600 mt-1">Try widening the period or adding more stages.</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contacts View */}
      {activeTab === 'contacts' && (
        <div className="space-y-3">
          {/* Bulk invite bar */}
          <div className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl p-3">
            <span className="text-xs text-gray-400">{contacts.length} contacts</span>
            <div className="flex-1" />
            {bulkResult && (
              <span className="text-xs text-green-400">
                Sent: {bulkResult.sent} | Failed: {bulkResult.failed} | Skipped: {bulkResult.skipped}
              </span>
            )}
            <button
              onClick={() => sendBulkInvites('whatsapp')}
              disabled={bulkInviting}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-medium transition-colors"
            >
              {bulkInviting ? 'Sending...' : 'Bulk WhatsApp Invite'}
            </button>
            <button
              onClick={() => sendBulkInvites('email')}
              disabled={bulkInviting}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-[10px] font-medium transition-colors"
            >
              {bulkInviting ? 'Sending...' : 'Bulk Email Invite'}
            </button>
          </div>

          {/* Invite status message */}
          {inviteMsg && (
            <div className={`text-xs px-3 py-2 rounded-lg ${inviteMsg.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
              {inviteMsg.text}
            </div>
          )}

          {contacts.map(contact => {
            const status = inviting[contact.id];
            const hasWhatsApp = !!(contact.whatsapp || contact.phone);
            const hasEmail = !!contact.email;
            return (
              <div key={contact.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors cursor-pointer" onClick={() => setSelectedContact(contact)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-medium capitalize ${CONTACT_TYPE_COLORS[contact.contact_type] || 'text-gray-400'}`}>
                        {contact.contact_type}
                      </span>
                      {contact.tags?.map(tag => (
                        <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 border border-gray-700">{tag}</span>
                      ))}
                      {status === 'sent' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/20 text-green-400 border border-green-500/20">Invited</span>
                      )}
                    </div>
                    <h4 className="text-sm font-medium text-white">{contact.company_name}</h4>
                    <p className="text-xs text-gray-500">{contact.contact_name} — {contact.country}</p>
                    {contact.email && <p className="text-[10px] text-gray-600 mt-0.5">{contact.email}</p>}
                    {(contact.whatsapp || contact.phone) && (
                      <p className="text-[10px] text-gray-600">{contact.whatsapp || contact.phone}</p>
                    )}
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
                    {/* Invite buttons */}
                    <div className="flex items-center gap-1.5 mt-2 justify-end" onClick={e => e.stopPropagation()}>
                      {hasWhatsApp && status !== 'sent' && (
                        <button
                          onClick={() => sendInviteWhatsApp(contact)}
                          disabled={status === 'sending'}
                          className="px-2 py-1 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                          title="Send WhatsApp invitation"
                        >
                          {status === 'sending' ? '...' : 'WhatsApp'}
                        </button>
                      )}
                      {hasEmail && status !== 'sent' && (
                        <button
                          onClick={() => sendInviteEmail(contact)}
                          disabled={status === 'sending'}
                          className="px-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded text-[10px] font-medium transition-colors disabled:opacity-50"
                          title="Send email invitation"
                        >
                          {status === 'sending' ? '...' : 'Email'}
                        </button>
                      )}
                      {status === 'sent' && (
                        <span className="text-[10px] text-green-500">Sent</span>
                      )}
                      {status === 'error' && (
                        <span className="text-[10px] text-red-400">Failed</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
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
            <div className="px-5 py-3 border-b border-gray-800 flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-white">
                Registered Users ({users.filter(u => userTierFilter === 'all' || (u.access_tier || 'registered') === userTierFilter).length}{userTierFilter !== 'all' ? ` / ${users.length}` : ''})
              </h3>
              <div className="flex items-center gap-2">
                {['all', 'admin', 'maxons_team', 'verified', 'registered'].map(t => {
                  const count = t === 'all' ? users.length : users.filter(u => (u.access_tier || 'registered') === t).length;
                  const active = userTierFilter === t;
                  return (
                    <button
                      key={t}
                      onClick={() => setUserTierFilter(t)}
                      className={`text-[10px] px-2 py-0.5 rounded transition-colors capitalize ${
                        active ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400 hover:text-white'
                      }`}
                    >
                      {t === 'all' ? 'All' : t.replace('_', ' ')} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {users.length > 0 ? (
              <div className="divide-y divide-gray-800">
                {users
                  .filter(u => userTierFilter === 'all' || (u.access_tier || 'registered') === userTierFilter)
                  .map(u => {
                  const tier = u.access_tier || 'registered';
                  const vState = verifying[u.id];
                  const isVerified = tier === 'verified' || tier === 'maxons_team' || tier === 'admin';
                  const isV1Migrated = u.metadata?.migrated_from_v1 === true || u.metadata?.v1_user_id;
                  return (
                    <div key={u.id} className="px-5 py-3 flex items-center gap-4 hover:bg-gray-800/30 transition-colors">
                      {/* Avatar */}
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-600/30 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-green-400">
                          {(u.full_name || u.email || '?').charAt(0).toUpperCase()}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm text-white font-medium truncate">{u.full_name || 'No Name'}</p>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${TIER_COLORS[tier] || TIER_COLORS.registered}`}>
                            {tier.replace('_', ' ')}
                          </span>
                          {isV1Migrated && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                              V1 migrated
                            </span>
                          )}
                          {u.whatsapp_verified && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400">
                              📱 WhatsApp✓
                            </span>
                          )}
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

                      {/* Verify action (admin/team only) */}
                      {canVerify && (
                        <div className="shrink-0">
                          {isVerified ? (
                            <span className="text-[10px] text-green-400 flex items-center gap-1">✓ Verified</span>
                          ) : (
                            <button
                              onClick={() => verifyUser(u.id)}
                              disabled={vState === 'pending'}
                              className="text-[10px] px-2 py-1 rounded-lg bg-green-600/20 hover:bg-green-600/40 text-green-400 border border-green-500/30 transition-colors disabled:opacity-50"
                              title="Mark this user as verified — grants verified-tier access per original V2 promise"
                            >
                              {vState === 'pending' ? '…verifying' : vState === 'error' ? '✗ retry' : '✓ Verify'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-green-500/20">
                <p className="text-lg mb-1">1</p>
                <p className="text-[10px] text-green-400 font-medium">Upload CSV</p>
                <p className="text-[9px] text-gray-600">Import customer list</p>
                <p className="text-[9px] text-green-500 mt-1">Active</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-green-500/20">
                <p className="text-lg mb-1">2</p>
                <p className="text-[10px] text-green-400 font-medium">Send Invites</p>
                <p className="text-[9px] text-gray-600">WhatsApp + Email per contact</p>
                <p className="text-[9px] text-green-500 mt-1">Active</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-green-500/20">
                <p className="text-lg mb-1">3</p>
                <p className="text-[10px] text-green-400 font-medium">Register</p>
                <p className="text-[9px] text-gray-600">4-method login system</p>
                <p className="text-[9px] text-green-500 mt-1">Active</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center border border-green-500/20">
                <p className="text-lg mb-1">4</p>
                <p className="text-[10px] text-green-400 font-medium">Personalize</p>
                <p className="text-[9px] text-gray-600">Zyra AI tailors insights</p>
                <p className="text-[9px] text-green-500 mt-1">Active</p>
              </div>
            </div>
            <p className="text-[10px] text-gray-500 mt-3 text-center">
              Go to the Contacts tab to send individual or bulk invitations via WhatsApp or Email
            </p>
          </div>
        </div>
      )}

      {/* Bulk WhatsApp Invite (Phase C5b) */}
      {activeTab === 'invite' && <CRMBulkInvite />}

      {/* How This CRM Works */}
      {!selectedContact && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-white mb-2">How This CRM Works</h3>
          <p className="text-xs text-gray-400 leading-relaxed">
            This CRM is built specifically for almond trading. Every contact is scored by relationship health (0-100),
            deals track from initial inquiry through shipment with real Strata pricing + MAXONS margin.
            AI analyzes each relationship and suggests next actions. As the platform grows,
            emails, WhatsApp messages, and trade documents will auto-feed into the activity log.
          </p>
        </div>
      )}

      {/* Contact Detail Panel (Slide-over) */}
      {selectedContact && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedContact(null)} />
          {/* Panel */}
          <div className="relative w-full max-w-lg bg-gray-950 border-l border-gray-800 overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-6 py-4 z-10">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-green-500/30 to-emerald-600/30 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-400">
                      {(selectedContact.company_name || '?').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-white">{selectedContact.company_name}</h3>
                    <p className="text-xs text-gray-500">{selectedContact.contact_name} — {selectedContact.country}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedContact(null)} className="text-gray-500 hover:text-white transition-colors text-lg">
                  &times;
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Contact Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase">Type</p>
                  <p className={`text-sm font-medium capitalize ${CONTACT_TYPE_COLORS[selectedContact.contact_type] || 'text-gray-400'}`}>
                    {selectedContact.contact_type}
                  </p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase">Score</p>
                  <div className="flex items-center gap-2 mt-1">
                    <ScoreBar score={selectedContact.relationship_score} />
                  </div>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase">Lifetime Volume</p>
                  <p className="text-sm font-medium text-white">{fmtLbs(selectedContact.total_volume_lbs)}</p>
                </div>
                <div className="bg-gray-900 rounded-lg p-3 border border-gray-800">
                  <p className="text-[10px] text-gray-500 uppercase">Interactions</p>
                  <p className="text-sm font-medium text-white">{selectedContact.total_interactions || 0}</p>
                </div>
              </div>

              {/* Contact Details */}
              <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 space-y-2">
                {selectedContact.email && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-20">Email</span>
                    <span className="text-xs text-gray-300">{selectedContact.email}</span>
                  </div>
                )}
                {(selectedContact.phone || selectedContact.whatsapp) && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-20">Phone</span>
                    <span className="text-xs text-gray-300">{selectedContact.whatsapp || selectedContact.phone}</span>
                  </div>
                )}
                {selectedContact.city && (
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-20">City</span>
                    <span className="text-xs text-gray-300">{selectedContact.city}</span>
                  </div>
                )}
                {selectedContact.notes && (
                  <div className="flex items-start gap-2 pt-2 border-t border-gray-800">
                    <span className="text-gray-500 text-xs w-20 mt-0.5">Notes</span>
                    <span className="text-xs text-gray-400 leading-relaxed">{selectedContact.notes}</span>
                  </div>
                )}
              </div>

              {/* AI Next Action */}
              {selectedContact.ai_next_action && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-[10px] text-amber-400 uppercase font-medium mb-1">AI Recommended Action</p>
                  <p className="text-xs text-amber-300">{selectedContact.ai_next_action}</p>
                </div>
              )}

              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                {(selectedContact.whatsapp || selectedContact.phone) && inviting[selectedContact.id] !== 'sent' && (
                  <button
                    onClick={() => sendInviteWhatsApp(selectedContact)}
                    disabled={inviting[selectedContact.id] === 'sending'}
                    className="px-3 py-1.5 bg-green-600/20 hover:bg-green-600/40 text-green-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Send WhatsApp Invite
                  </button>
                )}
                {selectedContact.email && inviting[selectedContact.id] !== 'sent' && (
                  <button
                    onClick={() => sendInviteEmail(selectedContact)}
                    disabled={inviting[selectedContact.id] === 'sending'}
                    className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Send Email Invite
                  </button>
                )}
                {inviting[selectedContact.id] === 'sent' && (
                  <span className="px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-xs">Invitation Sent</span>
                )}
              </div>

              {/* Linked Deals */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">
                  Deals ({deals.filter(d => d.contact_id === selectedContact.id).length})
                </h4>
                {deals.filter(d => d.contact_id === selectedContact.id).length > 0 ? (
                  <div className="space-y-2">
                    {deals.filter(d => d.contact_id === selectedContact.id).map(deal => (
                      <div key={deal.id} className="bg-gray-900 border border-gray-800 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-1">
                          <StageBadge stage={deal.stage} />
                          <span className="text-xs font-bold text-white">{fmtUSD(deal.total_value_usd)}</span>
                        </div>
                        <p className="text-xs text-gray-300">{deal.variety} {deal.grade} — {deal.destination_country}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          {deal.volume_mt} MT | ${deal.maxons_price}/lb | {deal.incoterm}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 bg-gray-900/50 rounded-lg p-3 text-center">No deals linked</p>
                )}
              </div>

              {/* Activity Timeline */}
              <div>
                <h4 className="text-sm font-semibold text-white mb-2">
                  Activity ({activities.filter(a => a.contact_id === selectedContact.id).length})
                </h4>
                {activities.filter(a => a.contact_id === selectedContact.id).length > 0 ? (
                  <div className="space-y-1.5">
                    {activities.filter(a => a.contact_id === selectedContact.id).slice(0, 10).map(act => (
                      <div key={act.id} className="flex items-start gap-2 bg-gray-900/50 rounded-lg p-2.5">
                        <ActivityIcon type={act.activity_type} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-gray-300">{act.subject}</p>
                          <p className="text-[10px] text-gray-600">{fmtDate(act.created_at)}</p>
                        </div>
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
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600 bg-gray-900/50 rounded-lg p-3 text-center">No activity yet</p>
                )}

                {/* Add Note */}
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a note..."
                    value={noteText}
                    onChange={e => setNoteText(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addNote(selectedContact.id)}
                    className="flex-1 bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500/30"
                  />
                  <button
                    onClick={() => addNote(selectedContact.id)}
                    disabled={!noteText.trim() || addingNote}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-xs transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Tags */}
              {selectedContact.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedContact.tags.map(tag => (
                    <span key={tag} className="text-[10px] px-2 py-1 rounded-full bg-gray-800 text-gray-400 border border-gray-700">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
