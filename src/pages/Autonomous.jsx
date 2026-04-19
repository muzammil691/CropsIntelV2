import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Autonomous() {
  const [logs, setLogs] = useState([]);
  const [config, setConfig] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const { data: logData } = await supabase
        .from('scraping_logs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(20);

      const { data: configData } = await supabase
        .from('system_config')
        .select('*');

      if (logData) setLogs(logData);
      if (configData) {
        const configMap = {};
        configData.forEach(c => { configMap[c.key] = c.value; });
        setConfig(configMap);
      }
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-white mb-2">Autonomous Systems</h2>
      <p className="text-gray-400 text-sm mb-8">Monitor and control the self-running data pipeline</p>

      {/* System Config */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Scraping Schedule</h3>
          <p className="text-white text-sm">Monthly (15th at 8 AM UTC)</p>
          <p className="text-xs text-gray-500 mt-1">almonds.org Position & Shipment Reports</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Auto-Analysis</h3>
          <p className={`text-sm ${config.auto_analysis_enabled ? 'text-green-400' : 'text-red-400'}`}>
            {config.auto_analysis_enabled ? 'Enabled' : 'Disabled'}
          </p>
          <p className="text-xs text-gray-500 mt-1">YoY, anomalies, trade signals</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <h3 className="text-sm font-medium text-gray-400 mb-2">Data Reprocess</h3>
          <p className="text-white text-sm">Weekly (Mondays 6 AM UTC)</p>
          <p className="text-xs text-gray-500 mt-1">Recalculate trends & anomalies</p>
        </div>
      </div>

      {/* Activity Log */}
      <h3 className="text-lg font-semibold text-white mb-4">Activity Log</h3>
      {logs.length > 0 ? (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-gray-900 border border-gray-800 rounded-lg px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className={`w-2 h-2 rounded-full ${
                  log.status === 'success' ? 'bg-green-500' :
                  log.status === 'failed' ? 'bg-red-500' :
                  log.status === 'started' ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-500'
                }`} />
                <div>
                  <p className="text-sm text-white">{log.scraper_name}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(log.started_at).toLocaleString()}
                    {log.duration_ms && ` (${log.duration_ms}ms)`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  log.status === 'success' ? 'bg-green-500/20 text-green-400' :
                  log.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                  log.status === 'skipped' ? 'bg-gray-500/20 text-gray-400' :
                  'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {log.status}
                </span>
                {log.records_inserted > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    +{log.records_inserted} records
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-xl text-gray-400 mb-2">No activity yet</p>
          <p className="text-sm text-gray-600">
            Start the runner: <code className="bg-gray-800 px-2 py-1 rounded text-green-400">npm run auto</code>
          </p>
        </div>
      )}
    </div>
  );
}
