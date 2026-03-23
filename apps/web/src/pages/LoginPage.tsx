import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store';
import { api } from '../lib/api';
import { toast } from 'sonner';

type View = 'login' | '2fa' | 'force-change' | 'forgot' | 'reset';

export default function LoginPage() {
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [loading, setLoading] = useState(false);
  // Password fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  // Forgot password
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetToken, setResetToken] = useState('');

  const login = useAuthStore((s) => s.login);
  const verify2FA = useAuthStore((s) => s.verify2FA);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await login(email, password);
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
      // In dev mode, the API returns the reset token directly
      if (res.data.resetToken) {
        setResetToken(res.data.resetToken);
        setView('reset');
      } else {
        setView('reset');
      }
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">TimeTrack</h1>
            <p className="text-sm text-gray-500 mt-1">Workforce Time & Attendance</p>
          </div>

          {/* Login Form */}
          {view === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="name@company.com" required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="Enter your password" required
                />
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50">
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <button type="button" onClick={() => { setForgotEmail(email); setView('forgot'); }}
                className="w-full py-2 text-sm text-primary hover:text-primary/80 transition">
                Forgot Password?
              </button>
            </form>
          )}

          {/* 2FA Form */}
          {view === '2fa' && (
            <form onSubmit={handle2FA} className="space-y-4">
              <p className="text-sm text-gray-600 text-center">Enter the 6-digit code from your authenticator app</p>
              <input
                type="text" value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 text-center text-2xl tracking-[0.5em] focus:ring-2 focus:ring-primary focus:border-transparent outline-none"
                placeholder="000000" maxLength={6} autoFocus required
              />
              <button type="submit" disabled={loading || totpCode.length !== 6}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button type="button" onClick={goBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Back to login</button>
            </form>
          )}

          {/* Force Change Password */}
          {view === 'force-change' && (
            <form onSubmit={handleForceChangePassword} className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800 font-medium">Password Change Required</p>
                <p className="text-xs text-amber-600 mt-1">Your account was created with a default password. Please set a new personal password to continue.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="Minimum 8 characters" minLength={8} required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="Re-enter your new password" minLength={8} required />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
              <button type="submit" disabled={loading || newPassword.length < 8 || newPassword !== confirmPassword}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50">
                {loading ? 'Changing Password...' : 'Set New Password & Sign In'}
              </button>
              <button type="button" onClick={goBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Back to login</button>
            </form>
          )}

          {/* Forgot Password */}
          {view === 'forgot' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="text-center mb-2">
                <svg className="w-12 h-12 mx-auto text-gray-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
                <h2 className="text-lg font-semibold text-gray-900">Forgot Password?</h2>
                <p className="text-sm text-gray-500 mt-1">Enter your email address and we'll help you reset your password.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                <input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="name@company.com" required autoFocus />
              </div>
              <button type="submit" disabled={loading || !forgotEmail}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50">
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
              <button type="button" onClick={goBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Back to login</button>
            </form>
          )}

          {/* Reset Password */}
          {view === 'reset' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm text-green-800 font-medium">Reset Link Sent</p>
                <p className="text-xs text-green-600 mt-1">Check your email for the reset link, or enter the reset token below.</p>
              </div>
              {!resetToken && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reset Token</label>
                  <input type="text" value={resetToken} onChange={(e) => setResetToken(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition text-xs font-mono"
                    placeholder="Paste token from email" required />
                </div>
              )}
              {resetToken && (
                <div className="bg-gray-50 rounded-lg p-2">
                  <p className="text-xs text-gray-500 truncate">Token: {resetToken.slice(0, 20)}...{resetToken.slice(-10)}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="Minimum 8 characters" minLength={8} required autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none transition"
                  placeholder="Re-enter your new password" minLength={8} required />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-500">Passwords do not match</p>
              )}
              <button type="submit" disabled={loading || !resetToken || newPassword.length < 8 || newPassword !== confirmPassword}
                className="w-full py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition disabled:opacity-50">
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
              <button type="button" onClick={goBack} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700">Back to login</button>
            </form>
          )}

          <p className="text-xs text-center text-gray-400 mt-6">
            Powered by NovaStream Digital
          </p>
        </div>
      </div>
    </div>
  );
}
