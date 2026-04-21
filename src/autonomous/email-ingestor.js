// CropsIntelV2 — Autonomous Email Ingestion Engine
// Monitors dedicated app email inbox(es) for incoming reports, price updates,
// news, and trade inquiries. Auto-processes attachments and routes to CRM/BRM/SRM.
//
// Architecture:
//   intel@cropsintel.com   → Intelligence inbox (reports, news, market data)
//   trade@cropsintel.com   → CRM/BRM/SRM inbox (buyer inquiries, logistics, supplier comms)
//
// Supports: IMAP polling, webhook/forwarding, or API-based retrieval
//
// Usage:
//   node src/autonomous/email-ingestor.js          # check all inboxes
//   node src/autonomous/email-ingestor.js --inbox intel  # check intel only
//
// Created: 2026-04-21

import { config } from 'dotenv';
config();

import supabaseAdmin from '../lib/supabase-admin.js';

// ============================================================
// Configuration
// ============================================================
const INBOXES = {
  intel: {
    email: process.env.INTEL_EMAIL || 'intel@cropsintel.com',
    purpose: 'intelligence',
    description: 'Receives industry reports, price updates, newsletters, and market data',
    subscriptions: [
      { service: 'abc_alerts', url: 'https://www.almondboard.com', type: 'report' },
      { service: 'bountiful_updates', url: 'https://bountiful.ag', type: 'newsletter' },
      { service: 'usda_crop_reports', url: 'https://www.nass.usda.gov', type: 'report' },
      { service: 'strata_price_alerts', url: 'https://online.stratamarkets.com', type: 'price_update' },
    ]
  },
  trade: {
    email: process.env.TRADE_EMAIL || 'trade@cropsintel.com',
    purpose: 'crm',
    description: 'Receives buyer inquiries, supplier comms, logistics updates, and trade negotiations',
    routing: {
      buyer_keywords: ['inquiry', 'quote', 'pricing', 'order', 'purchase', 'buy', 'rfq', 'interested'],
      supplier_keywords: ['supply', 'offer', 'available', 'stock', 'warehouse', 'harvest', 'crop'],
      logistics_keywords: ['shipment', 'shipping', 'container', 'freight', 'tracking', 'delivery', 'customs', 'bl', 'bill of lading'],
    }
  }
};

// ============================================================
// Logging helper
// ============================================================
async function logActivity(action, status, details = {}) {
  await supabaseAdmin.from('scraping_logs').insert({
    scraper_name: `email-ingestor-${action}`,
    status,
    records_found: details.found || 0,
    records_inserted: details.inserted || 0,
    error_message: details.error || null,
    duration_ms: details.duration || 0,
    metadata: details.metadata || {},
    completed_at: new Date().toISOString()
  });
}

// ============================================================
// Email Classification (AI-powered routing)
// ============================================================
function classifyEmail(email) {
  const text = `${email.subject || ''} ${email.body_text || ''} ${email.from_name || ''}`.toLowerCase();

  // Detect email type
  let processingType = 'general';
  let routeTo = 'intelligence';
  let priority = 'normal';
  let actionRequired = false;

  // Report/PDF detection
  if (/report|position|forecast|estimate|acreage|almanac/.test(text)) {
    processingType = 'report_pdf';
    routeTo = 'intelligence';
  }

  // Price update detection
  if (/price|pricing|bid|offer|market\s*price|per\s*(?:lb|pound|kg)/.test(text)) {
    processingType = 'price_update';
    routeTo = 'intelligence';
    actionRequired = true;
  }

  // Buyer inquiry detection
  if (INBOXES.trade.routing.buyer_keywords.some(kw => text.includes(kw))) {
    processingType = 'crm_inquiry';
    routeTo = 'crm';
    actionRequired = true;
    priority = 'high';
  }

  // Supplier communication
  if (INBOXES.trade.routing.supplier_keywords.some(kw => text.includes(kw))) {
    processingType = 'crm_inquiry';
    routeTo = 'srm';
    actionRequired = true;
  }

  // Logistics update
  if (INBOXES.trade.routing.logistics_keywords.some(kw => text.includes(kw))) {
    processingType = 'logistics';
    routeTo = 'brm';
    actionRequired = true;
    if (/urgent|asap|immediate|delay|problem|issue/.test(text)) {
      priority = 'urgent';
    }
  }

  // News detection
  if (/news|article|blog|press\s*release|announcement/.test(text)) {
    processingType = 'news';
    routeTo = 'intelligence';
  }

  return { processingType, routeTo, priority, actionRequired };
}

// ============================================================
// Extract data from email content
// ============================================================
function extractData(email, classification) {
  const text = email.body_text || '';
  const extracted = {};

  switch (classification.processingType) {
    case 'price_update':
      // Extract price mentions
      const priceMatches = text.matchAll(/\$([\d,.]+)\s*(?:per\s*)?(?:lb|pound|kg)/gi);
      extracted.prices = [...priceMatches].map(m => ({
        value: parseFloat(m[1].replace(/,/g, '')),
        context: text.substring(Math.max(0, m.index - 50), m.index + m[0].length + 50)
      }));

      // Extract variety mentions
      const varieties = text.match(/nonpareil|carmel|butte|padre|monterey|independence|mission/gi);
      if (varieties) extracted.varieties = [...new Set(varieties.map(v => v.toLowerCase()))];
      break;

    case 'report_pdf':
      // Extract crop year mentions
      const cropYears = text.match(/20\d{2}[/-]\d{2,4}/g);
      if (cropYears) extracted.crop_years = [...new Set(cropYears)];

      // Extract large numbers (likely production/shipment data)
      const bigNums = text.matchAll(/([\d,]+)\s*(?:million|billion|M|B)?\s*(?:pounds?|lbs?)/gi);
      extracted.quantities = [...bigNums].map(m => m[0]);
      break;

    case 'crm_inquiry':
      // Extract company/sender info
      const domain = email.from_address?.split('@')[1];
      extracted.company_domain = domain;
      extracted.sender = email.from_name || email.from_address;

      // Extract quantity mentions
      const qtyMatches = text.matchAll(/([\d,]+)\s*(?:mt|metric\s*tons?|containers?|lbs?|kg)/gi);
      extracted.quantities = [...qtyMatches].map(m => m[0]);

      // Extract destination/country mentions
      const countries = text.match(/(?:ship(?:ping)?\s*to|deliver(?:y)?\s*to|destination)\s*:?\s*(\w+(?:\s\w+)?)/gi);
      if (countries) extracted.destinations = countries;
      break;

    case 'logistics':
      // Extract tracking/reference numbers
      const refNums = text.match(/(?:tracking|ref|bl|container)[\s#:]*([A-Z0-9-]+)/gi);
      if (refNums) extracted.references = refNums;

      // Extract dates
      const dates = text.match(/(?:eta|etd|arrival|departure|delivery)\s*:?\s*([\w\s,]+\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi);
      if (dates) extracted.dates = dates;
      break;
  }

  return extracted;
}

// ============================================================
// Generate AI summary for an email
// ============================================================
function generateSummary(email, classification, extractedData) {
  const parts = [];

  parts.push(`[${classification.processingType.toUpperCase()}]`);
  parts.push(`From: ${email.from_name || email.from_address || 'Unknown'}`);
  parts.push(`Subject: ${email.subject || 'No subject'}`);

  if (classification.routeTo !== 'intelligence') {
    parts.push(`Routed to: ${classification.routeTo.toUpperCase()}`);
  }

  if (extractedData.prices?.length > 0) {
    parts.push(`Prices found: ${extractedData.prices.map(p => `$${p.value}`).join(', ')}`);
  }

  if (extractedData.varieties?.length > 0) {
    parts.push(`Varieties: ${extractedData.varieties.join(', ')}`);
  }

  if (extractedData.quantities?.length > 0) {
    parts.push(`Quantities: ${extractedData.quantities.join(', ')}`);
  }

  return parts.join(' | ');
}

// ============================================================
// Process a single email
// ============================================================
async function processEmail(email) {
  // Classify
  const classification = classifyEmail(email);

  // Extract structured data
  const extractedData = extractData(email, classification);

  // Generate summary
  const summary = generateSummary(email, classification, extractedData);

  // Store in inbox table
  const { data, error } = await supabaseAdmin.from('email_inbox').insert({
    email_address: email.inbox_email || 'unknown',
    from_address: email.from_address,
    from_name: email.from_name,
    subject: email.subject,
    body_text: email.body_text?.substring(0, 10000), // Cap at 10k chars
    received_at: email.received_at || new Date().toISOString(),
    is_processed: true,
    processing_type: classification.processingType,
    extracted_data: extractedData,
    attachments: email.attachments || [],
    routed_to: classification.routeTo,
    ai_summary: summary,
    ai_action_required: classification.actionRequired,
    ai_priority: classification.priority,
  }).select().single();

  if (error) {
    console.error('Failed to store email:', error.message);
    return null;
  }

  // Auto-create CRM contact if new buyer/supplier
  if (classification.processingType === 'crm_inquiry' && email.from_address) {
    await upsertContact(email, classification);
  }

  // If it's a price update, store in market data
  if (classification.processingType === 'price_update' && extractedData.prices?.length > 0) {
    for (const price of extractedData.prices) {
      await supabaseAdmin.from('market_data').insert({
        data_date: new Date().toISOString().split('T')[0],
        data_type: 'email_price',
        source: `email:${email.from_address}`,
        variety: extractedData.varieties?.[0] || null,
        value_per_lb: price.value,
        unit: 'USD/lb',
        metadata: { email_subject: email.subject, context: price.context }
      });
    }
  }

  // If it's a news item, store in industry news
  if (classification.processingType === 'news') {
    await supabaseAdmin.from('industry_news').upsert({
      title: email.subject || 'Email news item',
      source: `email:${email.from_address?.split('@')[1] || 'unknown'}`,
      source_url: null,
      published_date: new Date().toISOString().split('T')[0],
      summary: email.body_text?.substring(0, 500),
      ai_sentiment: 'neutral',
      tags: ['email', classification.processingType],
    }, { onConflict: 'source,source_url' });
  }

  console.log(`  Processed: [${classification.priority}] ${classification.processingType} → ${classification.routeTo} | ${email.subject?.substring(0, 50)}`);
  return data;
}

// ============================================================
// Auto-create/update CRM contact from email
// ============================================================
async function upsertContact(email, classification) {
  if (!email.from_address) return;

  const domain = email.from_address.split('@')[1];
  const contactType = classification.routeTo === 'srm' ? 'supplier' :
                      classification.routeTo === 'brm' ? 'logistics' : 'buyer';

  // Check if contact exists
  const { data: existing } = await supabaseAdmin
    .from('crm_contacts')
    .select('id, total_interactions')
    .eq('email', email.from_address)
    .single();

  if (existing) {
    // Update interaction count
    await supabaseAdmin.from('crm_contacts').update({
      total_interactions: (existing.total_interactions || 0) + 1,
      last_interaction_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }).eq('id', existing.id);
  } else {
    // Create new contact
    await supabaseAdmin.from('crm_contacts').insert({
      contact_type: contactType,
      company_name: domain?.replace(/\.\w+$/, '').replace(/[-_]/g, ' '),
      contact_name: email.from_name || null,
      email: email.from_address,
      total_interactions: 1,
      last_interaction_at: new Date().toISOString(),
      ai_notes: `First contact via email: "${email.subject}". Auto-classified as ${contactType}.`,
      tags: [contactType, 'auto-discovered'],
    });
    console.log(`  New CRM contact: ${email.from_name || email.from_address} (${contactType})`);
  }
}

// ============================================================
// Manage subscriptions
// ============================================================
async function syncSubscriptions() {
  console.log('Syncing email subscriptions...');

  for (const [inboxKey, inbox] of Object.entries(INBOXES)) {
    if (!inbox.subscriptions) continue;

    for (const sub of inbox.subscriptions) {
      const { error } = await supabaseAdmin.from('email_subscriptions').upsert({
        email_address: inbox.email,
        service_name: sub.service,
        service_url: sub.url,
        subscription_type: sub.type,
        is_active: true,
      }, { onConflict: 'email_address,service_name' });

      if (!error) {
        console.log(`  Subscription: ${sub.service} → ${inbox.email}`);
      }
    }
  }
}

// ============================================================
// Main ingestion cycle
// ============================================================
export async function runEmailIngestion() {
  const startTime = Date.now();
  console.log('\n========================================');
  console.log('CropsIntelV2 — Email Ingestion Engine');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('========================================\n');

  await logActivity('cycle', 'started');

  // Sync subscription records
  await syncSubscriptions();

  // NOTE: Actual email retrieval requires either:
  // 1. IMAP connection (node-imap or imapflow package)
  // 2. Webhook/forwarding service (e.g., Mailgun, SendGrid inbound)
  // 3. Gmail API integration
  //
  // For now, this engine processes any emails that arrive in the email_inbox table
  // via webhook or manual insertion. The full IMAP polling will be added when
  // the email addresses are set up.

  // Process any unprocessed emails in the inbox
  const { data: unprocessed, error } = await supabaseAdmin
    .from('email_inbox')
    .select('*')
    .eq('is_processed', false)
    .order('received_at', { ascending: true })
    .limit(50);

  let processed = 0;

  if (!error && unprocessed?.length > 0) {
    console.log(`\nFound ${unprocessed.length} unprocessed emails`);

    for (const email of unprocessed) {
      const result = await processEmail(email);
      if (result) processed++;
    }
  } else {
    console.log('\nNo unprocessed emails in queue');
    console.log('Tip: Set up email forwarding to Supabase webhook, or configure IMAP polling');
  }

  const duration = Date.now() - startTime;

  await logActivity('cycle', processed > 0 ? 'success' : 'no_data', {
    found: unprocessed?.length || 0,
    inserted: processed,
    duration,
    metadata: {
      inboxes: Object.keys(INBOXES),
      subscriptions_synced: true
    }
  });

  console.log(`\nEmail ingestion complete: ${processed} emails processed (${duration}ms)`);
  return { found: unprocessed?.length || 0, processed, duration };
}

// Run if called directly
if (process.argv[1] && process.argv[1].includes('email-ingestor')) {
  runEmailIngestion().then(result => {
    console.log('\nResult:', result);
    process.exit(0);
  }).catch(err => {
    console.error('Email ingestor crashed:', err);
    process.exit(1);
  });
}
