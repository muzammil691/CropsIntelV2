import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { loadAPIKeys, getAIStatus } from '../lib/ai-engine';
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
    if (isAdmin) loadAllUsers();
  }, [isAdmin]);

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
                  <option value="buyer">Buyer</option>
                  <option value="seller">Seller</option>
                  <option value="broker">Broker</option>
                  <option value="analyst">Analyst</option>
                  <option value="admin">Admin</option>
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

      {/* Admin: User Management */}
      {isAdmin && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
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
                  <option value="buyer">Buyer</option><option value="seller">Seller</option><option value="broker">Broker</option>
                  <option value="analyst">Analyst</option><option value="admin">Admin</option>
                </select>
                <select value={newUser.access_tier} onChange={e => setNewUser(p => ({ ...p, access_tier: e.target.value }))}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-500/50">
                  {ACCESS_TIERS.map(t => <option key={t} value={t}>{TIER_LABELS[t]}</option>)}
                </select>
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
                      <option value="buyer">Buyer</option>
                      <option value="seller">Seller</option>
                      <option value="broker">Broker</option>
                      <option value="analyst">Analyst</option>
                      <option value="admin">Admin</option>
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
            <p className="text-sm text-white font-medium mt-1">10 Years</p>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-3">
            <p className="text-[10px] text-gray-500 uppercase">Reports</p>
            <p className="text-sm text-white font-medium mt-1">116 Monthly</p>
          </div>
        </div>
      </div>

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
