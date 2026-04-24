-- CropsIntelV2 — email_queue table
-- Created 2026-04-25
--
-- Context: the email-send edge function has three tiers — SMTP → Resend → queue.
-- The SMTP path was disabled (denomailer 502 at Supabase edge runtime) and no
-- Resend key is configured yet, so EVERY email currently falls through to the
-- queue. Without this table the emails were silently dropped. This migration
-- creates the queue so a server-side Node cron can flush it via nodemailer
-- (which works fine outside Deno Deploy).
--
-- Also adds an index on status+created_at for the flusher's pull query.

CREATE TABLE IF NOT EXISTS public.email_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  to_address     TEXT NOT NULL,
  subject        TEXT NOT NULL,
  html           TEXT,
  body           TEXT,                      -- plain-text fallback
  email_type     TEXT,                      -- invite / upgrade / trade_alert / custom / broadcast
  status         TEXT NOT NULL DEFAULT 'queued',  -- queued | sending | sent | failed
  attempts       INT NOT NULL DEFAULT 0,
  last_error     TEXT,
  sent_at        TIMESTAMPTZ,
  queued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status_created
  ON public.email_queue (status, created_at);
CREATE INDEX IF NOT EXISTS idx_email_queue_to_address
  ON public.email_queue (to_address);

-- RLS — only service-role can read/write; admins can view via Settings panel.
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.email_queue;
CREATE POLICY "Service role full access"
  ON public.email_queue FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admin can view queue" ON public.email_queue;
CREATE POLICY "Admin can view queue"
  ON public.email_queue FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

COMMENT ON TABLE public.email_queue IS
  'Outbound email queue — email-send edge fn inserts when SMTP/Resend paths fail or are disabled. Flushed by server-side Node cron.';
