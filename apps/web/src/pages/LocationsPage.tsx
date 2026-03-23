import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/auth.store';
import { usePlaceSearch, PlaceResult } from '../hooks/useGooglePlaces';

const emptyForm = { name: '', address: '', latitude: '', longitude: '', radiusMeters: '100', timezone: 'Africa/Accra', building: '', floor: '' };

function PlaceSearchInput({ onSelect }: { onSelect: (place: PlaceResult) => void }) {
  const [query, setQuery] = useState('');
  const { results, searching, search, clear } = usePlaceSearch();

  const handleSelect = (place: PlaceResult) => {
    onSelect(place);
    setQuery(place.name);
    clear();
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Search Place</label>
      <div className="relative">
        <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); search(e.target.value); }}
          onFocus={() => { if (query.length >= 3) search(query); }}
          placeholder="Search for a company or place..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none"
        />
        {searching && (
          <div className="absolute right-3 top-2.5">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>
      {results.length > 0 && (
        <div className="mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto z-50 relative">
          {results.map((place, i) => (
            <button key={i} type="button" onClick={() => handleSelect(place)} className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-start gap-2 border-b last:border-0">
              <svg className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{place.name}</p>
                <p className="text-xs text-gray-500 truncate">{place.address}</p>
              </div>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-1">Type a company name or address to auto-fill coordinates</p>
    </div>
  );
}

export default function LocationsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role || '');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const { data: locations, isLoading } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/locations', { ...data, latitude: parseFloat(data.latitude), longitude: parseFloat(data.longitude), radiusMeters: parseInt(data.radiusMeters), building: data.building || undefined, floor: data.floor || undefined }),
    onSuccess: () => { toast.success('Location created'); closeModal(); queryClient.invalidateQueries({ queryKey: ['locations'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/locations/${id}`, { ...data, latitude: parseFloat(data.latitude), longitude: parseFloat(data.longitude), radiusMeters: parseInt(data.radiusMeters), building: data.building || undefined, floor: data.floor || undefined }),
    onSuccess: () => { toast.success('Location updated'); closeModal(); queryClient.invalidateQueries({ queryKey: ['locations'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/locations/${id}`),
    onSuccess: () => { toast.success('Location deleted'); setDeleteConfirm(null); queryClient.invalidateQueries({ queryKey: ['locations'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const openEdit = (l: any) => {
    setEditingId(l.id);
    setForm({ name: l.name, address: l.address || '', latitude: String(l.latitude), longitude: String(l.longitude), radiusMeters: String(l.radiusMeters), timezone: l.timezone || 'Africa/Accra', building: l.building || '', floor: l.floor || '' });
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

  const detectLocation = () => {
    if (!navigator.geolocation) { toast.error('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })),
      () => toast.error('Location access denied'),
    );
  };

  const handlePlaceSelect = (place: PlaceResult) => {
    setForm((f) => ({
      ...f,
      name: f.name || place.name,
      address: place.address,
      latitude: place.latitude.toFixed(6),
      longitude: place.longitude.toFixed(6),
    }));
    toast.success(`Selected: ${place.name}`);
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Locations</h1><p className="text-gray-500 mt-1">Manage office locations and geofences</p></div>
        {isAdminOrAbove && (
          <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90">Add Location</button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? [...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-6 animate-pulse"><div className="h-5 bg-gray-200 rounded w-32 mb-3" /><div className="h-4 bg-gray-200 rounded w-48" /></div>)
          : locations?.map((l: any) => (
            <div key={l.id} className="bg-white rounded-xl border p-6 hover:shadow-md transition group">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold">{l.name}</h3>
                  <p className="text-sm text-gray-500 truncate">{l.address}</p>
                </div>
                {isAdminOrAbove && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => openEdit(l)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    {isSuperAdmin && (
                      <button onClick={() => setDeleteConfirm(l.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Delete">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Latitude</span><p className="font-mono text-xs">{l.latitude}</p></div>
                <div className="bg-gray-50 rounded p-2"><span className="text-gray-500">Longitude</span><p className="font-mono text-xs">{l.longitude}</p></div>
              </div>
              {(l.building || l.floor) && (
                <div className="mt-2 flex gap-2 text-xs">
                  {l.building && <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded">{l.building}</span>}
                  {l.floor && <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded">{l.floor}</span>}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-gray-500">Radius: <span className="font-medium text-gray-900">{l.radiusMeters}m</span></span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${l.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>{l.isActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          ))}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeModal}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">{editingId ? 'Edit Location' : 'Add Location'}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <PlaceSearchInput onSelect={handlePlaceSelect} />

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                <div className="relative flex justify-center"><span className="bg-white px-2 text-xs text-gray-400">or enter manually</span></div>
              </div>

              <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><input required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Latitude</label><input required type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Longitude</label><input required type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <button type="button" onClick={detectLocation} className="text-sm text-blue-600 hover:text-blue-800">Use my current location</button>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Building</label><input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} placeholder="e.g. Block A" className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Floor</label><input value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} placeholder="e.g. 3rd Floor" className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Radius (m)</label><input required type="number" value={form.radiusMeters} onChange={(e) => setForm({ ...form, radiusMeters: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label><input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
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
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Delete Location</h3>
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
    </div>
  );
}
