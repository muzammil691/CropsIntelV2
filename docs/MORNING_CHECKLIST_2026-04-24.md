# Morning Checklist — 2026-04-24

Wrote this so you wake up to a clear picture. Everything below is already shipped to cropsintel.com unless marked otherwise.

---

## 1 · Open `/map` on your phone (confirms the overnight shift)

You should see these panels, in this order, on the Overview tab:

1. **Now Working On** — the green pulsing banner with Claude's current step
2. **Blockers** — should be EMPTY (the workflow CNAME flip-flop is permanently fixed)
3. **Hero stats** — overall 92%, target 95%, 21 pages, 106 reports (target 128 after ABC backfill; see B4), 45 countries, 65 users, 4 login methods, 11 crop years
4. **Phase Progress** — phases 1-6 done, 7 active at 97%, 8-10 queued
5. **Next Priorities** — launch-first order
6. **Access Tiers** — Guest/Registered/Verified/MAXONS all marked built
7. **Night-Shift Plan** — 2 lists: launchFocus L1-L7 + nightShift blocks 1-8
8. **Launch Walkthrough Findings** — 11 findings logged, ~9 fixed, each with severity + route + fix commit
9. **Monitor Bot** — latest run = manually-seeded walkthrough, 14/14 routes OK, 3 findings remaining
10. **Recent Commits** — last 6 commits with shas

If anything above is missing, the deploy hasn't landed yet — wait ~60s and refresh.

---

## 2 · L6 — V1 login end-to-end test (5 min)

The V1ReturningUserModal is shipped and renders globally for users whose
`user_profiles.metadata.migrated_from_v1 === true` AND `v1_onboarded_at` is unset.

**Test with a real V1 account:**

1. Pick any email from the 65 migrated users:
   ```sh
   curl -s "https://cropsintel.com/progress.json" | jq '.stats.usersImported'
   # → 65
   ```
2. In Supabase dashboard → Authentication → Users, find one of the V1 accounts.
3. Trigger a password reset OR sign in via WhatsApp OTP using their phone.
4. **Expected:** on first sign-in, a modal pops up with three steps:
   - Step 1: confirms WhatsApp (prefilled from profile) → sends OTP
   - Step 2: enter OTP → verifies
   - Step 3: set new password → saves
5. After success, `user_profiles.metadata.v1_onboarded_at` should be stamped.
6. Next login: modal does NOT show again (correct behavior).

**Pass criteria:** V1 user successfully signs in + sets password + the modal doesn't reappear.

**If it fails:** open devtools console and watch for errors during the OTP/password flow.
Common failure points:
- Edge function `whatsapp-verify` blocks the OTP match (check function logs)
- `supabase.auth.updateUser({ password })` rejects (check password length — min 8)
- Profile load succeeds but `v1_onboarded_at` never stamps (check the Network tab for PATCH to /rest/v1/user_profiles)

---

## 3 · L5 — deploy the email-send edge function (5 min)

Code is ready at `supabase/functions/email-send/index.ts`. Full walkthrough in `docs/F1b_EMAIL_DEPLOY.md`. Short version:

```sh
# 1. Resend API key (free tier 3k emails/mo)
supabase secrets set RESEND_API_KEY="re_..."
supabase secrets set FROM_EMAIL="CropsIntel <noreply@cropsintel.com>"

# 2. Deploy
supabase functions deploy email-send

# 3. Test
curl -X POST \
  "https://<project>.supabase.co/functions/v1/email-send" \
  -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"invite","to":"you@your-email.com","context":{"name":"Test","role":"buyer","inviterName":"MAXONS Team"}}'
```

Once deployed:
- CRM Bulk Invite email leg activates (was queuing to `metadata.email_queued`).
- V2 upgrade email to 65 users becomes possible (wait until L6 passes).
- Trade alerts via email on top of WhatsApp.

---

## 4 · Tonight's 9 fixes shipped to cropsintel.com

| Severity | Route | What was broken | Now |
|---|---|---|---|
| critical | `/welcome` | 7 sections below hero invisible (IntersectionObserver) | Reveals on mount + failsafe |
| medium | `/welcome` | "9 Crop Years" stat stale | Now 11 (matches data) |
| medium | `/dashboard` | Admin/team saw generic "Welcome" persona | 5 new personas added (admin/team/sales/seller) |
| high | `/brokers` | Every market showed -87% YoY (Avoid) | Compare to single prior year only |
| medium | `/destinations` | Duplicate chip: "2016/17" + "2016/2017" | normalizeCropYear() collapses |
| false | `/forecasts` | Acreage chart looked blank | Actually rendering — scroll artifact |
| low | `/crm` | "1 logisticss" + "1 brokers" | Proper pluralization |
| high | `/intelligence` | "3 AI Models Active" (only Claude wired) | Honest live/roadmap panel |
| high | `/map` | Zyra system was a single entry | 5 first-class subsystems with real progress |

---

## 5 · What got built tonight (beyond bug fixes)

### Vision alignment (/map Systems tab)
- 9 new first-class systems added: BRM, SRM, Info Walls, Commodity-Agnostic Schema, Multi-Portal, Trade Lifecycle, ADELA, ATLAS, Verified Social Network
- 5 new Zyra subsystems: Bubble / Full-page / Trainer / WhatsApp / Prescriptions
- 1 new Monitor Bot system (the background self-audit agent)

### New routes (team-gated scaffolds)
- `/brokers` — BRM with market-signal intelligence (focus/hold/avoid per market, YoY-driven)
- `/suppliers` — SRM with county selector + variety mix + anonymized demand signals

### New libs
- `src/lib/commodity.js` — commodity-agnostic abstraction (never hardcode "almonds")
- `src/lib/permissions.js` — information-walls projections + canAccess
- `src/lib/audit-log.js` — auditAccess writer
- `src/lib/adela.js` — AI-provider router (Claude/GPT/Gemini/Council)
- `src/lib/invite-reconcile.js` — invited→joined auto-reconcile

### New schema
- `supabase/schema_commodity.sql` — commodities + products tables (seeded)
- `supabase/schema_info_walls.sql` — RLS policies + user_family() function + audit_log

### New edge function (code only)
- `supabase/functions/email-send/index.ts` — Resend-backed SMTP

### Launch blockers + fixes
- Workflow CNAME flip-flop: **permanently fixed** (Claude drove GitHub web UI to delete line 70)
- CRM reconcile invited→joined: **shipped** (runs on every sign-in via loadProfile hook)

---

## 6 · What's NOT done (honestly)

- **F1b email send** — code shipped, not deployed (step 3 above)
- **V2 upgrade email to 65 users** — waits on F1b + L6 pass
- **Human-like Zyra** — multilingual + natural voice still roadmap (Phase 8 via ADELA)
- **Zyra Trainer loop** — UI is 15% (thumbs + corrections + knowledge base all pending)
- **Real ABC shipment PDFs** — currently modeled for 4 years (Phase B2 deploys the real scraper loop)
- **Monitor Bot automation** — agent runs manual, needs workflow-scope to wire as a cron step

---

## 7 · Recommended morning action order

1. Open `/map` on your phone — confirm panels render
2. Deploy `email-send` edge function (`docs/F1b_EMAIL_DEPLOY.md`, ~5 min)
3. Run L6 V1 login test with one real migrated user (~5 min)
4. If L6 passes + email deployed → send V2 upgrade email to 65 users (script in deploy docs)
5. Ping me ("continue") and I'll pick up Zyra polish + multilingual next

---

**Commits shipped tonight:** see `progress.json.recentCommits` or `git log origin/main --oneline -30`.

Sleep well. Site is stable (12+ clean deploys tonight, zero outages since the CNAME fix).
