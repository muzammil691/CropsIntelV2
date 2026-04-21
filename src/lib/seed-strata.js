// Auto-seed strata_prices when table is empty
// Runs client-side via browser Supabase connection
// Realistic California almond pricing based on public market trends

const varieties = [
  { name: 'Nonpareil',    grade: '23/25',       form: 'Whole Natural',  base: 3.45 },
  { name: 'Nonpareil',    grade: '25/27',       form: 'Whole Natural',  base: 3.30 },
  { name: 'Nonpareil',    grade: '27/30',       form: 'Whole Natural',  base: 3.15 },
  { name: 'Carmel',       grade: 'Extra #1',    form: 'Whole Natural',  base: 2.85 },
  { name: 'Butte/Padres', grade: 'Extra #1',    form: 'Whole Natural',  base: 2.75 },
  { name: 'Monterey',     grade: 'Extra #1',    form: 'Whole Natural',  base: 2.70 },
  { name: 'Independence', grade: 'Extra #1',    form: 'Whole Natural',  base: 2.80 },
  { name: 'Mission',      grade: 'Extra #1',    form: 'Whole Natural',  base: 2.95 },
  { name: 'California',   grade: 'Standard 5%', form: 'Whole Natural',  base: 2.55 },
  { name: 'Nonpareil',    grade: '23/25',       form: 'Blanched',       base: 3.85 },
  { name: 'Nonpareil',    grade: '23/25',       form: 'Sliced',         base: 4.15 },
  { name: 'Nonpareil',    grade: '23/25',       form: 'Diced',          base: 4.05 },
];

// Monthly price factors — seasonal movement Oct 2024 → Apr 2026
const trend = {
  '2024-10': 0.92, '2024-11': 0.94, '2024-12': 0.97,
  '2025-01': 1.00, '2025-02': 1.02, '2025-03': 1.04,
  '2025-04': 1.03, '2025-05': 1.01, '2025-06': 0.99,
  '2025-07': 0.98, '2025-08': 0.96, '2025-09': 0.94,
  '2025-10': 0.93, '2025-11': 0.95, '2025-12': 0.98,
  '2026-01': 1.01, '2026-02': 1.04, '2026-03': 1.06,
  '2026-04': 1.08,
};

function noise(seed) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 0.04 - 0.02;
}

function r4(n) { return Math.round(n * 10000) / 10000; }

export function generatePriceRecords() {
  const records = [];
  let idx = 0;
  for (const [mk, factor] of Object.entries(trend)) {
    for (const day of ['01', '15']) {
      const date = `${mk}-${day}`;
      for (let vi = 0; vi < varieties.length; vi++) {
        const v = varieties[vi];
        const n = noise(idx + vi * 31 + (day === '15' ? 7 : 0));
        const price = r4(v.base * (factor + n));
        records.push({
          price_date: date,
          variety: v.name,
          grade: v.grade,
          form: v.form,
          price_usd_per_lb: price,
          maxons_price_per_lb: r4(price * 1.03),
          bid_price: r4(price * 0.995),
          ask_price: r4(price * 1.005),
          volume_lbs: Math.round(50000 + (noise(idx + vi * 17) + 0.02) * 5000000),
          source: 'strata',
          metadata: { seeded: true },
        });
        idx++;
      }
    }
  }
  return records;
}

export async function seedStrataPrices(supabase) {
  // Check if already has data
  const { count } = await supabase
    .from('strata_prices')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    console.log(`strata_prices already has ${count} rows, skipping seed`);
    return false;
  }

  const records = generatePriceRecords();
  console.log(`Seeding ${records.length} strata_prices records...`);

  // Batch insert
  for (let i = 0; i < records.length; i += 50) {
    const batch = records.slice(i, i + 50);
    const { error } = await supabase
      .from('strata_prices')
      .upsert(batch, { onConflict: 'price_date,variety,grade,form' });
    if (error) {
      console.error('Seed batch error:', error.message);
      return false;
    }
  }

  console.log(`✓ Seeded ${records.length} strata_prices records`);
  return true;
}
