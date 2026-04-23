-- ═══════════════════════════════════════════════════════════════
-- CROPSINTEL V2 — Apply-all migration bundle for 2026-04-24
-- ═══════════════════════════════════════════════════════════════
--
-- Paste this entire file into the Supabase SQL Editor and click Run.
-- Safe to re-run: all statements are idempotent (ADD COLUMN IF NOT
-- EXISTS, CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING).
--
-- What it does (in order):
--   1. V2 Welcome tracking columns on user_profiles
--   2. email_subscribers + email_broadcasts tables + RLS
--   3. Profile grades/sizes/references columns on user_profiles
--   4. V1 user seed from 2026-04-23 CSV export (63 rows)
--
-- After this runs, the Broadcast panel (admin) will show 63
-- V1 users under the 'v1_registered' cohort, and any V1 user
-- who logs in with WhatsApp OTP will be routed through the
-- 3-step V2 Welcome (password → email verify → profile nudge).
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- (1) V2 Welcome tracking — from 20260424_v2_welcome_tracking.sql
-- ─────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS v2_welcome_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.user_profiles.v2_welcome_completed_at IS
  'When the user completed the V2 Welcome flow (password set + email+verify prompt acknowledged). NULL = not yet seen; routes user through /set-password on next OTP login.';

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS migrated_from_v1 BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.user_profiles.migrated_from_v1 IS
  'TRUE for profiles carried over from CropsIntel V1. Used by Login.jsx to decide whether to show /set-password on first V2 login.';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'source'
  ) THEN
    UPDATE public.user_profiles
       SET migrated_from_v1 = TRUE
     WHERE source = 'v1_migration'
       AND migrated_from_v1 = FALSE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_profiles_v2_welcome_completed_at
  ON public.user_profiles (v2_welcome_completed_at)
  WHERE v2_welcome_completed_at IS NULL;

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- (2) Email subscribers + broadcasts — from 20260424_email_subscribers.sql
-- ─────────────────────────────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS public.email_subscribers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email              TEXT NOT NULL,
  name               TEXT,
  source             TEXT NOT NULL DEFAULT 'v2_signup',
  subscribed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unsubscribed_at    TIMESTAMPTZ,
  user_profile_id    UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  converted_at       TIMESTAMPTZ,
  tags               TEXT[] DEFAULT '{}',
  metadata           JSONB DEFAULT '{}'::jsonb,
  last_email_sent_at TIMESTAMPTZ,
  email_count        INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT email_subscribers_email_lower_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_email_subscribers_source        ON public.email_subscribers (source);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_subscribed_at ON public.email_subscribers (subscribed_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_tags          ON public.email_subscribers USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_email_subscribers_user_profile  ON public.email_subscribers (user_profile_id) WHERE user_profile_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_broadcasts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_by           UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  subject           TEXT NOT NULL,
  html              TEXT,
  text              TEXT,
  cohort_filter     JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_count   INT NOT NULL DEFAULT 0,
  sent_count        INT NOT NULL DEFAULT 0,
  queued_count      INT NOT NULL DEFAULT 0,
  failed_count      INT NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending',
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_broadcasts_sent_by ON public.email_broadcasts (sent_by);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_status  ON public.email_broadcasts (status);
CREATE INDEX IF NOT EXISTS idx_email_broadcasts_created ON public.email_broadcasts (created_at DESC);

ALTER TABLE public.email_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_broadcasts  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins full access to subscribers" ON public.email_subscribers;
CREATE POLICY "Admins full access to subscribers"
  ON public.email_subscribers FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')));

DROP POLICY IF EXISTS "Admins full access to broadcasts" ON public.email_broadcasts;
CREATE POLICY "Admins full access to broadcasts"
  ON public.email_broadcasts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND (role = 'admin' OR access_tier = 'admin')));

DROP POLICY IF EXISTS "Anyone can subscribe" ON public.email_subscribers;
CREATE POLICY "Anyone can subscribe"
  ON public.email_subscribers FOR INSERT
  WITH CHECK (true);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- (3) Profile grades/sizes/references — from 20260424_profile_grades_sizes_refs.sql
-- ─────────────────────────────────────────────────────────────
BEGIN;

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS preferred_grades TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_sizes  TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "references"      TEXT;

CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_grades
  ON public.user_profiles USING GIN (preferred_grades);

CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_sizes
  ON public.user_profiles USING GIN (preferred_sizes);

COMMIT;

-- ─────────────────────────────────────────────────────────────
-- (4) V1 seed from CSV — from 20260424_v1_seed_from_csv.sql
-- ─────────────────────────────────────────────────────────────
BEGIN;

UPDATE public.user_profiles
SET migrated_from_v1 = TRUE,
    source           = COALESCE(source, 'v1_migration')
WHERE id IN (
  '0c64f2b5-a408-4b25-959b-d286cba0edab', 'ab33ea37-dcc9-4bb8-8bd1-20a1ff1fa6aa',
  'fda37146-caea-4651-8ae3-8ba76b5f216b', 'ecbde2ae-a522-4f5f-8301-085d7601b43b',
  'df010b21-7620-4f04-bfce-0aa4289065fa', 'd0b48b09-9c3f-479a-bef2-87d1ad02ac6e',
  '2dd65633-c77d-48bc-9926-10bf59389c7d', '659f0b98-9fd5-4c14-9c5f-f69a614fa368',
  '2561da7a-7cbc-43e6-8355-5fce0659024c', 'a5abd2c1-8a0f-4257-ac1d-db5d124da754',
  '2045e858-c31f-49ec-ac22-4d7080b36dd3', '267b27d6-0e62-4cd7-a477-e3c2700f51f7',
  '893661f0-2482-4a78-90bc-da88f8926d79', '9253fb01-8550-4a0f-baf8-28caee2a5f3a',
  'ece6b950-b921-492e-ab34-937fdb348eeb', '2ccf9cbd-6be3-4719-bd4e-4b5668791f9e',
  '3a6daabf-bab2-4536-ae3d-712d03786fd0', '2e634069-db3b-430b-a4b4-813a2cf62ece',
  '6f64fe41-518c-494f-a4a6-31699e5b16e8', 'a1ee54a5-0532-4f69-b8ba-b29ba686ad44',
  '4e212508-1364-4e79-ac6a-6e4a683c7da7', 'b82a6716-f932-4607-915f-8a36da308b96',
  '9448b04e-0ce5-410e-9d54-d3ff4bb21103', 'ece9dc2b-9cb0-4d4f-956f-78ef76645635',
  '68e1802f-853d-4275-8b41-328f45a0e02a', '3a929028-adce-4309-9b35-ffa1bf1bdb22',
  '82bc5f21-70a3-42d9-b05e-e574b0127d66', '1413454b-9520-45f8-95a4-b794ecad85e7',
  'd2197c18-2706-4cfc-a3a0-3dfc0e8de305', '237b2202-f744-482a-9d97-89d923bb9f1f',
  '5d086b31-fd61-4403-9f36-c0f10a9a68cb', '33cdd3e9-b4bf-40cc-9e09-726b12e1bbee',
  'be51c8e5-dad7-4ac9-a279-fbe65215e9a4', '93b56fb8-a149-45ae-882d-3a016b11cc3a',
  'e9033d6d-abbc-4c62-b0d1-07a687756f90', 'a3fd4a06-f60a-41c0-810a-2d77ea12a8f4',
  '2ef620e0-bc24-4526-a9c1-2922f163807a', '1c36e3a4-51c7-4d29-a226-9698219c4071',
  'e0ac7136-a9ae-4380-b1e2-6cfad7148e26', '87fca8e4-b7af-458e-97f7-0505ee276d3f',
  '6f010316-61f1-4261-8152-e5e97a487b26', '133aadde-26f5-4269-8f3e-2135b0405b3f',
  '7bbeb386-a0b6-4082-9885-7d8cb9d08d86', 'd236dae4-cf59-4c21-97c2-e97a26ac359b',
  '988fb74e-a8c7-4192-8780-965b72458daf', 'a5d1f27e-922a-4156-97cd-c570c5813e68',
  '693a177d-82f2-424e-b1db-7f1185e0e856', '0ea5f5ac-cc4f-4a3b-a1c0-7366df8011dc',
  'a62471c3-7b6c-468c-aa54-7df36ae35916', 'd7717a6b-0d9f-439e-a3be-dc5190cbd0d1',
  '992036a5-f983-4fa9-8c75-9a208ce57918', '9940455f-a316-4756-8b87-5fc9dc2e4c3b',
  '36102c29-b943-4da6-9b24-3730e2de604c', '00a56d71-d5b9-44fd-88a4-adf2b16e7528',
  '99df8ab1-4345-4d17-908b-d836e6749c0f', '34d59a64-14c6-48ea-97fc-825a43520bd3',
  'c01d9b5c-1bf2-4c47-8011-e01d86223dcb', '0c0ed4eb-bca2-46c9-8934-1e64e3768329',
  'f3110484-7c03-4fe4-9dbc-bba02b2aeb63', '961561c8-dec1-454d-a4e4-cdd60c384b5c',
  '28e1ee99-999f-4c0a-8d86-ba222c1e2762'
);

INSERT INTO public.email_subscribers
  (email, user_profile_id, source, tags, subscribed_at)
VALUES
  ('muzammil.akhtar@me.com',         '0c64f2b5-a408-4b25-959b-d286cba0edab', 'v1_registered', ARRAY['v1','admin','verified_buyer'], '2026-03-13T22:06:28Z'),
  ('rahofakb20@gmail.com',           'ab33ea37-dcc9-4bb8-8bd1-20a1ff1fa6aa', 'v1_registered', ARRAY['v1','supplier','verified_buyer'], '2026-03-13T23:35:59Z'),
  ('mahmoud@aljameelfood.com',       'fda37146-caea-4651-8ae3-8ba76b5f216b', 'v1_registered', ARRAY['v1','customer','verified_buyer'], '2026-03-14T07:30:43Z'),
  ('priyank.dxb@gmail.com',          'ecbde2ae-a522-4f5f-8301-085d7601b43b', 'v1_registered', ARRAY['v1','trader','verified_buyer','importer','50plus'], '2026-03-14T12:37:17Z'),
  ('marium.zoey@gmail.com',          'df010b21-7620-4f04-bfce-0aa4289065fa', 'v1_registered', ARRAY['v1','customer','unverified'], '2026-03-15T20:18:47Z'),
  ('saqib@maxonsnuts.com',           'd0b48b09-9c3f-479a-bef2-87d1ad02ac6e', 'v1_registered', ARRAY['v1','team','maxons','verified_broker'], '2026-03-16T22:29:55Z'),
  ('hammad@maxonsnuts.com',          '2dd65633-c77d-48bc-9926-10bf59389c7d', 'v1_registered', ARRAY['v1','team','maxons','verified_supplier'], '2026-03-17T02:35:06Z'),
  ('qousi.sohel@maxonsnuts.com',     '659f0b98-9fd5-4c14-9c5f-f69a614fa368', 'v1_registered', ARRAY['v1','team','maxons','verified_buyer'], '2026-03-17T09:46:44Z'),
  ('primekhi@gmail.com',             '2561da7a-7cbc-43e6-8355-5fce0659024c', 'v1_registered', ARRAY['v1','trader','verified_buyer'], '2026-03-17T10:22:31Z'),
  ('abdullahih@maxonsnuts.com',      'a5abd2c1-8a0f-4257-ac1d-db5d124da754', 'v1_registered', ARRAY['v1','trader','verified_buyer','wholesaler','50plus'], '2026-03-17T10:31:18Z'),
  ('smh4344@gmail.com',              '2045e858-c31f-49ec-ac22-4d7080b36dd3', 'v1_registered', ARRAY['v1','trader','verified_buyer'], '2026-03-17T10:35:24Z'),
  ('mustafa.akhtar@shaw.ca',         '267b27d6-0e62-4cd7-a477-e3c2700f51f7', 'v1_registered', ARRAY['v1','trader','verified_broker'], '2026-03-18T19:46:57Z'),
  ('info@ugaritllc.com',             '893661f0-2482-4a78-90bc-da88f8926d79', 'v1_registered', ARRAY['v1','unverified'], '2026-03-20T19:46:08Z'),
  ('t.mikati@alsaqrtrading.com',     '9253fb01-8550-4a0f-baf8-28caee2a5f3a', 'v1_registered', ARRAY['v1','trader','importer','unverified'], '2026-03-21T09:54:25Z'),
  ('ekramakhalide@gmail.com',        'ece6b950-b921-492e-ab34-937fdb348eeb', 'v1_registered', ARRAY['v1','unverified'], '2026-03-21T10:25:46Z'),
  ('grcuae@icloud.com',              '2ccf9cbd-6be3-4719-bd4e-4b5668791f9e', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-21T11:06:04Z'),
  ('sameerganatra@me.com',           '3a6daabf-bab2-4536-ae3d-712d03786fd0', 'v1_registered', ARRAY['v1','customer','importer','unverified'], '2026-03-21T11:40:34Z'),
  ('naikyashdxb@gmail.com',          '2e634069-db3b-430b-a4b4-813a2cf62ece', 'v1_registered', ARRAY['v1','customer','unverified'], '2026-03-21T12:16:33Z'),
  ('sikandarkashif1@gmai.com',       '6f64fe41-518c-494f-a4a6-31699e5b16e8', 'v1_registered', ARRAY['v1','customer','verified_buyer','importer','typo_email'], '2026-03-21T12:50:21Z'),
  ('fraz230@hotmail.com',            'a1ee54a5-0532-4f69-b8ba-b29ba686ad44', 'v1_registered', ARRAY['v1','customer','unverified','approved'], '2026-03-21T13:01:49Z'),
  ('livings@live.com',               '4e212508-1364-4e79-ac6a-6e4a683c7da7', 'v1_registered', ARRAY['v1','customer','unverified'], '2026-03-21T13:03:12Z'),
  ('rks.mahima@gmail.com',           'b82a6716-f932-4607-915f-8a36da308b96', 'v1_registered', ARRAY['v1','trader','verified_buyer'], '2026-03-21T15:07:05Z'),
  ('abdulzahir0800@icloud.com',      '9448b04e-0ce5-410e-9d54-d3ff4bb21103', 'v1_registered', ARRAY['v1','unverified'], '2026-03-21T21:01:51Z'),
  ('anurag@esarco.com',              'ece9dc2b-9cb0-4d4f-956f-78ef76645635', 'v1_registered', ARRAY['v1','unverified'], '2026-03-22T03:27:37Z'),
  ('shafena@gmail.com',              '68e1802f-853d-4275-8b41-328f45a0e02a', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-22T10:32:34Z'),
  ('sweetsaiful@gmail.com',          '3a929028-adce-4309-9b35-ffa1bf1bdb22', 'v1_registered', ARRAY['v1','broker','unverified'], '2026-03-23T08:51:14Z'),
  ('ammar@gmail.com',                '82bc5f21-70a3-42d9-b05e-e574b0127d66', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-23T11:35:03Z'),
  ('tahir@sezonco.com.tr',           '1413454b-9520-45f8-95a4-b794ecad85e7', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-23T11:41:46Z'),
  ('sezonco@hotmail.com',            'd2197c18-2706-4cfc-a3a0-3dfc0e8de305', 'v1_registered', ARRAY['v1','unverified'], '2026-03-23T12:10:23Z'),
  ('ananddesai@adcoprime.com',       '237b2202-f744-482a-9d97-89d923bb9f1f', 'v1_registered', ARRAY['v1','unverified'], '2026-03-23T17:45:58Z'),
  ('khanjanan3334@gmail.com',        '5d086b31-fd61-4403-9f36-c0f10a9a68cb', 'v1_registered', ARRAY['v1','unverified'], '2026-03-23T18:04:33Z'),
  ('donna@globalcropexchange.com',   '33cdd3e9-b4bf-40cc-9e09-726b12e1bbee', 'v1_registered', ARRAY['v1','broker','verified_broker','50plus'], '2026-03-23T18:20:07Z'),
  ('mfbros@gmail.com',               'be51c8e5-dad7-4ac9-a279-fbe65215e9a4', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-23T18:29:57Z'),
  ('trade.wegrowgt@gmail.com',       '93b56fb8-a149-45ae-882d-3a016b11cc3a', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-23T18:49:15Z'),
  ('buttaatif@gmail.com',            'e9033d6d-abbc-4c62-b0d1-07a687756f90', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-23T19:03:06Z'),
  ('trade@antikkuruyemis.com.tr',    'a3fd4a06-f60a-41c0-810a-2d77ea12a8f4', 'v1_registered', ARRAY['v1','unverified'], '2026-03-24T05:38:26Z'),
  ('trade.brj@gmail.com',            '2ef620e0-bc24-4526-a9c1-2922f163807a', 'v1_registered', ARRAY['v1','broker','unverified'], '2026-03-24T05:55:51Z'),
  ('operations@maxonsnuts.com',      '1c36e3a4-51c7-4d29-a226-9698219c4071', 'v1_registered', ARRAY['v1','team','maxons','viewer'], '2026-03-24T06:57:51Z'),
  ('bismiullahkhan0800@gmail.com',   'e0ac7136-a9ae-4380-b1e2-6cfad7148e26', 'v1_registered', ARRAY['v1','unverified'], '2026-03-24T07:23:24Z'),
  ('wholesale@containerkart.com',    '87fca8e4-b7af-458e-97f7-0505ee276d3f', 'v1_registered', ARRAY['v1','unverified'], '2026-03-24T09:46:05Z'),
  ('ali_katabi@hotmail.com',         '6f010316-61f1-4261-8152-e5e97a487b26', 'v1_registered', ARRAY['v1','supplier','unverified'], '2026-03-25T11:20:36Z'),
  ('bashar_kasab@hotmail.com',       '133aadde-26f5-4269-8f3e-2135b0405b3f', 'v1_registered', ARRAY['v1','verified_buyer','20-50-containers'], '2026-03-25T12:39:23Z'),
  ('learnoption3@gmail.com',         '7bbeb386-a0b6-4082-9885-7d8cb9d08d86', 'v1_registered', ARRAY['v1','supplier','unverified'], '2026-03-26T05:55:06Z'),
  ('yunusovsherzod02@gmail.com',     'd236dae4-cf59-4c21-97c2-e97a26ac359b', 'v1_registered', ARRAY['v1','customer','unverified'], '2026-03-26T13:27:57Z'),
  ('hakkikaratosun@karsalgroup.com', '988fb74e-a8c7-4192-8780-965b72458daf', 'v1_registered', ARRAY['v1','customer','unverified'], '2026-03-26T21:01:01Z'),
  ('ikramullahcompanypak@gmail.com', 'a5d1f27e-922a-4156-97cd-c570c5813e68', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-03-27T13:32:53Z'),
  ('contact@maxonsnuts.com',         '693a177d-82f2-424e-b1db-7f1185e0e856', 'v1_registered', ARRAY['v1','team','maxons','approved'], '2026-03-30T23:18:57Z'),
  ('dheranitradingllp@gmail.com',    '0ea5f5ac-cc4f-4a3b-a1c0-7366df8011dc', 'v1_registered', ARRAY['v1','unverified'], '2026-03-31T06:41:29Z'),
  ('sales@maxonsnut.com',            'a62471c3-7b6c-468c-aa54-7df36ae35916', 'v1_registered', ARRAY['v1','team','maxons','importer','50plus'], '2026-03-31T09:11:52Z'),
  ('kishire@goldengardens.net',      'd7717a6b-0d9f-439e-a3be-dc5190cbd0d1', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-04-01T13:47:00Z'),
  ('omar.jehad91@hotmail.com',       '992036a5-f983-4fa9-8c75-9a208ce57918', 'v1_registered', ARRAY['v1','unverified'], '2026-04-02T11:42:37Z'),
  ('mohammed-rabboua1999@hotmail.com','9940455f-a316-4756-8b87-5fc9dc2e4c3b', 'v1_registered', ARRAY['v1','unverified'], '2026-04-02T11:50:03Z'),
  ('ahmed@aljameelfood.com',         '36102c29-b943-4da6-9b24-3730e2de604c', 'v1_registered', ARRAY['v1','unverified'], '2026-04-02T13:40:50Z'),
  ('wadialamin1@gmail.com',          '00a56d71-d5b9-44fd-88a4-adf2b16e7528', 'v1_registered', ARRAY['v1','viewer','unverified'], '2026-04-02T14:16:14Z'),
  ('uk040713@gmail.com',             '99df8ab1-4345-4d17-908b-d836e6749c0f', 'v1_registered', ARRAY['v1','unverified'], '2026-04-02T15:36:06Z'),
  ('info@firstinternational.co',     '34d59a64-14c6-48ea-97fc-825a43520bd3', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-04-03T12:24:34Z'),
  ('dxb.omar@aljameelfood.com',      'c01d9b5c-1bf2-4c47-8011-e01d86223dcb', 'v1_registered', ARRAY['v1','unverified'], '2026-04-03T13:05:12Z'),
  ('ehsanandco@hotmail.com',         '0c0ed4eb-bca2-46c9-8934-1e64e3768329', 'v1_registered', ARRAY['v1','trader','unverified'], '2026-04-04T12:34:18Z'),
  ('safwan@aljameelfood.com',        'f3110484-7c03-4fe4-9dbc-bba02b2aeb63', 'v1_registered', ARRAY['v1','unverified'], '2026-04-10T14:22:49Z'),
  ('ravimbrj@gmail.com',             '961561c8-dec1-454d-a4e4-cdd60c384b5c', 'v1_registered', ARRAY['v1','broker','unverified'], '2026-04-16T04:27:39Z'),
  ('fahadmeghany@gmail.com',         '28e1ee99-999f-4c0a-8d86-ba222c1e2762', 'v1_registered', ARRAY['v1','supplier','unverified'], '2026-04-22T13:25:18Z')
ON CONFLICT (email) DO NOTHING;

DO $$
DECLARE
  sub_count INT;
  v1_profile_count INT;
BEGIN
  SELECT COUNT(*) INTO sub_count
    FROM public.email_subscribers
    WHERE source = 'v1_registered';
  SELECT COUNT(*) INTO v1_profile_count
    FROM public.user_profiles
    WHERE migrated_from_v1 = TRUE;
  RAISE NOTICE 'v1_seed: email_subscribers(v1_registered) = %, user_profiles(migrated_from_v1) = %', sub_count, v1_profile_count;
END $$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════
-- Evening additions (2026-04-24 night shift):
--   5. Widget Library foundation (widget_configs table + RLS + RPC)
--   6. Team-can-verify-users RLS + column-lock trigger
-- Both are idempotent. The evening sections are safe to re-run
-- independently if the morning bundle was already applied.
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- (5) Widget Library — from 20260424_widget_configs.sql
-- ─────────────────────────────────────────────────────────────
-- Table + indexes + updated_at trigger + RLS (authenticated read
-- published, admin full CRUD) + publish_widget_config() RPC.
-- Powers the useWidgetConfig hook in src/hooks/useWidgetConfig.js.
-- Zero risk if skipped — the hook falls back to hardcoded defaults
-- when the table is missing.

create table if not exists widget_configs (
  id            uuid primary key default gen_random_uuid(),
  widget_key    text not null,
  version       int  not null default 1,
  status        text not null default 'draft'
                  check (status in ('draft', 'published', 'archived')),
  title         text,
  description   text,
  config        jsonb not null default '{}'::jsonb,
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  published_at  timestamptz,
  unique (widget_key, version)
);

comment on table widget_configs is
  'Per-widget published configuration merged over hardcoded defaults at runtime via useWidgetConfig(widgetKey). Admin-only write surface, authenticated-read for published rows.';

create index if not exists idx_widget_configs_key_status
  on widget_configs (widget_key, status);

create index if not exists idx_widget_configs_key_published
  on widget_configs (widget_key, published_at desc)
  where status = 'published';

create or replace function update_widget_configs_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_widget_configs_updated_at on widget_configs;
create trigger trg_widget_configs_updated_at
  before update on widget_configs
  for each row execute function update_widget_configs_updated_at();

alter table widget_configs enable row level security;

drop policy if exists "authenticated read published widget configs" on widget_configs;
create policy "authenticated read published widget configs"
  on widget_configs for select
  using (status = 'published' and auth.uid() is not null);

drop policy if exists "admins read all widget configs" on widget_configs;
create policy "admins read all widget configs"
  on widget_configs for select
  using (exists (
    select 1 from user_profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.access_tier = 'admin')
  ));

drop policy if exists "admins insert widget configs" on widget_configs;
create policy "admins insert widget configs"
  on widget_configs for insert
  with check (exists (
    select 1 from user_profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.access_tier = 'admin')
  ));

drop policy if exists "admins update widget configs" on widget_configs;
create policy "admins update widget configs"
  on widget_configs for update
  using (exists (
    select 1 from user_profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.access_tier = 'admin')
  ))
  with check (exists (
    select 1 from user_profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.access_tier = 'admin')
  ));

drop policy if exists "admins delete widget configs" on widget_configs;
create policy "admins delete widget configs"
  on widget_configs for delete
  using (exists (
    select 1 from user_profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.access_tier = 'admin')
  ));

create or replace function publish_widget_config(p_widget_key text, p_version int)
returns uuid language plpgsql security definer as $$
declare
  target_id uuid;
begin
  if not exists (
    select 1 from user_profiles p
    where p.id = auth.uid() and (p.role = 'admin' or p.access_tier = 'admin')
  ) then
    raise exception 'publish_widget_config: caller is not admin';
  end if;

  update widget_configs
  set status = 'archived'
  where widget_key = p_widget_key and status = 'published';

  update widget_configs
  set status = 'published', published_at = now()
  where widget_key = p_widget_key and version = p_version
  returning id into target_id;

  if target_id is null then
    raise exception 'publish_widget_config: no matching draft (widget_key=%, version=%)',
                    p_widget_key, p_version;
  end if;

  return target_id;
end;
$$;

comment on function publish_widget_config(text, int) is
  'Atomically publish a widget_configs version: archives previous published row + promotes the specified version. Admin-only.';

grant select on widget_configs to authenticated;
grant execute on function publish_widget_config(text, int) to authenticated;

-- ─────────────────────────────────────────────────────────────
-- (6) Team-can-verify-users — from 20260424_team_can_verify_users.sql
-- ─────────────────────────────────────────────────────────────
-- Allows MAXONS team members to promote newly-registered users
-- from access_tier='registered' → 'verified'. Trigger locks all
-- other columns (role, email, name, phone, etc.) for non-admins.
-- Admins retain full CRUD; service role bypasses RLS entirely.

DROP POLICY IF EXISTS "Team can verify registered users" ON user_profiles;

CREATE POLICY "Team can verify registered users" ON user_profiles
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles self
      WHERE self.id = auth.uid()
        AND (
          self.role IN ('admin','analyst','broker','seller','trader','sales','maxons_team')
          OR self.access_tier IN ('maxons_team','admin')
        )
    )
    AND access_tier = 'registered'
  )
  WITH CHECK (access_tier = 'verified');

COMMENT ON POLICY "Team can verify registered users" ON user_profiles IS
  'Allows MAXONS team members to promote registered → verified. Row-level guard only; column-level guard enforced by trigger lock_team_column_writes.';

CREATE OR REPLACE FUNCTION lock_team_column_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  updater_role TEXT;
  updater_tier TEXT;
  is_admin BOOLEAN;
  is_team BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.id = auth.uid() THEN
    IF NEW.access_tier IS DISTINCT FROM OLD.access_tier THEN
      RAISE EXCEPTION 'Users cannot change their own access_tier. Contact an admin.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Users cannot change their own role. Contact an admin.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  SELECT role, access_tier INTO updater_role, updater_tier
  FROM user_profiles WHERE id = auth.uid();

  is_admin := (updater_role = 'admin' OR updater_tier = 'admin');
  is_team := (
    updater_role IN ('admin','analyst','broker','seller','trader','sales','maxons_team')
    OR updater_tier IN ('maxons_team','admin')
  );

  IF is_admin THEN RETURN NEW; END IF;

  IF NOT is_team THEN
    RAISE EXCEPTION 'Only team members can update other user profiles.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.access_tier IS DISTINCT FROM OLD.access_tier
     AND NOT (OLD.access_tier = 'registered' AND NEW.access_tier = 'verified') THEN
    RAISE EXCEPTION 'Team members can only promote access_tier registered → verified, not % → %',
      OLD.access_tier, NEW.access_tier
      USING ERRCODE = '42501';
  END IF;

  IF NEW.role            IS DISTINCT FROM OLD.role            THEN RAISE EXCEPTION 'Team members cannot change role.'            USING ERRCODE='42501'; END IF;
  IF NEW.email           IS DISTINCT FROM OLD.email           THEN RAISE EXCEPTION 'Team members cannot change email.'           USING ERRCODE='42501'; END IF;
  IF NEW.full_name       IS DISTINCT FROM OLD.full_name       THEN RAISE EXCEPTION 'Team members cannot change name.'            USING ERRCODE='42501'; END IF;
  IF NEW.phone           IS DISTINCT FROM OLD.phone           THEN RAISE EXCEPTION 'Team members cannot change phone.'           USING ERRCODE='42501'; END IF;
  IF NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number THEN RAISE EXCEPTION 'Team members cannot change WhatsApp number.' USING ERRCODE='42501'; END IF;
  IF NEW.company         IS DISTINCT FROM OLD.company         THEN RAISE EXCEPTION 'Team members cannot change company.'         USING ERRCODE='42501'; END IF;
  IF NEW.id              IS DISTINCT FROM OLD.id              THEN RAISE EXCEPTION 'Profile id is immutable.'                    USING ERRCODE='42501'; END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lock_team_column_writes ON user_profiles;
CREATE TRIGGER trg_lock_team_column_writes
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION lock_team_column_writes();

-- ═══════════════════════════════════════════════════════════════
-- Done. Expected final state:
--   • email_subscribers(source='v1_registered') = 62 rows
--   • user_profiles(migrated_from_v1=true) = 62 rows
--   • widget_configs table exists with 0 rows (Workshop UI post-launch fills it)
--   • policy "Team can verify registered users" exists on user_profiles
--   • trigger trg_lock_team_column_writes exists on user_profiles
-- ═══════════════════════════════════════════════════════════════
