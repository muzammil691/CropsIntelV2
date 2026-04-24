// Continent mapping + container math + reusable metric configs.
//
// Used by:
//   - src/pages/Destinations.jsx (continent rollup + country drill-down)
//   - future: Supply / Forecasts / Dashboard continent views
//
// The ABC export list covers ~45 destination countries. The continents below
// match the groupings ABC itself uses in the position-report region section
// (Western Europe, Eastern Europe, Middle East, Asia, etc.) with a few
// pragmatic adjustments (North Africa grouped with MENA since almond demand
// patterns follow Arab-world cues more than sub-Saharan ones).

// Standard 40' HC container for almonds ≈ 44,000 lbs (20 MT payload).
// Industry convention; exact tonnage varies by packaging + moisture but
// 44,000 lbs is the number handlers + brokers quote.
export const CONTAINER_LBS = 44000;

// Bag-level conversions (common almond trade units)
export const BAG_LBS = 50; // 50-lb poly bag, the ABC reference unit
export const MT_LBS = 2204.62; // 1 metric ton in lbs

export const CONTINENT_ORDER = [
  'Western Europe',
  'Eastern Europe',
  'Middle East / North Africa',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'Oceania',
  'North America',
  'Latin America',
  'Sub-Saharan Africa',
  'Other',
];

export const CONTINENT_COLORS = {
  'Western Europe':             '#3b82f6',
  'Eastern Europe':             '#6366f1',
  'Middle East / North Africa': '#f59e0b',
  'South Asia':                 '#22c55e',
  'East Asia':                  '#ef4444',
  'Southeast Asia':             '#14b8a6',
  'Oceania':                    '#06b6d4',
  'North America':              '#a855f7',
  'Latin America':              '#ec4899',
  'Sub-Saharan Africa':         '#eab308',
  'Other':                      '#6b7280',
};

// Country → continent. Keys normalized to the strings ABC uses in its
// position report destination region breakdown (see
// src/scrapers/shipment-parser.js normalizeCountry()). Any unmapped country
// falls through to 'Other' at lookup time.
export const COUNTRY_TO_CONTINENT = {
  // Western Europe
  'Germany':       'Western Europe',
  'United Kingdom':'Western Europe',
  'UK':            'Western Europe',
  'France':        'Western Europe',
  'Italy':         'Western Europe',
  'Spain':         'Western Europe',
  'Netherlands':   'Western Europe',
  'Belgium':       'Western Europe',
  'Sweden':        'Western Europe',
  'Denmark':       'Western Europe',
  'Norway':        'Western Europe',
  'Finland':       'Western Europe',
  'Switzerland':   'Western Europe',
  'Austria':       'Western Europe',
  'Ireland':       'Western Europe',
  'Portugal':      'Western Europe',
  'Greece':        'Western Europe',
  'Iceland':       'Western Europe',
  'Luxembourg':    'Western Europe',
  'Malta':         'Western Europe',

  // Eastern Europe
  'Poland':        'Eastern Europe',
  'Russia':        'Eastern Europe',
  'Ukraine':       'Eastern Europe',
  'Czech Republic':'Eastern Europe',
  'Slovakia':      'Eastern Europe',
  'Romania':       'Eastern Europe',
  'Hungary':       'Eastern Europe',
  'Bulgaria':      'Eastern Europe',
  'Serbia':        'Eastern Europe',
  'Croatia':       'Eastern Europe',
  'Slovenia':      'Eastern Europe',
  'Lithuania':     'Eastern Europe',
  'Latvia':        'Eastern Europe',
  'Estonia':       'Eastern Europe',
  'Belarus':       'Eastern Europe',

  // Middle East + North Africa (combined per almond trade convention)
  'United Arab Emirates': 'Middle East / North Africa',
  'UAE':                  'Middle East / North Africa',
  'Saudi Arabia':         'Middle East / North Africa',
  'Kuwait':               'Middle East / North Africa',
  'Qatar':                'Middle East / North Africa',
  'Oman':                 'Middle East / North Africa',
  'Bahrain':              'Middle East / North Africa',
  'Jordan':               'Middle East / North Africa',
  'Lebanon':              'Middle East / North Africa',
  'Iran':                 'Middle East / North Africa',
  'Iraq':                 'Middle East / North Africa',
  'Israel':               'Middle East / North Africa',
  'Yemen':                'Middle East / North Africa',
  'Syria':                'Middle East / North Africa',
  'Turkey':               'Middle East / North Africa',
  'Egypt':                'Middle East / North Africa',
  'Morocco':              'Middle East / North Africa',
  'Algeria':              'Middle East / North Africa',
  'Tunisia':              'Middle East / North Africa',
  'Libya':                'Middle East / North Africa',

  // South Asia
  'India':       'South Asia',
  'Pakistan':    'South Asia',
  'Bangladesh':  'South Asia',
  'Sri Lanka':   'South Asia',
  'Nepal':       'South Asia',
  'Bhutan':      'South Asia',
  'Afghanistan': 'South Asia',
  'Maldives':    'South Asia',

  // East Asia
  'China':        'East Asia',
  'Hong Kong':    'East Asia',
  'China/HK':     'East Asia',
  'China/Hong Kong':'East Asia',
  'Taiwan':       'East Asia',
  'Japan':        'East Asia',
  'South Korea':  'East Asia',
  'Korea':        'East Asia',
  'North Korea':  'East Asia',
  'Mongolia':     'East Asia',

  // Southeast Asia
  'Vietnam':     'Southeast Asia',
  'Thailand':    'Southeast Asia',
  'Indonesia':   'Southeast Asia',
  'Malaysia':    'Southeast Asia',
  'Philippines': 'Southeast Asia',
  'Singapore':   'Southeast Asia',
  'Cambodia':    'Southeast Asia',
  'Laos':        'Southeast Asia',
  'Myanmar':     'Southeast Asia',
  'Brunei':      'Southeast Asia',

  // Oceania
  'Australia':   'Oceania',
  'New Zealand': 'Oceania',
  'Fiji':        'Oceania',
  'Papua New Guinea':'Oceania',

  // North America
  'Canada':        'North America',
  'Mexico':        'North America',
  'United States': 'North America',
  'USA':           'North America',

  // Latin America (south + central + caribbean)
  'Brazil':       'Latin America',
  'Argentina':    'Latin America',
  'Chile':        'Latin America',
  'Colombia':     'Latin America',
  'Peru':         'Latin America',
  'Venezuela':    'Latin America',
  'Ecuador':      'Latin America',
  'Bolivia':      'Latin America',
  'Uruguay':      'Latin America',
  'Paraguay':     'Latin America',
  'Guatemala':    'Latin America',
  'Honduras':     'Latin America',
  'Costa Rica':   'Latin America',
  'Panama':       'Latin America',
  'El Salvador':  'Latin America',
  'Nicaragua':    'Latin America',
  'Dominican Republic':'Latin America',
  'Cuba':         'Latin America',
  'Jamaica':      'Latin America',
  'Trinidad and Tobago':'Latin America',
  'Puerto Rico':  'Latin America',

  // Sub-Saharan Africa
  'South Africa': 'Sub-Saharan Africa',
  'Nigeria':      'Sub-Saharan Africa',
  'Kenya':        'Sub-Saharan Africa',
  'Ghana':        'Sub-Saharan Africa',
  'Ethiopia':     'Sub-Saharan Africa',
  'Tanzania':     'Sub-Saharan Africa',
  'Uganda':       'Sub-Saharan Africa',
  'Angola':       'Sub-Saharan Africa',
  'Mozambique':   'Sub-Saharan Africa',
  'Senegal':      'Sub-Saharan Africa',
  'Zambia':       'Sub-Saharan Africa',
  'Zimbabwe':     'Sub-Saharan Africa',
  'Cameroon':     'Sub-Saharan Africa',
};

export function continentOf(country) {
  if (!country) return 'Other';
  // Exact match first
  if (COUNTRY_TO_CONTINENT[country]) return COUNTRY_TO_CONTINENT[country];
  // Fuzzy match for scraper variants like "China, People's Rep." or "U.A.E."
  const norm = country.trim().toLowerCase();
  for (const [key, continent] of Object.entries(COUNTRY_TO_CONTINENT)) {
    if (key.toLowerCase() === norm) return continent;
    // Handle "China/HK" → "China", "United Arab Emirates" → "UAE", etc.
    if (norm.includes(key.toLowerCase()) || key.toLowerCase().includes(norm)) {
      return continent;
    }
  }
  return 'Other';
}

// ─── Reusable metric definitions ────────────────────────────────────
// Every widget that displays volume-style data should expose this metric
// toggle. Pass the active metric into formatters + dataKey builders.
export const VOLUME_METRICS = [
  {
    key: 'lbs',
    label: 'Volume (lbs)',
    short: 'lbs',
    formatter: (v) => (v / 1e6).toFixed(1) + 'M',
    tickFormatter: (v) => (v / 1e6).toFixed(0) + 'M',
    tooltipFormatter: (v) => (v / 1e6).toFixed(1) + 'M lbs',
    csvLabel: 'Volume (lbs)',
    transform: (v) => v,
  },
  {
    key: 'containers',
    label: 'Containers (40HC)',
    short: 'cntrs',
    formatter: (v) => Math.round(v / CONTAINER_LBS).toLocaleString(),
    tickFormatter: (v) => Math.round(v / CONTAINER_LBS).toLocaleString(),
    tooltipFormatter: (v) => Math.round(v / CONTAINER_LBS).toLocaleString() + ' containers',
    csvLabel: 'Containers (40HC)',
    transform: (v) => v / CONTAINER_LBS,
  },
  {
    key: 'mt',
    label: 'Metric tons',
    short: 'MT',
    formatter: (v) => (v / MT_LBS / 1000).toFixed(1) + 'K MT',
    tickFormatter: (v) => (v / MT_LBS / 1000).toFixed(0) + 'K',
    tooltipFormatter: (v) => (v / MT_LBS).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' MT',
    csvLabel: 'Metric tons',
    transform: (v) => v / MT_LBS,
  },
  {
    key: 'kernels',
    label: 'Kernel lbs (000s)',
    short: 'K lbs',
    formatter: (v) => (v / 1000).toFixed(0) + 'K',
    tickFormatter: (v) => (v / 1000).toFixed(0) + 'K',
    tooltipFormatter: (v) => (v / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + 'K lbs',
    csvLabel: 'Kernel lbs (000s)',
    transform: (v) => v / 1000,
  },
];

export function getMetric(key) {
  return VOLUME_METRICS.find(m => m.key === key) || VOLUME_METRICS[0];
}
