// CRM Bulk Invite tab — paste WhatsApp numbers, pick a persona type,
// send a templated invite via Twilio, and track delivery per number.
//
// Each successful send persists a crm_contacts row (contact_type set,
// phone stored, tags: ['invited','bulk'], metadata.invite_status='sent').
// When the invited user later registers with the same WhatsApp number,
// a separate reconcile step can flip metadata.invite_status='joined'
// (Phase C5c — not in this MVP).

import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { sendWhatsAppTemplate } from '../lib/whatsapp';
import { pickInviteTemplate, TEMPLATE_CATALOG } from '../lib/whatsapp-templates';
import { useAuth } from '../lib/auth';

const CONTACT_TYPES = [
  { value: 'buyer',     label: 'Buyer / Importer' },
  { value: 'supplier',  label: 'Supplier / Handler' },
  { value: 'broker',    label: 'Broker / Trader' },
  { value: 'grower',    label: 'Grower' },
  { value: 'processor', label: 'Processor / Manufacturer' },
  { value: 'logistics', label: 'Logistics / Freight' },
  { value: 'industry',  label: 'Industry Contact' },
];

const DEFAULT_TEMPLATE =
`Hi! You're invited to CropsIntel — the autonomous almond market intelligence platform used by MAXONS International Trading.

Get live ABC position data, pricing intel, destination flow, and AI market briefs — all in one place.

Register here: https://cropsintel.com/register

Or reply YES and we'll set you up via WhatsApp.`;

// Normalize a phone/WhatsApp number: strip non-digits, prefix + if it looks international.
function normalize(input) {
  if (!input) return '';
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return '';
  // If starts with 00 -> +
  if (digits.startsWith('00')) return '+' + digits.slice(2);
  // If 10 digits (US), default +1
  if (digits.length === 10) return '+1' + digits;
  // Already international
  return '+' + digits;
}

// Parse a pasted blob into rows of {phone?, email?, name?}.
// Accepts per-line formats:
//   +971501234567
//   alice@example.com
//   +971501234567, alice@example.com
//   Alice, +971501234567, alice@example.com
//   +971501234567  alice@example.com  Alice Almond
function parseRows(blob) {
  if (!blob) return [];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return blob.split(/\n+/).map(line => {
    const parts = line.split(/[,;\t]|  +/).map(s => s.trim()).filter(Boolean);
    let phone = '', email = '', name = '';
    for (const p of parts) {
      if (!email && emailRe.test(p)) { email = p; continue; }
      if (!phone && /\d/.test(p)) {
        const n = normalize(p);
        if (n.length >= 8) { phone = n; continue; }
      }
      if (!name) { name = p; }
    }
    if (!phone && !email) return null;
    return { phone, email, name };
  }).filter(Boolean);
}

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp only' },
  { value: 'email',    label: 'Email only' },
  { value: 'both',     label: 'Both (WhatsApp + Email)' },
];

export default function CRMBulkInvite() {
  const { profile } = useAuth();
  const [raw, setRaw] = useState('');
  const [contactType, setContactType] = useState('buyer');
  const [channel, setChannel] = useState('whatsapp');
  const [message, setMessage] = useState(DEFAULT_TEMPLATE);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]); // [{ row, status, notes[] }]

  // The WhatsApp template auto-selected from contact_type. Buyer → invite_buyer,
  // supplier/grower/packer → invite_supplier, broker/trader → invite_broker,
  // team roles → invite_team. Admin can edit the custom freeform body used as
  // fallback, but the template path is what actually delivers outside the 24h
  // window (see src/lib/whatsapp-templates.js for the routing map).
  const templateKey = pickInviteTemplate(contactType);
  const templateMeta = TEMPLATE_CATALOG[templateKey];
  const inviterName = profile?.display_name || profile?.email || 'MAXONS Team';

  const rows = parseRows(raw);

  async function handleSend() {
    if (rows.length === 0) {
      setResults([{ row: { phone: '—' }, status: 'error', notes: ['Paste at least one WhatsApp number or email per line.'] }]);
      return;
    }
    setSending(true);
    setResults(rows.map(r => ({ row: r, status: 'pending', notes: [] })));

    const out = [];
    for (const r of rows) {
      const notes = [];
      let ok = false, failed = false;

      // Upsert CRM contact so the invite is trackable regardless of channel
      try {
        const { error: insertErr } = await supabase.from('crm_contacts').upsert({
          contact_type: contactType,
          phone: r.phone || null,
          email: r.email || null,
          contact_name: r.name || null,
          tags: ['invited', 'bulk', ...(r.phone ? ['has_whatsapp'] : []), ...(r.email ? ['has_email'] : [])],
          metadata: {
            invite_status: 'sent',
            invite_channel: channel,
            invited_at: new Date().toISOString(),
            invite_template: templateKey,
            invite_template_category: templateMeta?.category || 'utility',
          },
          relationship_score: 40,
        }, { onConflict: r.phone ? 'phone' : 'email', ignoreDuplicates: false });
        if (insertErr && !insertErr.message.includes('duplicate')) {
          notes.push(`CRM warn: ${insertErr.message}`);
        }
      } catch (err) {
        notes.push(`CRM insert error: ${err.message}`);
      }

      // WhatsApp leg — sent via template (guaranteed delivery even if recipient
      // hasn't messaged us in the last 24h, provided the template is Meta-
      // approved in Twilio). Variables are the recipient's name + our inviter
      // name; the custom `message` textarea becomes the freeform fallback.
      if ((channel === 'whatsapp' || channel === 'both') && r.phone) {
        try {
          const result = await sendWhatsAppTemplate(
            r.phone,
            templateKey,
            { name: r.name || 'there', inviter: inviterName },
            message
          );
          if (result?.mode === 'content_api') {
            notes.push(`WhatsApp template delivered (${templateKey})`);
          } else if (result?.status === 'sent_window_dependent') {
            notes.push(`WhatsApp freeform queued — template ${templateKey} not yet approved, may drop outside 24h`);
          } else {
            notes.push(`WhatsApp sent (${result?.mode || 'unknown'})`);
          }
          ok = true;
        } catch (err) {
          notes.push(`WhatsApp failed: ${err?.message || err}`);
          failed = true;
        }
      } else if ((channel === 'whatsapp' || channel === 'both') && !r.phone) {
        notes.push('WhatsApp skipped: no phone');
      }

      // Email leg — no SMTP edge function yet (Phase F1b). We queue the
      // invite in crm_contacts.metadata.email_queued and let the reconcile
      // job send when SMTP lands. Honest disclosure in notes.
      if ((channel === 'email' || channel === 'both') && r.email) {
        try {
          await supabase.from('crm_contacts').update({
            metadata: {
              invite_status: 'sent',
              invite_channel: channel,
              invited_at: new Date().toISOString(),
              invite_template: templateKey,
              invite_template_category: templateMeta?.category || 'utility',
              email_queued: true,
              email_queued_at: new Date().toISOString(),
            }
          }).eq('email', r.email);
          notes.push('Email queued (SMTP edge function = Phase F1b)');
          ok = true;
        } catch (err) {
          notes.push(`Email queue failed: ${err?.message || err}`);
          failed = true;
        }
      } else if ((channel === 'email' || channel === 'both') && !r.email) {
        notes.push('Email skipped: no email');
      }

      const status = ok && !failed ? 'sent' : failed && !ok ? 'failed' : ok ? 'partial' : 'failed';
      out.push({ row: r, status, notes });
      setResults([...out, ...rows.slice(out.length).map(rr => ({ row: rr, status: 'pending', notes: [] }))]);
    }
    setResults(out);
    setSending(false);
  }

  const sentCount    = results.filter(r => r.status === 'sent').length;
  const partialCount = results.filter(r => r.status === 'partial').length;
  const failedCount  = results.filter(r => r.status === 'failed').length;

  return (
    <div className="space-y-4">
      <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
        <h3 className="text-base font-semibold text-white">Bulk WhatsApp Invite</h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Paste WhatsApp numbers (one per line, comma, or semicolon-separated), pick the persona type, edit the message, and send.
          Each successful send creates a <code className="text-gray-400">crm_contacts</code> row with invite tracking so you can see who joined later.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: numbers + type */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5 space-y-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">
              Contacts ({rows.length} parsed)
            </label>
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={'+971501234567, alice@example.com, Alice\n+919876543210\nbob@example.com\nCarol Trade, +1-415-555-0100, carol@trading.co\n...'}
              rows={9}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 font-mono placeholder:text-gray-600 focus:outline-none focus:border-green-500/50"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              One contact per line. Any combination of phone, email, name (comma/tab/2+space separated).
              Phone normalized to +E.164; email auto-detected.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">
                Persona type
              </label>
              <select
                value={contactType}
                onChange={e => setContactType(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              >
                {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">
                Channel
              </label>
              <select
                value={channel}
                onChange={e => setChannel(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200"
              >
                {CHANNELS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 -mt-2">
            Email sending is queued to <code>crm_contacts.metadata.email_queued</code> — the SMTP edge function (Phase F1b) will drain the queue. WhatsApp sends immediately via the whatsapp-send edge function.
          </p>

          {/* Template binding preview — tells the admin which Meta-approved
              template will actually ship to this persona, and in which Meta
              category (authentication/utility/marketing). If the template is
              not yet approved in Twilio, the edge fn falls back to the
              custom message textarea freeform — but that ONLY delivers
              inside the 24h window. */}
          <div className="mt-1 px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20">
            <p className="text-[10px] text-green-300 font-semibold uppercase tracking-wider">
              WhatsApp template: <code className="text-green-200">{templateKey}</code>
              <span className="ml-2 text-[10px] text-green-400/80 normal-case font-normal">
                (Meta category: {templateMeta?.category || 'utility'})
              </span>
            </p>
            <p className="text-[10px] text-gray-400 mt-1 leading-snug">
              {templateMeta?.description || 'Per-role invite template; admin-editable in Settings.'}
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || rows.length === 0}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? `Sending ${results.filter(r => r.status === 'pending').length} of ${rows.length}...` : `Send ${rows.length} invite${rows.length === 1 ? '' : 's'} via ${channel === 'both' ? 'WhatsApp + Email' : channel}`}
          </button>
        </div>

        {/* Right: message editor */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <label className="text-xs uppercase tracking-wider text-gray-500 block mb-2">
            Message template
          </label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={12}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 focus:outline-none focus:border-green-500/50"
          />
          <p className="text-[10px] text-gray-600 mt-1">
            Keep it short — WhatsApp messages over 400 chars are often truncated in previews.
            Include the /register link so recipients can self-serve.
          </p>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-white">Send results</h4>
            <div className="flex items-center gap-3 text-xs">
              {sentCount > 0 && <span className="text-green-400">✓ {sentCount} sent</span>}
              {partialCount > 0 && <span className="text-amber-400">~ {partialCount} partial</span>}
              {failedCount > 0 && <span className="text-red-400">✗ {failedCount} failed</span>}
              {sending && <span className="text-amber-400">in progress…</span>}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left py-2">Contact</th>
                  <th className="text-left py-2 w-24">Status</th>
                  <th className="text-left py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 font-mono text-gray-300">
                      <div>{r.row?.phone || '—'}</div>
                      {r.row?.email && <div className="text-gray-500">{r.row.email}</div>}
                      {r.row?.name && <div className="text-gray-600 text-[10px]">{r.row.name}</div>}
                    </td>
                    <td className="py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        r.status === 'sent'    ? 'bg-green-500/20 text-green-400' :
                        r.status === 'partial' ? 'bg-amber-500/20 text-amber-400' :
                        r.status === 'failed'  ? 'bg-red-500/20 text-red-400' :
                        r.status === 'error'   ? 'bg-red-500/20 text-red-400' :
                                                 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500">
                      {(r.notes || []).map((n, j) => <div key={j} className="text-[10px]">{n}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-600 mt-3">
            Each invite creates a CRM contact tagged <code>invited</code>/<code>bulk</code> (plus <code>has_whatsapp</code>/<code>has_email</code>) with
            <code> metadata.invite_status='sent'</code>. When the recipient registers with the same WhatsApp or email,
            reconcile flips them to <code>joined</code> (Phase C5b-followup). Email delivery is queued; SMTP edge function is Phase F1b.
          </p>
        </div>
      )}
    </div>
  );
}
