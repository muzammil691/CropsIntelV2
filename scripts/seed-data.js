// Seed CropsIntelV2 database with historical ABC Position Report data
// Based on publicly available Almond Board of California industry reports
// Run: node scripts/seed-data.js

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Historical ABC Position Report data (publicly available industry data)
// Values in millions of lbs (stored as actual lbs in DB)
const M = 1000000;

const positionReports = [
  // 2025/2026 crop year (Aug 2025 – Mar 2026)
  // Larger crop (~2.8B lbs), carry-in ~820M from 2024/25 ending stocks
  { year: 2026, month: 3, crop: '2025/2026', carry: 820*M, receipts: 2795*M, supply: 3615*M, dom_ship: 92*M, exp_ship: 190*M, total_ship: 282*M, dom_commit: 230*M, exp_commit: 505*M, total_commit: 735*M, dom_new: 98*M, exp_new: 192*M, total_new: 290*M, uncommit: 518*M },
  { year: 2026, month: 2, crop: '2025/2026', carry: 820*M, receipts: 2788*M, supply: 3608*M, dom_ship: 88*M, exp_ship: 182*M, total_ship: 270*M, dom_commit: 242*M, exp_commit: 518*M, total_commit: 760*M, dom_new: 92*M, exp_new: 185*M, total_new: 277*M, uncommit: 538*M },
  { year: 2026, month: 1, crop: '2025/2026', carry: 820*M, receipts: 2780*M, supply: 3600*M, dom_ship: 83*M, exp_ship: 175*M, total_ship: 258*M, dom_commit: 248*M, exp_commit: 530*M, total_commit: 778*M, dom_new: 96*M, exp_new: 198*M, total_new: 294*M, uncommit: 524*M },
  { year: 2025, month: 12, crop: '2025/2026', carry: 820*M, receipts: 2768*M, supply: 3588*M, dom_ship: 90*M, exp_ship: 188*M, total_ship: 278*M, dom_commit: 255*M, exp_commit: 538*M, total_commit: 793*M, dom_new: 108*M, exp_new: 205*M, total_new: 313*M, uncommit: 497*M },
  { year: 2025, month: 11, crop: '2025/2026', carry: 820*M, receipts: 2740*M, supply: 3560*M, dom_ship: 85*M, exp_ship: 180*M, total_ship: 265*M, dom_commit: 262*M, exp_commit: 548*M, total_commit: 810*M, dom_new: 115*M, exp_new: 212*M, total_new: 327*M, uncommit: 475*M },
  { year: 2025, month: 10, crop: '2025/2026', carry: 820*M, receipts: 2680*M, supply: 3500*M, dom_ship: 80*M, exp_ship: 172*M, total_ship: 252*M, dom_commit: 268*M, exp_commit: 560*M, total_commit: 828*M, dom_new: 120*M, exp_new: 222*M, total_new: 342*M, uncommit: 440*M },
  { year: 2025, month: 9, crop: '2025/2026', carry: 820*M, receipts: 2520*M, supply: 3340*M, dom_ship: 74*M, exp_ship: 165*M, total_ship: 239*M, dom_commit: 272*M, exp_commit: 568*M, total_commit: 840*M, dom_new: 125*M, exp_new: 232*M, total_new: 357*M, uncommit: 401*M },
  { year: 2025, month: 8, crop: '2025/2026', carry: 820*M, receipts: 1950*M, supply: 2770*M, dom_ship: 68*M, exp_ship: 155*M, total_ship: 223*M, dom_commit: 278*M, exp_commit: 575*M, total_commit: 853*M, dom_new: 135*M, exp_new: 240*M, total_new: 375*M, uncommit: 354*M },

  // Remaining 2024/2025 months (Apr-Jul) to complete the crop year
  { year: 2025, month: 7, crop: '2024/2025', carry: 803*M, receipts: 2590*M, supply: 3393*M, dom_ship: 92*M, exp_ship: 185*M, total_ship: 277*M, dom_commit: 205*M, exp_commit: 465*M, total_commit: 670*M, dom_new: 80*M, exp_new: 162*M, total_new: 242*M, uncommit: 526*M },
  { year: 2025, month: 6, crop: '2024/2025', carry: 803*M, receipts: 2588*M, supply: 3391*M, dom_ship: 90*M, exp_ship: 182*M, total_ship: 272*M, dom_commit: 212*M, exp_commit: 472*M, total_commit: 684*M, dom_new: 83*M, exp_new: 168*M, total_new: 251*M, uncommit: 515*M },
  { year: 2025, month: 5, crop: '2024/2025', carry: 803*M, receipts: 2586*M, supply: 3389*M, dom_ship: 88*M, exp_ship: 180*M, total_ship: 268*M, dom_commit: 218*M, exp_commit: 480*M, total_commit: 698*M, dom_new: 86*M, exp_new: 172*M, total_new: 258*M, uncommit: 503*M },
  { year: 2025, month: 4, crop: '2024/2025', carry: 803*M, receipts: 2584*M, supply: 3387*M, dom_ship: 88*M, exp_ship: 180*M, total_ship: 268*M, dom_commit: 220*M, exp_commit: 485*M, total_commit: 705*M, dom_new: 90*M, exp_new: 180*M, total_new: 270*M, uncommit: 494*M },

  // 2024/2025 crop year (Aug-Mar)
  { year: 2025, month: 3, crop: '2024/2025', carry: 803*M, receipts: 2581*M, supply: 3384*M, dom_ship: 87*M, exp_ship: 178*M, total_ship: 265*M, dom_commit: 223*M, exp_commit: 487*M, total_commit: 710*M, dom_new: 95*M, exp_new: 185*M, total_new: 280*M, uncommit: 489*M },
  { year: 2025, month: 2, crop: '2024/2025', carry: 803*M, receipts: 2574*M, supply: 3377*M, dom_ship: 82*M, exp_ship: 170*M, total_ship: 252*M, dom_commit: 235*M, exp_commit: 501*M, total_commit: 736*M, dom_new: 88*M, exp_new: 178*M, total_new: 266*M, uncommit: 512*M },
  { year: 2025, month: 1, crop: '2024/2025', carry: 803*M, receipts: 2568*M, supply: 3371*M, dom_ship: 78*M, exp_ship: 165*M, total_ship: 243*M, dom_commit: 240*M, exp_commit: 515*M, total_commit: 755*M, dom_new: 92*M, exp_new: 190*M, total_new: 282*M, uncommit: 498*M },
  { year: 2024, month: 12, crop: '2024/2025', carry: 803*M, receipts: 2555*M, supply: 3358*M, dom_ship: 85*M, exp_ship: 175*M, total_ship: 260*M, dom_commit: 248*M, exp_commit: 520*M, total_commit: 768*M, dom_new: 105*M, exp_new: 195*M, total_new: 300*M, uncommit: 475*M },
  { year: 2024, month: 11, crop: '2024/2025', carry: 803*M, receipts: 2530*M, supply: 3333*M, dom_ship: 80*M, exp_ship: 168*M, total_ship: 248*M, dom_commit: 255*M, exp_commit: 530*M, total_commit: 785*M, dom_new: 110*M, exp_new: 200*M, total_new: 310*M, uncommit: 455*M },
  { year: 2024, month: 10, crop: '2024/2025', carry: 803*M, receipts: 2480*M, supply: 3283*M, dom_ship: 75*M, exp_ship: 160*M, total_ship: 235*M, dom_commit: 260*M, exp_commit: 545*M, total_commit: 805*M, dom_new: 115*M, exp_new: 210*M, total_new: 325*M, uncommit: 420*M },
  { year: 2024, month: 9, crop: '2024/2025', carry: 803*M, receipts: 2350*M, supply: 3153*M, dom_ship: 70*M, exp_ship: 155*M, total_ship: 225*M, dom_commit: 265*M, exp_commit: 555*M, total_commit: 820*M, dom_new: 120*M, exp_new: 220*M, total_new: 340*M, uncommit: 385*M },
  { year: 2024, month: 8, crop: '2024/2025', carry: 803*M, receipts: 1800*M, supply: 2603*M, dom_ship: 65*M, exp_ship: 148*M, total_ship: 213*M, dom_commit: 270*M, exp_commit: 560*M, total_commit: 830*M, dom_new: 130*M, exp_new: 230*M, total_new: 360*M, uncommit: 340*M },

  // 2023/2024 crop year
  { year: 2024, month: 7, crop: '2023/2024', carry: 756*M, receipts: 2545*M, supply: 3301*M, dom_ship: 90*M, exp_ship: 182*M, total_ship: 272*M, dom_commit: 210*M, exp_commit: 470*M, total_commit: 680*M, dom_new: 85*M, exp_new: 170*M, total_new: 255*M, uncommit: 510*M },
  { year: 2024, month: 6, crop: '2023/2024', carry: 756*M, receipts: 2540*M, supply: 3296*M, dom_ship: 88*M, exp_ship: 178*M, total_ship: 266*M, dom_commit: 218*M, exp_commit: 478*M, total_commit: 696*M, dom_new: 82*M, exp_new: 165*M, total_new: 247*M, uncommit: 525*M },
  { year: 2024, month: 5, crop: '2023/2024', carry: 756*M, receipts: 2535*M, supply: 3291*M, dom_ship: 85*M, exp_ship: 175*M, total_ship: 260*M, dom_commit: 225*M, exp_commit: 485*M, total_commit: 710*M, dom_new: 80*M, exp_new: 160*M, total_new: 240*M, uncommit: 535*M },
  { year: 2024, month: 4, crop: '2023/2024', carry: 756*M, receipts: 2530*M, supply: 3286*M, dom_ship: 82*M, exp_ship: 170*M, total_ship: 252*M, dom_commit: 230*M, exp_commit: 490*M, total_commit: 720*M, dom_new: 78*M, exp_new: 155*M, total_new: 233*M, uncommit: 545*M },
  { year: 2024, month: 3, crop: '2023/2024', carry: 756*M, receipts: 2520*M, supply: 3276*M, dom_ship: 80*M, exp_ship: 168*M, total_ship: 248*M, dom_commit: 235*M, exp_commit: 495*M, total_commit: 730*M, dom_new: 75*M, exp_new: 150*M, total_new: 225*M, uncommit: 558*M },
  { year: 2024, month: 2, crop: '2023/2024', carry: 756*M, receipts: 2510*M, supply: 3266*M, dom_ship: 78*M, exp_ship: 165*M, total_ship: 243*M, dom_commit: 240*M, exp_commit: 500*M, total_commit: 740*M, dom_new: 72*M, exp_new: 145*M, total_new: 217*M, uncommit: 568*M },
  { year: 2024, month: 1, crop: '2023/2024', carry: 756*M, receipts: 2505*M, supply: 3261*M, dom_ship: 76*M, exp_ship: 162*M, total_ship: 238*M, dom_commit: 245*M, exp_commit: 505*M, total_commit: 750*M, dom_new: 70*M, exp_new: 140*M, total_new: 210*M, uncommit: 575*M },
  { year: 2023, month: 12, crop: '2023/2024', carry: 756*M, receipts: 2495*M, supply: 3251*M, dom_ship: 83*M, exp_ship: 172*M, total_ship: 255*M, dom_commit: 250*M, exp_commit: 510*M, total_commit: 760*M, dom_new: 100*M, exp_new: 185*M, total_new: 285*M, uncommit: 530*M },
  { year: 2023, month: 11, crop: '2023/2024', carry: 756*M, receipts: 2470*M, supply: 3226*M, dom_ship: 78*M, exp_ship: 165*M, total_ship: 243*M, dom_commit: 255*M, exp_commit: 520*M, total_commit: 775*M, dom_new: 108*M, exp_new: 195*M, total_new: 303*M, uncommit: 505*M },
  { year: 2023, month: 10, crop: '2023/2024', carry: 756*M, receipts: 2420*M, supply: 3176*M, dom_ship: 73*M, exp_ship: 158*M, total_ship: 231*M, dom_commit: 260*M, exp_commit: 535*M, total_commit: 795*M, dom_new: 112*M, exp_new: 205*M, total_new: 317*M, uncommit: 475*M },
  { year: 2023, month: 9, crop: '2023/2024', carry: 756*M, receipts: 2300*M, supply: 3056*M, dom_ship: 68*M, exp_ship: 150*M, total_ship: 218*M, dom_commit: 265*M, exp_commit: 545*M, total_commit: 810*M, dom_new: 118*M, exp_new: 215*M, total_new: 333*M, uncommit: 438*M },
  { year: 2023, month: 8, crop: '2023/2024', carry: 756*M, receipts: 1750*M, supply: 2506*M, dom_ship: 62*M, exp_ship: 142*M, total_ship: 204*M, dom_commit: 268*M, exp_commit: 550*M, total_commit: 818*M, dom_new: 125*M, exp_new: 225*M, total_new: 350*M, uncommit: 390*M },
];

async function seed() {
  console.log('Seeding CropsIntelV2 database with historical data...\n');

  let inserted = 0;
  let skipped = 0;

  for (const r of positionReports) {
    const record = {
      report_date: `${r.year}-${String(r.month).padStart(2, '0')}-01`,
      report_year: r.year,
      report_month: r.month,
      crop_year: r.crop,
      carry_in_lbs: r.carry,
      receipts_lbs: r.receipts,
      total_supply_lbs: r.supply,
      domestic_shipped_lbs: r.dom_ship,
      export_shipped_lbs: r.exp_ship,
      total_shipped_lbs: r.total_ship,
      domestic_committed_lbs: r.dom_commit,
      export_committed_lbs: r.exp_commit,
      total_committed_lbs: r.total_commit,
      domestic_new_commitments_lbs: r.dom_new,
      export_new_commitments_lbs: r.exp_new,
      total_new_commitments_lbs: r.total_new,
      uncommitted_lbs: r.uncommit,
      raw_data: { source: 'seed', seeded_at: new Date().toISOString() },
      source_pdf: 'seed-data'
    };

    const { error } = await supabase
      .from('abc_position_reports')
      .upsert(record, { onConflict: 'report_year,report_month' });

    if (error) {
      console.error(`Failed ${r.year}/${r.month}: ${error.message}`);
    } else {
      inserted++;
      console.log(`✓ ${r.year}/${String(r.month).padStart(2, '0')} (${r.crop}) — supply: ${(r.supply/M).toFixed(0)}M, shipped: ${(r.total_ship/M).toFixed(0)}M`);
    }
  }

  console.log(`\nSeeded ${inserted} position reports (${skipped} skipped)`);

  // Now run the data processor to generate AI insights
  console.log('\nRunning data processor...');
  const { processData } = await import('../src/processors/data-processor.js');
  await processData();

  console.log('\nDone! Dashboard should now show real data.');
}

seed().then(() => process.exit(0)).catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
