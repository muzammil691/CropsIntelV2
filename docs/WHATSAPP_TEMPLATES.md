# WhatsApp Templates — Runbook

## Why this exists

Twilio's WhatsApp Business API obeys Meta's **24-hour customer-service window**.
Outside that window (i.e. the user hasn't messaged our business number in the
last 24h), WhatsApp silently drops freeform `Body:` messages. Twilio returns
200 OK so our app thinks delivery succeeded — but the user never sees it.

**This was the OTP launch blocker**: a teammate reported OTP never arrived
until he messaged the Twilio number first to open a 24h window.

The fix is to send via Twilio's **Content API** using a Meta-approved
template (`ContentSid` + `ContentVariables`). Templates are always
deliverable regardless of window state.

## Architecture

```
 invite flow / OTP flow / alert flow
            │
            ▼
   src/lib/whatsapp.js
      sendWhatsAppTemplate(phone, templateKey, variables, fallback)
            │
            ▼
   Supabase edge fn: whatsapp-send
      1. SELECT twilio_content_sid FROM whatsapp_templates WHERE template_key = ?
      2. If SID exists  → POST to Twilio with ContentSid + ContentVariables  (guaranteed delivery)
      3. If SID is NULL → POST freeform Body:  (only delivers inside 24h window)
            │
            ▼
   Twilio API → Meta/WhatsApp → user
```

### Files

- `supabase/migrations/20260424_whatsapp_templates.sql` — `whatsapp_templates` table + `whatsapp_inbound_within_24h(phone)` helper
- `supabase/functions/whatsapp-templates-sync/index.ts` — reads your Twilio Content + ApprovalRequests, upserts into the DB
- `supabase/functions/whatsapp-send/index.ts` — dispatches each send via Content API or freeform fallback
- `src/lib/whatsapp-templates.js` — shared catalog (template keys, role map, fallback bodies)
- `src/lib/whatsapp.js` — frontend helpers `sendWhatsAppTemplate` + `syncWhatsAppTemplates`
- `src/pages/Settings.jsx` → `WhatsAppTemplatesPanel` — admin UI

## One-time setup

1. **Apply the migration** in Supabase SQL editor (or via CLI):
   ```sh
   # If using Supabase CLI:
   supabase db push
   ```
   This creates the `whatsapp_templates` table and the 24h-window helper.

2. **Deploy the two edge functions**:
   ```sh
   supabase functions deploy whatsapp-send
   supabase functions deploy whatsapp-templates-sync
   ```
   They reuse the existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and
   `TWILIO_WHATSAPP_FROM` secrets from Supabase Vault. No new secrets needed.

3. **Sync from Twilio** — two options:
   - UI: Settings → scroll to "WhatsApp Templates" panel → **Sync from Twilio**.
   - CLI:
     ```sh
     curl -X POST "$SUPABASE_URL/functions/v1/whatsapp-templates-sync" \
       -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
       -H "Content-Type: application/json" \
       -d '{}'
     ```
   This pulls every Content resource from your Twilio account and writes one
   row per template with the real body text, ContentSid, category, and
   approval status from Meta.

## Template catalog (what CropsIntel uses)

The code references these **12 template keys**. Our sync fn matches them to
Twilio templates by `twilio_friendly_name` first, falling back to
`friendly_name = template_key`. You can rename Twilio templates to match these
keys **or** set `whatsapp_templates.twilio_friendly_name` in SQL to point to
whatever you named them.

| template_key         | Meta category    | Variables         | Purpose                                              |
|----------------------|------------------|-------------------|------------------------------------------------------|
| `otp_verification`   | authentication   | {{1}} = code      | Login OTP (launch-blocker, must be approved)         |
| `welcome_v2`         | utility          | {{1}} = name      | Post-first-login welcome                             |
| `invite_buyer`       | utility          | {{1}} name, {{2}} inviter | Buyer / customer / importer invite           |
| `invite_supplier`    | utility          | {{1}} name, {{2}} inviter | Supplier / grower / packer / processor invite|
| `invite_broker`      | utility          | {{1}} name, {{2}} inviter | Broker / trader invite                       |
| `invite_team`        | utility          | {{1}} name, {{2}} inviter | Internal MAXONS team invite                  |
| `trade_alert`        | marketing        | {{1}} title, {{2}} summary, {{3}} urgency | Zyra-generated price/position signals |
| `market_brief`       | marketing        | {{1}} date, {{2}} summary | Weekly/biweekly market digest                |
| `offer_new`          | marketing        | {{1}} product, {{2}} price, {{3}} qty, {{4}} validity | New MAXONS offer to CRM contacts |
| `news_update`        | marketing        | {{1}} headline, {{2}} summary | Scraper-driven news push             |
| `account_action`     | utility          | {{1}} name, {{2}} action | "Please verify your account" / "complete profile"|
| `zyra_digest`        | utility          | {{1}} name, {{2}} summary | Daily AI brief for internal team            |

## Role → template routing

`src/lib/whatsapp-templates.js::pickInviteTemplate(contactType)`:

| `contact_type` / `role` value                      | Template           |
|----------------------------------------------------|--------------------|
| `buyer`, `customer`, `importer`, `logistics`, `industry` | `invite_buyer`   |
| `supplier`, `handler`, `grower`, `packer`, `processor`   | `invite_supplier`|
| `broker`, `trader`                                 | `invite_broker`    |
| `maxons_team`, `admin`, `analyst`, `sales`, `finance` | `invite_team`   |
| anything else / unknown                            | `invite_buyer`     |

The bulk-invite UI in `src/components/CRMBulkInvite.jsx` displays the
auto-selected template next to the persona picker so the admin can confirm
routing before clicking Send.

## Authoring a new template on Twilio

1. Go to **Twilio Console → Messaging → Content Template Builder**
2. Click **Create new**
3. **Friendly name**: use the `template_key` from the table above
   (e.g. `invite_supplier`). If you've already got a different name, record
   it by setting `whatsapp_templates.twilio_friendly_name` in SQL so our sync
   can match:
   ```sql
   UPDATE whatsapp_templates
   SET twilio_friendly_name = 'cropsintel_supplier_invite_v2'
   WHERE template_key = 'invite_supplier';
   ```
4. **Template type**: usually `twilio/text` (plain text) or `twilio/call-to-action`
   (text + button). Our catalog describes button text/URL where relevant.
5. **Body**: paste from the table above, using `{{1}}`, `{{2}}`, etc.
6. **Variables**: add sample values (shown in the table's `example` column).
7. Save → **Submit to WhatsApp** → pick the category:
   - `otp_verification` must be **AUTHENTICATION** (fast-tracked by Meta).
   - invites + welcome + account_action + zyra_digest → **UTILITY**.
   - trade_alert + market_brief + offer_new + news_update → **MARKETING**.
8. Meta approves:
   - AUTHENTICATION: minutes to hours
   - UTILITY: 24h typical
   - MARKETING: 24–72h
9. After approval, run the **Sync from Twilio** button in Settings → the DB
   row for that template_key gets its `twilio_content_sid` set to `HX…` and
   `approval_status='approved'`.
10. Next send uses the Content API automatically — no code redeploy needed.

## Verifying delivery

After sync, the Settings panel shows per-template status. When you send:

- **Success + `mode: "content_api"`** → delivered via approved template, always works
- **Success + `mode: "freeform"` + `status: "sent"`** → delivered freeform inside 24h window
- **Success + `mode: "freeform"` + `status: "sent_window_dependent"`** → Twilio accepted the freeform send, **but WhatsApp may drop it** because the recipient hasn't messaged us in the last 24h. This is where OTP used to fail silently.
- **Success: false** → Twilio rejected (bad number, auth, etc.) — check edge function logs.

Monitor `whatsapp_messages` table:
```sql
SELECT
  status,
  mode := metadata->>'mode',
  COUNT(*) AS n
FROM whatsapp_messages
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY status, metadata->>'mode'
ORDER BY n DESC;
```

Any non-zero `sent_window_dependent` row means we need to get that template
approved. Check the Settings panel for which templates are still pending.

## Troubleshooting

**OTP still not arriving for cold users after deploy?**
- Check Settings → WhatsApp Templates: is `otp_verification` showing `approved` + a ContentSid?
- If not: authoring step wasn't submitted, or Meta rejected. Check Twilio console.
- If yes: check edge function logs — `mode` should be `content_api` not `freeform`.

**Sync returns 0 templates?**
- Check `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` are set in Supabase Vault.
- Try dry-run first — surfaces errors without writing.

**Template shows `approved` but sends still fail?**
- The Twilio `From` number might not be linked to the Meta WABA that approved the template.
- Confirm `TWILIO_WHATSAPP_FROM` is the same sender attached to the approved template in Twilio Console → Senders.
