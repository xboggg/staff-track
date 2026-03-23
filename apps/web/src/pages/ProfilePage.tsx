import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [show2FASetup, setShow2FASetup] = useState(false);
  const [qrUri, setQrUri] = useState('');
  const [totpCode, setTotpCode] = useState('');

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) throw new Error('Passwords do not match');
      return api.post('/auth/change-password', { currentPassword, newPassword });
    },
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      alert('Password changed successfully');
    },
    onError: (err: any) => alert(err?.response?.data?.message || err.message || 'Failed to change password'),
  });

  const enable2FAMutation = useMutation({
    mutationFn: async () => (await api.post('/auth/2fa/enable')).data,
    onSuccess: (data) => {
      setQrUri(data.otpauthUrl || data.qrCodeUrl || '');
      setShow2FASetup(true);
    },
  });

  const confirm2FAMutation = useMutation({
    mutationFn: async () => api.post('/auth/2fa/confirm', { code: totpCode }),
    onSuccess: () => {
      setShow2FASetup(false);
      setTotpCode('');
      alert('Two-factor authentication enabled');
    },
    onError: () => alert('Invalid code. Please try again.'),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Profile</h1>
        <p className="text-gray-500 mt-1">Manage your account settings</p>
      </div>

      {/* User Info */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center text-xl font-bold text-primary">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{user?.firstName} {user?.lastName}</h2>
            <p className="text-gray-500">{user?.email}</p>
            <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{user?.role}</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-gray-500">Employee ID:</span> <span className="font-medium">{user?.employeeId || '-'}</span></div>
          <div><span className="text-gray-500">Department:</span> <span className="font-medium">{(user as any)?.department?.name || '-'}</span></div>
          <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{user?.phone || '-'}</span></div>
          <div><span className="text-gray-500">Status:</span> <span className={`font-medium ${user?.isActive ? 'text-green-600' : 'text-red-600'}`}>{user?.isActive ? 'Active' : 'Inactive'}</span></div>
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Password</h3>
          <button onClick={() => setShowPasswordForm(!showPasswordForm)} className="text-sm text-primary hover:underline">
            {showPasswordForm ? 'Cancel' : 'Change Password'}
          </button>
        </div>
        {showPasswordForm && (
          <div className="space-y-3">
            <input type="password" placeholder="Current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            <button
              onClick={() => changePasswordMutation.mutate()}
              disabled={changePasswordMutation.isPending || !currentPassword || !newPassword || newPassword.length < 8}
              className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50"
            >
              {changePasswordMutation.isPending ? 'Changing...' : 'Update Password'}
            </button>
          </div>
        )}
      </div>

      {/* Two-Factor Auth */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Two-Factor Authentication</h3>
            <p className="text-sm text-gray-500 mt-1">Add an extra layer of security to your account</p>
          </div>
          {!show2FASetup && (
            <button onClick={() => enable2FAMutation.mutate()} disabled={enable2FAMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
              {enable2FAMutation.isPending ? 'Setting up...' : 'Enable 2FA'}
            </button>
          )}
        </div>
        {show2FASetup && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.):</p>
            {qrUri && <div className="bg-gray-50 p-4 rounded-lg text-center"><code className="text-xs break-all">{qrUri}</code></div>}
            <div className="flex gap-2">
              <input type="text" placeholder="Enter 6-digit code" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg text-sm" maxLength={6} />
              <button onClick={() => confirm2FAMutation.mutate()} disabled={confirm2FAMutation.isPending || totpCode.length !== 6} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                {confirm2FAMutation.isPending ? 'Verifying...' : 'Verify & Enable'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
