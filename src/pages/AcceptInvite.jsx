import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

// ═══════════════════════════════════════════════════════════════════════
// AcceptInvite — /accept-invite?t=<invitation_id>
//
// The invitee arrives here from the link in their email / WhatsApp. We:
//   1. Validate the token against team_invitations (exists, not expired,
//      not already accepted, not revoked).
//   2. Show a multi-step form:
//      a. Confirm identity (name prefilled, email/whatsapp editable)
//      b. Set password (required — so login works both ways)
//      c. Job details (title, description, expertise, languages)
//   3. On submit:
//      - Sign up with email + password (creates auth.users row)
//      - Insert / upsert user_profiles with tier from invitation +
//        job_title / job_description / expertise / languages + invited_via
//      - Mark the invitation accepted
//      - Redirect to /dashboard
//
// Why no OTP dance here? The invitation link IS the capability — anyone
// holding the unguessable UUID proves they received it. They still set a
// real password + land in auth.users, so all normal login paths work
// afterwards.
// ═══════════════════════════════════════════════════════════════════════

const LANGUAGE_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'ar', label: 'Arabic' },
  { code: 'hi', label: 'Hindi' },
  { code: 'es', label: 'Spanish' },
  { code: 'tr', label: 'Turkish' },
  { code: 'zh', label: 'Chinese' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
];

const EXPERTISE_SUGGESTIONS = [
  'Almond pricing',
  'Variety analysis',
  'Destination flow',
  'Supplier relations',
  'Contract negotiation',
  'Logistics',
  'Quality control',
  'Market research',
  'Customer success',
  'Export compliance',
];

export default function AcceptInvite() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('t');

  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [validationError, setValidationError] = useState('');

  // Step state
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Step 1 — identity (prefilled)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [company, setCompany] = useState('');

  // Step 2 — password
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // Step 3 — job details
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [expertise, setExpertise] = useState([]);
  const [expertiseInput, setExpertiseInput] = useState('');
  const [languages, setLanguages] = useState(['en']);

  // ─── Validate the invitation token on mount ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setValidationError('Missing invitation token. Check the link you received.');
        setLoading(false);
        return;
      }
      try {
        const { data, error } = await supabase
          .from('team_invitations')
          .select('*')
          .eq('id', token)
          .maybeSingle();

        if (cancelled) return;
        if (error) throw error;
        if (!data) {
          setValidationError('This invitation link is invalid. Ask the person who invited you to send a fresh link.');
          setLoading(false);
          return;
        }
        if (data.status === 'accepted') {
          setValidationError('This invitation has already been accepted. Try logging in at /login.');
          setLoading(false);
          return;
        }
        if (data.status === 'revoked') {
          setValidationError('This invitation has been revoked. Contact the person who invited you.');
          setLoading(false);
          return;
        }
        if (data.expires_at && new Date(data.expires_at) < new Date()) {
          setValidationError('This invitation has expired. Ask for a new one.');
          setLoading(false);
          return;
        }

        setInvitation(data);
        setFullName(data.full_name || '');
        setEmail(data.email || '');
        setWhatsapp(data.whatsapp_number || '');
        setCompany(data.company || '');
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setValidationError('Could not load invitation: ' + (err.message || 'unknown error'));
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  // ─── Submit the full form ───────────────────────────────────────────
  async function handleAccept(e) {
    e.preventDefault();
    setSubmitError('');

    // Validate all steps once more.
    if (!fullName.trim()) return setSubmitError('Your name is required');
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return setSubmitError('A valid email is required to create your login');
    }
    if (!password) return setSubmitError('Password is required');
    if (password.length < 8) return setSubmitError('Password must be at least 8 characters');
    if (password !== confirmPw) return setSubmitError('Passwords do not match');
    if (!jobTitle.trim()) return setSubmitError('Job title helps us tailor your dashboard');
    if (!jobDescription.trim() || jobDescription.trim().length < 20) {
      return setSubmitError('Please add 1–3 sentences about what you do (at least 20 characters)');
    }

    setSubmitting(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const cleanPhone = whatsapp.trim() ? normalizePhone(whatsapp.trim()) : null;

      // 1. Create auth account (signUp — NOT invite — since we have password).
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            invited_via: invitation.id,
          },
        },
      });
      if (authErr) {
        // If the email already exists, offer a sign-in path.
        if (String(authErr.message).toLowerCase().includes('already')) {
          throw new Error('This email is already registered. Try logging in at /login — your role will be updated based on the invitation.');
        }
        throw authErr;
      }
      const newUserId = authData?.user?.id;
      if (!newUserId) {
        throw new Error('Auth account was created but no user id returned. Try logging in at /login.');
      }

      // 2. Upsert user_profiles with tier/role from invitation + job details.
      // `onboarded_as_role` preserves the original invited role for audit, even
      // if admin later promotes/demotes the user. See migration
      // 20260425_trade_hub_foundation.sql (spec §2.2 / crosswalk §2).
      const profileRow = {
        id: newUserId,
        email: cleanEmail,
        full_name: fullName.trim(),
        company: company.trim() || null,
        whatsapp_number: cleanPhone,
        role: invitation.role,
        access_tier: invitation.access_tier || 'registered',
        job_title: jobTitle.trim(),
        job_description: jobDescription.trim(),
        expertise: expertise.length ? expertise : null,
        languages: languages.length ? languages : null,
        invited_via: invitation.id,
        onboarded_as_role: invitation.role, // audit trail — original role at invitation time
        onboarded_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const { error: profErr } = await supabase
        .from('user_profiles')
        .upsert(profileRow, { onConflict: 'id' });
      if (profErr) {
        // Non-fatal if RLS rejects the upsert — we still have auth.users.
        // Surface the error but continue so the user can login and complete
        // profile in Settings.
        console.warn('[AcceptInvite] user_profiles upsert failed:', profErr.message);
      }

      // 3. Mark invitation accepted.
      const { error: acceptErr } = await supabase
        .from('team_invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString(),
          accepted_by: newUserId,
        })
        .eq('id', invitation.id);
      if (acceptErr) {
        console.warn('[AcceptInvite] invitation accept mark failed:', acceptErr.message);
      }

      // 4. If email needs confirmation (Supabase default), auth.session may
      // be null. Sign them in immediately so they land on the dashboard.
      let signInOk = !!authData?.session;
      if (!authData?.session) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        if (!signInErr) signInOk = true;
        else console.warn('[AcceptInvite] auto-signin failed:', signInErr.message);
      }

      // 5. Pre-seed the profile fetch before Dashboard mounts. Without this,
      // AuthContext.loadProfile races with navigate() and the sidebar briefly
      // renders the fallback 'buyer' role — team-only nav entries never
      // appear, leaving new team members confused about where their tools
      // are. Forcing a SELECT here guarantees the row is hot in Supabase's
      // replication before we navigate. See docs/TRADE_HUB_CROSSWALK_v1.md §6.
      let freshProfile = null;
      if (signInOk) {
        try {
          const { data: refreshed } = await supabase
            .from('user_profiles')
            .select('*')
            .eq('id', newUserId)
            .maybeSingle();
          freshProfile = refreshed;
        } catch (pullErr) {
          console.warn('[AcceptInvite] profile pre-fetch failed:', pullErr?.message);
        }
      }

      // 6. Decide whether this invitee landed on the team side so Dashboard
      // can render a team-specific welcome banner.
      const TEAM_ROLE_LIST = [
        // legacy
        'admin', 'analyst', 'broker', 'seller', 'trader', 'sales', 'maxons_team',
        // spec §12.1 (14 internal)
        'super_admin', 'procurement_head', 'procurement_officer',
        'sales_lead', 'sales_handler',
        'documentation_lead', 'documentation_officer',
        'logistics_head', 'logistics_officer', 'warehouse_manager',
        'finance_head', 'finance_officer', 'compliance_officer',
      ];
      const isTeamInvite =
        TEAM_ROLE_LIST.includes(invitation.role) ||
        invitation.access_tier === 'maxons_team' ||
        invitation.access_tier === 'admin';

      navigate('/dashboard', {
        replace: true,
        state: {
          welcomeMessage: `Welcome to CropsIntel, ${fullName.trim().split(' ')[0]}! Your profile is ready.`,
          justOnboardedAs: invitation.role,
          justOnboardedTier: invitation.access_tier,
          isTeamInvite,
          // If sign-in failed (e.g. email-confirm required), tell Dashboard so
          // it can show a "please check your inbox / try login" nudge instead
          // of the team welcome banner.
          signInSucceeded: signInOk,
        },
      });
    } catch (err) {
      setSubmitError(err.message || 'Could not complete invitation acceptance');
    } finally {
      setSubmitting(false);
    }
  }

  function toggleLanguage(code) {
    setLanguages(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  }

  function addExpertise(tag) {
    const clean = tag.trim();
    if (!clean || expertise.includes(clean)) return;
    setExpertise(prev => [...prev, clean]);
    setExpertiseInput('');
  }

  function removeExpertise(tag) {
    setExpertise(prev => prev.filter(t => t !== tag));
  }

  function nextStep() {
    setSubmitError('');
    if (step === 1) {
      if (!fullName.trim()) return setSubmitError('Your name is required');
      if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return setSubmitError('A valid email is required');
      }
    }
    if (step === 2) {
      if (!password) return setSubmitError('Password is required');
      if (password.length < 8) return setSubmitError('At least 8 characters');
      if (password !== confirmPw) return setSubmitError('Passwords do not match');
    }
    setStep(s => Math.min(s + 1, 3));
  }

  function prevStep() {
    setSubmitError('');
    setStep(s => Math.max(s - 1, 1));
  }

  // ─── Loading / error UI ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-sm text-gray-400">Loading your invitation…</div>
      </div>
    );
  }

  if (validationError) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Invitation unavailable</h2>
          <p className="text-sm text-gray-400 mb-5">{validationError}</p>
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

  // ─── Main form ──────────────────────────────────────────────────────
  const inviterName = invitation?.invited_by_name || 'The CropsIntel team';
  const roleLabel = (invitation?.role || 'buyer').replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-[10px] font-semibold text-green-400 mb-3 tracking-wide">
            INVITATION · CROPSINTEL BY MAXONS
          </div>
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 shadow-lg shadow-green-500/20">
            CI
          </div>
          <h1 className="text-3xl font-bold text-white">Join as {roleLabel}</h1>
          <p className="text-sm text-gray-400 mt-2">
            {inviterName} invited you. Takes 2 minutes.
          </p>
          {invitation.personal_note && (
            <blockquote className="mt-4 px-4 py-3 bg-green-500/5 border-l-2 border-green-500 text-sm text-gray-300 italic text-left">
              &ldquo;{invitation.personal_note}&rdquo;
              <span className="block text-[10px] text-gray-500 mt-1 not-italic">— {inviterName}</span>
            </blockquote>
          )}
        </div>

        {/* Progress strip */}
        <div className="flex items-center justify-center gap-2 mb-5">
          <StepDot done={step > 1} active={step === 1} label="You" />
          <StepLine done={step > 1} />
          <StepDot done={step > 2} active={step === 2} label="Password" />
          <StepLine done={step > 2} />
          <StepDot active={step === 3} label="Your role" />
        </div>

        <form onSubmit={handleAccept} className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
          {submitError && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg px-3 py-2">
              {submitError}
            </div>
          )}

          {/* ── Step 1: identity ── */}
          {step === 1 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white mb-1">Confirm your details</h3>
              <p className="text-xs text-gray-500 mb-3">
                Edit anything {inviterName.split(' ')[0]} got wrong.
              </p>
              <Input label="Full name *" value={fullName} onChange={setFullName} autoFocus />
              <Input label="Work email *" value={email} onChange={setEmail} type="email" placeholder="you@company.com" />
              <Input label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+971 50 123 4567" />
              <Input label="Company" value={company} onChange={setCompany} placeholder="MAXONS International Trading" />
            </section>
          )}

          {/* ── Step 2: password ── */}
          {step === 2 && (
            <section className="space-y-3">
              <h3 className="text-sm font-semibold text-white mb-1">Set your password</h3>
              <p className="text-xs text-gray-500 mb-3">
                Minimum 8 characters. You can also log in with WhatsApp OTP later.
              </p>
              <Input label="Password *" value={password} onChange={setPassword} type="password" autoFocus />
              <Input label="Confirm password *" value={confirmPw} onChange={setConfirmPw} type="password" />
            </section>
          )}

          {/* ── Step 3: job details ── */}
          {step === 3 && (
            <section className="space-y-4">
              <h3 className="text-sm font-semibold text-white mb-1">Tell us about your role</h3>
              <p className="text-xs text-gray-500 mb-3">
                So Zyra + your dashboards tune to what you actually do.
              </p>
              <Input label="Job title *" value={jobTitle} onChange={setJobTitle} placeholder="Senior Trader, Head of Sourcing, etc." />
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">What do you do? *</label>
                <textarea
                  value={jobDescription}
                  onChange={e => setJobDescription(e.target.value)}
                  rows={3}
                  placeholder="1–3 sentences about your day-to-day work, what decisions you make, who you work with."
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50 resize-none"
                />
                <span className="text-[10px] text-gray-600">{jobDescription.trim().length} chars {jobDescription.trim().length < 20 && '(min 20)'}</span>
              </div>

              {/* Expertise tags */}
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Expertise tags</label>
                <div className="flex gap-2 mb-2">
                  <input
                    value={expertiseInput}
                    onChange={e => setExpertiseInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addExpertise(expertiseInput);
                      }
                    }}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
                    placeholder="Type a tag and press Enter"
                  />
                  <button
                    type="button"
                    onClick={() => addExpertise(expertiseInput)}
                    disabled={!expertiseInput.trim()}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                  >
                    Add
                  </button>
                </div>
                {expertise.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {expertise.map(tag => (
                      <span key={tag} className="text-[11px] px-2 py-1 rounded-full bg-green-500/10 text-green-300 border border-green-500/30 flex items-center gap-1">
                        {tag}
                        <button type="button" onClick={() => removeExpertise(tag)} className="hover:text-red-400 ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-1">
                  {EXPERTISE_SUGGESTIONS.filter(s => !expertise.includes(s)).slice(0, 6).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => addExpertise(s)}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-gray-800/50 text-gray-500 hover:text-gray-300 border border-gray-700/50 hover:border-gray-600 transition-colors"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Languages */}
              <div>
                <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-2">Languages you speak</label>
                <div className="flex flex-wrap gap-1.5">
                  {LANGUAGE_OPTIONS.map(lang => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => toggleLanguage(lang.code)}
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                        languages.includes(lang.code)
                          ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                          : 'bg-gray-800/50 text-gray-500 border-gray-700/50 hover:border-gray-600'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-800">
            {step > 1 && (
              <button
                type="button"
                onClick={prevStep}
                disabled={submitting}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white border border-gray-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
              >
                ← Back
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={nextStep}
                className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all"
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating your account…' : 'Join CropsIntel →'}
              </button>
            )}
          </div>
        </form>

        <p className="text-[10px] text-gray-600 text-center mt-5">
          By accepting, you agree to CropsIntel's terms. Your data stays private.
        </p>
      </div>
    </div>
  );
}

// ─── helpers ───────────────────────────────────────────────────────────
function normalizePhone(s) {
  if (!s) return null;
  const clean = s.replace(/[^\d+]/g, '');
  if (!clean) return null;
  return clean.startsWith('+') ? clean : `+${clean}`;
}

function Input({ label, value, onChange, type = 'text', placeholder, autoFocus }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-500/50"
      />
    </div>
  );
}

function StepDot({ done, active, label }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`w-2.5 h-2.5 rounded-full ${
        done ? 'bg-green-500' : active ? 'bg-blue-500 ring-4 ring-blue-500/20' : 'bg-gray-700'
      }`} />
      <span className={`text-[9px] tracking-wide ${done ? 'text-green-400' : active ? 'text-blue-400' : 'text-gray-600'}`}>
        {label}
      </span>
    </div>
  );
}

function StepLine({ done }) {
  return <div className={`flex-1 h-px max-w-[40px] ${done ? 'bg-green-500/50' : 'bg-gray-800'}`} />;
}
