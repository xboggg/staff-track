import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../lib/api';
import { toast } from 'sonner';

const STEPS = ['Organization', 'Admin Account', 'Review'];

export default function RegisterPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Org fields
  const [orgName, setOrgName] = useState('');
  const [orgCode, setOrgCode] = useState('');
  const [domain, setDomain] = useState('');
  const [timezone, setTimezone] = useState('Africa/Accra');

  // Admin fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all duration-200 text-sm';
  const btnClass = 'py-3 px-6 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25';

  const canProceedStep0 = orgName.trim() && orgCode.trim() && orgCode.length >= 2;
  const canProceedStep1 = firstName.trim() && lastName.trim() && email.trim() && password.length >= 8 && password === confirmPassword;

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await api.post('/auth/register', {
        organizationName: orgName.trim(),
        organizationCode: orgCode.trim().toUpperCase(),
        domain: domain.trim() || undefined,
        timezone,
        adminEmail: email.trim(),
        adminPassword: password,
        adminFirstName: firstName.trim(),
        adminLastName: lastName.trim(),
      });

      const data = res.data;
      useAuthStore.setState({
        user: data.user,
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        isAuthenticated: true,
      });

      toast.success(`Welcome! ${data.organization.name} has been registered.`);
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Panel */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-violet-700 via-indigo-700 to-purple-800">
        <div className="absolute inset-0">
          <div className="absolute top-0 -left-20 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-3xl" />
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/15 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <span className="text-white font-bold text-xl tracking-tight">StaffTrack</span>
              <span className="text-violet-200 text-xs block -mt-0.5">by NovaStream Digital</span>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <h2 className="text-4xl font-extrabold text-white leading-tight">
                Get Started<br />in Minutes
              </h2>
              <p className="text-violet-200 mt-4 text-lg leading-relaxed max-w-md">
                Set up your organization, invite your team, and start tracking attendance — all in under 5 minutes.
              </p>
            </div>

            <div className="space-y-4">
              {['Create your organization profile', 'Set up your admin account', 'Add departments & invite staff'].map((text, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i <= step ? 'bg-white/20 text-white' : 'bg-white/5 text-violet-300'
                  }`}>
                    {i < step ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <span className={`text-sm ${i <= step ? 'text-white font-medium' : 'text-violet-300'}`}>{text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-violet-200 text-xs">Free to get started</span>
            </div>
            <span className="text-violet-300/60 text-xs">&copy; {new Date().getFullYear()} NovaStream Digital</span>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50/50">
        <div className="w-full max-w-[460px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-6">
            <div className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/25">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="text-left">
                <span className="text-gray-900 font-bold text-lg">StaffTrack</span>
                <span className="text-gray-400 text-[10px] block -mt-0.5">by NovaStream Digital</span>
              </div>
            </div>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-8">
            {STEPS.map((s, i) => (
              <div key={s} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  i < step ? 'bg-violet-600 text-white' : i === step ? 'bg-violet-100 text-violet-700 ring-2 ring-violet-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {i < step ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : i + 1}
                </div>
                <span className={`text-xs font-medium hidden sm:block ${i === step ? 'text-violet-700' : 'text-gray-400'}`}>{s}</span>
                {i < STEPS.length - 1 && <div className={`flex-1 h-px ${i < step ? 'bg-violet-400' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>

          {/* Step 0: Organization */}
          {step === 0 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Register Your Organization</h1>
              <p className="text-gray-500 text-sm mb-6">Tell us about your company</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Name *</label>
                  <input type="text" value={orgName} onChange={(e) => setOrgName(e.target.value)}
                    className={inputClass} placeholder="e.g. Acme Corporation" required autoFocus />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization Code *</label>
                  <input type="text" value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 20))}
                    className={inputClass + ' uppercase tracking-wider'} placeholder="e.g. ACME" required />
                  <p className="text-xs text-gray-400 mt-1">Unique identifier (2-20 chars, letters, numbers, hyphens)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Company Domain <span className="text-gray-400 font-normal">(optional)</span></label>
                  <input type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
                    className={inputClass} placeholder="e.g. acme.com" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Timezone</label>
                  <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
                    className={inputClass}>
                    <option value="Africa/Accra">Africa/Accra (GMT+0)</option>
                    <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                    <option value="Africa/Nairobi">Africa/Nairobi (GMT+3)</option>
                    <option value="Africa/Johannesburg">Africa/Johannesburg (GMT+2)</option>
                    <option value="Europe/London">Europe/London (GMT+0/+1)</option>
                    <option value="America/New_York">America/New_York (EST)</option>
                    <option value="America/Chicago">America/Chicago (CST)</option>
                    <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                    <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" disabled={!canProceedStep0} onClick={() => setStep(1)} className={btnClass + ' flex-1'}>
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Admin Account */}
          {step === 1 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Create Admin Account</h1>
              <p className="text-gray-500 text-sm mb-6">This will be the Super Admin for {orgName}</p>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">First Name *</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)}
                      className={inputClass} placeholder="John" required autoFocus />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Last Name *</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)}
                      className={inputClass} placeholder="Doe" required />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email Address *</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className={inputClass} placeholder="admin@company.com" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Password *</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      className={inputClass + ' pr-10'} placeholder="Minimum 8 characters" minLength={8} required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        {showPassword ? (
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        ) : (
                          <>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                  {password && password.length < 8 && (
                    <p className="text-xs text-amber-600 mt-1">Password must be at least 8 characters</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password *</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass} placeholder="Re-enter password" required />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(0)}
                    className="py-3 px-6 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition">
                    Back
                  </button>
                  <button type="button" disabled={!canProceedStep1} onClick={() => setStep(2)} className={btnClass + ' flex-1'}>
                    Continue
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Review */}
          {step === 2 && (
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-1">Review & Confirm</h1>
              <p className="text-gray-500 text-sm mb-6">Please verify your details before creating your account</p>

              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                  <div>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Organization</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Name</span>
                        <span className="text-sm font-medium text-gray-900">{orgName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Code</span>
                        <span className="text-sm font-mono font-medium text-violet-600">{orgCode}</span>
                      </div>
                      {domain && (
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-500">Domain</span>
                          <span className="text-sm text-gray-900">{domain}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Timezone</span>
                        <span className="text-sm text-gray-900">{timezone}</span>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Admin Account</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Name</span>
                        <span className="text-sm font-medium text-gray-900">{firstName} {lastName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Email</span>
                        <span className="text-sm text-gray-900">{email}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-500">Role</span>
                        <span className="text-sm font-medium text-violet-600">Super Admin</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex gap-3">
                    <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div>
                      <p className="text-sm text-blue-800 font-medium">What happens next?</p>
                      <p className="text-xs text-blue-600 mt-0.5">
                        Your organization will be created with a default "General" department and standard shift (8AM-5PM).
                        You can customize everything from the dashboard after signing in.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setStep(1)}
                    className="py-3 px-6 rounded-xl border border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition">
                    Back
                  </button>
                  <button type="button" disabled={loading} onClick={handleSubmit} className={btnClass + ' flex-1'}>
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Creating...
                      </span>
                    ) : 'Create Organization'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="mt-8 text-center space-y-3">
            <p className="text-sm text-gray-500">
              Already have an account?{' '}
              <Link to="/login" className="text-violet-600 hover:text-violet-700 font-semibold">Sign in</Link>
            </p>
            <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
              <span>Powered by</span>
              <span className="font-semibold text-gray-500">NovaStream Digital</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
