-- ═══════════════════════════════════════════════════════════════
-- V1 user seed from CSV export (2026-04-23) — WhatsApp-based linking
-- ═══════════════════════════════════════════════════════════════
--
-- User directive 2026-04-24: "we have to match by whatsapp not
-- email.. our user data concept is more whatsapp based"
--
-- V2 uses WhatsApp OTP as the primary identity. V1 users may
-- re-register in V2 under a different email but same phone, so
-- we link via normalized whatsapp_number, NOT email.
--
-- Numbers normalized via regexp_replace(x, '[^0-9]', '') so
-- '+971 52 177 4980' matches '+971521774980' matches '971521774980'.
--
-- Source: /Users/muzammilakhtar/Downloads/export-2026-04-23T20-47-25-151Z-0c64f2b5.csv
-- Filtering: 3 @almondoracle.internal aliases + 2 test accounts dropped.
-- Seeds 62 distinct V1 users into email_subscribers.
-- Safe to re-run — ON CONFLICT (email) DO NOTHING.
-- ═══════════════════════════════════════════════════════════════

BEGIN;

-- Seed email_subscribers. user_profile_id resolves via normalized
-- whatsapp match against user_profiles. Metadata carries the V1
-- whatsapp, full name, and company so the Broadcast panel can
-- show rich info without a join.
INSERT INTO public.email_subscribers
  (email, user_profile_id, source, tags, metadata, subscribed_at)
SELECT v.email,
       (
         SELECT up.id FROM public.user_profiles up
         WHERE up.whatsapp_number IS NOT NULL
           AND regexp_replace(up.whatsapp_number, '[^0-9]', '', 'g') =
               regexp_replace(v.whatsapp,         '[^0-9]', '', 'g')
           AND regexp_replace(v.whatsapp, '[^0-9]', '', 'g') <> ''
         LIMIT 1
       ) AS user_profile_id,
       'v1_registered',
       v.tags,
       jsonb_build_object(
         'v1_whatsapp',  v.whatsapp,
         'v1_full_name', v.full_name,
         'v1_company',   v.company,
         'v1_country',   v.country,
         'v1_role',      v.v1role
       ),
       v.subscribed_at
FROM (VALUES
  ('muzammil.akhtar@me.com',          '+971527854447',  'MUZAMMIL AKHTAR',          'MAXONS GENERAL TRADING LLC',        'United Arab Emirates', 'admin',     ARRAY['v1','admin','verified_buyer']::TEXT[],                                  '2026-03-13T22:06:28Z'::TIMESTAMPTZ),
  ('rahofakb20@gmail.com',            '+971562381471',  'rahaf kabakle',            'MAxons',                            'United Arab Emirates', 'supplier',  ARRAY['v1','supplier','verified_buyer']::TEXT[],                              '2026-03-13T23:35:59Z'::TIMESTAMPTZ),
  ('mahmoud@aljameelfood.com',        '+971569222560',  'Mahmoud Akrin',            'Aljameel',                          'United Arab Emirates', 'customer',  ARRAY['v1','customer','verified_buyer']::TEXT[],                              '2026-03-14T07:30:43Z'::TIMESTAMPTZ),
  ('priyank.dxb@gmail.com',           '+971543043611',  'Priyank Garg',             'Avyaya Trading & Services Fzco',    'United Arab Emirates', 'trader',    ARRAY['v1','trader','verified_buyer','importer','50plus']::TEXT[],            '2026-03-14T12:37:17Z'::TIMESTAMPTZ),
  ('marium.zoey@gmail.com',           '+971527774623',  'Marium Muzammil',          NULL,                                'United Arab Emirates', 'customer',  ARRAY['v1','customer','unverified']::TEXT[],                                  '2026-03-15T20:18:47Z'::TIMESTAMPTZ),
  ('saqib@maxonsnuts.com',            '+447448438415',  'SAQIB CHHOTANI',           'CropsIntel Team',                   'United Kingdom',        'team',      ARRAY['v1','team','maxons','verified_broker']::TEXT[],                        '2026-03-16T22:29:55Z'::TIMESTAMPTZ),
  ('hammad@maxonsnuts.com',           '+971521774980',  'HAMMAD',                   'CropsIntel Team',                   'United Arab Emirates', 'team',      ARRAY['v1','team','maxons','verified_supplier']::TEXT[],                      '2026-03-17T02:35:06Z'::TIMESTAMPTZ),
  ('qousi.sohel@maxonsnuts.com',      '+971529661639',  'QOUSI KHADOUR',            'CropsIntel Team',                   'United Arab Emirates', 'team',      ARRAY['v1','team','maxons','verified_buyer']::TEXT[],                         '2026-03-17T09:46:44Z'::TIMESTAMPTZ),
  ('primekhi@gmail.com',              '+971521973837',  'Muhammad Akhtar Usman',    NULL,                                'United Arab Emirates', 'trader',    ARRAY['v1','trader','verified_buyer']::TEXT[],                                '2026-03-17T10:22:31Z'::TIMESTAMPTZ),
  ('abdullahih@maxonsnuts.com',       '+971527865608',  'ABDULLAH IHSAN',           'Ehsan Trading Co LLC',              'United Arab Emirates', 'trader',    ARRAY['v1','trader','verified_buyer','wholesaler','50plus']::TEXT[],          '2026-03-17T10:31:18Z'::TIMESTAMPTZ),
  ('smh4344@gmail.com',               '+971561066060',  'milad',                    NULL,                                'United Arab Emirates', 'trader',    ARRAY['v1','trader','verified_buyer']::TEXT[],                                '2026-03-17T10:35:24Z'::TIMESTAMPTZ),
  ('mustafa.akhtar@shaw.ca',          '+16047151352',   'Mustafa Akhtar',           NULL,                                'Canada',                'trader',    ARRAY['v1','trader','verified_broker']::TEXT[],                               '2026-03-18T19:46:57Z'::TIMESTAMPTZ),
  ('info@ugaritllc.com',              '+971546816289',  'Ammar',                    NULL,                                'United Arab Emirates', NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-20T19:46:08Z'::TIMESTAMPTZ),
  ('t.mikati@alsaqrtrading.com',      '+971559110044',  'Tarek Mikati',             'Al Saqr General Trading Co LLC',    'United Arab Emirates', 'trader',    ARRAY['v1','trader','importer','unverified']::TEXT[],                         '2026-03-21T09:54:25Z'::TIMESTAMPTZ),
  ('ekramakhalide@gmail.com',         '+923352445516',  'Ekrama khalid',            NULL,                                'Pakistan',              NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-21T10:25:46Z'::TIMESTAMPTZ),
  ('grcuae@icloud.com',               '+971528502515',  'Sameer chaturvedi',        NULL,                                'United Arab Emirates', 'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-21T11:06:04Z'::TIMESTAMPTZ),
  ('sameerganatra@me.com',            '+919867325599',  'Sameer Ganatra',           NULL,                                'India',                 'customer',  ARRAY['v1','customer','importer','unverified']::TEXT[],                       '2026-03-21T11:40:34Z'::TIMESTAMPTZ),
  ('naikyashdxb@gmail.com',           '+971502911234',  'Yash Naik',                NULL,                                'United Arab Emirates', 'customer',  ARRAY['v1','customer','unverified']::TEXT[],                                  '2026-03-21T12:16:33Z'::TIMESTAMPTZ),
  ('sikandarkashif1@gmai.com',        '+923215818881',  'Kashif sikandar',          'Sk enterprise',                     'Pakistan',              'customer',  ARRAY['v1','customer','verified_buyer','importer','typo_email']::TEXT[],      '2026-03-21T12:50:21Z'::TIMESTAMPTZ),
  ('fraz230@hotmail.com',             '+14026101475',   'FRAZ MUBARIK',             NULL,                                'Pakistan',              'customer',  ARRAY['v1','customer','unverified','approved']::TEXT[],                       '2026-03-21T13:01:49Z'::TIMESTAMPTZ),
  ('livings@live.com',                '+923335815500',  'Farhad',                   NULL,                                'Pakistan',              'customer',  ARRAY['v1','customer','unverified']::TEXT[],                                  '2026-03-21T13:03:12Z'::TIMESTAMPTZ),
  ('rks.mahima@gmail.com',            '+919322249221',  'Ritesh shah',              'mahima herbals',                    'india',                 'trader',    ARRAY['v1','trader','verified_buyer']::TEXT[],                                '2026-03-21T15:07:05Z'::TIMESTAMPTZ),
  ('abdulzahir0800@icloud.com',       '+971501083349',  'M zahir',                  'Muhammad zahir abdul QAHIR foodstuff','Dxb',                 NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-21T21:01:51Z'::TIMESTAMPTZ),
  ('anurag@esarco.com',               '+919831016720',  'Anurag Tulshan',           'Esarco Exim pvt ltd',               'India',                 NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-22T03:27:37Z'::TIMESTAMPTZ),
  ('shafena@gmail.com',               '+971502243352',  'Shafena Agri Foodstuff',   'Shafena',                           'Dubai',                 'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-22T10:32:34Z'::TIMESTAMPTZ),
  ('sweetsaiful@gmail.com',           '+971509767650',  'Md Saiful Islam',          NULL,                                'United Arab Emirates', 'broker',    ARRAY['v1','broker','unverified']::TEXT[],                                    '2026-03-23T08:51:14Z'::TIMESTAMPTZ),
  ('ammar@gmail.com',                 '+9710501175099', 'Ammar',                    NULL,                                'United Arab Emirates', 'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-23T11:35:03Z'::TIMESTAMPTZ),
  ('tahir@sezonco.com.tr',            '+905348570153',  'Tahir Ömer',               'Sezonco company',                   'Turkey',                'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-23T11:41:46Z'::TIMESTAMPTZ),
  ('sezonco@hotmail.com',             '+905303927769',  'Mahmut Ömer',              'Mawasim',                           'Turkey',                NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-23T12:10:23Z'::TIMESTAMPTZ),
  ('ananddesai@adcoprime.com',        '+971507140924',  'Anand H Desai',            'Adco Prime General Trading LLC',    'UAE and India',         NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-23T17:45:58Z'::TIMESTAMPTZ),
  ('khanjanan3334@gmail.com',         '+923317763332',  'Qaseem agha',              'NAYAB TRADERS',                     'Pakistan',              NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-23T18:04:33Z'::TIMESTAMPTZ),
  ('donna@globalcropexchange.com',    '+16504350130',   'Donna Diomampo',           'Global Crop exchange',              'United States',         'broker',    ARRAY['v1','broker','verified_broker','50plus']::TEXT[],                      '2026-03-23T18:20:07Z'::TIMESTAMPTZ),
  ('mfbros@gmail.com',                '+923312202801',  'Fahad Khatri',             'Mohammad & Fahad Brothers',         'Karachi Pakistan',      'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-23T18:29:57Z'::TIMESTAMPTZ),
  ('trade.wegrowgt@gmail.com',        '+971564814335',  'Ashim Kumer Das',          'WEGROW GENERAL TRADING LLC',        'United Arab Emirates', 'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-23T18:49:15Z'::TIMESTAMPTZ),
  ('buttaatif@gmail.com',             '+923008499280',  'Aatif Butt',               'Pak Afghan Impex',                  'Pakistan',              'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-23T19:03:06Z'::TIMESTAMPTZ),
  ('trade@antikkuruyemis.com.tr',     '+905359631904',  'Anil Cinoglu',             'Antik Nuts',                        'Türkiye',               NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-24T05:38:26Z'::TIMESTAMPTZ),
  ('trade.brj@gmail.com',             '+919601806520',  'RAVI MOTWANI',             'B R J FOODSTUFF TRADING L.L.C.',    'United Arab Emirates', 'broker',    ARRAY['v1','broker','unverified']::TEXT[],                                    '2026-03-24T05:55:51Z'::TIMESTAMPTZ),
  ('operations@maxonsnuts.com',       '+971527281388',  'Ovais Younus',             'Maxons General trading llc',        'Dubai',                 'viewer',    ARRAY['v1','team','maxons','viewer']::TEXT[],                                 '2026-03-24T06:57:51Z'::TIMESTAMPTZ),
  ('bismiullahkhan0800@gmail.com',    '+971582677370',  'Bismillah khan',           'Zain Gulshan Trading LLC',          'PAKISTAN',              NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-24T07:23:24Z'::TIMESTAMPTZ),
  ('wholesale@containerkart.com',     '+971528183846',  'Muhammad Ameen',           'Container kart General Trading',    'UAE',                   NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-24T09:46:05Z'::TIMESTAMPTZ),
  ('ali_katabi@hotmail.com',          '+962796600116',  'yes plz',                  'ali katabi establsihment',          'jordan',                'supplier',  ARRAY['v1','supplier','unverified']::TEXT[],                                  '2026-03-25T11:20:36Z'::TIMESTAMPTZ),
  ('bashar_kasab@hotmail.com',        '+971563133243',  'Bashar Kasab',             'Shezer fzc',                        'Syria / uae',           NULL,        ARRAY['v1','verified_buyer','20-50-containers']::TEXT[],                      '2026-03-25T12:39:23Z'::TIMESTAMPTZ),
  ('learnoption3@gmail.com',          '+971588236263',  'Gauree',                   'M G food industries',               'I m in Dubai.',         'supplier',  ARRAY['v1','supplier','unverified']::TEXT[],                                  '2026-03-26T05:55:06Z'::TIMESTAMPTZ),
  ('yunusovsherzod02@gmail.com',      '+971581697644',  'Yunusov Sherzod',          'ZikrNuts Foodstuff Training LLC',   'Kazakhstan',            'customer',  ARRAY['v1','customer','unverified']::TEXT[],                                  '2026-03-26T13:27:57Z'::TIMESTAMPTZ),
  ('hakkikaratosun@karsalgroup.com',  '+905383310905',  'Hakkı Karatosun',          NULL,                                'Turkey',                'customer',  ARRAY['v1','customer','unverified']::TEXT[],                                  '2026-03-26T21:01:01Z'::TIMESTAMPTZ),
  ('ikramullahcompanypak@gmail.com',  '+923139165205',  'Sami khan',                'Ikramullah&company',                'Pakistan',              'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-03-27T13:32:53Z'::TIMESTAMPTZ),
  ('contact@maxonsnuts.com',          '+971523897541',  'NOUMAN IHSAN',             'CropsIntel Team',                   NULL,                    'team',      ARRAY['v1','team','maxons','approved']::TEXT[],                               '2026-03-30T23:18:57Z'::TIMESTAMPTZ),
  ('dheranitradingllp@gmail.com',     '+919537575774',  'Xyra',                     'Durga corporation',                 'India',                 NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-03-31T06:41:29Z'::TIMESTAMPTZ),
  ('sales@maxonsnut.com',             '+971558933495',  'FAHAD IQBAL',              'CropsIntel Team',                   'United Arab Emirates', 'team',      ARRAY['v1','team','maxons','importer','50plus']::TEXT[],                      '2026-03-31T09:11:52Z'::TIMESTAMPTZ),
  ('kishire@goldengardens.net',       '+971504520215',  'Kishore kumar',            NULL,                                'United Arab Emirates', 'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-04-01T13:47:00Z'::TIMESTAMPTZ),
  ('omar.jehad91@hotmail.com',        '+971501344639',  'Omar jehad rabboua',       'Jehad raboue trading company LLC',  'UAE',                   NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-04-02T11:42:37Z'::TIMESTAMPTZ),
  ('mohammed-rabboua1999@hotmail.com','+971556552403',  'Mohammed rabbouh',         'Jehad raboue trading LLC',          'Dubai, UAE',            NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-04-02T11:50:03Z'::TIMESTAMPTZ),
  ('ahmed@aljameelfood.com',          '+971509889948',  'AHMED AKRIN',              'AL JAMEEL GROUP',                   'TURKIYE',               NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-04-02T13:40:50Z'::TIMESTAMPTZ),
  ('wadialamin1@gmail.com',           '+971544402915',  'AHMED DAGHMASH',           'WADI ALAMIN FOODSTUFF TRADING LLC', 'UAE',                   'viewer',    ARRAY['v1','viewer','unverified']::TEXT[],                                    '2026-04-02T14:16:14Z'::TIMESTAMPTZ),
  ('uk040713@gmail.com',              '+923449137640',  'Muhammad usman',           'Usman and company',                 'Pakistan',              NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-04-02T15:36:06Z'::TIMESTAMPTZ),
  ('info@firstinternational.co',      '+919566219290',  'Abrar Aslam',              'First International Fzco',          'UAE',                   'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-04-03T12:24:34Z'::TIMESTAMPTZ),
  ('dxb.omar@aljameelfood.com',       '+971551860463',  'Omar khasara al jameel',   'Jameel international foodstuff trading llc','Uae',           NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-04-03T13:05:12Z'::TIMESTAMPTZ),
  ('ehsanandco@hotmail.com',          '+923334247472',  'Ehsan elyo',               'ehsan and co.',                     'Pakistan',              'trader',    ARRAY['v1','trader','unverified']::TEXT[],                                    '2026-04-04T12:34:18Z'::TIMESTAMPTZ),
  ('safwan@aljameelfood.com',         '+971562220009',  'Safwan AKREN Aljameel',    'Aljameel international',            'UAE, Saudi, turkey',    NULL,        ARRAY['v1','unverified']::TEXT[],                                             '2026-04-10T14:22:49Z'::TIMESTAMPTZ),
  ('ravimbrj@gmail.com',              '+971554463253',  'RAVI',                     'B R J FOODSTUFF TRADING L.L.C.',    'United Arab Emirates', 'broker',    ARRAY['v1','broker','unverified']::TEXT[],                                    '2026-04-16T04:27:39Z'::TIMESTAMPTZ),
  ('fahadmeghany@gmail.com',          '+971508235748',  'B',                        NULL,                                'Pakistan',              'supplier',  ARRAY['v1','supplier','unverified']::TEXT[],                                  '2026-04-22T13:25:18Z'::TIMESTAMPTZ)
) AS v(email, whatsapp, full_name, company, country, v1role, tags, subscribed_at)
ON CONFLICT (email) DO NOTHING;

-- Mark matched V2 user_profiles as migrated_from_v1 (link by normalized whatsapp)
UPDATE public.user_profiles up
   SET migrated_from_v1 = TRUE
  FROM public.email_subscribers es
 WHERE es.source = 'v1_registered'
   AND up.whatsapp_number IS NOT NULL
   AND regexp_replace(up.whatsapp_number,    '[^0-9]', '', 'g') =
       regexp_replace(es.metadata->>'v1_whatsapp', '[^0-9]', '', 'g')
   AND regexp_replace(es.metadata->>'v1_whatsapp', '[^0-9]', '', 'g') <> ''
   AND up.migrated_from_v1 = FALSE;

DO $$
DECLARE
  sub_count INT;
  linked_count INT;
  v1_profile_count INT;
BEGIN
  SELECT COUNT(*) INTO sub_count FROM public.email_subscribers WHERE source = 'v1_registered';
  SELECT COUNT(*) INTO linked_count FROM public.email_subscribers WHERE source = 'v1_registered' AND user_profile_id IS NOT NULL;
  SELECT COUNT(*) INTO v1_profile_count FROM public.user_profiles WHERE migrated_from_v1 = TRUE;
  RAISE NOTICE 'v1_seed: subscribers = %, linked_to_v2_profile = %, v1_flagged_profiles = %', sub_count, linked_count, v1_profile_count;
END $$;

COMMIT;
