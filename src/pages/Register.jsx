import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const ROLES = [
  { value: 'buyer', label: 'Buyer / Importer' },
  { value: 'supplier', label: 'Supplier / Handler' },
  { value: 'broker', label: 'Broker / Trader' },
  { value: 'grower', label: 'Grower' },
  { value: 'analyst', label: 'Market Analyst' },
  { value: 'other', label: 'Other' },
];

const PRODUCTS = [
  'Nonpareil', 'Carmel', 'Butte/Padres', 'California', 'Mission',
  'Monterey', 'Independence', 'Fritz', 'All Varieties',
];

const COUNTRIES = [
  'United Arab Emirates', 'Saudi Arabia', 'India', 'China', 'Germany',
  'Spain', 'Turkey', 'Japan', 'South Korea', 'Italy', 'Netherlands',
  'United Kingdom', 'France', 'Canada', 'Mexico', 'Australia',
  'Pakistan', 'United States', 'Other',
];

export default function Register() {
  const { signUp } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    full_name: '',
    email: '',
    password: '',
    confirmPassword: '',
    company: '',
    role: 'buyer',
    country: '',
    products_of_interest: [],
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    setError('');
  }

  function toggleProduct(product) {
    setForm(prev => ({
      ...prev,
      products_of_interest: prev.products_of_interest.includes(product)
        ? prev.products_of_interest.filter(p => p !== product)
        : [...prev.products_of_interest, product],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.full_name.trim()) return setError('Full name is required');
    if (!form.email.trim()) return setError('Email is required');
    if (form.password.length < 6) return setError('Password must be at least 6 characters');
    if (form.password !== form.confirmPassword) return setError('Passwords do not match');
    if (!form.company.trim()) return setError('Company name is required');
    if (!form.country) return setError('Please select your country');

    setLoading(true);
    try {
      await signUp(form.email, form.password, {
        full_name: form.full_name,
        company: form.company,
        role: form.role,
        country: form.country,
        products_of_interest: form.products_of_interest,
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

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Brand */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-lg mx-auto mb-3">
            CI
          </div>
          <h1 className="text-2xl font-bold text-white">Join CropsIntel</h1>
          <p className="text-sm text-gray-500 mt-1">
            Access the world's most comprehensive almond market intelligence
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Name + Company row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Full Name *</label>
              <input
                type="text"
                value={form.full_name}
                onChange={e => updateField('full_name', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                placeholder="Your full name"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Company *</label>
              <input
                type="text"
                value={form.company}
                onChange={e => updateField('company', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                placeholder="Company name"
              />
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">Email *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => updateField('email', e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
              placeholder="you@company.com"
            />
          </div>

          {/* Password row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Password *</label>
              <input
                type="password"
                value={form.password}
                onChange={e => updateField('password', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Confirm Password *</label>
              <input
                type="password"
                value={form.confirmPassword}
                onChange={e => updateField('confirmPassword', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
                placeholder="Confirm password"
              />
            </div>
          </div>

          {/* Role + Country row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Country *</label>
              <select
                value={form.country}
                onChange={e => updateField('country', e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20"
              >
                <option value="">Select country</option>
                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Products of Interest */}
          <div>
            <label className="block text-xs text-gray-400 mb-2">Products of Interest</label>
            <div className="flex flex-wrap gap-2">
              {PRODUCTS.map(p => {
                const selected = form.products_of_interest.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleProduct(p)}
                    className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                      selected
                        ? 'bg-green-500/20 border-green-500/40 text-green-400'
                        : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>

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
