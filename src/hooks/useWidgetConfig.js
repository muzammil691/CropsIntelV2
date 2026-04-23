import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

/**
 * useWidgetConfig(widgetKey, defaultConfig)
 *
 * Wave 5 (2026-04-24) — Widget Library foundation.
 *
 * Merges the latest published `widget_configs` row (if any) for the given
 * `widgetKey` over `defaultConfig` (which is the widget's hardcoded default).
 *
 * Returns:
 *   {
 *     config:     object — defaultConfig shallow-merged with the DB config
 *     loading:    bool   — true while the fetch is in flight
 *     isDefault:  bool   — true if no published DB row was found (or user is anon)
 *     error:      string — non-null on DB error (non-fatal; defaults still returned)
 *     reload:     fn     — force a re-fetch (e.g. after Workshop publishes a change)
 *   }
 *
 * Design notes:
 *   • Anon users never hit the table (RLS requires auth + status='published').
 *     We short-circuit to defaults so unauthenticated pages stay snappy.
 *   • We shallow-merge so partial overrides work: DB can override just
 *     `title` or `colors` without clobbering the whole defaults block.
 *   • If the table doesn't exist yet (migration not yet applied to the
 *     live DB), we silently fall back to defaults — the page still works.
 *   • The dependency array uses JSON.stringify(defaultConfig) so that
 *     callers passing an inline object literal don't cause an infinite
 *     re-fetch loop. For expensive/deep defaults, memoize at the call site.
 */
export function useWidgetConfig(widgetKey, defaultConfig = {}) {
  const [state, setState] = useState({
    config: defaultConfig,
    loading: true,
    isDefault: true,
    error: null,
  });

  // Reload counter lets callers force a re-fetch
  const [reloadTick, setReloadTick] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!widgetKey) {
      setState({
        config: defaultConfig,
        loading: false,
        isDefault: true,
        error: null,
      });
      return;
    }

    let cancelled = false;

    (async () => {
      setState(prev => ({ ...prev, loading: true }));

      try {
        // Anon short-circuit: RLS requires auth.uid() so we wouldn't see
        // anything anyway. Skip the round-trip.
        const { data: sess } = await supabase.auth.getSession();
        if (!sess?.session?.user) {
          if (!cancelled && mountedRef.current) {
            setState({
              config: defaultConfig,
              loading: false,
              isDefault: true,
              error: null,
            });
          }
          return;
        }

        const { data, error } = await supabase
          .from('widget_configs')
          .select('config, version, published_at')
          .eq('widget_key', widgetKey)
          .eq('status', 'published')
          .order('published_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled || !mountedRef.current) return;

        if (error) {
          // Common harmless case: the table doesn't exist yet in this env.
          // Return defaults + surface error for debug panels (but don't break UI).
          const tableMissing = /relation .*widget_configs.* does not exist/i.test(error.message || '');
          setState({
            config: defaultConfig,
            loading: false,
            isDefault: true,
            error: tableMissing ? null : (error.message || String(error)),
          });
          return;
        }

        if (data?.config && typeof data.config === 'object') {
          setState({
            config: { ...defaultConfig, ...data.config },
            loading: false,
            isDefault: false,
            error: null,
          });
        } else {
          setState({
            config: defaultConfig,
            loading: false,
            isDefault: true,
            error: null,
          });
        }
      } catch (err) {
        if (cancelled || !mountedRef.current) return;
        setState({
          config: defaultConfig,
          loading: false,
          isDefault: true,
          error: err?.message || String(err),
        });
      }
    })();

    return () => { cancelled = true; };
    // JSON.stringify is a deliberate shallow-equality helper; OK for small
    // configs. Heavy defaults should useMemo at the call site.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetKey, JSON.stringify(defaultConfig), reloadTick]);

  const reload = () => setReloadTick(t => t + 1);

  return { ...state, reload };
}

/**
 * Convenience helper for the Workshop UI: upsert a draft version for a
 * widget_key, auto-incrementing version from the latest row.
 *
 * Admin-only at the RLS level; non-admins will see a PostgREST 403.
 *
 * @param {string} widgetKey
 * @param {object} config
 * @param {object} meta — optional { title, description, publish: true|false }
 * @returns {Promise<{ id, version, status } | { error }>}
 */
export async function saveWidgetDraft(widgetKey, config, meta = {}) {
  const { title = null, description = null, publish = false } = meta;

  // Find latest version for this widget_key
  const { data: existing, error: fetchErr } = await supabase
    .from('widget_configs')
    .select('version')
    .eq('widget_key', widgetKey)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchErr) return { error: fetchErr.message || String(fetchErr) };

  const nextVersion = (existing?.version || 0) + 1;

  const { data, error } = await supabase
    .from('widget_configs')
    .insert({
      widget_key: widgetKey,
      version: nextVersion,
      status: 'draft',
      title,
      description,
      config,
    })
    .select('id, version, status')
    .single();

  if (error) return { error: error.message || String(error) };

  if (publish) {
    const { error: pubErr } = await supabase.rpc('publish_widget_config', {
      p_widget_key: widgetKey,
      p_version: nextVersion,
    });
    if (pubErr) return { ...data, publishError: pubErr.message || String(pubErr) };
    return { ...data, status: 'published' };
  }

  return data;
}

export default useWidgetConfig;
