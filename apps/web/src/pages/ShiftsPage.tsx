import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/auth.store';

const SHIFT_TYPES = ['MORNING', 'AFTERNOON', 'NIGHT', 'FLEXIBLE', 'SPLIT', 'CUSTOM'] as const;

const typeColors: Record<string, string> = {
  MORNING: 'bg-amber-100 text-amber-800',
  AFTERNOON: 'bg-blue-100 text-blue-800',
  NIGHT: 'bg-indigo-100 text-indigo-800',
  FLEXIBLE: 'bg-green-100 text-green-800',
  SPLIT: 'bg-purple-100 text-purple-800',
  CUSTOM: 'bg-gray-100 text-gray-800',
};

const emptyForm = {
  name: '',
  type: 'MORNING' as string,
  startTime: '08:00',
  endTime: '17:00',
  graceMinutesLate: '15',
  graceMinutesEarly: '15',
  breakDurationMinutes: '60',
  isDefault: false,
};

const emptyAssignForm = {
  userId: '',
  shiftId: '',
  startDate: new Date().toISOString().split('T')[0],
  endDate: '',
};

export default function ShiftsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role || '');
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // Shift CRUD state
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Assignment state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [deleteAssignConfirm, setDeleteAssignConfirm] = useState<string | null>(null);

  // ── Shifts queries & mutations ──

  const { data: shifts, isLoading } = useQuery({
    queryKey: ['shifts'],
    queryFn: async () => {
      try { return (await api.get('/shifts')).data; } catch { return []; }
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/shifts', {
      ...data,
      graceMinutesLate: parseInt(data.graceMinutesLate),
      graceMinutesEarly: parseInt(data.graceMinutesEarly),
      breakDurationMinutes: parseInt(data.breakDurationMinutes),
    }),
    onSuccess: () => { toast.success('Shift created'); closeModal(); queryClient.invalidateQueries({ queryKey: ['shifts'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create shift'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/shifts/${id}`, {
      ...data,
      graceMinutesLate: parseInt(data.graceMinutesLate),
      graceMinutesEarly: parseInt(data.graceMinutesEarly),
      breakDurationMinutes: parseInt(data.breakDurationMinutes),
    }),
    onSuccess: () => { toast.success('Shift updated'); closeModal(); queryClient.invalidateQueries({ queryKey: ['shifts'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update shift'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/${id}`),
    onSuccess: () => { toast.success('Shift deleted'); setDeleteConfirm(null); queryClient.invalidateQueries({ queryKey: ['shifts'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete shift'),
  });

  // ── Assignment queries & mutations ──

  const { data: assignments, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['shift-assignments'],
    queryFn: async () => {
      try { return (await api.get('/shifts/assignments/all')).data; } catch { return []; }
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-active'],
    queryFn: async () => {
      try { return (await api.get('/users?isActive=true&perPage=100')).data; } catch { return { data: [], total: 0 }; }
    },
    enabled: isAdminOrAbove,
  });

  const activeUsers = usersData?.data || [];

  const assignMutation = useMutation({
    mutationFn: (data: { userId: string; shiftId: string; startDate: string; endDate?: string }) => {
      const payload: any = { userId: data.userId, shiftId: data.shiftId, startDate: data.startDate };
      if (data.endDate) payload.endDate = data.endDate;
      return api.post('/shifts/assignments', payload);
    },
    onSuccess: () => {
      toast.success('Shift assigned successfully');
      closeAssignModal();
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to assign shift'),
  });

  const deleteAssignMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/shifts/assignments/${id}`),
    onSuccess: () => {
      toast.success('Assignment removed');
      setDeleteAssignConfirm(null);
      queryClient.invalidateQueries({ queryKey: ['shift-assignments'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to remove assignment'),
  });

  // ── Handlers ──

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const openEdit = (s: any) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      type: s.type,
      startTime: s.startTime,
      endTime: s.endTime,
      graceMinutesLate: String(s.graceMinutesLate),
      graceMinutesEarly: String(s.graceMinutesEarly),
      breakDurationMinutes: String(s.breakDurationMinutes),
      isDefault: s.isDefault,
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const closeAssignModal = () => { setShowAssignModal(false); setAssignForm(emptyAssignForm); };

  const handleAssignSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    assignMutation.mutate({
      userId: assignForm.userId,
      shiftId: assignForm.shiftId,
      startDate: assignForm.startDate,
      endDate: assignForm.endDate || undefined,
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Shifts</h1><p className="text-gray-500 mt-1">Manage work schedules and shifts</p></div>
        {isAdminOrAbove && (
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90">Add Shift</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? [...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-6 animate-pulse"><div className="h-5 bg-gray-200 rounded w-32 mb-3" /><div className="h-4 bg-gray-200 rounded w-20" /></div>)
          : !shifts?.length ? (
            <div className="col-span-full bg-white rounded-xl border p-12 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <p className="text-gray-500 font-medium">No shifts created yet</p>
              <p className="text-sm text-gray-400 mt-1">Create shifts for different teams and schedules</p>
            </div>
          )
          : shifts.map((s: any) => (
            <div key={s.id} className="bg-white rounded-xl border p-6 hover:shadow-md transition group">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-lg">{s.name}</h3>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[s.type] || typeColors.CUSTOM}`}>{s.type}</span>
                  {isAdminOrAbove && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => openEdit(s)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      {isSuperAdmin && !s.isDefault && (
                        <button onClick={() => setDeleteConfirm(s.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Start</span><span className="font-medium">{s.startTime}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">End</span><span className="font-medium">{s.endTime}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Grace (Late)</span><span>{s.graceMinutesLate} min</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Grace (Early)</span><span>{s.graceMinutesEarly} min</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Break</span><span>{s.breakDurationMinutes} min</span></div>
              </div>
              {s.isDefault && <div className="mt-3 pt-3 border-t"><span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Default Shift</span></div>}
            </div>
          ))}
      </div>

      {/* ── Shift Assignments Section ── */}
      <div className="flex items-center justify-between">
        <div><h2 className="text-xl font-bold">Shift Assignments</h2><p className="text-gray-500 mt-1">Assign employees to shifts</p></div>
        {isAdminOrAbove && (
          <button onClick={() => { setAssignForm(emptyAssignForm); setShowAssignModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90">Assign Shift</button>
        )}
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {assignmentsLoading ? (
          <div className="p-6 space-y-3 animate-pulse">
            {[...Array(3)].map((_, i) => <div key={i} className="h-4 bg-gray-200 rounded w-full" />)}
          </div>
        ) : !assignments?.length ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            <p className="text-gray-500 font-medium">No shift assignments yet</p>
            <p className="text-sm text-gray-400 mt-1">Assign employees to their respective shifts</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Employee</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Department</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Shift</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Time</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">Start Date</th>
                  <th className="text-left py-3 px-4 font-medium text-gray-600">End Date</th>
                  {isAdminOrAbove && <th className="text-right py-3 px-4 font-medium text-gray-600">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {assignments.map((a: any) => (
                  <tr key={a.id} className="hover:bg-gray-50 transition">
                    <td className="py-3 px-4">
                      <div className="font-medium text-gray-900">{a.user?.firstName} {a.user?.lastName}</div>
                      <div className="text-xs text-gray-400">{a.user?.employeeId}</div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{a.user?.department?.name || '-'}</td>
                    <td className="py-3 px-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${typeColors[a.shift?.type] || typeColors.CUSTOM}`}>{a.shift?.name}</span>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{a.shift?.startTime} - {a.shift?.endTime}</td>
                    <td className="py-3 px-4 text-gray-600">{a.startDate ? new Date(a.startDate).toLocaleDateString() : '-'}</td>
                    <td className="py-3 px-4 text-gray-600">{a.endDate ? new Date(a.endDate).toLocaleDateString() : <span className="text-gray-400 italic">Ongoing</span>}</td>
                    {isAdminOrAbove && (
                      <td className="py-3 px-4 text-right">
                        <button onClick={() => setDeleteAssignConfirm(a.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Remove assignment">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Shift Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Shift' : 'Add Shift'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Shift Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning Shift" className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>

              <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                  {SHIFT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label><input required type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">End Time</label><input required type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Grace Late (min)</label><input required type="number" min="0" value={form.graceMinutesLate} onChange={(e) => setForm({ ...form, graceMinutesLate: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Grace Early (min)</label><input required type="number" min="0" value={form.graceMinutesEarly} onChange={(e) => setForm({ ...form, graceMinutesEarly: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>

              <div><label className="block text-sm font-medium text-gray-700 mb-1">Break Duration (min)</label><input required type="number" min="0" value={form.breakDurationMinutes} onChange={(e) => setForm({ ...form, breakDurationMinutes: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary" />
                <span className="text-sm text-gray-700">Set as default shift</span>
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={isPending} className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50">
                  {isPending ? (editingId ? 'Updating...' : 'Creating...') : (editingId ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Shift Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Shift</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Shift Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeAssignModal}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Assign Shift</h2>
            <form onSubmit={handleAssignSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select required value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select employee...</option>
                  {activeUsers.map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} {u.employeeId ? `(${u.employeeId})` : ''}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
                <select required value={assignForm.shiftId} onChange={(e) => setAssignForm({ ...assignForm, shiftId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select shift...</option>
                  {(shifts || []).map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input required type="date" value={assignForm.startDate} onChange={(e) => setAssignForm({ ...assignForm, startDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-gray-400">(optional)</span></label>
                  <input type="date" value={assignForm.endDate} onChange={(e) => setAssignForm({ ...assignForm, endDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeAssignModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={assignMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50">
                  {assignMutation.isPending ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Assignment Confirmation */}
      {deleteAssignConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteAssignConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Remove Assignment</h3>
                <p className="text-sm text-gray-500">This will unassign the employee from this shift.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteAssignConfirm(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={() => deleteAssignMutation.mutate(deleteAssignConfirm)} disabled={deleteAssignMutation.isPending} className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50">
                {deleteAssignMutation.isPending ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
