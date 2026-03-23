import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { toast } from 'sonner';

const ROLES = ['EMPLOYEE', 'SUPERVISOR', 'DEPARTMENT_HEAD', 'HR_MANAGER', 'ADMIN', 'SUPER_ADMIN'];
const EMPTY_FORM = { email: '', password: '', firstName: '', lastName: '', employeeId: '', departmentId: '', role: 'EMPLOYEE', phoneNumber: '' };

export default function UsersPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role || '');
  const canManageUsers = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'].includes(currentUser?.role || '');
  const isDeptHead = currentUser?.role === 'DEPARTMENT_HEAD';
  const fileRef = useRef<HTMLInputElement>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showADSync, setShowADSync] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [importResults, setImportResults] = useState<{ success: number; failed: number; errors: string[] } | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editForm, setEditForm] = useState({ firstName: '', lastName: '', email: '', employeeId: '', phoneNumber: '', departmentId: '', role: '' });
  const [adConfig, setAdConfig] = useState({ server: '', port: '389', baseDN: '', bindDN: '', bindPassword: '', useTLS: false, userFilter: '(objectClass=user)', defaultRole: 'EMPLOYEE', defaultDepartmentId: '' });
  const [adSyncing, setAdSyncing] = useState(false);
  const [adResults, setAdResults] = useState<{ synced: number; updated: number; failed: number; errors: string[] } | null>(null);
  const perPage = 20;

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, page, roleFilter, deptFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), perPage: String(perPage) });
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (deptFilter) params.set('departmentId', deptFilter);
      if (statusFilter) params.set('isActive', statusFilter);
      return (await api.get(`/users?${params}`)).data;
    },
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/departments')).data,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/users', data),
    onSuccess: () => {
      toast.success('User created');
      setShowCreate(false);
      setForm(EMPTY_FORM);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create user'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/users/${id}`, data),
    onSuccess: () => {
      toast.success('User updated');
      setEditUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update user'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/users/${id}`, { isActive }),
    onSuccess: () => { toast.success('Updated'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('User permanently deleted');
      setDeleteConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete user'),
  });

  const openEdit = (u: any) => {
    setEditUser(u);
    setEditForm({
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      employeeId: u.employeeId,
      phoneNumber: u.phoneNumber || '',
      departmentId: u.departmentId || '',
      role: u.role,
    });
  };

  const roleBadge = (role: string) => {
    const m: Record<string, string> = { SUPER_ADMIN: 'bg-red-100 text-red-800', ADMIN: 'bg-blue-100 text-blue-800', HR_MANAGER: 'bg-purple-100 text-purple-800', DEPARTMENT_HEAD: 'bg-indigo-100 text-indigo-800', SUPERVISOR: 'bg-teal-100 text-teal-800', EMPLOYEE: 'bg-gray-100 text-gray-800' };
    return m[role] || 'bg-gray-100 text-gray-800';
  };

  const exportCSV = () => {
    if (!data?.data?.length) return;
    const headers = ['Employee ID', 'First Name', 'Last Name', 'Email', 'Department', 'Role', 'Status', 'Phone', 'Last Login'];
    const rows = data.data.map((u: any) => [
      u.employeeId, u.firstName, u.lastName, u.email,
      u.department?.name || '', u.role, u.isActive ? 'Active' : 'Inactive',
      u.phoneNumber || '', u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never',
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `users-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const handleCSVImport = async (file: File) => {
    const text = await file.text();
    const lines = text.split('\n').filter((l) => l.trim());
    if (lines.length < 2) { toast.error('CSV file is empty or has no data rows'); return; }

    const headers = lines[0].split(',').map((h) => h.replace(/"/g, '').trim().toLowerCase());
    const requiredFields = ['first name', 'last name', 'email', 'employee id'];
    const missing = requiredFields.filter((f) => !headers.includes(f));
    if (missing.length) { toast.error(`Missing required columns: ${missing.join(', ')}`); return; }

    const results = { success: 0, failed: 0, errors: [] as string[] };
    const deptMap = new Map((departments || []).map((d: any) => [d.name.toLowerCase(), d.id]));

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^,]+)/g)?.map((v) => v.replace(/^"|"$/g, '').trim()) || [];
      const row: Record<string, string> = {};
      headers.forEach((h, j) => { row[h] = values[j] || ''; });

      try {
        const deptId = row['department'] ? deptMap.get(row['department'].toLowerCase()) : undefined;
        await api.post('/users', {
          firstName: row['first name'],
          lastName: row['last name'],
          email: row['email'],
          employeeId: row['employee id'],
          password: row['password'] || 'Welcome@123',
          role: row['role']?.toUpperCase().replace(/ /g, '_') || 'EMPLOYEE',
          departmentId: deptId || '',
          phoneNumber: row['phone'] || row['phone number'] || '',
        });
        results.success++;
      } catch (e: any) {
        results.failed++;
        results.errors.push(`Row ${i + 1} (${row['email']}): ${e.response?.data?.message || 'Failed'}`);
      }
    }

    setImportResults(results);
    queryClient.invalidateQueries({ queryKey: ['users'] });
    if (results.success > 0) toast.success(`${results.success} users imported successfully`);
    if (results.failed > 0) toast.error(`${results.failed} users failed to import`);
  };

  const downloadTemplate = () => {
    const csv = '"First Name","Last Name","Email","Employee ID","Department","Role","Phone","Password"\n"John","Doe","john@example.com","EMP001","IT Department","EMPLOYEE","0201234567","Welcome@123"';
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'users-import-template.csv';
    a.click();
  };

  const handleADSync = async () => {
    if (!adConfig.server || !adConfig.baseDN) { toast.error('Server and Base DN are required'); return; }
    setAdSyncing(true);
    setAdResults(null);
    try {
      const res = await api.post('/users/ad-sync', adConfig);
      setAdResults(res.data);
      queryClient.invalidateQueries({ queryKey: ['users'] });
      if (res.data.synced > 0) toast.success(`${res.data.synced} users synced from Active Directory`);
    } catch (e: any) {
      toast.error(e.response?.data?.message || 'AD sync failed');
      setAdResults({ synced: 0, updated: 0, failed: 0, errors: [e.response?.data?.message || 'Connection failed'] });
    } finally {
      setAdSyncing(false);
    }
  };

  const totalPages = data?.meta?.totalPages || 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-gray-500 mt-1">{data?.meta?.total || 0} {isDeptHead ? 'department members' : 'total employees'}</p>
        </div>
        <div className="flex gap-2">
          {isAdminOrAbove && (
            <button onClick={() => setShowADSync(true)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2" title="Sync from Active Directory">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              AD Sync
            </button>
          )}
          {canManageUsers && (
            <button onClick={() => setShowImport(true)} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              Import CSV
            </button>
          )}
          <button onClick={exportCSV} className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Export
          </button>
          {canManageUsers && (
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90">Add User</button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b flex flex-wrap gap-3">
          <input type="text" placeholder="Search by name, email, or employee ID..." value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="flex-1 min-w-[200px] px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-primary focus:border-transparent outline-none" />
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border text-sm">
            <option value="">All Roles</option>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border text-sm">
            <option value="">All Departments</option>
            {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 rounded-lg border text-sm">
            <option value="">All Status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">ID</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Last Login</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr></thead>
            <tbody>
              {isLoading ? [...Array(5)].map((_, i) => (
                <tr key={i} className="border-b">{[...Array(7)].map((_, j) => <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-20 animate-pulse" /></td>)}</tr>
              )) : !data?.data?.length ? (
                <tr><td colSpan={7} className="py-12 text-center text-gray-400">No users found</td></tr>
              ) : data.data.map((u: any) => (
                <tr key={u.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center text-xs font-medium">{u.firstName?.[0]}{u.lastName?.[0]}</div>
                      <div><p className="text-sm font-medium">{u.firstName} {u.lastName}</p><p className="text-xs text-gray-500">{u.email}</p></div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm font-mono">{u.employeeId}</td>
                  <td className="py-3 px-4 text-sm">{u.department?.name || '-'}</td>
                  <td className="py-3 px-4"><span className={`text-xs px-2 py-0.5 rounded-full ${roleBadge(u.role)}`}>{u.role.replace(/_/g, ' ')}</span></td>
                  <td className="py-3 px-4"><span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{u.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td className="py-3 px-4 text-sm text-gray-500">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : 'Never'}</td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1">
                      {canManageUsers && (
                        <button onClick={() => openEdit(u)} className="text-xs px-3 py-1 rounded text-blue-600 hover:bg-blue-50">Edit</button>
                      )}
                      {isAdminOrAbove && (
                        <button onClick={() => toggleMutation.mutate({ id: u.id, isActive: !u.isActive })}
                          className={`text-xs px-3 py-1 rounded ${u.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                          {u.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}
                      {isSuperAdmin && u.id !== currentUser?.id && (
                        <button onClick={() => setDeleteConfirm(u)} className="text-xs px-3 py-1 rounded text-red-600 hover:bg-red-50" title="Permanently delete user">Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * perPage) + 1}–{Math.min(page * perPage, data?.meta?.total || 0)} of {data?.meta?.total || 0}
            </p>
            <div className="flex gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50">First</button>
              <button onClick={() => setPage(page - 1)} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50">Prev</button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                if (p > totalPages) return null;
                return <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 rounded border text-sm ${p === page ? 'bg-primary text-white border-primary' : 'hover:bg-gray-50'}`}>{p}</button>;
              })}
              <button onClick={() => setPage(page + 1)} disabled={page >= totalPages} className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50">Next</button>
              <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="px-3 py-1 rounded border text-sm disabled:opacity-40 hover:bg-gray-50">Last</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Add New User</h2>
            <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate(form); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name</label><input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label><input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label><input required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option>
                    {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                    {ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Password</label><input required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50">{createMutation.isPending ? 'Creating...' : 'Create User'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setEditUser(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Edit User</h2>
            <form onSubmit={(e) => { e.preventDefault(); updateMutation.mutate({ id: editUser.id, data: editForm }); }} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">First Name</label><input required value={editForm.firstName} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label><input required value={editForm.lastName} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" required value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Employee ID</label><input required value={editForm.employeeId} onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input value={editForm.phoneNumber} onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                  <select value={editForm.departmentId} onChange={(e) => setEditForm({ ...editForm, departmentId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                    <option value="">Select...</option>
                    {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                  <select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                    {ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditUser(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={updateMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 disabled:opacity-50">{updateMutation.isPending ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import CSV Modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowImport(false); setImportResults(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Import Users from CSV</h2>
            <p className="text-sm text-gray-500 mb-4">Upload a CSV file with user data. Required columns: First Name, Last Name, Email, Employee ID</p>

            {!importResults ? (
              <div className="space-y-4">
                <div onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary hover:bg-primary/5 transition">
                  <svg className="w-10 h-10 mx-auto text-gray-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  <p className="text-sm font-medium text-gray-700">Click to select CSV file</p>
                  <p className="text-xs text-gray-400 mt-1">CSV format with headers</p>
                </div>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleCSVImport(file);
                  e.target.value = '';
                }} />
                <div className="flex items-center justify-between">
                  <button onClick={downloadTemplate} className="text-sm text-primary hover:underline">Download template CSV</button>
                  <button onClick={() => { setShowImport(false); setImportResults(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{importResults.success}</p>
                    <p className="text-sm text-green-600">Imported</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">{importResults.failed}</p>
                    <p className="text-sm text-red-600">Failed</p>
                  </div>
                </div>
                {importResults.errors.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <p className="text-xs font-medium text-red-800 mb-2">Errors:</p>
                    {importResults.errors.map((err, i) => <p key={i} className="text-xs text-red-600 mb-1">{err}</p>)}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={() => { setShowImport(false); setImportResults(null); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </div>
              <h2 className="text-lg font-semibold text-red-800">Delete User</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">Are you sure you want to permanently delete:</p>
            <p className="text-sm font-semibold mb-1">{deleteConfirm.firstName} {deleteConfirm.lastName}</p>
            <p className="text-xs text-gray-500 mb-4">{deleteConfirm.email}</p>
            <div className="bg-red-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-red-700">This action is irreversible. All attendance records, leave requests, and other data associated with this user will be permanently deleted.</p>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm.id)} disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AD Sync Modal */}
      {showADSync && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setShowADSync(false); setAdResults(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-1">
              <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" /></svg>
              <h2 className="text-lg font-semibold">Active Directory Sync</h2>
            </div>
            <p className="text-sm text-gray-500 mb-4">Connect to your organization's Active Directory / LDAP server to import and sync users automatically.</p>

            {!adResults ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><label className="block text-sm font-medium text-gray-700 mb-1">LDAP Server</label><input placeholder="ldap.cagd.gov.gh" value={adConfig.server} onChange={(e) => setAdConfig({ ...adConfig, server: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none text-sm" /></div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Port</label><input value={adConfig.port} onChange={(e) => setAdConfig({ ...adConfig, port: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none text-sm" /></div>
                </div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Base DN</label><input placeholder="DC=cagd,DC=gov,DC=gh" value={adConfig.baseDN} onChange={(e) => setAdConfig({ ...adConfig, baseDN: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bind DN (Service Account)</label><input placeholder="CN=svc-timetrack,OU=Service Accounts,DC=cagd,DC=gov,DC=gh" value={adConfig.bindDN} onChange={(e) => setAdConfig({ ...adConfig, bindDN: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bind Password</label><input type="password" value={adConfig.bindPassword} onChange={(e) => setAdConfig({ ...adConfig, bindPassword: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">User Search Filter</label><input value={adConfig.userFilter} onChange={(e) => setAdConfig({ ...adConfig, userFilter: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none text-sm font-mono text-xs" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Default Role</label>
                    <select value={adConfig.defaultRole} onChange={(e) => setAdConfig({ ...adConfig, defaultRole: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm">
                      {ROLES.filter((r) => r !== 'SUPER_ADMIN').map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div><label className="block text-sm font-medium text-gray-700 mb-1">Default Department</label>
                    <select value={adConfig.defaultDepartmentId} onChange={(e) => setAdConfig({ ...adConfig, defaultDepartmentId: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm">
                      <option value="">Select...</option>
                      {(departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={adConfig.useTLS} onChange={(e) => setAdConfig({ ...adConfig, useTLS: e.target.checked })} className="rounded" />
                  <span className="text-sm text-gray-700">Use TLS / LDAPS (port 636)</span>
                </label>
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-800"><strong>How it works:</strong> TimeTrack connects to your AD server, fetches users matching the filter, and creates/updates accounts. Existing users (matched by email) are updated. New users get the default password <code className="bg-blue-100 px-1 rounded">Welcome@123</code>.</p>
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <button type="button" onClick={() => { setShowADSync(false); setAdResults(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                  <button onClick={handleADSync} disabled={adSyncing || !adConfig.server || !adConfig.baseDN}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                    {adSyncing && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                    {adSyncing ? 'Syncing...' : 'Start Sync'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-green-700">{adResults.synced}</p>
                    <p className="text-sm text-green-600">New Users</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-blue-700">{adResults.updated}</p>
                    <p className="text-sm text-blue-600">Updated</p>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <p className="text-2xl font-bold text-red-700">{adResults.failed}</p>
                    <p className="text-sm text-red-600">Failed</p>
                  </div>
                </div>
                {adResults.errors.length > 0 && (
                  <div className="bg-red-50 rounded-lg p-3 max-h-40 overflow-y-auto">
                    <p className="text-xs font-medium text-red-800 mb-2">Errors:</p>
                    {adResults.errors.map((err, i) => <p key={i} className="text-xs text-red-600 mb-1">{err}</p>)}
                  </div>
                )}
                <div className="flex justify-end">
                  <button onClick={() => { setShowADSync(false); setAdResults(null); }} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
