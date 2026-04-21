import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ROLES = [
  { value: 'buyer', label: 'Buyer / Importer' },
  { value: 'supplier', label: 'Supplier / Handler' },
  { value: 'broker', label: 'Broker / Trader' },
  { value: 'grower', label: 'Grower' },
  { value: 'analyst', label: 'Market Analyst' },
  { value: 'processor', label: 'Processor / Manufacturer' },
  { value: 'logistics', label: 'Logistics / Freight' },
  { value: 'finance', label: 'Trade Finance' },
  { value: 'other', label: 'Other' },
];

const PRODUCTS = [
  'Nonpareil', 'Carmel', 'Butte/Padres', 'California', 'Mission',
  'Monterey', 'Independence', 'Fritz', 'Aldrich', 'Price',
  'Sonora', 'Wood Colony', 'All Varieties',
];

const VOLUME_RANGES = [
  'Under 100 MT', '100–500 MT', '500–1,000 MT',
  '1,000–5,000 MT', '5,000–10,000 MT', '10,000+ MT',
];

const CERTIFICATIONS = [
  'HACCP', 'ISO 22000', 'BRC', 'IFS', 'FSSC 22000',
  'SQF', 'Organic (USDA)', 'Organic (EU)', 'Fair Trade',
  'Kosher', 'Halal', 'Non-GMO Project', 'FDA Registered',
];

const PAYMENT_TERMS = [
  'LC at Sight', 'Usance LC', 'CAD', 'TT Advance',
  'TT Against BL', 'DA 30/60/90', 'Open Account',
];

const MAJOR_PORTS = [
  // Middle East
  'Jebel Ali (UAE)', 'Khalifa Port (UAE)', 'Hamad Port (Qatar)',
  'Dammam (Saudi Arabia)', 'Jeddah (Saudi Arabia)', 'Sohar (Oman)',
  'Shuwaikh (Kuwait)', 'Mina Salman (Bahrain)',
  // Indian Subcontinent
  'Nhava Sheva / JNPT (India)', 'Mundra (India)', 'Chennai (India)',
  'Colombo (Sri Lanka)', 'Karachi (Pakistan)', 'Chittagong (Bangladesh)',
  // East Asia
  'Shanghai (China)', 'Qingdao (China)', 'Tianjin (China)',
  'Busan (South Korea)', 'Tokyo/Yokohama (Japan)', 'Kobe (Japan)',
  'Kaohsiung (Taiwan)', 'Ho Chi Minh City (Vietnam)',
  // Southeast Asia
  'Singapore', 'Port Klang (Malaysia)', 'Laem Chabang (Thailand)',
  'Jakarta/Tanjung Priok (Indonesia)', 'Manila (Philippines)',
  // Europe
  'Rotterdam (Netherlands)', 'Hamburg (Germany)', 'Antwerp (Belgium)',
  'Barcelona (Spain)', 'Valencia (Spain)', 'Genoa (Italy)',
  'Felixstowe (UK)', 'Le Havre (France)', 'Piraeus (Greece)',
  'Gdansk (Poland)', 'Istanbul/Mersin (Turkey)',
  // Americas
  'Oakland (USA)', 'Long Beach/LA (USA)', 'New York/Newark (USA)',
  'Vancouver (Canada)', 'Montreal (Canada)',
  'Manzanillo (Mexico)', 'Santos (Brazil)', 'Buenos Aires (Argentina)',
  // Africa
  'Durban (South Africa)', 'Mombasa (Kenya)', 'Lagos/Apapa (Nigeria)',
  'Casablanca (Morocco)', 'Alexandria (Egypt)',
  // Oceania
  'Melbourne (Australia)', 'Sydney (Australia)', 'Auckland (New Zealand)',
];

// Complete list of countries
const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
  'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan',
  'Bahamas', 'Bahrain', 'Bangladesh', 'Barbados', 'Belarus', 'Belgium',
  'Belize', 'Benin', 'Bhutan', 'Bolivia', 'Bosnia and Herzegovina',
  'Botswana', 'Brazil', 'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada', 'Central African Republic',
  'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo (Brazzaville)',
  'Congo (DRC)', 'Costa Rica', 'Croatia', 'Cuba', 'Cyprus', 'Czech Republic',
  'Denmark', 'Djibouti', 'Dominica', 'Dominican Republic',
  'East Timor', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea',
  'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia',
  'Fiji', 'Finland', 'France',
  'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Grenada',
  'Guatemala', 'Guinea', 'Guinea-Bissau', 'Guyana',
  'Haiti', 'Honduras', 'Hungary',
  'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy',
  'Jamaica', 'Japan', 'Jordan',
  'Kazakhstan', 'Kenya', 'Kiribati', 'Kosovo', 'Kuwait', 'Kyrgyzstan',
  'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya',
  'Liechtenstein', 'Lithuania', 'Luxembourg',
  'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta',
  'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia',
  'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
  'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua',
  'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman',
  'Pakistan', 'Palau', 'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay',
  'Peru', 'Philippines', 'Poland', 'Portugal',
  'Qatar',
  'Romania', 'Russia', 'Rwanda',
  'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
  'Samoa', 'San Marino', 'Sao Tome and Principe', 'Saudi Arabia', 'Senegal',
  'Serbia', 'Seychelles', 'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia',
  'Solomon Islands', 'Somalia', 'South Africa', 'South Korea', 'South Sudan',
  'Spain', 'Sri Lanka', 'Sudan', 'Suriname', 'Sweden', 'Switzerland', 'Syria',
  'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Tonga',
  'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Turkmenistan', 'Tuvalu',
  'Uganda', 'Ukraine', 'United Arab Emirates', 'United Kingdom', 'United States',
  'Uruguay', 'Uzbekistan',
  'Vanuatu', 'Vatican City', 'Venezuela', 'Vietnam',
  'Yemen',
  'Zambia', 'Zimbabwe',
];

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // Multi-step form

  const [form, setForm] = useState({
    // Step 1 — Account
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    // Step 2 — Company
    company: '',
    role: 'buyer',
    country: '',
    city: '',
    phone: '',
    whatsapp_number: '',
    website: '',
    // Step 3 — Trade Profile
    trade_type: '',
    annual_volume: '',
    products_of_interest: [],
    preferred_ports: [],
    certifications: [],
    payment_terms: [],
    // Step 4 — Social (optional)
    linkedin: '',
    twitter: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [portSearch, setPortSearch] = useState('');

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  function toggleArrayItem(field, item) {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(item)
        ? prev[field].filter(i => i !== item)
        : [...prev[field], item],
    }));
  }

  function validateStep(s) {
    if (s === 1) {
      if (!form.full_name.trim()) return 'Full name is required';
      if (!form.email.trim()) return 'Email is required';
      if (form.password.length < 6) return 'Password must be at least 6 characters';
      if (form.password !== form.confirmPassword) return 'Passwords do not match';
    }
    if (s === 2) {
      if (!form.company.trim()) return 'Company name is required';
      if (!form.country) return 'Please select your country';
    }
    return null;
  }

  function nextStep() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError('');
    setStep(s => Math.min(s + 1, 4));
  }

  function prevStep() {
    setError('');
    setStep(s => Math.max(s - 1, 1));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    // Validate steps 1 & 2
    for (let s = 1; s <= 2; s++) {
      const err = validateStep(s);
      if (err) { setError(err); setStep(s); return; }
    }

    setLoading(true);
    try {
      await signUp(form.email, form.password, {
        full_name: form.full_name,
        company: form.company,
        role: form.role,
        country: form.country,
        city: form.city,
        phone: form.phone,
        whatsapp_number: form.whatsapp_number,
        trade_type: form.trade_type,
        annual_volume: form.annual_volume,
        products_of_interest: form.products_of_interest,
        preferred_ports: form.preferred_ports,
        certifications: form.certifications,
        payment_terms: form.payment_terms,
        website: form.website,
        social_links: {
          linkedin: form.linkedin || null,
          twitter: form.twitter || null,
        },
      });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Registration Successful</h2>
          <p className="text-sm text-gray-400 mb-6">
            Please check your email to verify your account. Once verified, you'll have full access to CropsIntel's market intelligence platform.
          </p>
          <Link
            to="/login"
            className="inline-block px-6 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  const filteredCountries = countrySearch
    ? COUNTRIES.filter(c => c.toLowerCase().includes(countrySearch.toLowerCase()))
    : COUNTRIES;

  const filteredPorts = portSearch
    ? MAJOR_PORTS.filter(p => p.toLowerCase().includes(portSearch.toLowerCase()))
    : MAJOR_PORTS;

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
            CI
          </div>
          <h1 className="text-2xl font-bold text-white">Join CropsIntel</h1>
          <p className="text-sm text-gray-500 mt-1">
            The world's most comprehensive almond market intelligence
          </p>
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {[1, 2, 3, 4].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                s === step
                  ? 'bg-green-500/20 border-green-500 text-green-400'
                  : s < step
                  ? 'bg-green-600 border-green-600 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-500'
              }`}>
                {s < step ? '✓' : s}
              </div>
              {s < 4 && <div className={`w-8 h-0.5 ${s < step ? 'bg-green-500' : 'bg-gray-700'}`} />}
            </div>
          ))}
        </div>
        <div className="text-center text-xs text-gray-500 mb-4">
          {step === 1 && 'Account Details'}
          {step === 2 && 'Company & Location'}
          {step === 3 && 'Trade Profile'}
          {step === 4 && 'Review & Submit'}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* ── STEP 1: Account ── */}
          {step === 1 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Full Name *" value={form.full_name} onChange={v => updateField('full_name', v)} placeholder="Your full name" />
                <InputField label="Email *" type="email" value={form.email} onChange={v => updateField('email', v)} placeholder="you@company.com" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Password *" type="password" value={form.password} onChange={v => updateField('password', v)} placeholder="Min 6 characters" />
                <InputField label="Confirm Password *" type="password" value={form.confirmPassword} onChange={v => updateField('confirmPassword', v)} placeholder="Confirm password" />
              </div>
            </>
          )}

          {/* ── STEP 2: Company & Location ── */}
          {step === 2 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Company *" value={form.company} onChange={v => updateField('company', v)} placeholder="Company name" />
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Your Role *</label>
                  <select
                    value={form.role}
                    onChange={e => updateField('role', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                  >
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Country *</label>
                  <input
                    type="text"
                    value={countrySearch || form.country}
                    onChange={e => { setCountrySearch(e.target.value); if (!e.target.value) updateField('country', ''); }}
                    placeholder="Search countries..."
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                  />
                  {countrySearch && (
                    <div className="mt-1 max-h-40 overflow-y-auto bg-gray-800 border border-gray-700 rounded-lg">
                      {filteredCountries.slice(0, 10).map(c => (
                        <button key={c} type="button" onClick={() => { updateField('country', c); setCountrySearch(''); }}
                          className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white">
                          {c}
                        </button>
                      ))}
                      {filteredCountries.length > 10 && <div className="px-3 py-1.5 text-xs text-gray-500">+{filteredCountries.length - 10} more...</div>}
                    </div>
                  )}
                  {form.country && !countrySearch && (
                    <div className="mt-1 text-xs text-green-400">Selected: {form.country}</div>
                  )}
                </div>
                <InputField label="City" value={form.city} onChange={v => updateField('city', v)} placeholder="City" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField label="Phone" value={form.phone} onChange={v => updateField('phone', v)} placeholder="+971 50 xxx xxxx" />
                <InputField label="WhatsApp Number" value={form.whatsapp_number} onChange={v => updateField('whatsapp_number', v)} placeholder="+971 50 xxx xxxx" />
              </div>

              <InputField label="Website" value={form.website} onChange={v => updateField('website', v)} placeholder="www.company.com" />
            </>
          )}

          {/* ── STEP 3: Trade Profile ── */}
          {step === 3 && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Trade Type</label>
                  <select value={form.trade_type} onChange={e => updateField('trade_type', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50">
                    <option value="">Select...</option>
                    <option value="import">Import Only</option>
                    <option value="export">Export Only</option>
                    <option value="both">Import & Export</option>
                    <option value="domestic">Domestic Only</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Annual Volume</label>
                  <select value={form.annual_volume} onChange={e => updateField('annual_volume', e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50">
                    <option value="">Select...</option>
                    {VOLUME_RANGES.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              {/* Products */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Almond Varieties of Interest</label>
                <div className="flex flex-wrap gap-1.5">
                  {PRODUCTS.map(p => {
                    const sel = form.products_of_interest.includes(p);
                    return (
                      <button key={p} type="button" onClick={() => toggleArrayItem('products_of_interest', p)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          sel ? 'bg-green-500/20 border-green-500/40 text-green-400'
                              : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                        }`}>{p}</button>
                    );
                  })}
                </div>
              </div>

              {/* Ports */}
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">Preferred Ports</label>
                <input type="text" value={portSearch} onChange={e => setPortSearch(e.target.value)}
                  placeholder="Search ports..."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 mb-2"
                />
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {(portSearch ? filteredPorts : MAJOR_PORTS.filter(p => form.preferred_ports.includes(p)).concat(
                    portSearch ? [] : MAJOR_PORTS.filter(p => !form.preferred_ports.includes(p)).slice(0, 12)
                  )).map(p => {
                    const sel = form.preferred_ports.includes(p);
                    return (
                      <button key={p} type="button" onClick={() => toggleArrayItem('preferred_ports', p)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          sel ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                              : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                        }`}>{p}</button>
                    );
                  })}
                </div>
                {form.preferred_ports.length > 0 && (
                  <div className="mt-1 text-xs text-blue-400">{form.preferred_ports.length} port(s) selected</div>
                )}
              </div>

              {/* Certifications */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Certifications</label>
                <div className="flex flex-wrap gap-1.5">
                  {CERTIFICATIONS.map(c => {
                    const sel = form.certifications.includes(c);
                    return (
                      <button key={c} type="button" onClick={() => toggleArrayItem('certifications', c)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          sel ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                              : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                        }`}>{c}</button>
                    );
                  })}
                </div>
              </div>

              {/* Payment Terms */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Payment Terms</label>
                <div className="flex flex-wrap gap-1.5">
                  {PAYMENT_TERMS.map(t => {
                    const sel = form.payment_terms.includes(t);
                    return (
                      <button key={t} type="button" onClick={() => toggleArrayItem('payment_terms', t)}
                        className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                          sel ? 'bg-purple-500/20 border-purple-500/40 text-purple-400'
                              : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                        }`}>{t}</button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* ── STEP 4: Review & Submit ── */}
          {step === 4 && (
            <>
              <div className="space-y-3 text-sm">
                <ReviewSection title="Account" items={[
                  ['Name', form.full_name],
                  ['Email', form.email],
                ]} />
                <ReviewSection title="Company" items={[
                  ['Company', form.company],
                  ['Role', ROLES.find(r => r.value === form.role)?.label],
                  ['Country', form.country],
                  ['City', form.city],
                  ['Phone', form.phone],
                  ['WhatsApp', form.whatsapp_number],
                  ['Website', form.website],
                ]} />
                <ReviewSection title="Trade Profile" items={[
                  ['Trade Type', form.trade_type || 'Not specified'],
                  ['Annual Volume', form.annual_volume || 'Not specified'],
                  ['Products', form.products_of_interest.join(', ') || 'None selected'],
                  ['Ports', form.preferred_ports.join(', ') || 'None selected'],
                  ['Certifications', form.certifications.join(', ') || 'None'],
                  ['Payment Terms', form.payment_terms.join(', ') || 'Not specified'],
                ]} />
              </div>

              {/* Social links (optional, on review page) */}
              <div className="border-t border-gray-800 pt-4 mt-4">
                <label className="block text-xs text-gray-400 mb-3">Social Links (optional)</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <InputField label="LinkedIn" value={form.linkedin} onChange={v => updateField('linkedin', v)} placeholder="linkedin.com/in/..." small />
                  <InputField label="Twitter / X" value={form.twitter} onChange={v => updateField('twitter', v)} placeholder="@handle" small />
                </div>
              </div>
            </>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-3 pt-2">
            {step > 1 && (
              <button type="button" onClick={prevStep}
                className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm font-medium transition-colors border border-gray-700">
                Back
              </button>
            )}
            {step < 4 ? (
              <button type="button" onClick={nextStep}
                className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all">
                Continue
              </button>
            ) : (
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating account...
                  </span>
                ) : (
                  'Create Account'
                )}
              </button>
            )}
          </div>

          {/* Login link */}
          <p className="text-center text-sm text-gray-500">
            Already have an account?{' '}
            <Link to="/login" className="text-green-400 hover:text-green-300 transition-colors">
              Sign in
            </Link>
          </p>
        </form>

        {/* Value props */}
        <div className="grid grid-cols-3 gap-3 mt-6 text-center">
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-3">
            <p className="text-lg mb-1">10+</p>
            <p className="text-[10px] text-gray-500">Years of Data</p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-3">
            <p className="text-lg mb-1">116</p>
            <p className="text-[10px] text-gray-500">Monthly Reports</p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-3">
            <p className="text-lg mb-1">24/7</p>
            <p className="text-[10px] text-gray-500">AI Intelligence</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable Components ──

function InputField({ label, type = 'text', value, onChange, placeholder, small }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg px-3 ${small ? 'py-2 text-xs' : 'py-2.5 text-sm'} text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20`}
        placeholder={placeholder}
      />
    </div>
  );
}

function ReviewSection({ title, items }) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3">
      <h3 className="text-xs font-semibold text-green-400 mb-2 uppercase tracking-wider">{title}</h3>
      <div className="space-y-1">
        {items.filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <span className="text-gray-500 text-xs">{label}</span>
            <span className="text-gray-300 text-xs text-right max-w-[60%] truncate">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
