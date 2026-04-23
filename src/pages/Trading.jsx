// CropsIntelV2 — Trading page
// Tabs: Offer Builder · Recent Offers · Buyer Portal · Supplier Portal
//
// 2026-04-24 rebuild (Wave 2): extracted OfferBuilder + OfferLineItem into
// src/components/ and all pure math into src/lib/offerCalcs.js. This file now
// focuses on page-level concerns (tabs, data loading, offer lifecycle actions)
// and shrinks from 846 to ~350 lines.

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { sendOfferNotification } from '../lib/whatsapp';
import OfferBuilder from '../components/OfferBuilder';
import { resolveStrataPriceValue, fmtUSD } from '../lib/offerCalcs';

const STATUS_COLORS = {
  draft:     'bg-gray-500/20 text-gray-400 border-gray-500/30',
  sent:      'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pending:   'bg-amber-500/20 text-amber-400 border-amber-500/30',
  accepted:  'bg-green-500/20 text-green-400 border-green-500/30',
  rejected:  'bg-red-500/20 text-red-400 border-red-500/30',
  expired:   'bg-gray-500/20 text-gray-500 border-gray-500/30',
};

export default function Trading() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('builder');
  const [offers, setOffers]       = useState([]);
  const [contacts, setContacts]   = useState([]);
  const [stratamap, setStratamap] = useState({});
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saveMsg, setSaveMsg]     = useState('');

  // ─── Load once on mount ────────────────────────────────────
  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [dealsRes, contactsRes, strataRes] = await Promise.all([
        supabase.from('crm_deals').select('*, crm_contacts(company_name, contact_name, country)').order('created_at', { ascending: false }).limit(50),
        supabase.from('crm_contacts').select('id, company_name, contact_name, country, contact_type').eq('contact_type', 'buyer').order('relationship_score', { ascending: false }),
        supabase.from('strata_prices').select('variety, grade, form, price_usd_per_lb, price_date').order('price_date', { ascending: false }).limit(500),
      ]);
      if (!dealsRes.error && dealsRes.data)       setOffers(dealsRes.data);
      if (!contactsRes.error && contactsRes.data) setContacts(contactsRes.data);

      if (!strataRes.error && Array.isArray(strataRes.data)) {
        const map = {};
        for (const row of strataRes.data) {
          const k = `${row.variety}-${row.grade}`;
          if (!map[k] && row.price_usd_per_lb != null) map[k] = Number(row.price_usd_per_lb);
          if (row.form) {
            const k2 = `${row.variety}-${row.form}`;
            if (!map[k2] && row.price_usd_per_lb != null) map[k2] = Number(row.price_usd_per_lb);
          }
        }
        setStratamap(map);
      }
    } catch (err) {
      console.warn('Load trading data error:', err.message);
    }
    setLoading(false);
  }

  // ─── Save handler — delegated from OfferBuilder ──────────
  async function saveOffer(payload) {
    setSaving(true);
    setSaveMsg('');
    try {
      const { data, error } = await supabase
        .from('crm_deals')
        .insert(payload)
        .select('*, crm_contacts(company_name, contact_name, country)')
        .single();
      if (error) throw error;

      setOffers(prev => [data, ...prev]);
      const count = payload?.metadata?.line_items?.length || 1;
      setSaveMsg(`Offer created (${count} product${count > 1 ? 's' : ''}). Switch to Recent Offers.`);
      setActiveTab('offers');
      setTimeout(() => setSaveMsg(''), 5000);
      return data;
    } catch (err) {
      setSaveMsg('Error: ' + err.message);
      setTimeout(() => setSaveMsg(''), 5000);
      return null;
    } finally {
      setSaving(false);
    }
  }

  // ─── Offer lifecycle actions ───────────────────────────────
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
        variety:  offer.variety,
        grade:    offer.grade,
        form:     offer.form,
        price:    offer.maxons_price,
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

  const portalViews = [
    { id: 'builder',  label: 'Offer Builder' },
    { id: 'offers',   label: 'Recent Offers' },
    { id: 'buyer',    label: 'Buyer Portal' },
    { id: 'supplier', label: 'Supplier Portal' },
  ];

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Trading Portal</h1>
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
        <OfferBuilder
          contacts={contacts}
          stratamap={stratamap}
          userId={user?.id}
          onSave={saveOffer}
          saving={saving}
          saveMsg={saveMsg}
        />
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
                  <h4 className="text-sm font-medium text-white flex items-center gap-2 flex-wrap">
                    <span>{offer.variety} {offer.grade} — {offer.volume_mt?.toFixed(1)} MT {offer.incoterm} {offer.destination_port || ''}</span>
                    {offer.metadata?.is_multi_product && Array.isArray(offer.metadata?.line_items) && (
                      <span
                        className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-normal"
                        title={offer.metadata.line_items.map(li => `${li.variety} ${li.grade} · ${li.volume_mt} MT`).join(' · ')}
                      >
                        +{offer.metadata.line_items.length - 1} more
                      </span>
                    )}
                    {(offer.metadata?.freight_cost_usd > 0 || offer.metadata?.insurance_cost_usd > 0) && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 font-normal">
                        incl. freight/ins
                      </span>
                    )}
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
                {[
                  ['Nonpareil', '23/25'],
                  ['Nonpareil', '25/27'],
                  ['Carmel', '25/27'],
                  ['Butte/Padres', 'Extra #1'],
                ].map(([v, g]) => {
                  const bp = resolveStrataPriceValue(stratamap, v, g);
                  return (
                    <div key={`${v}-${g}`} className="flex items-center justify-between text-xs">
                      <span className="text-gray-300">{v} {g}</span>
                      <span className="text-green-400 font-mono">{fmtUSD(bp * 1.03)}</span>
                    </div>
                  );
                })}
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
