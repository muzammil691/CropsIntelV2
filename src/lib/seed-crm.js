// Auto-seed CRM tables when empty
// Realistic MAXONS almond trading contacts, deals, and activities

const contacts = [
  {
    contact_type: 'buyer',
    company_name: 'Al Barakah Foods',
    contact_name: 'Ahmed Al-Mansouri',
    email: 'ahmed@albarakahfoods.ae',
    phone: '+971-4-555-1234',
    country: 'UAE',
    region: 'middle_east',
    relationship_score: 92,
    total_volume_lbs: 450000,
    total_interactions: 28,
    last_interaction_at: '2026-04-18T09:30:00Z',
    ai_notes: 'Tier 1 buyer. Consistent quarterly orders of Nonpareil 23/25. Prefers CIF Jebel Ali. Payment reliable, typically 30-day LC.',
    ai_next_action: 'Send Q3 pricing sheet — historically places large pre-harvest order in May',
    tags: ['tier-1', 'quarterly', 'nonpareil'],
  },
  {
    contact_type: 'buyer',
    company_name: 'Rajesh Dry Fruits Ltd',
    contact_name: 'Rajesh Sharma',
    email: 'rajesh@rajeshdf.in',
    phone: '+91-22-6789-1234',
    country: 'India',
    region: 'asia',
    relationship_score: 85,
    total_volume_lbs: 800000,
    total_interactions: 42,
    last_interaction_at: '2026-04-15T14:20:00Z',
    ai_notes: 'Top India buyer by volume. Multi-variety orders (NP, Carmel, Independence). Price-sensitive but loyal. Strong Diwali/wedding season demand Aug-Nov.',
    ai_next_action: 'Follow up on Independence variety availability for Aug shipment',
    tags: ['tier-1', 'high-volume', 'india', 'multi-variety'],
  },
  {
    contact_type: 'buyer',
    company_name: 'Euronut GmbH',
    contact_name: 'Klaus Weber',
    email: 'k.weber@euronut.de',
    phone: '+49-89-555-6789',
    country: 'Germany',
    region: 'europe',
    relationship_score: 78,
    total_volume_lbs: 320000,
    total_interactions: 18,
    last_interaction_at: '2026-04-10T11:00:00Z',
    ai_notes: 'EU confectionery distributor. Strong demand for Blanched and Sliced NP for marzipan/bakery sector. Requires EU food safety certs. Orders tend to be bi-annual.',
    ai_next_action: 'Send blanched premium pricing update — spread is at 18-month high',
    tags: ['eu', 'blanched', 'confectionery', 'bi-annual'],
  },
  {
    contact_type: 'buyer',
    company_name: 'Saudi Snacks Co',
    contact_name: 'Faisal Al-Otaibi',
    email: 'faisal@saudisnacks.sa',
    phone: '+966-11-555-4567',
    country: 'Saudi Arabia',
    region: 'middle_east',
    relationship_score: 71,
    total_volume_lbs: 180000,
    total_interactions: 12,
    last_interaction_at: '2026-03-28T10:15:00Z',
    ai_notes: 'Growing retail brand. Interested in Mission variety (flavor profile). Also buys NP 25/27 for snack line. Ramadan surge buyer.',
    ai_next_action: 'Schedule call to discuss Mission variety sourcing for Ramadan 2027 pipeline',
    tags: ['retail', 'mission', 'growing', 'ramadan'],
  },
  {
    contact_type: 'supplier',
    company_name: 'Central Valley Almonds',
    contact_name: 'Mike Thompson',
    email: 'mike@centralvalleyalmonds.com',
    phone: '+1-559-555-7890',
    country: 'United States',
    region: 'americas',
    relationship_score: 88,
    total_volume_lbs: 1200000,
    total_interactions: 35,
    last_interaction_at: '2026-04-16T16:00:00Z',
    ai_notes: 'Primary NP supplier. Family farm, 1,200 acres in Kern County. Excellent quality consistency. Offers competitive pricing for volume commitments.',
    ai_next_action: 'Negotiate 2026/27 forward contract — crop estimate looks strong',
    tags: ['tier-1', 'nonpareil', 'kern-county', 'forward'],
  },
  {
    contact_type: 'supplier',
    company_name: 'Pacific Nut Processors',
    contact_name: 'Sarah Chen',
    email: 'sarah@pacificnut.com',
    phone: '+1-209-555-3456',
    country: 'United States',
    region: 'americas',
    relationship_score: 82,
    total_volume_lbs: 650000,
    total_interactions: 22,
    last_interaction_at: '2026-04-12T13:30:00Z',
    ai_notes: 'Multi-variety processor in San Joaquin Valley. Good source for Carmel, Butte/Padres, Monterey. Also does blanching and slicing in-house.',
    ai_next_action: 'Get updated blanched pricing — EU buyer interest is strong',
    tags: ['processor', 'multi-variety', 'blanching', 'value-add'],
  },
  {
    contact_type: 'logistics',
    company_name: 'Gulf Shipping & Logistics',
    contact_name: 'Omar Hassan',
    email: 'omar@gulfshipping.ae',
    phone: '+971-4-555-8901',
    country: 'UAE',
    region: 'middle_east',
    relationship_score: 75,
    total_volume_lbs: 0,
    total_interactions: 15,
    last_interaction_at: '2026-04-05T08:45:00Z',
    ai_notes: 'Reliable freight forwarder for ME routes. Handles Jebel Ali and Dammam. Good container rates. Typical transit Oakland→Jebel Ali: 22-25 days.',
    ai_next_action: 'Request Q2 freight rate update for Oakland→Jebel Ali and Oakland→Nhava Sheva',
    tags: ['freight', 'dubai', 'reliable'],
  },
  {
    contact_type: 'broker',
    company_name: 'TreeNut Trading Partners',
    contact_name: 'David Park',
    email: 'dpark@treenut.com',
    phone: '+1-916-555-2345',
    country: 'United States',
    region: 'americas',
    relationship_score: 68,
    total_volume_lbs: 280000,
    total_interactions: 9,
    last_interaction_at: '2026-03-22T15:20:00Z',
    ai_notes: 'Sacramento-based broker. Good connections in China/SE Asia markets. Handles documentation and compliance. 1.5% commission.',
    ai_next_action: 'Explore China opportunity — tariff situation may be shifting',
    tags: ['broker', 'china', 'se-asia'],
  },
];

// Deals reference contacts by array index (will be mapped to real IDs after insert)
const deals = [
  {
    contactIdx: 0, // Al Barakah Foods
    deal_type: 'sell', stage: 'negotiation',
    variety: 'Nonpareil', grade: '23/25', form: 'Whole Natural',
    volume_lbs: 88000, volume_mt: 39.92,
    strata_base_price: 3.66, maxons_price: 3.77, margin_pct: 3.00,
    total_value_usd: 331760,
    incoterm: 'CIF', destination_country: 'UAE', destination_port: 'Jebel Ali',
    estimated_ship_date: '2026-06-15',
    notes: 'Q3 order. Ahmed wants to lock in before summer price firming. Awaiting final volume confirmation.',
    ai_win_probability: 0.85,
  },
  {
    contactIdx: 1, // Rajesh Dry Fruits
    deal_type: 'sell', stage: 'quoted',
    variety: 'Independence', grade: 'Extra #1', form: 'Whole Natural',
    volume_lbs: 132000, volume_mt: 59.87,
    strata_base_price: 2.80, maxons_price: 2.88, margin_pct: 3.00,
    total_value_usd: 380160,
    incoterm: 'CFR', destination_country: 'India', destination_port: 'Nhava Sheva',
    estimated_ship_date: '2026-08-01',
    notes: 'Pre-Diwali pipeline. Rajesh exploring Independence as Nonpareil alternative. Sent pricing Apr 14.',
    ai_win_probability: 0.65,
  },
  {
    contactIdx: 1, // Rajesh Dry Fruits — second deal
    deal_type: 'sell', stage: 'contracted',
    variety: 'Nonpareil', grade: '25/27', form: 'Whole Natural',
    volume_lbs: 220000, volume_mt: 99.79,
    strata_base_price: 3.30, maxons_price: 3.40, margin_pct: 3.00,
    total_value_usd: 748000,
    incoterm: 'CFR', destination_country: 'India', destination_port: 'Nhava Sheva',
    estimated_ship_date: '2026-05-20',
    actual_ship_date: null,
    notes: 'Contracted Apr 8. LC received. Awaiting supplier shipment confirmation.',
    ai_win_probability: 0.95,
  },
  {
    contactIdx: 2, // Euronut GmbH
    deal_type: 'sell', stage: 'inquiry',
    variety: 'Nonpareil', grade: '23/25', form: 'Blanched',
    volume_lbs: 66000, volume_mt: 29.94,
    strata_base_price: 4.08, maxons_price: 4.20, margin_pct: 3.00,
    total_value_usd: 277200,
    incoterm: 'CIF', destination_country: 'Germany', destination_port: 'Hamburg',
    estimated_ship_date: '2026-07-01',
    notes: 'Klaus inquired about blanched NP availability for summer marzipan production. Need to source from Pacific Nut.',
    ai_win_probability: 0.50,
  },
  {
    contactIdx: 3, // Saudi Snacks
    deal_type: 'sell', stage: 'shipped',
    variety: 'Nonpareil', grade: '25/27', form: 'Whole Natural',
    volume_lbs: 44000, volume_mt: 19.96,
    strata_base_price: 3.30, maxons_price: 3.40, margin_pct: 3.00,
    total_value_usd: 149600,
    incoterm: 'CIF', destination_country: 'Saudi Arabia', destination_port: 'Dammam',
    estimated_ship_date: '2026-04-01',
    actual_ship_date: '2026-04-03',
    notes: 'Container shipped via Gulf Shipping. ETA Dammam Apr 25. BL and docs sent.',
    ai_win_probability: 0.98,
  },
  {
    contactIdx: 0, // Al Barakah — completed deal
    deal_type: 'sell', stage: 'completed',
    variety: 'Nonpareil', grade: '23/25', form: 'Whole Natural',
    volume_lbs: 110000, volume_mt: 49.9,
    strata_base_price: 3.52, maxons_price: 3.63, margin_pct: 3.00,
    total_value_usd: 399300,
    incoterm: 'CIF', destination_country: 'UAE', destination_port: 'Jebel Ali',
    estimated_ship_date: '2026-02-10',
    actual_ship_date: '2026-02-12',
    notes: 'Q1 order completed. Full payment received Mar 8. Excellent execution.',
    ai_win_probability: 1.00,
  },
];

const activities = [
  { contactIdx: 0, activity_type: 'whatsapp', subject: 'Q3 pricing inquiry', description: 'Ahmed asked about Q3 Nonpareil 23/25 pricing. Sent preliminary quote at $3.77/lb CIF.', outcome: 'positive', created_at: '2026-04-18T09:30:00Z' },
  { contactIdx: 1, activity_type: 'email', subject: 'Independence variety pricing', description: 'Sent Rajesh updated Independence pricing sheet with CFR Nhava Sheva rates.', outcome: 'follow_up', created_at: '2026-04-15T14:20:00Z' },
  { contactIdx: 1, activity_type: 'stage_change', subject: 'NP 25/27 deal → Contracted', description: 'LC received from Rajesh Dry Fruits. Deal moved to contracted stage.', outcome: 'positive', created_at: '2026-04-08T11:00:00Z' },
  { contactIdx: 2, activity_type: 'email', subject: 'Blanched NP inquiry follow-up', description: 'Klaus requested blanched NP availability and pricing for Q3 marzipan production.', outcome: 'neutral', created_at: '2026-04-10T11:00:00Z' },
  { contactIdx: 3, activity_type: 'stage_change', subject: 'Saudi Snacks order shipped', description: 'Container departed Oakland via Gulf Shipping. BL and certificate of origin sent.', outcome: 'positive', created_at: '2026-04-03T16:00:00Z' },
  { contactIdx: 4, activity_type: 'call', subject: '2026/27 forward contract discussion', description: 'Discussed forward pricing for 2026/27 crop with Mike. Crop looks strong, may get favorable pricing for 500K+ lb commitment.', outcome: 'positive', created_at: '2026-04-16T16:00:00Z' },
  { contactIdx: 5, activity_type: 'email', subject: 'Blanched pricing request', description: 'Asked Sarah for updated blanched NP 23/25 pricing for 66K lbs EU order.', outcome: 'follow_up', created_at: '2026-04-12T13:30:00Z' },
  { contactIdx: 6, activity_type: 'call', subject: 'Q2 freight rate update', description: 'Omar confirmed Oakland→Jebel Ali at $3,200/container, Oakland→Nhava Sheva at $2,800. Rates stable through June.', outcome: 'positive', created_at: '2026-04-05T08:45:00Z' },
  { contactIdx: 0, activity_type: 'meeting', subject: 'Quarterly review — Al Barakah', description: 'In-person meeting at Dubai office. Reviewed Q1 performance, discussed Q3 pipeline. Ahmed happy with quality and pricing.', outcome: 'positive', created_at: '2026-03-20T10:00:00Z' },
  { contactIdx: 7, activity_type: 'email', subject: 'China market opportunity', description: 'David flagged potential tariff changes that could open China market for CA almonds. Exploring 100K lb trial shipment.', outcome: 'neutral', created_at: '2026-03-22T15:20:00Z' },
];

export async function seedCRM(supabase) {
  // Check if contacts already exist
  const { count } = await supabase
    .from('crm_contacts')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    console.log(`crm_contacts already has ${count} rows, skipping seed`);
    return false;
  }

  // 1. Insert contacts
  const { data: insertedContacts, error: cErr } = await supabase
    .from('crm_contacts')
    .insert(contacts)
    .select('id');

  if (cErr) {
    console.error('Seed crm_contacts error:', cErr.message);
    return false;
  }

  const contactIds = insertedContacts.map(c => c.id);
  console.log(`✓ Seeded ${contactIds.length} crm_contacts`);

  // 2. Insert deals with real contact_id references
  const dealRecords = deals.map(d => ({
    contact_id: contactIds[d.contactIdx],
    deal_type: d.deal_type,
    stage: d.stage,
    variety: d.variety,
    grade: d.grade,
    form: d.form,
    volume_lbs: d.volume_lbs,
    volume_mt: d.volume_mt,
    strata_base_price: d.strata_base_price,
    maxons_price: d.maxons_price,
    margin_pct: d.margin_pct,
    total_value_usd: d.total_value_usd,
    incoterm: d.incoterm,
    destination_country: d.destination_country,
    destination_port: d.destination_port,
    estimated_ship_date: d.estimated_ship_date,
    actual_ship_date: d.actual_ship_date || null,
    notes: d.notes,
    ai_win_probability: d.ai_win_probability,
  }));

  const { data: insertedDeals, error: dErr } = await supabase
    .from('crm_deals')
    .insert(dealRecords)
    .select('id');

  if (dErr) {
    console.error('Seed crm_deals error:', dErr.message);
  } else {
    console.log(`✓ Seeded ${insertedDeals.length} crm_deals`);
  }

  // 3. Insert activities
  const actRecords = activities.map(a => ({
    contact_id: contactIds[a.contactIdx],
    activity_type: a.activity_type,
    subject: a.subject,
    description: a.description,
    outcome: a.outcome,
    created_at: a.created_at,
    completed_at: a.created_at,
    created_by: 'system',
  }));

  const { error: aErr } = await supabase
    .from('crm_activities')
    .insert(actRecords);

  if (aErr) {
    console.error('Seed crm_activities error:', aErr.message);
  } else {
    console.log(`✓ Seeded ${actRecords.length} crm_activities`);
  }

  return true;
}
