# F1b — Email SMTP edge function deploy (for the morning)

**Shipped 2026-04-24 overnight (code only — not yet deployed):**
`supabase/functions/email-send/index.ts`

This is the email leg of Phase F1 that unlocks:
- CRM Bulk Invite email channel (currently queues email in `metadata.email_queued`; deploys actually send)
- V2 Upgrade email to the 65 migrated V1 users
- Trade Alerts via email (in addition to WhatsApp)

## 5-minute deploy steps

1. **Resend account + API key** (free tier is 3,000 emails/month):
   - https://resend.com — sign up
   - Add DNS: verify `cropsintel.com` domain (SPF + DKIM + optional DMARC records)
   - Generate API key

2. **Set secret in Supabase:**
   ```sh
   supabase secrets set RESEND_API_KEY="re_..."
   supabase secrets set FROM_EMAIL="CropsIntel <noreply@cropsintel.com>"
   ```

3. **Deploy:**
   ```sh
   supabase functions deploy email-send
   ```

4. **Test:**
   ```sh
   curl -X POST \
     "https://<project>.supabase.co/functions/v1/email-send" \
     -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
     -H "Content-Type: application/json" \
     -d '{"type":"invite","to":"your-own-email@example.com","context":{"name":"Test","role":"buyer","inviterName":"MAXONS Team"}}'
   ```

5. **Wire the frontend** (one-line change):
   In `src/components/CRMBulkInvite.jsx`, the email leg currently calls
   `supabase.from('crm_contacts').update(...)` to mark `email_queued`.
   After deploy, replace that block with a `fetch` to `/functions/v1/email-send`
   to actually send + flip `email_sent_at` on success.

6. **V2 upgrade email to 65 users:**
   ```js
   // From an admin-only script:
   const { data: users } = await supabase.from('user_profiles')
     .select('email, full_name')
     .eq('metadata->>migrated_from_v1', 'true');
   for (const u of users) {
     await fetch('/functions/v1/email-send', {
       method: 'POST',
       body: JSON.stringify({
         type: 'upgrade',
         to: u.email,
         context: { name: u.full_name, v1UserEmail: u.email }
       })
     });
   }
   ```

## Templates included

- `invite` — matches the default WhatsApp invite copy
- `upgrade` — V1→V2 upgrade notification
- `trade_alert` — urgency-colored alert

## What NOT to do

- Don't hardcode the API key in the edge function — use Supabase secrets.
- Don't add per-email `Reply-To` headers without auth (spoofing risk).
- Don't send V2 upgrade emails before confirming the V1 popup works end-to-end on cropsintel.com (L6 in launchFocusPlan).
