import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/auth.store';

const emptyForm = {
  name: '',
  date: '',
  isRecurring: false,
  countryCode: 'GH',
};

export default function HolidaysPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role || '');
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: holidays, isLoading } = useQuery({
    queryKey: ['holidays'],
    queryFn: async () => {
      try { return (await api.get('/holidays')).data; } catch { return []; }
    },
  });

  const sortedHolidays = holidays
    ? [...holidays].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/holidays', data),
    onSuccess: () => { toast.success('Holiday created'); closeModal(); queryClient.invalidateQueries({ queryKey: ['holidays'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create holiday'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/holidays/${id}`, data),
    onSuccess: () => { toast.success('Holiday updated'); closeModal(); queryClient.invalidateQueries({ queryKey: ['holidays'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update holiday'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/holidays/${id}`),
    onSuccess: () => { toast.success('Holiday deleted'); setDeleteConfirm(null); queryClient.invalidateQueries({ queryKey: ['holidays'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete holiday'),
  });

  const seedMutation = useMutation({
    mutationFn: () => api.post('/holidays/seed/2026'),
    onSuccess: () => { toast.success('Ghana 2026 holidays seeded'); queryClient.invalidateQueries({ queryKey: ['holidays'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to seed holidays'),
  });

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const openEdit = (h: any) => {
    setEditingId(h.id);
    setForm({
      name: h.name,
      date: h.date?.slice(0, 10) || '',
      isRecurring: h.isRecurring || false,
      countryCode: h.countryCode || 'GH',
    });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      date: form.date,
      isRecurring: form.isRecurring,
      countryCode: form.countryCode,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: { name: payload.name, date: payload.date, isRecurring: payload.isRecurring } });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const isPast = (dateStr: string) => {
    const d = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return d < today;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Holidays</h1>
          <p className="text-gray-500 mt-1">Manage public holidays and non-working days</p>
        </div>
        {isAdminOrAbove && (
          <div className="flex items-center gap-3">
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {seedMutation.isPending ? 'Seeding...' : 'Seed 2026 Holidays'}
            </button>
            <button
              onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }}
              className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90"
            >
              Add Holiday
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-xl border p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-40 mb-3" />
              <div className="h-4 bg-gray-200 rounded w-28" />
            </div>
          ))
        ) : !sortedHolidays.length ? (
          <div className="col-span-full bg-white rounded-xl border p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-gray-500 font-medium">No holidays added yet</p>
            <p className="text-sm text-gray-400 mt-1">Add holidays manually or seed Ghana public holidays</p>
          </div>
        ) : (
          sortedHolidays.map((h: any) => (
            <div key={h.id} className={`bg-white rounded-xl border p-6 hover:shadow-md transition group ${isPast(h.date) ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-lg leading-tight">{h.name}</h3>
                {isAdminOrAbove && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(h)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => setDeleteConfirm(h.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600 mb-3">{formatDate(h.date)}</p>
              <div className="flex items-center gap-2">
                {h.isRecurring && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">Recurring</span>
                )}
                {h.countryCode && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">{h.countryCode}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Holiday' : 'Add Holiday'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Holiday Name</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Independence Day"
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  required
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Country Code</label>
                <input
                  value={form.countryCode}
                  onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                  placeholder="GH"
                  maxLength={2}
                  className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.isRecurring}
                  onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-gray-700">Recurring every year</span>
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

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Holiday</h3>
                <p className="text-sm text-gray-500">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
