import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { loadAPIKeys, getAIStatus } from '../lib/ai-engine';
import { syncWhatsAppTemplates } from '../lib/whatsapp';
import { useAuth } from '../lib/auth';

const ACCESS_TIERS = ['guest', 'registered', 'verified', 'maxons_team', 'admin'];
const TIER_LABELS = { guest: 'Guest', registered: 'Registered', verified: 'Verified', maxons_team: 'MAXONS Team', admin: 'Admin' };
const TIER_COLORS = {
  guest: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  registered: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  verified: 'bg-green-500/20 text-green-400 border-green-500/30',
  maxons_team: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  admin: 'bg-red-500/20 text-red-400 border-red-500/30',
};

// All role options — mirrors the role set in App.jsx TEAM_ROLES + ROLE_PRIORITY.
// Grouped: buy/sell side, value chain, and internal team roles.
const ALL_ROLES = [
  { value: 'buyer',       label: 'Buyer',              group: 'trading' },
  { value: 'seller',      label: 'Seller',             group: 'trading' },
  { value: 'trader',      label: 'Trader',             group: 'trading' },
  { value: 'broker',      label: 'Broker',             group: 'trading' },
  { value: 'grower',      label: 'Grower',             group: 'chain'   },
  { value: 'supplier',    label: 'Handler / Packer',   group: 'chain'   },
  { value: 'processor',   label: 'Processor',          group: 'chain'   },
  { value: 'analyst',     label: 'Analyst',            group: 'team'    },
  { value: 'sales',       label: 'Sales',              group: 'team'    },
  { value: 'maxons_team', label: 'MAXONS Team',        group: 'team'    },
  { value: 'admin',       label: 'Admin',              group: 'team'    },
];

// Canonical internal-team role set. Mirrors TEAM_ROLES in App.jsx line 138.
// Any role in this list (or access_tier === 'maxons_team' / 'admin') counts
// as "internal team" for purposes of verify-users capability.
const TEAM_ROLE_VALUES = ['admin', 'analyst', 'broker', 'seller', 'trader', 'sales', 'maxons_team'];

const AI_SYSTEMS = [
  { key: 'anthropic', name: 'Claude (Anthropic)', role: 'Primary Brain', desc: 'Deep reasoning, document analysis, trade synthesis', color: 'orange' },
  { key: 'openai', name: 'GPT (OpenAI)', role: 'Fast Factual', desc: 'Quick checks, alternative market perspectives', color: 'green' },
  { key: 'gemini', name: 'Gemini (Google)', role: 'Third Perspective', desc: 'Consensus analysis, creative market interpretation', color: 'blue' },
  { key: 'elevenlabs', name: 'ElevenLabs', role: 'Voice Layer', desc: 'Zyra voice synthesis for spoken insights', color: 'purple' },
];

const colorMap = {
  orange: { dot: 'bg-orange-500', bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400' },
  green: { dot: 'bg-green-500', bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400' },
  blue: { dot: 'bg-blue-500', bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  purple: { dot: 'bg-purple-500', bg: 'bg-purple-500/10 border-purple-500/20', text: 'text-purple-400' },
};

export default function Settings() {
  const { isAuthenticated, user, profile: authProfile, updatePassword } = useAuth();
  const [keys, setKeys] = useState({ anthropic: '', openai: '', gemini: '', elevenlabs: '' });
  const [aiStatus, setAiStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  // Profile editing state
  const [profile, setProfile] = useState({
    full_name: '', email: '', company: '', country: '', city: '',
    phone: '', whatsapp_number: '', role: 'buyer', trade_type: '',
    annual_volume: '', website: '', products_of_interest: '',
    preferred_ports: '', certifications: '', payment_terms: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Change password state
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState('');

  // Admin user management state
  const [allUsers, setAllUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState(null);
  const [adminMsg, setAdminMsg] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', company: '', whatsapp_number: '', role: 'buyer', access_tier: 'registered' });
  const [addingUser, setAddingUser] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // userId to confirm deletion

  const isAdmin = authProfile?.role === 'admin';
  // Team capability: role is in TEAM_ROLE_VALUES or tier is elevated.
  const isTeam = Boolean(
    authProfile && (
      TEAM_ROLE_VALUES.includes(authProfile.role) ||
      authProfile.access_tier === 'maxons_team' ||
      authProfile.access_tier === 'admin'
    )
  );
  // Team members who are NOT admin get the slimmed-down verify-only panel
  const isTeamOnly = isTeam && !isAdmin;

  // Team-only: queue of users pending verification (access_tier === 'registered')
  const [pendingUsers, setPendingUsers] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  // Admin-only: email broadcast UI state
  const [subscribers, setSubscribers] = useState([]);
  const [subsLoading, setSubsLoading] = useState(false);
  const [broadcastFilter, setBroadcastFilter] = useState({ source: 'all', includeRegistered: true });
  const [broadcast, setBroadcast] = useState({ subject: '', html: '', text: '' });
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastMsg, setBroadcastMsg] = useState('');
  const [broadcastHistory, setBroadcastHistory] = useState([]);

  useEffect(() => { loadSettings(); }, []);

  // Load profile when auth profile is available
  useEffect(() => {
    if (authProfile) {
      setProfile(prev => ({
        ...prev,
        full_name: authProfile.full_name || '',
        email: authProfile.email || user?.email || '',
        company: authProfile.company || '',
        country: authProfile.country || '',
        city: authProfile.city || '',
        phone: authProfile.phone || '',
        whatsapp_number: authProfile.whatsapp_number || '',
        role: authProfile.role || 'buyer',
        trade_type: authProfile.trade_type || '',
        annual_volume: authProfile.annual_volume || '',
        website: authProfile.website || '',
        products_of_interest: authProfile.products_of_interest || '',
        preferred_ports: authProfile.preferred_ports || '',
        certifications: authProfile.certifications || '',
        payment_terms: authProfile.payment_terms || '',
      }));
    }
  }, [authProfile, user]);

  async function loadSettings() {
    setLoading(true);
    try {
      // Load current AI keys from system_config
      const { data } = await supabase
        .from('system_config')
        .select('value')
        .eq('key', 'ai_api_keys')
        .single();

      if (data?.value) {
        const parsed = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        setKeys({
          anthropic: parsed.anthropic || '',
          openai: parsed.openai || '',
          gemini: parsed.gemini || '',
          elevenlabs: parsed.elevenlabs || '',
        });
      }
    } catch (err) {
      console.warn('Could not load AI keys:', err.message);
    }

    // Load AI status
    await loadAPIKeys();
    setAiStatus(getAIStatus());
    setLoading(false);
  }

  async function saveKeys() {
    setSaving(true);
    setSaveMsg('');
    try {
      // Filter out empty strings → null
      const cleanKeys = {};
      Object.entries(keys).forEach(([k, v]) => {
        cleanKeys[k] = v.trim() || null;
      });

      const { error } = await supabase
        .from('system_config')
        .upsert({
          key: 'ai_api_keys',
          value: cleanKeys,
          description: '4 AI system API keys — set values here to enable live AI',
          updated_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Reload API keys and status
      await loadAPIKeys();
      setAiStatus(getAIStatus());
      setSaveMsg('Saved! AI systems updated.');
    } catch (err) {
      setSaveMsg('Error: ' + err.message);
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 4000);
  }

  async function saveProfile() {
    if (!user) return;
    setProfileSaving(true);
    setProfileMsg('');
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          full_name: profile.full_name.trim(),
          company: profile.company.trim(),
          country: profile.country.trim(),
          city: profile.city.trim(),
          phone: profile.phone.trim(),
          whatsapp_number: profile.whatsapp_number.trim(),
          role: profile.role,
          trade_type: profile.trade_type.trim(),
          annual_volume: profile.annual_volume.trim(),
          website: profile.website.trim(),
          products_of_interest: profile.products_of_interest.trim(),
          preferred_ports: profile.preferred_ports.trim(),
          certifications: profile.certifications.trim(),
          payment_terms: profile.payment_terms.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      setProfileMsg('Profile saved successfully.');
    } catch (err) {
      setProfileMsg('Error: ' + err.message);
    }
    setProfileSaving(false);
    setTimeout(() => setProfileMsg(''), 4000);
  }

  // Admin: load all users
  useEffect(() => {
    if (isAdmin) {
      loadAllUsers();
      loadSubscribers();
      loadBroadcastHistory();
    }
  }, [isAdmin]);

  // Team-only: load pending verification queue
  useEffect(() => {
    if (isTeamOnly) loadPendingUsers();
  }, [isTeamOnly]);

  // Hash-scroll: when the sidebar's "Team & Users" link fires (/settings#team-panel),
  // scroll the matching section into view. Runs on mount AND on hashchange so a
  // click while already on /settings still re-scrolls.
  useEffect(() => {
    function scrollToHash() {
      const hash = window.location.hash.replace('#', '');
      if (!hash) return;
      // Give React a tick to render the panel (isAdmin/isTeamOnly gates
      // may not be resolved until after the profile loads).
      requestAnimationFrame(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    scrollToHash();
    window.addEventListener('hashchange', scrollToHash);
    return () => window.removeEventListener('hashchange', scrollToHash);
  }, [isAdmin, isTeamOnly, allUsers.length, pendingUsers.length]);

  async function loadPendingUsers() {
    setPendingLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, email, full_name, company, whatsapp_number, country, created_at, role, access_tier')
        .eq('access_tier', 'registered')
        .order('created_at', { ascending: false })
        .limit(100);
      if (!error && data) setPendingUsers(data);
    } catch { /* table may not exist */ }
    setPendingLoading(false);
  }

  async function verifyPendingUser(userId, userEmail, userName) {
    setVerifyMsg('');
    try {
      // Flip access_tier registered → verified
      const { error } = await supabase
        .from('user_profiles')
        .update({
          access_tier: 'verified',
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .eq('access_tier', 'registered'); // guard: don't demote a verified/team user
      if (error) throw error;

      // Log the verification as a CRM activity so there's an audit trail
      try {
        await supabase.from('crm_activities').insert({
          activity_type: 'user_verified',
          subject: `User verified by ${authProfile?.full_name || authProfile?.email || 'team member'}`,
          description: `Verified ${userName || userEmail} (${userEmail}) — registered → verified`,
          outcome: 'positive',
          completed_at: new Date().toISOString(),
          created_by: authProfile?.id || 'system',
          metadata: {
            verified_user_id: userId,
            verified_by: authProfile?.id,
            verified_by_role: authProfile?.role,
            previous_tier: 'registered',
            new_tier: 'verified',
          },
        });
      } catch { /* activity log is best-effort */ }

      // Remove from pending queue
      setPendingUsers(prev => prev.filter(u => u.id !== userId));
      setVerifyMsg(`Verified ${userName || userEmail}`);
    } catch (err) {
      setVerifyMsg('Error: ' + (err.message || 'Failed to verify user'));
    }
    setTimeout(() => setVerifyMsg(''), 4000);
  }

  async function loadAllUsers() {
    setUsersLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) setAllUsers(data);
    } catch { /* table may not exist */ }
    setUsersLoading(false);
  }

  // ─── Admin broadcast: load subscriber cohort ────────────────
  async function loadSubscribers() {
    setSubsLoading(true);
    try {
      const { data, error } = await supabase
        .from('email_subscribers')
        .select('id, email, name, source, subscribed_at, converted_at, user_profile_id, tags, last_email_sent_at, email_count')
        .is('unsubscribed_at', null)
        .order('subscribed_at', { ascending: false })
        .limit(500);
      if (!error && data) setSubscribers(data);
    } catch {
      // Table may not exist yet (migration pending) — render empty state.
    }
    setSubsLoading(false);
  }

  async function loadBroadcastHistory() {
    try {
      const { data, error } = await supabase
        .from('email_broadcasts')
        .select('id, subject, recipient_count, sent_count, queued_count, failed_count, status, created_at, completed_at')
        .order('created_at', { ascending: false })
        .limit(10);
      if (!error && data) setBroadcastHistory(data);
    } catch { /* no-op */ }
  }

  // Computed broadcast recipients: union of email_subscribers + user_profiles
  // (if includeRegistered), de-duped by email. Respects source filter.
  function computeBroadcastRecipients() {
    const seen = new Set();
    const out = [];
    // Subscribers
    for (const s of subscribers) {
      if (broadcastFilter.source !== 'all' && s.source !== broadcastFilter.source) continue;
      if (!s.email) continue;
      const k = s.email.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ email: s.email, name: s.name, source: s.source, id: s.id, kind: 'subscriber' });
    }
    // Registered users (user_profiles.email)
    if (broadcastFilter.includeRegistered) {
      for (const u of allUsers) {
        if (!u.email) continue;
        const k = u.email.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ email: u.email, name: u.full_name, source: 'user_profile', id: u.id, kind: 'user' });
      }
    }
    return out;
  }

  async function sendBroadcast() {
    setBroadcastMsg('');
    if (!broadcast.subject.trim()) return setBroadcastMsg('Error: Subject required');
    if (!broadcast.html.trim() && !broadcast.text.trim()) return setBroadcastMsg('Error: Either HTML or text body required');

    const recipients = computeBroadcastRecipients();
    if (recipients.length === 0) return setBroadcastMsg('Error: No recipients match the current filter');

    if (!confirm(`Send "${broadcast.subject}" to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}?`)) return;

    setBroadcastSending(true);
    try {
      // Log the broadcast first (pending status) — captures intent even
      // if email-send fails per-recipient.
      const { data: broadcastRow, error: logErr } = await supabase
        .from('email_broadcasts')
        .insert({
          sent_by: authProfile?.id,
          subject: broadcast.subject,
          html: broadcast.html || null,
          text: broadcast.text || null,
          cohort_filter: broadcastFilter,
          recipient_count: recipients.length,
          status: 'sending',
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (logErr) throw logErr;

      // Call email-send edge function with bulk array
      const emails = recipients.map(r => r.email);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/email-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          type: 'custom',
          to: emails,
          subject: broadcast.subject,
          html: broadcast.html,
          text: broadcast.text,
          context: { broadcast_id: broadcastRow.id },
        }),
      });

      const result = await res.json().catch(() => ({}));

      // Stamp completion
      await supabase
        .from('email_broadcasts')
        .update({
          status: result?.success ? 'completed' : 'failed',
          sent_count: result?.sent || 0,
          queued_count: result?.queued || (result?.success && !result?.sent ? recipients.length : 0),
          failed_count: result?.failed || 0,
          completed_at: new Date().toISOString(),
        })
        .eq('id', broadcastRow.id);

      // Update last_email_sent_at + email_count for subscriber recipients
      const subIds = recipients.filter(r => r.kind === 'subscriber').map(r => r.id);
      if (subIds.length > 0) {
        await supabase.rpc('increment_subscriber_email_count', { subscriber_ids: subIds, sent_at: new Date().toISOString() })
          .catch(() => {
            // RPC may not exist — fall through to a batch update.
            return supabase
              .from('email_subscribers')
              .update({ last_email_sent_at: new Date().toISOString() })
              .in('id', subIds);
          });
      }

      setBroadcastMsg(result?.success
        ? `Broadcast sent to ${recipients.length} recipient${recipients.length === 1 ? '' : 's'}${result.queued ? ` (queued — email provider offline)` : ''}`
        : `Error: ${result?.error || 'Broadcast failed'}`);
      setBroadcast({ subject: '', html: '', text: '' });
      loadBroadcastHistory();
    } catch (err) {
      setBroadcastMsg('Error: ' + (err.message || 'Broadcast failed'));
    } finally {
      setBroadcastSending(false);
    }
  }

  async function updateUserRole(userId, newRole) {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      setAdminMsg(`Role updated to ${newRole}`);
    } catch (err) {
      setAdminMsg('Error: ' + err.message);
    }
    setTimeout(() => setAdminMsg(''), 3000);
  }

  async function updateUserTier(userId, newTier) {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ access_tier: newTier, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (error) throw error;
      setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, access_tier: newTier } : u));
      setAdminMsg(`Access tier updated to ${TIER_LABELS[newTier] || newTier}`);
    } catch (err) {
      setAdminMsg('Error: ' + err.message);
    }
    setTimeout(() => setAdminMsg(''), 3000);
  }

  // Change password
  async function handleChangePassword() {
    setPasswordMsg('');
    if (!newPassword) return setPasswordMsg('Error: Password is required');
    if (newPassword.length < 6) return setPasswordMsg('Error: Password must be at least 6 characters');
    if (newPassword !== confirmNewPassword) return setPasswordMsg('Error: Passwords do not match');

    setPasswordSaving(true);
    try {
      await updatePassword(newPassword);
      setPasswordMsg('Password updated successfully.');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (err) {
      setPasswordMsg('Error: ' + (err.message || 'Failed to update password'));
    }
    setPasswordSaving(false);
    setTimeout(() => setPasswordMsg(''), 5000);
  }

  // Admin: Add new user
  async function handleAddUser() {
    if (!newUser.email?.trim()) return setAdminMsg('Error: Email is required');
    if (!newUser.full_name?.trim()) return setAdminMsg('Error: Name is required');

    setAddingUser(true);
    setAdminMsg('');
    try {
      // Create Supabase auth account
      const tempPassword = crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: newUser.email.trim(),
        password: tempPassword,
        options: { data: { full_name: newUser.full_name.trim() } },
      });

      // Note: signUp creates the auth account. The user will need to verify email or use WhatsApp OTP.
      // We also create their profile row.
      if (authErr) throw authErr;

      if (authData.user) {
        await supabase.from('user_profiles').upsert({
          id: authData.user.id,
          email: newUser.email.trim(),
          full_name: newUser.full_name.trim(),
          company: newUser.company.trim(),
          whatsapp_number: newUser.whatsapp_number.trim(),
          role: newUser.role,
          access_tier: newUser.access_tier,
          created_at: new Date().toISOString(),
        });
      }

      setAdminMsg(`User ${newUser.full_name} added. They'll need to verify their email or use WhatsApp OTP to log in.`);
      setShowAddUser(false);
      setNewUser({ full_name: '', email: '', company: '', whatsapp_number: '', role: 'buyer', access_tier: 'registered' });
      await loadAllUsers();
    } catch (err) {
      setAdminMsg('Error: ' + (err.message || 'Failed to add user'));
    }
    setAddingUser(false);
    setTimeout(() => setAdminMsg(''), 6000);
  }

  // Admin: Delete user (profile row only — auth account requires admin API)
  async function handleDeleteUser(userId) {
    setAdminMsg('');
    try {
      const { error } = await supabase
        .from('user_profiles')
        .delete()
        .eq('id', userId);
      if (error) throw error;
      setAllUsers(prev => prev.filter(u => u.id !== userId));
      setAdminMsg('User removed from the platform.');
      setDeleteConfirm(null);
    } catch (err) {
      setAdminMsg('Error: ' + (err.message || 'Failed to delete user'));
    }
    setTimeout(() => setAdminMsg(''), 4000);
  }

  const filteredUsers = allUsers.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (u.full_name || '').toLowerCase().includes(q)
      || (u.email || '').toLowerCase().includes(q)
      || (u.company || '').toLowerCase().includes(q)
      || (u.whatsapp_number || '').includes(q);
  });

  function maskKey(key) {
    if (!key || key.length < 12) return key;
    return key.slice(0, 6) + '...' + key.slice(-4);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const connectedCount = aiStatus ? Object.entries(aiStatus).filter(([k, v]) => k !== 'council' && v.connected).length : 0;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">System Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Configure AI systems, API keys, and platform preferences</p>
      </div>

      {/* User Profile */}
      {isAuthenticated && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Your Profile</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'full_name', label: 'Full Name', placeholder: 'Your full name' },
              { key: 'email', label: 'Email', placeholder: 'email@example.com', disabled: true, note: 'Contact admin to change' },
              { key: 'company', label: 'Company', placeholder: 'Company name' },
              { key: 'whatsapp_number', label: 'WhatsApp Number', placeholder: '+971501234567' },
              { key: 'phone', label: 'Phone', placeholder: '+971501234567' },
              { key: 'country', label: 'Country', placeholder: 'UAE' },
              { key: 'city', label: 'City', placeholder: 'Dubai' },
              { key: 'trade_type', label: 'Trade Type', placeholder: 'Importer, Exporter, Broker...' },
              { key: 'annual_volume', label: 'Annual Volume', placeholder: '1000 MT' },
              { key: 'website', label: 'Website', placeholder: 'https://...' },
              { key: 'products_of_interest', label: 'Products of Interest', placeholder: 'NPS, NPIS, Almond Flour...' },
              { key: 'preferred_ports', label: 'Preferred Ports', placeholder: 'Jebel Ali, Nhava Sheva...' },
              { key: 'certifications', label: 'Certifications', placeholder: 'FSSC 22000, BRC, Organic...' },
              { key: 'payment_terms', label: 'Payment Terms', placeholder: 'LC at sight, 30 days...' },
            ].map(f => (
              <div key={f.key}>
                <label className="text-xs text-gray-400 mb-1 block">{f.label}</label>
                <input
                  type="text"
                  value={profile[f.key]}
                  onChange={e => !f.disabled && setProfile(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  disabled={f.disabled}
                  className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 ${f.disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                {f.note && <p className="text-[10px] text-gray-600 mt-0.5">{f.note}</p>}
              </div>
            ))}
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Role</label>
              {isAdmin ? (
                <select
                  value={profile.role}
                  onChange={e => setProfile(prev => ({ ...prev, role: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50"
                >
                  <optgroup label="Trading">
                    {ALL_ROLES.filter(r => r.group === 'trading').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Value Chain">
                    {ALL_ROLES.filter(r => r.group === 'chain').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Internal Team">
                    {ALL_ROLES.filter(r => r.group === 'team').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                </select>
              ) : (
                <div className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white opacity-50 cursor-not-allowed capitalize">
                  {profile.role || 'buyer'}
                </div>
              )}
              {!isAdmin && <p className="text-[10px] text-gray-600 mt-0.5">Contact admin to change role</p>}
            </div>
          </div>
          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={saveProfile}
              disabled={profileSaving}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {profileSaving ? 'Saving...' : 'Save Profile'}
            </button>
            {profileMsg && (
              <span className={`text-xs ${profileMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {profileMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Change Password */}
      {isAuthenticated && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-white mb-4">Change Password</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-lg">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => { setNewPassword(e.target.value); setPasswordMsg(''); }}
                placeholder="At least 6 characters"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Confirm New Password</label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={e => { setConfirmNewPassword(e.target.value); setPasswordMsg(''); }}
                placeholder="Re-enter password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={handleChangePassword}
              disabled={passwordSaving || !newPassword}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
            {passwordMsg && (
              <span className={`text-xs ${passwordMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {passwordMsg}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Team-only: Verify Users panel (no add, no delete, no tier edit beyond registered->verified) */}
      {isTeamOnly && (
        <div id="team-panel" className="bg-gray-900/50 border border-purple-500/30 rounded-xl p-5 scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Verify Users
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30 font-normal">
                  Team
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {pendingUsers.length === 0 ? 'No users awaiting verification' : `${pendingUsers.length} pending`}
                 — you can verify new registrants but cannot add or delete users.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {verifyMsg && (
                <span className={`text-xs max-w-xs truncate ${verifyMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {verifyMsg}
                </span>
              )}
              <button
                onClick={loadPendingUsers}
                disabled={pendingLoading}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors border border-gray-700"
              >
                {pendingLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {pendingUsers.length === 0 && !pendingLoading ? (
            <div className="bg-gray-800/30 border border-dashed border-gray-700 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-500">All caught up. New registrants will appear here for verification.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pendingUsers.map(u => (
                <div key={u.id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{u.full_name || 'No name'}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-blue-500/20 text-blue-400 border-blue-500/30">
                          Registered
                        </span>
                        {u.role && u.role !== 'buyer' && (
                          <span className="text-[10px] text-gray-500 capitalize">{u.role}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-[11px] text-gray-500 truncate">{u.email || 'No email'}</span>
                        {u.company && <span className="text-[11px] text-gray-600">{u.company}</span>}
                        {u.whatsapp_number && <span className="text-[11px] text-gray-600">{u.whatsapp_number}</span>}
                        {u.country && <span className="text-[11px] text-gray-600">{u.country}</span>}
                        {u.created_at && (
                          <span className="text-[11px] text-gray-700">
                            Registered {new Date(u.created_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => verifyPendingUser(u.id, u.email, u.full_name)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
                    >
                      Verify
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Admin: User Management */}
      {isAdmin && (
        <div id="team-panel" className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white">User Management</h2>
              <p className="text-xs text-gray-500 mt-0.5">{allUsers.length} registered users</p>
            </div>
            <div className="flex items-center gap-2">
              {adminMsg && (
                <span className={`text-xs max-w-xs truncate ${adminMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {adminMsg}
                </span>
              )}
              <button
                onClick={() => setShowAddUser(!showAddUser)}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs transition-colors font-medium"
              >
                + Add User
              </button>
              <button
                onClick={loadAllUsers}
                disabled={usersLoading}
                className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors border border-gray-700"
              >
                {usersLoading ? 'Loading...' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <input
              type="text"
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="Search by name, email, company, or phone..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
            />
          </div>

          {/* Add User Form */}
          {showAddUser && (
            <div className="bg-gray-800/70 border border-green-500/20 rounded-lg p-4 mb-4">
              <h3 className="text-sm font-semibold text-green-400 mb-3">Add New Team Member</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input type="text" value={newUser.full_name} onChange={e => setNewUser(p => ({ ...p, full_name: e.target.value }))}
                  placeholder="Full Name *" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50" />
                <input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="Email *" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50" />
                <input type="text" value={newUser.company} onChange={e => setNewUser(p => ({ ...p, company: e.target.value }))}
                  placeholder="Company" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50" />
                <input type="text" value={newUser.whatsapp_number} onChange={e => setNewUser(p => ({ ...p, whatsapp_number: e.target.value }))}
                  placeholder="WhatsApp (+971...)" className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50" />
                <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50">
                  <optgroup label="Trading">
                    {ALL_ROLES.filter(r => r.group === 'trading').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Value Chain">
                    {ALL_ROLES.filter(r => r.group === 'chain').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Internal Team">
                    {ALL_ROLES.filter(r => r.group === 'team').map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </optgroup>
                </select>
                <select value={newUser.access_tier} onChange={e => setNewUser(p => ({ ...p, access_tier: e.target.value }))}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50">
                  {ACCESS_TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </select>
              </div>
              {/* Preset buttons — set role + tier in one click */}
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-[11px] text-gray-500">Quick presets:</span>
                <button
                  type="button"
                  onClick={() => setNewUser(p => ({ ...p, role: 'maxons_team', access_tier: 'maxons_team' }))}
                  className="px-2.5 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 rounded text-[11px] font-medium transition-colors"
                  title="Role: MAXONS Team  |  Tier: MAXONS Team"
                >
                  Make team member
                </button>
                <button
                  type="button"
                  onClick={() => setNewUser(p => ({ ...p, role: 'buyer', access_tier: 'verified' }))}
                  className="px-2.5 py-1 bg-green-600/30 hover:bg-green-600/50 text-green-300 border border-green-500/40 rounded text-[11px] font-medium transition-colors"
                  title="Role: Buyer  |  Tier: Verified"
                >
                  Verified buyer
                </button>
                <button
                  type="button"
                  onClick={() => setNewUser(p => ({ ...p, role: 'admin', access_tier: 'admin' }))}
                  className="px-2.5 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-300 border border-red-500/40 rounded text-[11px] font-medium transition-colors"
                  title="Role: Admin  |  Tier: Admin"
                >
                  Make admin
                </button>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={handleAddUser} disabled={addingUser}
                  className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
                  {addingUser ? 'Creating...' : 'Create User'}
                </button>
                <button onClick={() => setShowAddUser(false)}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* User list */}
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredUsers.map(u => (
              <div key={u.id} className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white truncate">{u.full_name || 'No name'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${TIER_COLORS[u.access_tier] || TIER_COLORS[u.role] || TIER_COLORS.registered}`}>
                        {u.role || 'buyer'}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${TIER_COLORS[u.access_tier] || TIER_COLORS.registered}`}>
                        {TIER_LABELS[u.access_tier] || 'Registered'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-gray-500 truncate">{u.email || 'No email'}</span>
                      {u.company && <span className="text-[11px] text-gray-600">{u.company}</span>}
                      {u.whatsapp_number && <span className="text-[11px] text-gray-600">{u.whatsapp_number}</span>}
                      {u.country && <span className="text-[11px] text-gray-600">{u.country}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={u.role || 'buyer'}
                      onChange={e => updateUserRole(u.id, e.target.value)}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-green-500/50"
                    >
                      <optgroup label="Trading">
                        {ALL_ROLES.filter(r => r.group === 'trading').map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Value Chain">
                        {ALL_ROLES.filter(r => r.group === 'chain').map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </optgroup>
                      <optgroup label="Internal Team">
                        {ALL_ROLES.filter(r => r.group === 'team').map(r => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </optgroup>
                    </select>
                    <select
                      value={u.access_tier || 'registered'}
                      onChange={e => updateUserTier(u.id, e.target.value)}
                      className="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-[11px] text-white focus:outline-none focus:border-green-500/50"
                    >
                      {ACCESS_TIERS.map(t => (
                        <option key={t} value={t}>{TIER_LABELS[t]}</option>
                      ))}
                    </select>
                    {/* Per-row "Make team" preset */}
                    {TEAM_ROLE_VALUES.includes(u.role) || u.access_tier === 'maxons_team' || u.access_tier === 'admin' ? (
                      <button
                        onClick={async () => { await updateUserRole(u.id, 'buyer'); await updateUserTier(u.id, 'verified'); }}
                        className="px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600 rounded text-[10px] font-medium transition-colors"
                        title="Revoke team access (role → buyer, tier → verified)"
                      >
                        Revoke team
                      </button>
                    ) : (
                      <button
                        onClick={async () => { await updateUserRole(u.id, 'maxons_team'); await updateUserTier(u.id, 'maxons_team'); }}
                        className="px-2 py-1 bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 rounded text-[10px] font-medium transition-colors"
                        title="Promote to MAXONS Team (role + tier)"
                      >
                        Make team
                      </button>
                    )}
                    {/* Delete button */}
                    {deleteConfirm === u.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleDeleteUser(u.id)}
                          className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-[10px] font-medium transition-colors">
                          Confirm
                        </button>
                        <button onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 bg-gray-600 text-gray-300 rounded text-[10px] transition-colors">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(u.id)} title="Remove user"
                        className="p-1 text-gray-600 hover:text-red-400 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {filteredUsers.length === 0 && !usersLoading && (
              <p className="text-center text-sm text-gray-600 py-4">No users found</p>
            )}
          </div>
        </div>
      )}

      {/* Admin: Email Broadcast — subscribers + registered users */}
      {isAdmin && (
        <div id="broadcast-panel" className="bg-gray-900/50 border border-blue-500/20 rounded-xl p-5 scroll-mt-20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                Email Broadcast
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-normal">
                  Admin
                </span>
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Reach {subscribers.length} subscriber{subscribers.length === 1 ? '' : 's'} + {allUsers.length} registered user{allUsers.length === 1 ? '' : 's'}. V1 cohort import happens via SQL — see markedForLater.
              </p>
            </div>
            <button
              onClick={() => { loadSubscribers(); loadBroadcastHistory(); }}
              disabled={subsLoading}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors border border-gray-700"
            >
              {subsLoading ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {/* Cohort filters */}
          <div className="bg-gray-950/50 border border-gray-800 rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-gray-500">Cohort:</span>
              {[
                { value: 'all', label: 'All subscribers' },
                { value: 'v1_subscribers', label: 'V1 subscribers (email-only)' },
                { value: 'v1_registered', label: 'V1 registered' },
                { value: 'v2_signup', label: 'V2 signups' },
                { value: 'footer_form', label: 'Footer form' },
                { value: 'zyra_chat', label: 'Via Zyra' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBroadcastFilter(f => ({ ...f, source: opt.value }))}
                  className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                    broadcastFilter.source === opt.value
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-gray-800 text-gray-500 border border-gray-700 hover:text-gray-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <label className="flex items-center gap-2 ml-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={broadcastFilter.includeRegistered}
                  onChange={e => setBroadcastFilter(f => ({ ...f, includeRegistered: e.target.checked }))}
                  className="w-3.5 h-3.5 accent-blue-500"
                />
                <span className="text-[11px] text-gray-400">Include registered users ({allUsers.length})</span>
              </label>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800 flex items-center gap-2">
              <span className="text-xs text-gray-500">Effective recipients:</span>
              <span className="text-sm text-white font-semibold">
                {computeBroadcastRecipients().length}
              </span>
              <span className="text-[10px] text-gray-600">(deduped by email)</span>
            </div>
          </div>

          {/* Compose */}
          <div className="grid grid-cols-1 gap-3">
            <input
              type="text"
              value={broadcast.subject}
              onChange={e => { setBroadcast(b => ({ ...b, subject: e.target.value })); setBroadcastMsg(''); }}
              placeholder="Subject line"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50"
            />
            <textarea
              value={broadcast.text}
              onChange={e => { setBroadcast(b => ({ ...b, text: e.target.value })); setBroadcastMsg(''); }}
              rows={5}
              placeholder="Plain-text body (for clients that don't render HTML)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-y"
            />
            <details className="group">
              <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-400 select-none">
                + HTML body (optional — rich layout)
              </summary>
              <textarea
                value={broadcast.html}
                onChange={e => { setBroadcast(b => ({ ...b, html: e.target.value })); setBroadcastMsg(''); }}
                rows={6}
                placeholder="<p>Hi {{name}}, …</p>"
                className="w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 font-mono resize-y"
              />
            </details>
            <div className="flex items-center justify-between">
              <div className="text-xs">
                {broadcastMsg && (
                  <span className={broadcastMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}>
                    {broadcastMsg}
                  </span>
                )}
              </div>
              <button
                onClick={sendBroadcast}
                disabled={broadcastSending || !broadcast.subject.trim()}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
              >
                {broadcastSending
                  ? 'Sending…'
                  : `Send to ${computeBroadcastRecipients().length}`}
              </button>
            </div>
          </div>

          {/* Broadcast history */}
          {broadcastHistory.length > 0 && (
            <div className="mt-5 pt-4 border-t border-gray-800">
              <h3 className="text-xs text-gray-500 uppercase mb-2 tracking-wide">Recent broadcasts</h3>
              <div className="space-y-1.5">
                {broadcastHistory.slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center justify-between bg-gray-800/30 border border-gray-800 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-white truncate">{b.subject}</p>
                      <p className="text-[10px] text-gray-600">
                        {new Date(b.created_at).toLocaleString()} —
                        {' '}{b.sent_count}/{b.recipient_count} sent
                        {b.queued_count ? ` · ${b.queued_count} queued` : ''}
                        {b.failed_count ? ` · ${b.failed_count} failed` : ''}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${
                      b.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                      b.status === 'sending' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                      b.status === 'failed' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                      'bg-gray-700/50 text-gray-400 border border-gray-700'
                    }`}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* AI Systems Overview — Admin only */}
      {isAdmin && <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">AI Intelligence Engine</h2>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              connectedCount >= 3 ? 'bg-green-500/20 text-green-400' :
              connectedCount >= 1 ? 'bg-amber-500/20 text-amber-400' :
              'bg-gray-500/20 text-gray-400'
            }`}>
              {connectedCount}/4 Connected
            </span>
            {aiStatus?.council?.connected && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                Council Active
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
          {AI_SYSTEMS.map(sys => {
            const status = aiStatus?.[sys.key];
            const cm = colorMap[sys.color];
            return (
              <div key={sys.key} className={`border rounded-lg p-4 ${status?.connected ? cm.bg : 'bg-gray-800/30 border-gray-700'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${status?.connected ? cm.dot : 'bg-gray-600'}`} />
                  <span className="text-sm font-medium text-white">{sys.name}</span>
                  <span className={`text-[10px] ml-auto ${status?.connected ? cm.text : 'text-gray-600'}`}>
                    {status?.connected ? 'Connected' : 'No Key'}
                  </span>
                </div>
                <p className="text-[10px] text-gray-500">{sys.role} — {sys.desc}</p>
              </div>
            );
          })}
        </div>

        {/* API Key Configuration */}
        <div className="border-t border-gray-800 pt-5">
          <h3 className="text-sm font-semibold text-white mb-3">API Key Configuration</h3>
          <p className="text-xs text-gray-500 mb-4">
            Enter your API keys below. Keys are stored securely in Supabase and loaded at runtime.
            You need at least 2 LLM keys (Claude + GPT or Gemini) for AI Council mode.
          </p>

          <div className="space-y-3">
            {AI_SYSTEMS.map(sys => (
              <div key={sys.key} className="flex items-center gap-3">
                <label className="text-xs text-gray-400 w-24 shrink-0">{sys.name.split(' ')[0]}</label>
                <input
                  type="password"
                  value={keys[sys.key]}
                  onChange={e => setKeys(prev => ({ ...prev, [sys.key]: e.target.value }))}
                  placeholder={`${sys.key === 'anthropic' ? 'sk-ant-...' : sys.key === 'openai' ? 'sk-...' : sys.key === 'gemini' ? 'AIza...' : 'xi-...'}`}
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 font-mono"
                />
                {keys[sys.key] && (
                  <span className="text-[10px] text-gray-600 font-mono w-24 truncate">{maskKey(keys[sys.key])}</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={saveKeys}
              disabled={saving}
              className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save API Keys'}
            </button>
            {saveMsg && (
              <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                {saveMsg}
              </span>
            )}
          </div>
        </div>
      </div>}

      {/* Platform Info */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h2 className="text-lg font-semibold text-white mb-3">Platform Information</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase">Version</p>
            <p className="text-sm text-white font-medium mt-1">CropsIntelV2</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase">Domain</p>
            <p className="text-sm text-white font-medium mt-1">cropsintel.com</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase">Data Scope</p>
            <p className="text-sm text-white font-medium mt-1">11 Crop Years</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase">ABC Reports</p>
            <p className="text-sm text-white font-medium mt-1">106 Monthly</p>
          </div>
        </div>
      </div>

      {/* WhatsApp Templates — Admin only */}
      {isAdmin && <WhatsAppTemplatesPanel />}

      {/* How It Works — Admin only */}
      {isAdmin && (
        <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-2">How AI Keys Work</h3>
          <div className="text-xs text-gray-400 leading-relaxed space-y-2">
            <p>
              API keys are stored in the Supabase <code className="text-green-400/80 bg-gray-800 px-1 rounded">system_config</code> table
              and loaded when any AI-powered page opens. Keys can also be set via <code className="text-green-400/80 bg-gray-800 px-1 rounded">VITE_</code> environment
              variables for local development.
            </p>
            <p>
              Fast Mode uses Claude as the primary AI with GPT/Gemini as fallbacks. Council Mode queries all 3 LLMs independently
              for high-stakes trade decisions, then Claude synthesizes a consensus. ElevenLabs provides Zyra's voice for any text response.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── WhatsApp Templates admin panel ──────────────────────────────────
// Pulls templates from Twilio Content API + WhatsApp ApprovalRequests via
// the `whatsapp-templates-sync` edge fn, then shows status per template
// (approved / pending / rejected) plus the ContentSid. This is the panel
// the admin uses to verify: "are our invite + OTP templates actually live
// on Twilio, or are we still falling back to freeform (which WhatsApp
// silently drops outside the 24h window)?"
function WhatsAppTemplatesPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastReport, setLastReport] = useState(null);
  const [err, setErr] = useState(null);

  async function loadRows() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('template_key, twilio_friendly_name, twilio_content_sid, category, approval_status, language_code, body_preview, last_synced_at')
        .order('category', { ascending: true })
        .order('template_key', { ascending: true });
      if (error) throw error;
      setRows(data || []);
    } catch (e) {
      setErr(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadRows(); }, []);

  async function handleSync({ dryRun = false } = {}) {
    setSyncing(true);
    setErr(null);
    setLastReport(null);
    try {
      const report = await syncWhatsAppTemplates({ dryRun });
      setLastReport(report);
      if (!dryRun) await loadRows();
    } catch (e) {
      setErr(`Sync failed: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  }

  const approved = rows.filter(r => r.approval_status === 'approved' && r.twilio_content_sid).length;
  const pending  = rows.filter(r => r.approval_status === 'pending' || !r.twilio_content_sid).length;
  const rejected = rows.filter(r => r.approval_status === 'rejected').length;

  return (
    <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-white">WhatsApp Templates</h2>
          <p className="text-xs text-gray-400 mt-1 leading-relaxed max-w-2xl">
            Pulls your live Twilio Content templates + Meta approval status. Any template without a ContentSid or not in <code className="text-amber-400">approved</code> status will fall back to freeform
            — which <b className="text-red-400">WhatsApp silently drops</b> if the recipient hasn't messaged us in the last 24h (this was the OTP bug).
            Sync re-reads from Twilio and overwrites any stale DB rows.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleSync({ dryRun: true })}
            disabled={syncing}
            className="px-3 py-1.5 rounded-lg text-xs border border-gray-700 text-gray-300 hover:border-gray-500 disabled:opacity-40"
          >
            {syncing ? 'Checking…' : 'Dry-run'}
          </button>
          <button
            onClick={() => handleSync({ dryRun: false })}
            disabled={syncing}
            className="px-4 py-1.5 rounded-lg text-xs bg-green-600 hover:bg-green-500 text-white font-medium disabled:opacity-40"
          >
            {syncing ? 'Syncing…' : 'Sync from Twilio'}
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        <div className="bg-gray-800/40 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase">Total</p>
          <p className="text-lg text-white font-bold">{rows.length}</p>
        </div>
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <p className="text-[10px] text-green-400 uppercase">Approved</p>
          <p className="text-lg text-green-300 font-bold">{approved}</p>
        </div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <p className="text-[10px] text-amber-400 uppercase">Pending</p>
          <p className="text-lg text-amber-300 font-bold">{pending}</p>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-[10px] text-red-400 uppercase">Rejected</p>
          <p className="text-lg text-red-300 font-bold">{rejected}</p>
        </div>
      </div>

      {err && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">{err}</div>
      )}
      {lastReport?.report && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-blue-300">
          Twilio returned {lastReport.report.twilio_total} template{lastReport.report.twilio_total === 1 ? '' : 's'}. Synced {lastReport.report.synced.length}; {lastReport.report.errors.length} error(s).
          {lastReport.report.dry_run && <span className="ml-2 text-blue-400">(dry-run — no DB writes)</span>}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <p className="text-xs text-gray-500">Loading templates…</p>
      ) : rows.length === 0 ? (
        <div className="px-3 py-6 rounded-lg border border-dashed border-gray-700 text-center">
          <p className="text-sm text-gray-400">No templates in the DB yet.</p>
          <p className="text-[11px] text-gray-500 mt-1">Click <b>Sync from Twilio</b> above to hydrate from your live Twilio Content account.</p>
        </div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 sticky top-0 bg-gray-900">
                <th className="text-left py-2 pr-3">Template key</th>
                <th className="text-left py-2 pr-3">Category</th>
                <th className="text-left py-2 pr-3">Status</th>
                <th className="text-left py-2 pr-3">Twilio SID</th>
                <th className="text-left py-2">Last synced</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.template_key} className="border-b border-gray-800/50">
                  <td className="py-2 pr-3">
                    <div className="text-gray-200 font-mono">{r.template_key}</div>
                    {r.twilio_friendly_name && r.twilio_friendly_name !== r.template_key && (
                      <div className="text-[10px] text-gray-500">twilio: {r.twilio_friendly_name}</div>
                    )}
                    {r.body_preview && (
                      <div className="text-[10px] text-gray-500 mt-0.5 line-clamp-1" title={r.body_preview}>{r.body_preview}</div>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      r.category === 'authentication' ? 'bg-blue-500/20 text-blue-400' :
                      r.category === 'marketing'     ? 'bg-purple-500/20 text-purple-400' :
                                                       'bg-gray-500/20 text-gray-400'
                    }`}>
                      {r.category}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      r.approval_status === 'approved' ? 'bg-green-500/20 text-green-400' :
                      r.approval_status === 'rejected' ? 'bg-red-500/20 text-red-400'   :
                      r.approval_status === 'paused'   ? 'bg-amber-500/20 text-amber-400':
                                                         'bg-gray-500/20 text-gray-400'
                    }`}>
                      {r.approval_status || 'pending'}
                    </span>
                  </td>
                  <td className="py-2 pr-3 font-mono text-gray-400 text-[10px]">
                    {r.twilio_content_sid || <span className="text-red-400/80">— not set</span>}
                  </td>
                  <td className="py-2 text-gray-500 text-[10px]">
                    {r.last_synced_at ? new Date(r.last_synced_at).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-gray-600 mt-3">
        See <code className="text-gray-400">docs/WHATSAPP_TEMPLATES.md</code> for the runbook — how to create + submit templates in Twilio Content Editor, the role → template map, and approval-category guidance.
      </p>
    </div>
  );
}
