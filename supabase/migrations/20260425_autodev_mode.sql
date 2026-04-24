-- CropsIntel V2 — Auto Dev Mode foundation (Mini-Phase 0)
-- 2026-04-25 · User directive: Claude works autonomously, broadcasts state to /map,
-- asks admin via WhatsApp (+971527854447) when stuck, never blocks on user.
--
-- Tables:
--   1. autodev_status       — singleton row with live worker state (for /map banner)
--   2. autodev_questions    — question queue Claude writes to; admin answers via WhatsApp
--   3. autodev_tasks        — history of tasks worked on (audit + "what's live right now")
--
-- Non-destructive: all CREATE IF NOT EXISTS + idempotent seeds.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- (1) autodev_status — singleton row (id = 1)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS autodev_status (
  id               INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state            TEXT NOT NULL DEFAULT 'idle'
                      CHECK (state IN ('idle','working','waiting','blocked','error')),
  worker_type      TEXT NOT NULL DEFAULT 'claude-session'
                      CHECK (worker_type IN ('claude-session','runner','manual')),
  current_task_id  UUID,
  current_task_title TEXT,
  current_task_detail TEXT,
  last_heartbeat   TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_started_at TIMESTAMPTZ DEFAULT now(),
  open_questions_count INT NOT NULL DEFAULT 0,
  total_tasks_completed INT NOT NULL DEFAULT 0,
  last_error       TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed the singleton row (upsert safe)
INSERT INTO autodev_status (id, state, worker_type, current_task_title)
VALUES (1, 'idle', 'claude-session', NULL)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_autodev_status_heartbeat ON autodev_status (last_heartbeat DESC);

-- ═══════════════════════════════════════════════════════════════════
-- (2) autodev_questions — question queue
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS autodev_questions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asked_by         TEXT NOT NULL DEFAULT 'claude-session',  -- 'claude-session' | 'runner'
  question         TEXT NOT NULL,
  suggestion       TEXT,       -- Claude's recommended answer (research-driven)
  options          JSONB,      -- [{ key, label, is_recommended }] — numbered 1..N
  context          JSONB NOT NULL DEFAULT '{}'::jsonb,
  asked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at       TIMESTAMPTZ,  -- NULL = no expiry; blocks work until answered
  status           TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','answered','expired','cancelled')),
  answer_key       TEXT,       -- matches options[].key if option was picked
  answer_text      TEXT,       -- free-text answer from WhatsApp
  answered_at      TIMESTAMPTZ,
  answered_by_phone TEXT,      -- the WhatsApp phone that answered
  whatsapp_sent_sid TEXT,      -- Twilio SID for the outbound question message
  whatsapp_reply_sid TEXT,     -- Twilio SID for the inbound answer message
  priority         TEXT NOT NULL DEFAULT 'normal'
                      CHECK (priority IN ('low','normal','high','blocking')),
  category         TEXT,       -- 'scope' | 'design' | 'data' | 'destructive' | 'credential'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autodev_questions_status_asked ON autodev_questions (status, asked_at DESC);
CREATE INDEX IF NOT EXISTS idx_autodev_questions_open_blocking ON autodev_questions (status, priority) WHERE status = 'open';

-- ═══════════════════════════════════════════════════════════════════
-- (3) autodev_tasks — work log (what was/is being done)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS autodev_tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title            TEXT NOT NULL,
  detail           TEXT,
  mini_phase       TEXT,       -- 'auto-dev-infra' | 'map-rebuild' | 'auth-polish' | ...
  status           TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','in_progress','blocked','done','cancelled')),
  blocked_by_question_id UUID REFERENCES autodev_questions(id) ON DELETE SET NULL,
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  files_touched    TEXT[],
  commit_sha       TEXT,
  notes            TEXT,
  assigned_worker  TEXT NOT NULL DEFAULT 'claude-session',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autodev_tasks_status ON autodev_tasks (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_autodev_tasks_mini_phase ON autodev_tasks (mini_phase);

-- ═══════════════════════════════════════════════════════════════════
-- RLS — admin and maxons_team can read/write; everyone else nothing
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE autodev_status    ENABLE ROW LEVEL SECURITY;
ALTER TABLE autodev_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE autodev_tasks     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS autodev_status_team_all ON autodev_status;
CREATE POLICY autodev_status_team_all ON autodev_status
  FOR ALL TO authenticated
  USING ( EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid()
                  AND (user_profiles.role IN ('admin','super_admin')
                       OR user_profiles.access_tier IN ('admin','maxons_team'))) )
  WITH CHECK ( EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid()
                       AND (user_profiles.role IN ('admin','super_admin')
                            OR user_profiles.access_tier IN ('admin','maxons_team'))) );

DROP POLICY IF EXISTS autodev_questions_team_all ON autodev_questions;
CREATE POLICY autodev_questions_team_all ON autodev_questions
  FOR ALL TO authenticated
  USING ( EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid()
                  AND (user_profiles.role IN ('admin','super_admin')
                       OR user_profiles.access_tier IN ('admin','maxons_team'))) )
  WITH CHECK ( EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid()
                       AND (user_profiles.role IN ('admin','super_admin')
                            OR user_profiles.access_tier IN ('admin','maxons_team'))) );

DROP POLICY IF EXISTS autodev_tasks_team_all ON autodev_tasks;
CREATE POLICY autodev_tasks_team_all ON autodev_tasks
  FOR ALL TO authenticated
  USING ( EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid()
                  AND (user_profiles.role IN ('admin','super_admin')
                       OR user_profiles.access_tier IN ('admin','maxons_team'))) )
  WITH CHECK ( EXISTS (SELECT 1 FROM user_profiles WHERE user_profiles.id = auth.uid()
                       AND (user_profiles.role IN ('admin','super_admin')
                            OR user_profiles.access_tier IN ('admin','maxons_team'))) );

-- ═══════════════════════════════════════════════════════════════════
-- Helpers: derived view for /map and heartbeat bump fn
-- ═══════════════════════════════════════════════════════════════════

-- View: autodev_live — flattened view for frontend
CREATE OR REPLACE VIEW autodev_live AS
SELECT
  s.state,
  s.worker_type,
  s.current_task_title,
  s.current_task_detail,
  s.last_heartbeat,
  EXTRACT(EPOCH FROM (now() - s.last_heartbeat))::INT AS seconds_since_heartbeat,
  s.open_questions_count,
  s.total_tasks_completed,
  s.last_error,
  s.session_started_at,
  (SELECT COUNT(*) FROM autodev_questions WHERE status = 'open' AND priority = 'blocking') AS blocking_questions,
  (SELECT COUNT(*) FROM autodev_tasks WHERE status = 'in_progress') AS tasks_in_progress
FROM autodev_status s
WHERE s.id = 1;

-- Fn: autodev_heartbeat — bump state + task; called by worker every 2 min
CREATE OR REPLACE FUNCTION autodev_heartbeat(
  p_state TEXT,
  p_worker_type TEXT,
  p_current_task_title TEXT DEFAULT NULL,
  p_current_task_detail TEXT DEFAULT NULL,
  p_last_error TEXT DEFAULT NULL
) RETURNS autodev_status LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result autodev_status;
BEGIN
  UPDATE autodev_status SET
    state = p_state,
    worker_type = p_worker_type,
    current_task_title = COALESCE(p_current_task_title, current_task_title),
    current_task_detail = COALESCE(p_current_task_detail, current_task_detail),
    last_heartbeat = now(),
    last_error = p_last_error,
    open_questions_count = (SELECT COUNT(*) FROM autodev_questions WHERE status = 'open'),
    updated_at = now()
  WHERE id = 1
  RETURNING * INTO result;
  RETURN result;
END;
$$;

COMMIT;
