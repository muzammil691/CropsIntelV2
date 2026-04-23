// CropsIntelV2 — Email Queue Flusher
// Drains the email_queue table by sending queued messages via Office 365
// SMTP (the same intel@cropsintel.com mailbox that imap-reader.js proves
// works for inbound). The edge function email-send was returning 502
// because Deno Deploy's raw TCP to smtp.office365.com hangs on STARTTLS
// negotiation — we queue the email from the edge fn and this Node.js
// flusher handles actual delivery.
//
// Why Node.js instead of Deno:
//   - Office 365 SMTP with basic auth works reliably via nodemailer.
//   - We already have the Office 365 creds configured (INTEL_EMAIL +
//     INTEL_EMAIL_PASSWORD) and proven working in imap-reader.js.
//   - No cold-start / TCP-restriction issues like Deno Deploy.
//
// Modes:
//   flushOnce()         — one-shot drain of up to N queued rows
//   startFlusherDaemon()— cron wrapper (called by runner.js)
//
// Usage:
//   node src/autonomous/email-flusher.js             # flush once, exit
//   node src/autonomous/email-flusher.js --watch     # persistent flusher
//
// Env:
//   INTEL_EMAIL, INTEL_EMAIL_PASSWORD     — Office 365 mailbox creds
//   INTEL_SMTP_HOST (default smtp.office365.com)
//   INTEL_SMTP_PORT (default 587 STARTTLS)
//   FROM_EMAIL      (default "CropsIntel <intel@cropsintel.com>")
//   FLUSH_BATCH_SIZE (default 25)
//   FLUSH_MAX_ATTEMPTS (default 5)
//
// Created: 2026-04-24

import { config } from 'dotenv';
config();

import nodemailer from 'nodemailer';
import supabaseAdmin from '../lib/supabase-admin.js';

// ============================================================
// Configuration
// ============================================================
const SMTP_CONFIG = {
  host: process.env.INTEL_SMTP_HOST || 'smtp.office365.com',
  port: parseInt(process.env.INTEL_SMTP_PORT || '587', 10),
  secure: false,              // STARTTLS upgrade on 587 (not implicit TLS)
  requireTLS: true,
  auth: {
    user: process.env.INTEL_EMAIL || 'intel@cropsintel.com',
    pass: process.env.INTEL_EMAIL_PASSWORD,
  },
  tls: {
    // Office 365 insists on TLS 1.2+; this keeps nodemailer from negotiating
    // older ciphers that get rejected.
    minVersion: 'TLSv1.2',
    ciphers: 'HIGH:!aNULL:!MD5',
  },
  // Fail fast on hung connections rather than waiting the default 10 min
  connectionTimeout: 10_000,
  greetingTimeout:   10_000,
  socketTimeout:     20_000,
};

const FROM_EMAIL       = process.env.FROM_EMAIL || 'CropsIntel <intel@cropsintel.com>';
const BATCH_SIZE       = parseInt(process.env.FLUSH_BATCH_SIZE || '25', 10);
const MAX_ATTEMPTS     = parseInt(process.env.FLUSH_MAX_ATTEMPTS || '5', 10);
const FLUSHER_VERSION  = '1.0.0';

// Reuse a single transporter — nodemailer pools connections internally.
let transporter = null;
function getTransporter() {
  if (!transporter) {
    if (!SMTP_CONFIG.auth.pass) {
      throw new Error('INTEL_EMAIL_PASSWORD not set — cannot flush email queue');
    }
    transporter = nodemailer.createTransport(SMTP_CONFIG);
  }
  return transporter;
}

// ============================================================
// Logging helper
// ============================================================
async function logActivity(action, status, details = {}) {
  try {
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: `email-flusher-${action}`,
      status,
      records_found:    details.found    || 0,
      records_inserted: details.inserted || 0,
      error_message:    details.error    || null,
      duration_ms:      details.duration || 0,
      metadata:         details.metadata || {},
      completed_at:     new Date().toISOString(),
    });
  } catch (err) {
    console.warn(`[email-flusher] logActivity failed: ${err.message}`);
  }
}

// ============================================================
// Fetch pending messages (queued, not retried too many times)
// ============================================================
async function fetchPending() {
  const { data, error } = await supabaseAdmin
    .from('email_queue')
    .select('*')
    .eq('status', 'queued')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (error) throw new Error(`fetchPending: ${error.message}`);
  return data || [];
}

// ============================================================
// Mark row sent / failed
// ============================================================
async function markSent(id, providerId) {
  await supabaseAdmin
    .from('email_queue')
    .update({
      status: 'sent',
      provider_id: providerId,
      sent_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', id);
}

async function markAttempt(row, errorMessage) {
  const nextAttempts = (row.attempts || 0) + 1;
  const finalStatus  = nextAttempts >= MAX_ATTEMPTS ? 'failed' : 'queued';
  await supabaseAdmin
    .from('email_queue')
    .update({
      status: finalStatus,
      attempts: nextAttempts,
      last_error: errorMessage?.slice(0, 2000) || 'unknown error',
    })
    .eq('id', row.id);
}

// ============================================================
// Send one row
// ============================================================
async function sendOne(row) {
  const t = getTransporter();
  const info = await t.sendMail({
    from:    row.from_address || FROM_EMAIL,
    to:      row.to_address,
    subject: row.subject || 'CropsIntel',
    html:    row.html_body || undefined,
    text:    row.text_body || undefined,
  });
  return info?.messageId || `smtp-${Date.now()}`;
}

// ============================================================
// Single-shot flush: returns { found, sent, failed }
// ============================================================
export async function flushOnce() {
  const startTime = Date.now();
  let found = 0, sent = 0, failed = 0;
  const errors = [];

  try {
    const rows = await fetchPending();
    found = rows.length;
    if (found === 0) {
      console.log('[email-flusher] no queued rows');
      return { found: 0, sent: 0, failed: 0, duration: Date.now() - startTime };
    }

    console.log(`[email-flusher] flushing ${found} queued row(s)...`);

    // Verify SMTP connection once before looping
    try {
      await getTransporter().verify();
    } catch (verifyErr) {
      // If the mailbox can't authenticate, the whole batch is doomed — don't
      // loop and increment attempt counts for every row; fail this run loudly.
      const msg = verifyErr?.message || String(verifyErr);
      console.error(`[email-flusher] SMTP verify failed — aborting batch: ${msg}`);
      await logActivity('flush', 'failed', {
        found,
        error: `SMTP verify: ${msg}`,
        duration: Date.now() - startTime,
      });
      // Reset the transporter so the next run rebuilds the connection
      transporter = null;
      return { found, sent: 0, failed: 0, aborted: true, error: msg };
    }

    for (const row of rows) {
      try {
        const providerId = await sendOne(row);
        await markSent(row.id, providerId);
        sent += 1;
        console.log(`[email-flusher] sent ${row.id} → ${row.to_address} (${providerId})`);
      } catch (sendErr) {
        failed += 1;
        const msg = sendErr?.message || String(sendErr);
        errors.push({ id: row.id, to: row.to_address, error: msg });
        await markAttempt(row, msg);
        console.warn(`[email-flusher] failed ${row.id} → ${row.to_address}: ${msg}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[email-flusher] done: ${sent}/${found} sent, ${failed} failed (${duration}ms)`);
    await logActivity('flush', failed === 0 ? 'success' : 'partial', {
      found,
      inserted: sent,
      duration,
      metadata: { failed, errors: errors.slice(0, 5), version: FLUSHER_VERSION },
    });

    return { found, sent, failed, duration };
  } catch (err) {
    const msg = err?.message || String(err);
    console.error(`[email-flusher] fatal: ${msg}`);
    await logActivity('flush', 'failed', {
      found,
      error: msg,
      duration: Date.now() - startTime,
    });
    return { found, sent, failed, error: msg };
  }
}

// ============================================================
// Daemon mode — used by runner.js via cron wrapper (not standalone)
// ============================================================
export async function startFlusherDaemon(intervalMs = 5 * 60 * 1000) {
  console.log(`[email-flusher] daemon started (interval ${Math.round(intervalMs / 1000)}s)`);
  const tick = async () => {
    try {
      await flushOnce();
    } catch (err) {
      console.warn(`[email-flusher] tick error: ${err?.message || err}`);
    }
  };
  await tick();
  setInterval(tick, intervalMs);
}

// ============================================================
// CLI entry
// ============================================================
const __isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (__isMainModule) {
  const watch = process.argv.includes('--watch');
  if (watch) {
    startFlusherDaemon();
  } else {
    flushOnce()
      .then((r) => {
        console.log('[email-flusher] result:', r);
        process.exit(r.failed > 0 || r.error ? 1 : 0);
      })
      .catch((err) => {
        console.error('[email-flusher] crash:', err);
        process.exit(1);
      });
  }
}
