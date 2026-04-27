// CropsIntelV2 — IMAP Email Reader
// Connects to intel@cropsintel.com (Office 365) via IMAP, polls for new messages,
// and inserts them into the email_inbox table for processing by email-ingestor.js.
//
// Architecture:
//   imap-reader.js  → Fetches raw emails from IMAP → inserts into email_inbox (is_processed: false)
//   email-ingestor.js → Picks up unprocessed rows → classifies, extracts, routes
//
// Modes:
//   pollInbox()        — one-shot fetch of unseen messages (cron-friendly)
//   connectAndWatch()  — persistent IDLE connection that reacts to new mail in real-time
//
// Usage:
//   node src/autonomous/imap-reader.js              # poll once
//   node src/autonomous/imap-reader.js --watch      # persistent watch mode
//
// Created: 2026-04-21

import { config } from 'dotenv';
config();

import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import supabaseAdmin from '../lib/supabase-admin.js';

// ============================================================
// Configuration
// ============================================================
const IMAP_CONFIG = {
  host: process.env.INTEL_IMAP_HOST || 'outlook.office365.com',
  port: parseInt(process.env.INTEL_IMAP_PORT || '993', 10),
  secure: true,
  auth: {
    user: process.env.INTEL_EMAIL || 'intel@cropsintel.com',
    pass: process.env.INTEL_EMAIL_PASSWORD,
  },
  logger: false,      // set to console for debug
  emitLogs: false,
};

const INBOX_EMAIL = process.env.INTEL_EMAIL || 'intel@cropsintel.com';
const MAX_FETCH_PER_POLL = 50;       // safety cap per poll cycle
const RECONNECT_DELAY_MS = 30_000;   // 30s before reconnect attempt
const MAX_RECONNECT_ATTEMPTS = 10;
const ATTACHMENT_SIZE_LIMIT = 10 * 1024 * 1024; // 10 MB

// ============================================================
// Logging helper (mirrors email-ingestor pattern)
// ============================================================
async function logActivity(action, status, details = {}) {
  try {
    await supabaseAdmin.from('scraping_logs').insert({
      scraper_name: `imap-reader-${action}`,
      status,
      records_found: details.found || 0,
      records_inserted: details.inserted || 0,
      error_message: details.error || null,
      duration_ms: details.duration || 0,
      metadata: details.metadata || {},
      completed_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to write scraping_logs:', err.message);
  }
}

// ============================================================
// Create IMAP client
// ============================================================
function createClient() {
  if (!IMAP_CONFIG.auth.pass) {
    throw new Error('INTEL_EMAIL_PASSWORD not set in .env');
  }
  return new ImapFlow(IMAP_CONFIG);
}

// ============================================================
// Parse a single message into a flat object for email_inbox
// ============================================================
async function parseMessage(client, seq, uid) {
  // Download full message source
  const download = await client.download(uid, undefined, { uid: true });
  const chunks = [];
  for await (const chunk of download.content) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks);

  // Parse with mailparser
  const parsed = await simpleParser(raw);

  // Build attachment array
  const attachments = [];
  if (parsed.attachments?.length > 0) {
    for (const att of parsed.attachments) {
      const entry = {
        filename: att.filename || 'unnamed',
        size: att.size || att.content?.length || 0,
        content_type: att.contentType || 'application/octet-stream',
        storage_path: null,  // filled after upload
      };

      // Upload to Supabase storage if under size limit
      if (att.content && att.content.length <= ATTACHMENT_SIZE_LIMIT) {
        try {
          const storagePath = `email-attachments/${Date.now()}_${att.filename || 'file'}`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from('attachments')
            .upload(storagePath, att.content, {
              contentType: att.contentType || 'application/octet-stream',
              upsert: false,
            });

          if (!uploadError) {
            entry.storage_path = storagePath;
          } else {
            console.warn(`  Attachment upload failed (${att.filename}): ${uploadError.message}`);
          }
        } catch (uploadErr) {
          console.warn(`  Attachment upload error (${att.filename}): ${uploadErr.message}`);
        }
      } else if (att.content && att.content.length > ATTACHMENT_SIZE_LIMIT) {
        console.warn(`  Attachment too large, skipping upload: ${att.filename} (${(att.content.length / 1024 / 1024).toFixed(1)} MB)`);
        entry.skipped_reason = 'too_large';
      }

      attachments.push(entry);
    }
  }

  return {
    email_address: INBOX_EMAIL,
    from_address: parsed.from?.value?.[0]?.address || null,
    from_name: parsed.from?.value?.[0]?.name || null,
    subject: parsed.subject || null,
    body_text: parsed.text || null,
    body_html: parsed.html || null,
    received_at: parsed.date?.toISOString() || new Date().toISOString(),
    is_processed: false,
    attachments,
    metadata: {
      uid,
      message_id: parsed.messageId || null,
      to: parsed.to?.text || null,
      cc: parsed.cc?.text || null,
      in_reply_to: parsed.inReplyTo || null,
      references: parsed.references || null,
      has_attachments: attachments.length > 0,
      attachment_count: attachments.length,
    },
  };
}

// ============================================================
// Check for duplicate (by message_id in metadata)
// ============================================================
async function isDuplicate(messageId) {
  if (!messageId) return false;
  const { data } = await supabaseAdmin
    .from('email_inbox')
    .select('id')
    .contains('metadata', { message_id: messageId })
    .limit(1);
  return data && data.length > 0;
}

// ============================================================
// pollInbox — one-shot fetch of unseen messages
// ============================================================
export async function pollInbox() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('CropsIntelV2 — IMAP Reader: Poll Mode');
  console.log(`Inbox: ${INBOX_EMAIL}`);
  console.log(`Time:  ${new Date().toISOString()}`);
  console.log('========================================\n');

  // Pre-flight: skip cleanly when creds aren't configured. GH Actions step gating
  // is best-effort but env may still leak through; double-check here.
  if (!IMAP_CONFIG.auth.pass) {
    console.log('IMAP credentials not configured (INTEL_EMAIL_PASSWORD missing). Skipping cleanly.');
    await logActivity('poll', 'skipped', {
      metadata: { reason: 'missing_credentials', secret_hint: 'Add INTEL_EMAIL + INTEL_EMAIL_PASSWORD to GH Actions repo secrets to activate.' }
    });
    return { found: 0, inserted: 0, errors: 0, skipped: true };
  }

  await logActivity('poll', 'started');

  const client = createClient();
  let found = 0;
  let inserted = 0;
  let errors = 0;

  try {
    await client.connect();
    console.log('Connected to IMAP server');

    const lock = await client.getMailboxLock('INBOX');
    try {
      // Search for unseen messages
      const uids = await client.search({ seen: false }, { uid: true });
      found = uids.length;

      if (found === 0) {
        console.log('No unseen messages');
      } else {
        console.log(`Found ${found} unseen message(s)`);
        const toProcess = uids.slice(0, MAX_FETCH_PER_POLL);

        for (const uid of toProcess) {
          try {
            const emailData = await parseMessage(client, null, uid);

            // Dedup check
            if (await isDuplicate(emailData.metadata.message_id)) {
              console.log(`  Skipping duplicate: ${emailData.subject?.substring(0, 50)}`);
              // Still mark as seen since we already have it
              await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
              continue;
            }

            // Insert into email_inbox
            const { error: insertError } = await supabaseAdmin
              .from('email_inbox')
              .insert(emailData);

            if (insertError) {
              console.error(`  Insert failed: ${insertError.message}`);
              errors++;
              continue;
            }

            // Mark as seen in IMAP
            await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });

            inserted++;
            console.log(`  Ingested: [UID ${uid}] ${emailData.subject?.substring(0, 60) || '(no subject)'}`);
          } catch (msgErr) {
            console.error(`  Error processing UID ${uid}: ${msgErr.message}`);
            errors++;
          }
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
    console.log('Disconnected from IMAP server');
  } catch (err) {
    console.error('IMAP poll error:', err.message);
    await logActivity('poll', 'error', {
      error: err.message,
      duration: Date.now() - startTime,
      metadata: { found, inserted, errors },
    });
    // Ensure disconnect
    try { await client.logout(); } catch (_) { /* ignore */ }
    return { found, inserted, errors, error: err.message };
  }

  const duration = Date.now() - startTime;

  await logActivity('poll', inserted > 0 ? 'success' : 'no_data', {
    found,
    inserted,
    duration,
    metadata: { errors, inbox: INBOX_EMAIL },
  });

  console.log(`\nPoll complete: ${found} found, ${inserted} ingested, ${errors} errors (${duration}ms)`);
  return { found, inserted, errors, duration };
}

// ============================================================
// connectAndWatch — persistent IDLE watching
// ============================================================
export async function connectAndWatch() {
  console.log('\n========================================');
  console.log('CropsIntelV2 — IMAP Reader: Watch Mode');
  console.log(`Inbox: ${INBOX_EMAIL}`);
  console.log(`Time:  ${new Date().toISOString()}`);
  console.log('========================================\n');

  let reconnectAttempts = 0;

  async function startWatching() {
    const client = createClient();

    try {
      await client.connect();
      console.log('Connected to IMAP server (watch mode)');
      reconnectAttempts = 0; // reset on successful connect

      await logActivity('watch', 'connected', {
        metadata: { inbox: INBOX_EMAIL, mode: 'persistent' },
      });

      const lock = await client.getMailboxLock('INBOX');

      // Do an initial poll of unseen messages
      const initialUids = await client.search({ seen: false }, { uid: true });
      if (initialUids.length > 0) {
        console.log(`Processing ${initialUids.length} existing unseen message(s)...`);
        for (const uid of initialUids.slice(0, MAX_FETCH_PER_POLL)) {
          try {
            const emailData = await parseMessage(client, null, uid);
            if (await isDuplicate(emailData.metadata.message_id)) {
              await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
              continue;
            }
            const { error: insertError } = await supabaseAdmin
              .from('email_inbox')
              .insert(emailData);
            if (!insertError) {
              await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
              console.log(`  Ingested: ${emailData.subject?.substring(0, 60) || '(no subject)'}`);
            }
          } catch (msgErr) {
            console.error(`  Error processing UID ${uid}: ${msgErr.message}`);
          }
        }
      }

      // Listen for new mail via IDLE
      client.on('exists', async (data) => {
        console.log(`\nNew mail event: ${data.count} message(s) in mailbox`);

        try {
          const newUids = await client.search({ seen: false }, { uid: true });
          for (const uid of newUids.slice(0, MAX_FETCH_PER_POLL)) {
            try {
              const emailData = await parseMessage(client, null, uid);
              if (await isDuplicate(emailData.metadata.message_id)) {
                await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                continue;
              }
              const { error: insertError } = await supabaseAdmin
                .from('email_inbox')
                .insert(emailData);
              if (!insertError) {
                await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
                console.log(`  Ingested: ${emailData.subject?.substring(0, 60) || '(no subject)'}`);
                await logActivity('watch-ingest', 'success', {
                  inserted: 1,
                  metadata: { subject: emailData.subject, from: emailData.from_address },
                });
              }
            } catch (msgErr) {
              console.error(`  Error processing UID ${uid}: ${msgErr.message}`);
            }
          }
        } catch (fetchErr) {
          console.error('Error fetching new messages:', fetchErr.message);
        }
      });

      // Handle disconnection
      client.on('close', async () => {
        console.log('IMAP connection closed');
        lock.release();
        await scheduleReconnect();
      });

      client.on('error', async (err) => {
        console.error('IMAP error:', err.message);
        await logActivity('watch', 'error', { error: err.message });
      });

      // Start IDLE
      console.log('Watching for new mail (IDLE mode)...');
      // ImapFlow handles IDLE automatically when the mailbox is locked and idle

    } catch (err) {
      console.error('Watch connection failed:', err.message);
      await logActivity('watch', 'error', { error: err.message });
      await scheduleReconnect();
    }
  }

  async function scheduleReconnect() {
    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
      await logActivity('watch', 'fatal', {
        error: `Max reconnect attempts reached after ${MAX_RECONNECT_ATTEMPTS} tries`,
      });
      return;
    }

    const delay = RECONNECT_DELAY_MS * reconnectAttempts; // linear backoff
    console.log(`Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    await new Promise((r) => setTimeout(r, delay));
    await startWatching();
  }

  await startWatching();
}

// ============================================================
// CLI entry point
// ============================================================
if (process.argv[1] && process.argv[1].includes('imap-reader')) {
  const watchMode = process.argv.includes('--watch');

  if (watchMode) {
    connectAndWatch().catch((err) => {
      console.error('IMAP watcher crashed:', err);
      process.exit(1);
    });
  } else {
    pollInbox()
      .then((result) => {
        console.log('\nResult:', result);
        process.exit(0);
      })
      .catch((err) => {
        console.error('IMAP poll crashed:', err);
        process.exit(1);
      });
  }
}
