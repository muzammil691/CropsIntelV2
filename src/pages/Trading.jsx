import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { sendOfferNotification } from '../lib/whatsapp';

// ─── Almond varieties and grades for offer builder ─────────────
const VARIETIES = ['Nonpareil', 'Carmel', 'Butte/Padres', 'California', 'Mission', 'Monterey', 'Independence', 'Fritz'];
const GRADES = ['23/25', '25/27', '27/30', '30/32', 'Extra #1', 'Supreme', 'Whole Natural', 'Blanched', 'Sliced', 'Diced'];
const INCOTERMS = ['FOB', 'CIF', 'CFR', 'EXW', 'DDP', 'DAP'];
const PACKAGING = ['25 kg cartons', '50 lb bags', '22.68 kg cartons', 'Bulk (tote bags)', 'Custom'];

// Sample Strata-like base prices
const BASE_PRICES = {
  'Nonpareil-23/25': 3.85, 'Nonpareil-25/27': 3.60, 'Nonpareil-27/30': 3.40,
  'Nonpareil-Whole Natural': 3.75, 'Nonpareil-Blanched': 4.10, 'Nonpareil-Sliced': 4.50,
  'Carmel-23/25': 3.40, 'Carmel-25/27': 3.20, 'Carmel-27/30': 3.05,
  'Butte/Padres-23/25': 3.30, 'Butte/Padres-25/27': 3.10, 'Butte/Padres-Extra #1': 2.90,
  'California-23/25': 3.50, 'California-25/27': 3.30,
  'Mission-23/25': 3.15, 'Monterey-25/27': 3.25, 'Independence-23/25': 3.45,
};


const STATUS_COLORS = {
  draft: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  sent: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  accepted: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
  expired: 'bg-gray-500/20 text-gray-500 border-gray-500/30',
};

function fmtUSD(n) { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function Trading() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('builder');
  const [offers, setOffers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Offer builder state
  const [variety, setVariety] = useState('Nonpareil');
  const [grade, setGrade] = useState('23/25');
  const [volumeMT, setVolumeMT] = useState(100);
  const [marginPct, setMarginPct] = useState(3.0);
  const [incoterm, setIncoterm] = useState('CIF');
  const [destination, setDestination] = useState('');
  const [packaging, setPackaging] = useState('25 kg cartons');
  const [notes, setNotes] = useState('');
  const [buyer, setBuyer] = useState('');
  const [contactId, setContactId] = useState('');
  const [shipDate, setShipDate] = useState('');

  const key = `${variety}-${grade}`;
  const basePrice = BASE_PRICES[key] || 3.50;
  const maxonsPrice = basePrice * (1 + marginPct / 100);
  const volumeLbs = Math.round(volumeMT * 2204.62);
  const totalValue = maxonsPrice * volumeLbs;
  const marginValue = (maxonsPrice - basePrice) * volumeLbs;

  // Load existing offers and contacts
  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [dealsRes, contactsRes] = await Promise.all([
        supabase.from('crm_deals').select('*, crm_contacts(company_name, contact_name, country)').order('created_at', { ascending: false }).limit(50),
        supabase.from('crm_contacts').select('id, company_name, contact_name, country, contact_type').eq('contact_type', 'buyer').order('relationship_score', { ascending: false }),
      ]);
      if (!dealsRes.error && dealsRes.data) setOffers(dealsRes.data);
      if (!contactsRes.error && contactsRes.data) setContacts(contactsRes.data);
    } catch (err) {
      console.warn('Load trading data error:', err.message);
    }
    setLoading(false);
  }

  async function generateOffer() {
    setSaving(true);
    setSaveMsg('');
    try {
      const dealData = {
        contact_id: contactId || null,
        deal_type: 'sell',
        stage: 'draft',
        variety,
        grade,
        form: grade.includes('Blanched') || grade.includes('Sliced') || grade.includes('Diced') ? grade : 'Whole Natural',
        volume_lbs: volumeLbs,
        volume_mt: volumeMT,
        strata_base_price: basePrice,
        maxons_price: maxonsPrice,
        margin_pct: marginPct,
        total_value_usd: Math.round(totalValue),
        incoterm,
        destination_port: destination || null,
        estimated_ship_date: shipDate || null,
        notes: [buyer ? `Buyer: ${buyer}` : '', packaging ? `Packaging: ${packaging}` : '', notes].filter(Boolean).join('. '),
        created_by: user?.id || null,
      };

      const { data, error } = await supabase
        .from('crm_deals')
        .insert(dealData)
        .select('*, crm_contacts(company_name, contact_name, country)')
        .single();

      if (error) throw error;

      setOffers(prev => [data, ...prev]);
      setSaveMsg('Offer created! Switch to Recent Offers to view.');
      setActiveTab('offers');

      // Reset form
      setBuyer(''); setDestination(''); setNotes(''); setContactId(''); setShipDate('');
    } catch (err) {
      setSaveMsg('Error: ' + err.message);
    }
    setSaving(false);
    setTimeout(() => setSaveMsg(''), 5000);
  }

  async function updateOfferStatus(offerId, newStage) {
    try {
      const { error } = await supabase
        .from('crm_deals')
        .update({ stage: newStage, updated_at: new Date().toISOString() })
        .eq('id', offerId);
      if (error) throw error;
      setOffers(prev => prev.map(o => o.id === offerId ? { ...o, stage: newStage } : o));
    } catch (err) {
      console.warn('Update stage error:', err.message);
    }
  }

  async function sendViaWhatsApp(offer) {
    // Find contact's WhatsApp number
    if (!offer.contact_id) {
      setSaveMsg('No contact linked — add a buyer to send via WhatsApp');
      setTimeout(() => setSaveMsg(''), 3000);
      return;
    }
    try {
      const { data: contact } = await supabase
        .from('crm_contacts')
        .select('phone')
        .eq('id', offer.contact_id)
        .single();

      if (!contact?.phone) {
        setSaveMsg('Contact has no phone number');
        setTimeout(() => setSaveMsg(''), 3000);
        return;
      }

      await sendOfferNotification(contact.phone, {
        offer_id: offer.id,
        variety: offer.variety,
        grade: offer.grade,
        form: offer.form,
        price: offer.maxons_price,
        quantity: `${offer.volume_mt} MT`,
        incoterm: offer.incoterm,
        validity: '7 days',
      });

      await updateOfferStatus(offer.id, 'sent');
      setSaveMsg('Offer sent via WhatsApp!');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (err) {
      setSaveMsg('WhatsApp send failed: ' + err.message);
      setTimeout(() => setSaveMsg(''), 5000);
    }
  }

  // Portal view tabs
  const portalViews = [
    { id: 'builder', label: 'Offer Builder' },
    { id: 'offers', label: 'Recent Offers' },
    { id: 'buyer', label: 'Buyer Portal' },
    { id: 'supplier', label: 'Supplier Portal' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">
          Trading Portal
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Build offers, manage trades, and view portal perspectives
        </p>
      </div>

      {/* Portal Tabs */}
      <div className="flex items-center gap-1 bg-gray-900/50 border border-gray-800 rounded-lg p-1 w-fit overflow-x-auto">
        {portalViews.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ─── Offer Builder ─── */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Builder Form */}
          <div className="lg:col-span-2 bg-gray-900/50 border border-gray-800 rounded-xl p-5 space-y-5">
            <h3 className="text-sm font-semibold text-white">Build New Offer</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Variety</label>
                <select value={variety} onChange={e => setVariety(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {VARIETIES.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Grade / Form</label>
                <select value={grade} onChange={e => setGrade(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Volume (MT)</label>
                <input type="number" value={volumeMT} onChange={e => setVolumeMT(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Margin %</label>
                <input type="number" step="0.5" value={marginPct} onChange={e => setMarginPct(Number(e.target.value))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Incoterm</label>
                <select value={incoterm} onChange={e => setIncoterm(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">CRM Contact (Buyer)</label>
                <select value={contactId} onChange={e => {
                  setContactId(e.target.value);
                  const c = contacts.find(x => x.id === e.target.value);
                  if (c) setBuyer(`${c.contact_name} — ${c.company_name}`);
                }} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">Select from CRM...</option>
                  {contacts.map(c => (
                    <option key={c.id} value={c.id}>{c.company_name} — {c.contact_name} ({c.country})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Or Type Buyer Name</label>
                <input type="text" value={buyer} onChange={e => setBuyer(e.target.value)} placeholder="Contact or company name" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Destination Port</label>
                <input type="text" value={destination} onChange={e => setDestination(e.target.value)} placeholder="e.g. Jebel Ali, Mumbai" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600" />
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Estimated Ship Date</label>
                <input type="date" value={shipDate} onChange={e => setShipDate(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Packaging</label>
                <select value={packaging} onChange={e => setPackaging(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
                  {PACKAGING.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 mb-1">Notes</label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Payment terms, special conditions..." className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={generateOffer}
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Generate Offer'}
              </button>
              {saveMsg && (
                <span className={`text-xs ${saveMsg.startsWith('Error') ? 'text-red-400' : 'text-green-400'}`}>
                  {saveMsg}
                </span>
              )}
            </div>
          </div>

          {/* Price Calculator Sidebar */}
          <div className="space-y-4">
            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Price Calculator</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">Strata Base Price</span>
                  <span className="text-sm text-white font-mono">{fmtUSD(basePrice)}/lb</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">MAXONS Margin ({marginPct}%)</span>
                  <span className="text-sm text-green-400 font-mono">+{fmtUSD(maxonsPrice - basePrice)}/lb</span>
                </div>
                <div className="border-t border-gray-800 pt-3 flex items-center justify-between">
                  <span className="text-xs text-white font-medium">MAXONS Offer Price</span>
                  <span className="text-lg text-white font-bold font-mono">{fmtUSD(maxonsPrice)}/lb</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Deal Summary</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Volume</span>
                  <span className="text-white">{volumeMT} MT ({volumeLbs.toLocaleString()} lbs)</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Total Value</span>
                  <span className="text-white font-bold">${(totalValue / 1000).toFixed(1)}K</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">MAXONS Margin</span>
                  <span className="text-green-400 font-bold">${(marginValue / 1000).toFixed(1)}K</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Terms</span>
                  <span className="text-white">{incoterm} {destination || '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Product</span>
                  <span className="text-white">{variety} {grade}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Recent Offers ─── */}
      {activeTab === 'offers' && (
        <div className="space-y-2">
          {loading && (
            <div className="flex items-center justify-center h-48">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {!loading && offers.length === 0 && (
            <div className="flex items-center justify-center h-48 text-gray-600">
              <div className="text-center">
                <p className="text-sm">No offers yet</p>
                <p className="text-xs mt-1 text-gray-700">Use the Offer Builder to create your first trade offer</p>
              </div>
            </div>
          )}
          {!loading && offers.map(offer => (
            <div key={offer.id} className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] border ${STATUS_COLORS[offer.stage] || STATUS_COLORS.draft}`}>
                      {offer.stage}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      {offer.created_at ? new Date(offer.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                    </span>
                  </div>
                  <h4 className="text-sm font-medium text-white">
                    {offer.variety} {offer.grade} — {offer.volume_mt?.toFixed(1)} MT {offer.incoterm} {offer.destination_port || ''}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {offer.crm_contacts?.company_name || offer.notes?.match(/Buyer: ([^.]+)/)?.[1] || 'No buyer linked'}
                    {offer.crm_contacts?.country ? ` (${offer.crm_contacts.country})` : ''}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-white">{fmtUSD(offer.maxons_price)}/lb</p>
                  <p className="text-[10px] text-gray-500">Base: {fmtUSD(offer.strata_base_price)}</p>
                  <p className="text-[10px] text-green-400">Margin: {fmtUSD((offer.maxons_price || 0) - (offer.strata_base_price || 0))}/lb</p>
                  <p className="text-[10px] text-gray-600 mt-1">${((offer.total_value_usd || 0) / 1000).toFixed(0)}K total</p>
                </div>
              </div>
              {/* Action buttons */}
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800/50">
                {offer.stage === 'draft' && (
                  <>
                    <button onClick={() => updateOfferStatus(offer.id, 'quoted')}
                      className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded text-[10px] hover:bg-blue-500/30 transition-colors">
                      Mark Quoted
                    </button>
                    <button onClick={() => sendViaWhatsApp(offer)}
                      className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-[10px] hover:bg-green-500/30 transition-colors">
                      Send via WhatsApp
                    </button>
                  </>
                )}
                {offer.stage === 'sent' && (
                  <button onClick={() => updateOfferStatus(offer.id, 'pending')}
                    className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] hover:bg-amber-500/30 transition-colors">
                    Awaiting Response
                  </button>
                )}
                {(offer.stage === 'quoted' || offer.stage === 'pending') && (
                  <>
                    <button onClick={() => updateOfferStatus(offer.id, 'accepted')}
                      className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-[10px] hover:bg-green-500/30 transition-colors">
                      Accepted
                    </button>
                    <button onClick={() => updateOfferStatus(offer.id, 'rejected')}
                      className="px-3 py-1 bg-red-500/20 text-red-400 rounded text-[10px] hover:bg-red-500/30 transition-colors">
                      Rejected
                    </button>
                    <button onClick={() => updateOfferStatus(offer.id, 'negotiation')}
                      className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded text-[10px] hover:bg-amber-500/30 transition-colors">
                      Negotiating
                    </button>
                  </>
                )}
                {offer.stage === 'accepted' && (
                  <button onClick={() => updateOfferStatus(offer.id, 'contracted')}
                    className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-[10px] hover:bg-emerald-500/30 transition-colors">
                    Contract Signed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Buyer Portal View ─── */}
      {activeTab === 'buyer' && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">
              CI
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">MAXONS Almond Portal</h3>
              <p className="text-xs text-gray-500">Buyer View — What your customers see</p>
            </div>
          </div>

          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-5 mb-4">
            <p className="text-[10px] text-green-400 uppercase tracking-wider mb-2">Information Wall Active</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Buyers see: available varieties with MAXONS pricing, their order history, shipment tracking, and quality certificates.
              They do NOT see: your supplier prices, margin calculations, other buyer information, or internal CRM notes.
              Each buyer gets a personalized view based on their profile, region, and purchase history.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Available Products</p>
              <div className="space-y-2">
                {['Nonpareil 23/25', 'Nonpareil 25/27', 'Carmel 25/27', 'Butte/Padres Extra #1'].map(p => (
                  <div key={p} className="flex items-center justify-between text-xs">
                    <span className="text-gray-300">{p}</span>
                    <span className="text-green-400 font-mono">{fmtUSD(BASE_PRICES[p.replace(' ', '-')] * 1.03 || 3.50)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Your Orders</p>
              <p className="text-xs text-gray-400">2 active orders</p>
              <p className="text-xs text-gray-500 mt-1">1 in transit | 1 processing</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Account Manager</p>
              <p className="text-xs text-white">Muzammil Akhtar</p>
              <p className="text-xs text-gray-500">MAXONS International Trading</p>
              <p className="text-xs text-green-400 mt-1">trade@cropsintel.com</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Supplier Portal View ─── */}
      {activeTab === 'supplier' && (
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
              CI
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">MAXONS Procurement Portal</h3>
              <p className="text-xs text-gray-500">Supplier View — What your suppliers see</p>
            </div>
          </div>

          <div className="bg-gray-800/30 border border-gray-700/50 rounded-xl p-5 mb-4">
            <p className="text-[10px] text-blue-400 uppercase tracking-wider mb-2">Information Wall Active</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Suppliers see: purchase orders from MAXONS, their delivery schedule, quality requirements, and payment status.
              They do NOT see: your sell-side pricing, buyer identities, margins, or other supplier terms.
              Each supplier portal is isolated and personalized.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Open Purchase Orders</p>
              <p className="text-xl font-bold text-white">3</p>
              <p className="text-xs text-gray-500 mt-1">500 MT total volume</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Delivery Schedule</p>
              <p className="text-xs text-gray-400">Next: May 15, 2026</p>
              <p className="text-xs text-gray-500 mt-1">200 MT Nonpareil 23/25</p>
            </div>
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Procurement Contact</p>
              <p className="text-xs text-white">MAXONS Procurement</p>
              <p className="text-xs text-blue-400 mt-1">intel@cropsintel.com</p>
            </div>
          </div>
        </div>
      )}

      {/* How Trading Portal Works */}
      <div className="bg-gray-900/40 border border-gray-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-white mb-2">How the Trading Portal Works</h3>
        <p className="text-xs text-gray-400 leading-relaxed">
          The Offer Builder pulls live Strata market prices and applies your MAXONS margin automatically. Each offer includes
          variety, grade, volume, incoterm, and destination — ready to send via email or WhatsApp. The portal layer shows
          different views to buyers and suppliers with AI-managed information walls: buyers see MAXONS sell prices and their
          order history; suppliers see purchase orders and delivery schedules. Neither side sees the other's information or
          your margin calculations.
        </p>
      </div>
    </div>
  );
}
