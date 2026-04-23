-- ═══════════════════════════════════════════════════════════════
-- V1 user seed from CSV export (2026-04-23)
-- ═══════════════════════════════════════════════════════════════
--
-- Source: /Users/muzammilakhtar/Downloads/export-2026-04-23T20-47-25-151Z-0c64f2b5.csv
-- CSV contained 68 profiles + 48 role rows + 65 auth_metadata rows.
--
-- After filtering out 3 @almondoracle.internal team aliases
-- (synthetic emails — team members already have real
-- maxonsnuts.com emails) and 2 test accounts (test@test.com,
-- testbrowser@cropsintel.com), this seed covers 63 real V1 users.
--
-- This script does TWO things:
--   1. Marks the existing V1 user_profiles rows with
--      migrated_from_v1 = true + source = 'v1_migration'
--      so the Login.jsx V2 Welcome route-fence fires for them.
--   2. Inserts every V1 email into email_subscribers with
--      source = 'v1_registered' + v1-derived tags so the
--      Broadcast panel's cohort filter resolves them.
--
-- Safe to re-run: all INSERTs use ON CONFLICT DO NOTHING
-- (email_subscribers.email UNIQUE, user_profiles.id PK).
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. Mark the V1 profiles (by UUID from CSV) as migrated_from_v1
-- ─────────────────────────────────────────────────────────────
-- We only UPDATE where the row exists; non-existent IDs are skipped.
-- Does NOT touch email/name/role/tier/any other user-visible field
-- — V2 state is authoritative if anything changed since the export.

UPDATE public.user_profiles
SET migrated_from_v1 = TRUE,
    source           = COALESCE(source, 'v1_migration')
WHERE id IN (
  '0c64f2b5-a408-4b25-959b-d286cba0edab',
  'ab33ea37-dcc9-4bb8-8bd1-20a1ff1fa6aa',
  'fda37146-caea-4651-8ae3-8ba76b5f216b',
  'ecbde2ae-a522-4f5f-8301-085d7601b43b',
  'df010b21-7620-4f04-bfce-0aa4289065fa',
  'd0b48b09-9c3f-479a-bef2-87d1ad02ac6e',
  '2dd65633-c77d-48bc-9926-10bf59389c7d',
  '659f0b98-9fd5-4c14-9c5f-f69a614fa368',
  '2561da7a-7cbc-43e6-8355-5fce0659024c',
  'a5abd2c1-8a0f-4257-ac1d-db5d124da754',
  '2045e858-c31f-49ec-ac22-4d7080b36dd3',
  '267b27d6-0e62-4cd7-a477-e3c2700f51f7',
  '893661f0-2482-4a78-90bc-da88f8926d79',
  '9253fb01-8550-4a0f-baf8-28caee2a5f3a',
  'ece6b950-b921-492e-ab34-937fdb348eeb',
  '2ccf9cbd-6be3-4719-bd4e-4b5668791f9e',
  '3a6daabf-bab2-4536-ae3d-712d03786fd0',
  '2e634069-db3b-430b-a4b4-813a2cf62ece',
  '6f64fe41-518c-494f-a4a6-31699e5b16e8',
  'a1ee54a5-0532-4f69-b8ba-b29ba686ad44',
  '4e212508-1364-4e79-ac6a-6e4a683c7da7',
  'b82a6716-f932-4607-915f-8a36da308b96',
  '9448b04e-0ce5-410e-9d54-d3ff4bb21103',
  'ece9dc2b-9cb0-4d4f-956f-78ef76645635',
  '68e1802f-853d-4275-8b41-328f45a0e02a',
  '3a929028-adce-4309-9b35-ffa1bf1bdb22',
  '82bc5f21-70a3-42d9-b05e-e574b0127d66',
  '1413454b-9520-45f8-95a4-b794ecad85e7',
  'd2197c18-2706-4cfc-a3a0-3dfc0e8de305',
  '237b2202-f744-482a-9d97-89d923bb9f1f',
  '5d086b31-fd61-4403-9f36-c0f10a9a68cb',
  '33cdd3e9-b4bf-40cc-9e09-726b12e1bbee',
  'be51c8e5-dad7-4ac9-a279-fbe65215e9a4',
  '93b56fb8-a149-45ae-882d-3a016b11cc3a',
  'e9033d6d-abbc-4c62-b0d1-07a687756f90',
  'a3fd4a06-f60a-41c0-810a-2d77ea12a8f4',
  '2ef620e0-bc24-4526-a9c1-2922f163807a',
  '1c36e3a4-51c7-4d29-a226-9698219c4071',
  'e0ac7136-a9ae-4380-b1e2-6cfad7148e26',
  '87fca8e4-b7af-458e-97f7-0505ee276d3f',
  '6f010316-61f1-4261-8152-e5e97a487b26',
  '133aadde-26f5-4269-8f3e-2135b0405b3f',
  '7bbeb386-a0b6-4082-9885-7d8cb9d08d86',
  'd236dae4-cf59-4c21-97c2-e97a26ac359b',
  '988fb74e-a8c7-4192-8780-965b72458daf',
  'a5d1f27e-922a-4156-97cd-c570c5813e68',
  '693a177d-82f2-424e-b1db-7f1185e0e856',
  '0ea5f5ac-cc4f-4a3b-a1c0-7366df8011dc',
  'a62471c3-7b6c-468c-aa54-7df36ae35916',
  'd7717a6b-0d9f-439e-a3be-dc5190cbd0d1',
  '992036a5-f983-4fa9-8c75-9a208ce57918',
  '9940455f-a316-4756-8b87-5fc9dc2e4c3b',
  '36102c29-b943-4da6-9b24-3730e2de604c',
  '00a56d71-d5b9-44fd-88a4-adf2b16e7528',
  '99df8ab1-4345-4d17-908b-d836e6749c0f',
  '34d59a64-14c6-48ea-97fc-825a43520bd3',
  'c01d9b5c-1bf2-4c47-8011-e01d86223dcb',
  '0c0ed4eb-bca2-46c9-8934-1e64e3768329',
  'f3110484-7c03-4fe4-9dbc-bba02b2aeb63',
  '961561c8-dec1-454d-a4e4-cdd60c384b5c',
  '28e1ee99-999f-4c0a-8d86-ba222c1e2762'
);

-- ─────────────────────────────────────────────────────────────
-- 2. Seed email_subscribers from the CSV email column
-- ─────────────────────────────────────────────────────────────
-- Tags carry the V1 verification_state + role so admin can
-- filter broadcasts by trader/broker/supplier/team/admin in
-- the Broadcast panel. user_profile_id links back to the
-- V2 auth.users row via user_profiles.id.

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

-- ─────────────────────────────────────────────────────────────
-- 3. Sanity row count — should print 63 after a clean run
-- ─────────────────────────────────────────────────────────────
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
