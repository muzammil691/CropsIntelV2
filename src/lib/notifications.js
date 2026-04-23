// CropsIntelV2 — Notification System
// Handles V2 upgrade announcements, email templates, WhatsApp broadcasts
// Used by admin to notify users/contacts about V2 launch and ongoing updates

import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ─── V2 Upgrade WhatsApp Message ──────────────────────────────────
export function getV2UpgradeWhatsAppMessage(contactName = '') {
  const greeting = contactName ? `Hi ${contactName},` : 'Hello,';
  return (
    `${greeting}\n\n` +
    `🌰 *CropsIntel V2 is Live!*\n\n` +
    `We're excited to announce the launch of CropsIntel Version 2 — a complete rebuild of our almond market intelligence platform.\n\n` +
    `*What's New:*\n` +
    `• Real ABC Position & Shipment data (9 crop years)\n` +
    `• Live Strata pricing with MAXONS margins\n` +
    `• Zyra AI — your intelligent trading analyst\n` +
    `• CRM & Deal tracking for buyers/suppliers\n` +
    `• WhatsApp-integrated trade alerts\n` +
    `• Global destination & trade flow maps\n` +
    `• Mobile-optimized experience\n\n` +
    `🔗 *Visit now:* https://cropsintel.com\n\n` +
    `Reply *DEMO* for a guided tour\n` +
    `Reply *REGISTER* to create your account\n\n` +
    `— MAXONS International Trading\n` +
    `Powered by CropsIntel V2`
  );
}

// ─── V2 Upgrade Email HTML ────────────────────────────────────────
export function getV2UpgradeEmailHTML(recipientName = 'Valued Partner') {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CropsIntel V2 is Live</title>
</head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0f;">
<tr><td align="center" style="padding:40px 20px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#111118;border-radius:12px;overflow:hidden;">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:40px 40px 30px;text-align:center;">
  <div style="font-size:36px;margin-bottom:8px;">🌾</div>
  <h1 style="color:#d4b16a;font-size:28px;margin:0 0 8px;">CropsIntel V2 is Live</h1>
  <p style="color:#8892b0;font-size:14px;margin:0;">The Future of Almond Market Intelligence</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px;">
  <p style="color:#ccd6f6;font-size:16px;line-height:1.6;margin:0 0 20px;">
    Dear ${recipientName},
  </p>
  <p style="color:#8892b0;font-size:15px;line-height:1.6;margin:0 0 24px;">
    We're thrilled to announce <strong style="color:#d4b16a;">CropsIntel Version 2</strong> — a ground-up rebuild of our almond market intelligence platform. Built for the modern trader, powered by AI, and backed by a decade of MAXONS expertise.
  </p>

  <!-- Features Grid -->
  <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 30px;">
    <tr>
      <td width="50%" style="padding:8px;vertical-align:top;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;">
          <div style="font-size:20px;margin-bottom:6px;">📊</div>
          <div style="color:#d4b16a;font-weight:bold;font-size:13px;margin-bottom:4px;">Real ABC Data</div>
          <div style="color:#8892b0;font-size:12px;">9 crop years of verified position, shipment, and receipt data</div>
        </div>
      </td>
      <td width="50%" style="padding:8px;vertical-align:top;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;">
          <div style="font-size:20px;margin-bottom:6px;">🤖</div>
          <div style="color:#d4b16a;font-weight:bold;font-size:13px;margin-bottom:4px;">Zyra AI Analyst</div>
          <div style="color:#8892b0;font-size:12px;">AI-powered market analysis with learning memory</div>
        </div>
      </td>
    </tr>
    <tr>
      <td width="50%" style="padding:8px;vertical-align:top;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;">
          <div style="font-size:20px;margin-bottom:6px;">💰</div>
          <div style="color:#d4b16a;font-weight:bold;font-size:13px;margin-bottom:4px;">Live Pricing</div>
          <div style="color:#8892b0;font-size:12px;">Strata market prices with MAXONS margin calculator</div>
        </div>
      </td>
      <td width="50%" style="padding:8px;vertical-align:top;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;">
          <div style="font-size:20px;margin-bottom:6px;">🌍</div>
          <div style="color:#d4b16a;font-weight:bold;font-size:13px;margin-bottom:4px;">Global Trade Maps</div>
          <div style="color:#8892b0;font-size:12px;">Destination analysis for 80+ export markets</div>
        </div>
      </td>
    </tr>
    <tr>
      <td width="50%" style="padding:8px;vertical-align:top;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;">
          <div style="font-size:20px;margin-bottom:6px;">🤝</div>
          <div style="color:#d4b16a;font-weight:bold;font-size:13px;margin-bottom:4px;">CRM & Deals</div>
          <div style="color:#8892b0;font-size:12px;">Full trading pipeline with AI-powered insights</div>
        </div>
      </td>
      <td width="50%" style="padding:8px;vertical-align:top;">
        <div style="background:#1a1a2e;border-radius:8px;padding:16px;">
          <div style="font-size:20px;margin-bottom:6px;">📱</div>
          <div style="color:#d4b16a;font-weight:bold;font-size:13px;margin-bottom:4px;">WhatsApp Alerts</div>
          <div style="color:#8892b0;font-size:12px;">Trade alerts and Zyra AI chat on WhatsApp</div>
        </div>
      </td>
    </tr>
  </table>

  <!-- CTA Button -->
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr><td align="center" style="padding:10px 0 30px;">
      <a href="https://cropsintel.com" style="display:inline-block;padding:14px 40px;background:linear-gradient(135deg,#d4b16a,#c4a050);color:#000;font-size:16px;font-weight:bold;text-decoration:none;border-radius:8px;">
        Explore CropsIntel V2
      </a>
    </td></tr>
  </table>

  <p style="color:#8892b0;font-size:14px;line-height:1.6;margin:0 0 16px;">
    <strong style="color:#ccd6f6;">For our iOS users:</strong> Update your CropsIntel app from TestFlight — V2 loads automatically with the latest build.
  </p>

  <p style="color:#8892b0;font-size:14px;line-height:1.6;margin:0;">
    Questions? Reply to this email or chat with Zyra AI directly on the platform.
  </p>
</td></tr>

<!-- Footer -->
<tr><td style="background:#0d0d15;padding:24px 40px;text-align:center;border-top:1px solid #1a1a2e;">
  <p style="color:#555;font-size:12px;margin:0 0 8px;">
    MAXONS International Trading — Dubai, UAE
  </p>
  <p style="color:#444;font-size:11px;margin:0;">
    <a href="https://cropsintel.com" style="color:#d4b16a;text-decoration:none;">cropsintel.com</a>
    &nbsp;·&nbsp; Powered by CropsIntel V2 &amp; Zyra AI
  </p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ─── V2 Upgrade Email Plain Text ──────────────────────────────────
export function getV2UpgradeEmailText(recipientName = 'Valued Partner') {
  return (
    `Dear ${recipientName},\n\n` +
    `CropsIntel V2 is Live!\n\n` +
    `We're thrilled to announce CropsIntel Version 2 — a ground-up rebuild of our almond market intelligence platform.\n\n` +
    `What's New:\n` +
    `- Real ABC Data: 9 crop years of verified position, shipment, and receipt data\n` +
    `- Zyra AI Analyst: AI-powered market analysis with learning memory\n` +
    `- Live Pricing: Strata market prices with MAXONS margin calculator\n` +
    `- Global Trade Maps: Destination analysis for 80+ export markets\n` +
    `- CRM & Deals: Full trading pipeline with AI-powered insights\n` +
    `- WhatsApp Alerts: Trade alerts and Zyra AI chat on WhatsApp\n\n` +
    `Visit: https://cropsintel.com\n\n` +
    `For iOS users: Update your CropsIntel app from TestFlight.\n\n` +
    `Questions? Reply to this email or chat with Zyra AI on the platform.\n\n` +
    `Best regards,\n` +
    `MAXONS International Trading — Dubai, UAE\n` +
    `Powered by CropsIntel V2 & Zyra AI`
  );
}

// ─── Broadcast WhatsApp to CRM Contacts ───────────────────────────
export async function broadcastWhatsAppUpgrade() {
  // Get all CRM contacts with phone numbers
  const { data: contacts, error } = await supabase
    .from('crm_contacts')
    .select('id, contact_name, phone, email')
    .not('phone', 'is', null)
    .neq('phone', '');

  if (error || !contacts?.length) {
    return { success: false, error: error?.message || 'No contacts with phone numbers', sent: 0 };
  }

  const results = [];
  for (const contact of contacts) {
    const message = getV2UpgradeWhatsAppMessage(contact.contact_name);
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/whatsapp-send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            type: 'custom',
            to: contact.phone,
            message,
          }),
        }
      );
      const data = await res.json();
      results.push({ contact: contact.contact_name, phone: contact.phone, ...data });
    } catch (err) {
      results.push({ contact: contact.contact_name, phone: contact.phone, success: false, error: err.message });
    }
  }

  const sent = results.filter(r => r.success).length;
  return { success: true, total: contacts.length, sent, results };
}

// ─── Log notification dispatch ────────────────────────────────────
export async function logNotificationDispatch(channel, recipientCount, status) {
  try {
    await supabase.from('crm_activities').insert({
      activity_type: 'notification',
      subject: `V2 Launch Notification — ${channel}`,
      description: `Sent V2 upgrade announcement to ${recipientCount} ${channel} recipients. Status: ${status}`,
      outcome: status === 'success' ? 'positive' : 'neutral',
      completed_at: new Date().toISOString(),
      created_by: 'system',
      metadata: { channel, recipientCount, status, version: 'v2_launch' },
    });
  } catch (err) {
    console.warn('Failed to log notification dispatch:', err.message);
  }
}
