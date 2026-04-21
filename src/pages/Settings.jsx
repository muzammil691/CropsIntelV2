import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { loadAPIKeys, getAIStatus } from '../lib/ai-engine';
import { useAuth } from '../lib/auth';

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
  const { isAuthenticated } = useAuth();
  const [keys, setKeys] = useState({ anthropic: '', openai: '', gemini: '', elevenlabs: '' });
  const [aiStatus, setAiStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadSettings(); }, []);

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

      {/* AI Systems Overview */}
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
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
      </div>

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
            <p className="text-sm text-white font-medium mt-1">cropsintel.net</p>
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

      {/* How It Works */}
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
    </div>
  );
}
