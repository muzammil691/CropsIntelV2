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
import { sendWhatsAppMessage } from '../lib/whatsapp';

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

function parseNumbers(blob) {
  if (!blob) return [];
  return blob
    .split(/[\n,;]/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(normalize)
    .filter(n => n.length >= 8);
}

export default function CRMBulkInvite() {
  const [raw, setRaw] = useState('');
  const [contactType, setContactType] = useState('buyer');
  const [message, setMessage] = useState(DEFAULT_TEMPLATE);
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState([]); // [{ number, status, note }]

  const numbers = parseNumbers(raw);

  async function handleSend() {
    if (numbers.length === 0) {
      setResults([{ number: '—', status: 'error', note: 'Paste at least one valid WhatsApp number.' }]);
      return;
    }
    setSending(true);
    setResults(numbers.map(n => ({ number: n, status: 'pending', note: '' })));

    const out = [];
    for (const n of numbers) {
      try {
        // 1. Log/upsert the crm_contacts row so the invite is trackable.
        const { error: insertErr } = await supabase.from('crm_contacts').upsert({
          contact_type: contactType,
          phone: n,
          tags: ['invited', 'bulk'],
          metadata: {
            invite_status: 'sent',
            invited_at: new Date().toISOString(),
            invite_channel: 'whatsapp_bulk',
            invite_template: 'default_v1',
          },
          relationship_score: 40,  // starting score for cold invite
        }, {
          onConflict: 'phone',
          ignoreDuplicates: false,
        });
        if (insertErr && !insertErr.message.includes('duplicate')) {
          // Non-fatal — still try to send
          console.warn('CRM insert warning:', insertErr.message);
        }

        // 2. Send the WhatsApp invite.
        await sendWhatsAppMessage(n, message);

        out.push({ number: n, status: 'sent', note: 'WhatsApp delivered' });
      } catch (err) {
        out.push({ number: n, status: 'failed', note: err?.message || String(err) });
      }
      // Update UI incrementally
      setResults([...out, ...numbers.slice(out.length).map(nn => ({ number: nn, status: 'pending', note: '' }))]);
    }
    setResults(out);
    setSending(false);
  }

  const sentCount   = results.filter(r => r.status === 'sent').length;
  const failedCount = results.filter(r => r.status === 'failed').length;

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
              WhatsApp numbers ({numbers.length} parsed)
            </label>
            <textarea
              value={raw}
              onChange={e => setRaw(e.target.value)}
              placeholder={'+971501234567\n+919876543210\n+1-415-555-0100\n...'}
              rows={9}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-xs text-gray-200 font-mono placeholder:text-gray-600 focus:outline-none focus:border-green-500/50"
            />
            <p className="text-[10px] text-gray-600 mt-1">
              Accepts any format — digits, spaces, dashes, plus sign. Normalized to +E.164 automatically.
            </p>
          </div>

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
            <p className="text-[10px] text-gray-600 mt-1">
              Tags the invited contact so they flow to the right pipeline and Zyra gets relevant context.
            </p>
          </div>

          <button
            onClick={handleSend}
            disabled={sending || numbers.length === 0}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-colors bg-green-600 hover:bg-green-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {sending ? `Sending ${results.filter(r => r.status === 'pending').length} of ${numbers.length}...` : `Send ${numbers.length} WhatsApp invite${numbers.length === 1 ? '' : 's'}`}
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
              {failedCount > 0 && <span className="text-red-400">✗ {failedCount} failed</span>}
              {sending && <span className="text-amber-400">in progress…</span>}
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500">
                  <th className="text-left py-2">Number</th>
                  <th className="text-left py-2 w-24">Status</th>
                  <th className="text-left py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-b border-gray-800/50">
                    <td className="py-2 font-mono text-gray-300">{r.number}</td>
                    <td className="py-2">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                        r.status === 'sent'   ? 'bg-green-500/20 text-green-400' :
                        r.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                        r.status === 'error'  ? 'bg-red-500/20 text-red-400' :
                                                'bg-amber-500/20 text-amber-400'
                      }`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500 truncate max-w-md">{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-600 mt-3">
            Each successful invite creates a CRM contact tagged <code>invited</code>/<code>bulk</code> with
            <code> metadata.invite_status='sent'</code>. When the recipient registers on cropsintel.com with the
            same WhatsApp number, the reconcile job will flip them to <code>joined</code> (Phase C5c).
          </p>
        </div>
      )}
    </div>
  );
}
