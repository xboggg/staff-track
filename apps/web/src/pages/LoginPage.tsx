import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../lib/api';
import { toast } from 'sonner';

type View = 'login' | '2fa' | 'force-change' | 'forgot' | 'reset';

const FEATURES = [
  { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', title: 'Real-Time Tracking', desc: 'GPS & QR-based clock-in with geofence validation' },
  { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', title: 'Enterprise Security', desc: 'Role-based access, 2FA, and full audit trails' },
  { icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', title: 'Smart Analytics', desc: 'Dashboards, reports, and workforce insights' },
  { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', title: 'Team Management', desc: 'Departments, shifts, leaves, and scheduling' },
];

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [activeFeature, setActiveFeature] = useState(0);

  const loginFn = useAuthStore((s) => s.login);
  const verify2FA = useAuthStore((s) => s.verify2FA);
  const navigate = useNavigate();

  useEffect(() => {
    const interval = setInterval(() => setActiveFeature((p) => (p + 1) % FEATURES.length), 4000);
    return () => clearInterval(interval);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await loginFn(email, password);
      if (result.requiresTwoFactor && result.tempToken) {
        setTempToken(result.tempToken);
        setView('2fa');
        toast.info('Enter your 2FA code');
      } else if (result.mustChangePassword && result.tempToken) {
        setTempToken(result.tempToken);
        setView('force-change');
        toast.info('You must change your password before continuing');
      } else {
        toast.success('Welcome back!');
        navigate('/');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tempToken) return;
    setLoading(true);
    try {
      await verify2FA(tempToken, totpCode);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleForceChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/force-change-password', { tempToken, newPassword });
      const data = res.data;
      useAuthStore.setState({
        user: data.user,
        accessToken: data.tokens.accessToken,
        refreshToken: data.tokens.refreshToken,
        isAuthenticated: true,
      });
      toast.success('Password changed successfully. Welcome!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post('/auth/forgot-password', { email: forgotEmail });
      toast.success(res.data.message);
      if (res.data.resetToken) {
        setResetToken(res.data.resetToken);
      }
      setView('reset');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to send reset link');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { resetToken, newPassword });
      toast.success(res.data.message);
      setView('login');
      setNewPassword('');
      setConfirmPassword('');
      setResetToken('');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setView('login');
    setTempToken('');
    setNewPassword('');
    setConfirmPassword('');
    setResetToken('');
    setForgotEmail('');
  };

  const inputClass = 'w-full px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none transition-all duration-200 text-sm';
  const btnClass = 'w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-violet-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40';

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Panel — Branding */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-gradient-to-br from-violet-700 via-indigo-700 to-purple-800">
        {/* Animated background shapes */}
        <div className="absolute inset-0">
          <div className="absolute top-0 -left-20 w-96 h-96 bg-white/5 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/3 w-72 h-72 bg-indigo-400/10 rounded-full blur-2xl" />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]"
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Top — Logo */}
          <div>
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
          </div>

          {/* Middle — Hero content */}
          <div className="space-y-8">
            <div>
              <h2 className="text-4xl font-extrabold text-white leading-tight">
                Smarter Workforce<br />Management
              </h2>
              <p className="text-violet-200 mt-4 text-lg leading-relaxed max-w-md">
                Track attendance, manage shifts, and gain real-time insights into your workforce — all from one powerful platform.
              </p>
            </div>

            {/* Feature carousel */}
            <div className="space-y-3">
              {FEATURES.map((f, i) => (
                <div key={i}
                  className={`flex items-start gap-4 p-4 rounded-2xl transition-all duration-500 ${
                    i === activeFeature
                      ? 'bg-white/15 backdrop-blur-sm border border-white/20 shadow-lg'
                      : 'opacity-40 hover:opacity-60'
                  }`}>
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-500 ${
                    i === activeFeature ? 'bg-white/20' : 'bg-white/5'
                  }`}>
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={f.icon} />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-semibold text-sm">{f.title}</h3>
                    <p className="text-violet-200 text-xs mt-0.5">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom — Footer */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-violet-200 text-xs">Enterprise-grade security</span>
            </div>
            <span className="text-violet-300/60 text-xs">&copy; {new Date().getFullYear()} NovaStream Digital</span>
          </div>
        </div>
      </div>

      {/* Right Panel — Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-gray-50/50">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
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

          {/* Login Form */}
          {view === 'login' && (
            <div>
              <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">Welcome back</h1>
                <p className="text-gray-500 text-sm mt-1.5">Sign in to your account to continue</p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className={inputClass + ' pl-10'} placeholder="name@company.com" required autoComplete="email" />
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-sm font-medium text-gray-700">Password</label>
                    <button type="button" onClick={() => { setForgotEmail(email); setView('forgot'); }}
                      className="text-xs text-violet-600 hover:text-violet-700 font-medium">
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                      <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                      className={inputClass + ' pl-10 pr-10'} placeholder="Enter your password" required autoComplete="current-password" />
                    <button type="button" onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                      {showPassword ? (
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        </svg>
                      ) : (
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading} className={btnClass}>
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : 'Sign In'}
                </button>
              </form>
            </div>
          )}

          {/* 2FA Form */}
          {view === '2fa' && (
            <div>
              <div className="mb-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-violet-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h1>
                <p className="text-gray-500 text-sm mt-1.5">Enter the 6-digit code from your authenticator app</p>
              </div>

              <form onSubmit={handle2FA} className="space-y-5">
                <input type="text" value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full px-4 py-4 rounded-xl border border-gray-200 bg-gray-50/50 text-center text-3xl tracking-[0.5em] font-mono focus:ring-2 focus:ring-violet-500 focus:border-transparent outline-none"
                  placeholder="000000" maxLength={6} autoFocus required />
                <button type="submit" disabled={loading || totpCode.length !== 6} className={btnClass}>
                  {loading ? 'Verifying...' : 'Verify Code'}
                </button>
                <button type="button" onClick={goBack}
                  className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition">
                  Back to sign in
                </button>
              </form>
            </div>
          )}

          {/* Force Change Password */}
          {view === 'force-change' && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Change Password</h1>
                <p className="text-gray-500 text-sm mt-1.5">Set a new personal password to continue</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm text-amber-800 font-semibold">Password Change Required</p>
                    <p className="text-xs text-amber-600 mt-0.5">Your account was created with a default password.</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleForceChangePassword} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass} placeholder="Minimum 8 characters" minLength={8} required autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass} placeholder="Re-enter your new password" minLength={8} required />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Passwords do not match
                  </p>
                )}
                <button type="submit" disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword} className={btnClass}>
                  {loading ? 'Changing Password...' : 'Set Password & Sign In'}
                </button>
                <button type="button" onClick={goBack}
                  className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition">
                  Back to sign in
                </button>
              </form>
            </div>
          )}

          {/* Forgot Password */}
          {view === 'forgot' && (
            <div>
              <div className="mb-8 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900">Forgot Password?</h1>
                <p className="text-gray-500 text-sm mt-1.5">No worries. Enter your email and we'll send you a reset link.</p>
              </div>
              <form onSubmit={handleForgotPassword} className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email address</label>
                  <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                    className={inputClass} placeholder="name@company.com" required autoFocus />
                </div>
                <button type="submit" disabled={loading || !forgotEmail} className={btnClass}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
                <button type="button" onClick={goBack}
                  className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition">
                  Back to sign in
                </button>
              </form>
            </div>
          )}

          {/* Reset Password */}
          {view === 'reset' && (
            <div>
              <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-900">Reset Password</h1>
                <p className="text-gray-500 text-sm mt-1.5">Enter the token from your email and set a new password</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
                <div className="flex gap-3">
                  <svg className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div>
                    <p className="text-sm text-emerald-800 font-semibold">Check Your Email</p>
                    <p className="text-xs text-emerald-600 mt-0.5">If an account exists, a reset link has been sent.</p>
                  </div>
                </div>
              </div>
              <form onSubmit={handleResetPassword} className="space-y-4">
                {!resetToken && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Reset Token</label>
                    <input type="text" value={resetToken} onChange={(e) => setResetToken(e.target.value)}
                      className={inputClass + ' font-mono text-xs'} placeholder="Paste token from email" required />
                  </div>
                )}
                {resetToken && (
                  <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <p className="text-xs text-gray-500 truncate font-mono">Token: {resetToken.slice(0, 20)}...{resetToken.slice(-10)}</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                    className={inputClass} placeholder="Minimum 8 characters" minLength={8} required autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    className={inputClass} placeholder="Re-enter your new password" minLength={8} required />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Passwords do not match
                  </p>
                )}
                <button type="submit" disabled={loading || !resetToken || newPassword.length < 8 || newPassword !== confirmPassword} className={btnClass}>
                  {loading ? 'Resetting...' : 'Reset Password'}
                </button>
                <button type="button" onClick={goBack}
                  className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 font-medium transition">
                  Back to sign in
                </button>
              </form>
            </div>
          )}

          {/* Footer */}
          <div className="mt-10 text-center space-y-3">
            <p className="text-sm text-gray-500">
              Don't have an account?{' '}
              <Link to="/register" className="text-violet-600 hover:text-violet-700 font-semibold">Register your organization</Link>
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
