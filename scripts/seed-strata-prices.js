// Seed strata_prices with realistic California almond pricing data
// Based on publicly available market pricing trends
// Run: node scripts/seed-strata-prices.js

import { config } from 'dotenv';
config();

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Realistic California almond pricing data
// Prices in USD per lb — based on publicly available market trends
// Nonpareil is the premium variety (~60% of CA crop)
// MAXONS price = market * 1.03 (3% margin)

const varieties = [
  { name: 'Nonpareil',      grade: '23/25',      form: 'Whole Natural',  basePrice: 3.45 },
  { name: 'Nonpareil',      grade: '25/27',      form: 'Whole Natural',  basePrice: 3.30 },
  { name: 'Nonpareil',      grade: '27/30',      form: 'Whole Natural',  basePrice: 3.15 },
  { name: 'Carmel',         grade: 'Extra #1',   form: 'Whole Natural',  basePrice: 2.85 },
  { name: 'Butte/Padres',   grade: 'Extra #1',   form: 'Whole Natural',  basePrice: 2.75 },
  { name: 'Monterey',       grade: 'Extra #1',   form: 'Whole Natural',  basePrice: 2.70 },
  { name: 'Independence',   grade: 'Extra #1',   form: 'Whole Natural',  basePrice: 2.80 },
  { name: 'Mission',        grade: 'Extra #1',   form: 'Whole Natural',  basePrice: 2.95 },
  { name: 'California',     grade: 'Standard 5%', form: 'Whole Natural', basePrice: 2.55 },
  { name: 'Nonpareil',      grade: '23/25',      form: 'Blanched',       basePrice: 3.85 },
  { name: 'Nonpareil',      grade: '23/25',      form: 'Sliced',         basePrice: 4.15 },
  { name: 'Nonpareil',      grade: '23/25',      form: 'Diced',          basePrice: 4.05 },
];

// Monthly price adjustment factors (simulates seasonal market movement)
// Prices generally rise Sep-Jan (new crop tightness), soften Feb-May, firm Jul-Aug (pre-harvest)
const monthlyTrend = {
  // 2024 Q4 — strong demand, tight supply from smaller 2024 crop
  '2024-10': 0.92, '2024-11': 0.94, '2024-12': 0.97,
  // 2025 Q1 — prices rising on strong export demand
  '2025-01': 1.00, '2025-02': 1.02, '2025-03': 1.04,
  // 2025 Q2 — seasonal softening, India/EU buying slows
  '2025-04': 1.03, '2025-05': 1.01, '2025-06': 0.99,
  // 2025 Q3 — pre-harvest uncertainty, 2025 crop estimates strong
  '2025-07': 0.98, '2025-08': 0.96, '2025-09': 0.94,
  // 2025 Q4 — large 2025 crop (~2.8B lbs) pressures prices
  '2025-10': 0.93, '2025-11': 0.95, '2025-12': 0.98,
  // 2026 Q1 — strong shipment pace supports pricing
  '2026-01': 1.01, '2026-02': 1.04, '2026-03': 1.06,
  // 2026 Apr — latest data point
  '2026-04': 1.08,
};

// Add some per-variety noise so they don't all move in lockstep
function noise(seed) {
  // Simple deterministic pseudo-random based on seed
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 0.04 - 0.02; // ±2% noise
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

async function seed() {
  console.log('Seeding strata_prices with California almond pricing data...\n');

  const records = [];
  let idx = 0;

  for (const [monthKey, factor] of Object.entries(monthlyTrend)) {
    // Create 2 data points per month (1st and 15th) for chart density
    const dates = [`${monthKey}-01`, `${monthKey}-15`];

    for (const date of dates) {
      for (let vi = 0; vi < varieties.length; vi++) {
        const v = varieties[vi];
        const n = noise(idx + vi * 31 + (date.endsWith('15') ? 7 : 0));
        const price = round4(v.basePrice * (factor + n));
        const maxonsPrice = round4(price * 1.03);
        const bid = round4(price * 0.995);
        const ask = round4(price * 1.005);
        const volume = Math.round(50000 + Math.random() * 200000);

        records.push({
          price_date: date,
          variety: v.name,
          grade: v.grade,
          form: v.form,
          price_usd_per_lb: price,
          maxons_price_per_lb: maxonsPrice,
          bid_price: bid,
          ask_price: ask,
          volume_lbs: volume,
          source: 'strata',
          metadata: { seeded: true },
        });
        idx++;
      }
    }
  }

  console.log(`Generated ${records.length} price records across ${Object.keys(monthlyTrend).length} months`);

  // Upsert in batches of 50
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await supabase
      .from('strata_prices')
      .upsert(batch, { onConflict: 'price_date,variety,grade,form' });

    if (error) {
      console.error(`Batch ${Math.floor(i/50) + 1} error: ${error.message}`);
      errors++;
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  Inserted ${inserted}/${records.length} records`);
    }
  }

  console.log(`\n\n✓ Seeded ${inserted} strata_prices records (${errors} batch errors)`);
  console.log(`  Varieties: ${[...new Set(records.map(r => r.variety))].join(', ')}`);
  console.log(`  Date range: ${records[0].price_date} → ${records[records.length - 1].price_date}`);
}

seed().then(() => process.exit(0)).catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
