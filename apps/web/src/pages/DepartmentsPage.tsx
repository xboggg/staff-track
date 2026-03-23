import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { useAuthStore } from '../stores/auth.store';

const emptyForm = { name: '', code: '', parentId: '' };

interface DeptNode {
  id: string;
  name: string;
  code: string;
  parentId?: string | null;
  parent?: { id: string; name: string } | null;
  head?: { firstName: string; lastName: string } | null;
  _count?: { users: number };
  children?: DeptNode[];
}

function buildTree(departments: DeptNode[]): DeptNode[] {
  const map = new Map<string, DeptNode>();
  const roots: DeptNode[] = [];
  departments.forEach((d) => map.set(d.id, { ...d, children: [] }));
  map.forEach((node) => {
    const pid = node.parentId || node.parent?.id;
    if (pid && map.has(pid)) {
      map.get(pid)!.children!.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function countAllStaff(node: DeptNode): number {
  let total = node._count?.users || 0;
  if (node.children) {
    for (const child of node.children) total += countAllStaff(child);
  }
  return total;
}

function countAllChildren(node: DeptNode): number {
  let total = node.children?.length || 0;
  if (node.children) {
    for (const child of node.children) total += countAllChildren(child);
  }
  return total;
}

export default function DepartmentsPage() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const isAdminOrAbove = ['SUPER_ADMIN', 'ADMIN'].includes(currentUser?.role || '');

  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: departments, isLoading } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/departments')).data,
  });

  const tree = useMemo(() => {
    if (!departments?.length) return [];
    const allIds = new Set(departments.map((d: DeptNode) => d.id));
    if (expanded.size === 0 && allIds.size > 0) setExpanded(allIds);
    return buildTree(departments);
  }, [departments]);

  const flatMap = useMemo(() => {
    const m = new Map<string, DeptNode>();
    if (departments) departments.forEach((d: DeptNode) => m.set(d.id, d));
    return m;
  }, [departments]);

  const totalStaff = useMemo(() => departments?.reduce((sum: number, d: DeptNode) => sum + (d._count?.users || 0), 0) || 0, [departments]);
  const topLevelCount = tree.length;

  const selected = useMemo(() => {
    if (!selectedId || !departments) return null;
    // Find from tree to get children
    const findInTree = (nodes: DeptNode[]): DeptNode | null => {
      for (const n of nodes) {
        if (n.id === selectedId) return n;
        if (n.children) {
          const found = findInTree(n.children);
          if (found) return found;
        }
      }
      return null;
    };
    return findInTree(tree);
  }, [selectedId, tree, departments]);

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/departments', { ...data, parentId: data.parentId || undefined }),
    onSuccess: () => { toast.success('Department created'); closeModal(); queryClient.invalidateQueries({ queryKey: ['departments'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to create department'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.put(`/departments/${id}`, { ...data, parentId: data.parentId || undefined }),
    onSuccess: () => { toast.success('Department updated'); closeModal(); queryClient.invalidateQueries({ queryKey: ['departments'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to update department'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      toast.success('Department deleted');
      setDeleteConfirm(null);
      if (selectedId === deleteConfirm) setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ['departments'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to delete department'),
  });

  const closeModal = () => { setShowModal(false); setEditingId(null); setForm(emptyForm); };

  const openEdit = (d: DeptNode) => {
    setEditingId(d.id);
    setForm({ name: d.name, code: d.code || '', parentId: d.parent?.id || d.parentId || '' });
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    editingId ? updateMutation.mutate({ id: editingId, data: form }) : createMutation.mutate(form);
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const parentOptions = departments?.filter((d: any) => d.id !== editingId) || [];

  // --- Tree row (compact sidebar item) ---
  const TreeRow = ({ dept, level = 0 }: { dept: DeptNode; level?: number }) => {
    const hasChildren = dept.children && dept.children.length > 0;
    const isExpanded = expanded.has(dept.id);
    const isSelected = selectedId === dept.id;
    const staffCount = dept._count?.users || 0;

    return (
      <>
        <button
          onClick={() => setSelectedId(dept.id)}
          className={`w-full text-left flex items-center gap-2 py-2 px-3 rounded-lg transition-all text-sm group/row
            ${isSelected ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-gray-50 text-gray-700'}`}
          style={{ paddingLeft: `${12 + level * 20}px` }}
        >
          {/* Expand toggle */}
          {hasChildren ? (
            <span
              onClick={(e) => { e.stopPropagation(); toggleExpand(dept.id); }}
              className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors
                ${isSelected ? 'text-primary' : 'text-gray-400 hover:text-gray-600'}`}
            >
              <svg className={`w-3.5 h-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
            </span>
          ) : (
            <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
              <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-primary' : 'bg-gray-300'}`} />
            </span>
          )}

          {/* Name + code */}
          <span className="truncate flex-1">{dept.name}</span>
          <span className={`text-[10px] font-mono flex-shrink-0 ${isSelected ? 'text-primary/60' : 'text-gray-400'}`}>{dept.code}</span>
          <span className={`text-[10px] flex-shrink-0 tabular-nums ${isSelected ? 'text-primary/60' : 'text-gray-400'}`}>{staffCount}</span>
        </button>

        {hasChildren && isExpanded && dept.children!.map((child) => (
          <TreeRow key={child.id} dept={child} level={level + 1} />
        ))}
      </>
    );
  };

  // --- Loading state ---
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><div className="h-7 bg-gray-200 rounded w-48 mb-2 animate-pulse" /><div className="h-4 bg-gray-200 rounded w-64 animate-pulse" /></div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl border p-4 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-9 bg-gray-100 rounded-lg animate-pulse" />)}
          </div>
          <div className="lg:col-span-2 bg-white rounded-xl border p-6">
            <div className="h-6 bg-gray-200 rounded w-40 mb-4 animate-pulse" />
            <div className="grid grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          </div>
        </div>
      </div>
    );
  }

  // --- Empty state ---
  if (!departments?.length) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-2xl font-bold text-gray-900">Departments</h1><p className="text-gray-500 mt-1">Organizational structure & hierarchy</p></div>
          {isAdminOrAbove && (
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Add Department
            </button>
          )}
        </div>
        <div className="bg-white rounded-xl border p-16 text-center">
          <div className="w-20 h-20 mx-auto mb-5 bg-gradient-to-br from-primary/10 to-violet-100 rounded-2xl flex items-center justify-center">
            <svg className="w-10 h-10 text-primary/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          </div>
          <p className="text-gray-600 font-semibold text-lg">No departments yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">Create your first department to start building the org structure</p>
          {isAdminOrAbove && (
            <button onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }} className="px-5 py-2.5 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 inline-flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              Create Department
            </button>
          )}
        </div>
        {renderModal()}
      </div>
    );
  }

  function renderModal() {
    return (
      <>
        {showModal && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={closeModal}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto border" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-semibold">{editingId ? 'Edit Department' : 'New Department'}</h2>
                <button onClick={closeModal} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Department Name</label>
                  <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Human Resources" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Code</label>
                  <input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. HR" className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none font-mono uppercase tracking-wider transition" maxLength={10} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Parent Department</label>
                  <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition">
                    <option value="">None (Top-level)</option>
                    {parentOptions.map((dept: any) => (
                      <option key={dept.id} value={dept.id}>{dept.name} ({dept.code})</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-3 pt-3 border-t">
                  <button type="button" onClick={closeModal} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium">Cancel</button>
                  <button type="submit" disabled={isPending} className="px-5 py-2.5 bg-primary text-white rounded-xl font-medium disabled:opacity-50 hover:bg-primary/90 transition">
                    {isPending ? (editingId ? 'Saving...' : 'Creating...') : (editingId ? 'Save Changes' : 'Create')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={() => setDeleteConfirm(null)}>
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-11 h-11 bg-red-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Delete Department</h3>
                  <p className="text-sm text-gray-500">This cannot be undone</p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-xl font-medium">Cancel</button>
                <button onClick={() => deleteMutation.mutate(deleteConfirm)} disabled={deleteMutation.isPending} className="px-5 py-2.5 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 disabled:opacity-50 transition">
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  const parentName = selected?.parent ? flatMap.get(selected.parent.id)?.name || selected.parent.name : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Departments</h1>
          <p className="text-gray-500 text-sm mt-0.5">Organizational structure & hierarchy</p>
        </div>
        {isAdminOrAbove && (
          <button
            onClick={() => { setForm(emptyForm); setEditingId(null); setShowModal(true); }}
            className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90 flex items-center gap-2 transition text-sm shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            Add Department
          </button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Departments', value: departments.length, icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', color: 'from-violet-500 to-purple-600' },
          { label: 'Top-Level', value: topLevelCount, icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z', color: 'from-blue-500 to-cyan-600' },
          { label: 'Total Staff', value: totalStaff, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'from-emerald-500 to-teal-600' },
          { label: 'With Sub-depts', value: departments.filter((d: DeptNode) => d.children?.length || tree.find(t => t.children?.some(c => c.id === d.id))).length || tree.filter(t => (t.children?.length || 0) > 0).length, icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z', color: 'from-amber-500 to-orange-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center flex-shrink-0`}>
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={stat.icon} /></svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900 leading-none">{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Tree navigator */}
        <div className="lg:col-span-4 xl:col-span-3">
          <div className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50/50">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Org Tree</h2>
            </div>
            <div className="p-2 max-h-[calc(100vh-340px)] overflow-y-auto">
              {tree.map((dept) => (
                <TreeRow key={dept.id} dept={dept} />
              ))}
            </div>
          </div>
        </div>

        {/* Right: Detail panel */}
        <div className="lg:col-span-8 xl:col-span-9">
          {selected ? (
            <div className="space-y-5">
              {/* Department header card */}
              <div className="bg-white rounded-xl border overflow-hidden">
                <div className="bg-gradient-to-r from-primary/5 via-violet-50/50 to-transparent px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-violet-600 flex items-center justify-center text-white text-xl font-bold shadow-lg shadow-primary/20">
                        {selected.code.slice(0, 2)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                          <span className="text-xs font-mono bg-white/80 border text-gray-500 px-2 py-0.5 rounded-md">{selected.code}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 text-sm text-gray-500">
                          {parentName && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" /></svg>
                              {parentName}
                            </span>
                          )}
                          {selected.head && (
                            <span className="flex items-center gap-1">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              {selected.head.firstName} {selected.head.lastName}
                            </span>
                          )}
                          {!parentName && !selected.head && <span className="text-gray-400">Top-level department</span>}
                        </div>
                      </div>
                    </div>
                    {isAdminOrAbove && (
                      <div className="flex gap-2">
                        <button onClick={() => openEdit(selected)} className="px-3.5 py-2 text-sm font-medium text-gray-600 bg-white border rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                          Edit
                        </button>
                        {isSuperAdmin && (
                          <button onClick={() => setDeleteConfirm(selected.id)} className="px-3.5 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 flex items-center gap-1.5 transition">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Stats for selected dept */}
                <div className="grid grid-cols-3 divide-x border-t">
                  <div className="px-6 py-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{selected._count?.users || 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Direct Staff</p>
                  </div>
                  <div className="px-6 py-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{countAllStaff(selected)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Total Staff</p>
                  </div>
                  <div className="px-6 py-4 text-center">
                    <p className="text-2xl font-bold text-gray-900">{countAllChildren(selected)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Sub-departments</p>
                  </div>
                </div>
              </div>

              {/* Sub-departments grid */}
              {selected.children && selected.children.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Sub-departments</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {selected.children.map((child) => {
                      const childTotal = countAllStaff(child);
                      const childSubs = countAllChildren(child);
                      return (
                        <button
                          key={child.id}
                          onClick={() => { setSelectedId(child.id); setExpanded(prev => new Set([...prev, child.id])); }}
                          className="bg-white rounded-xl border p-4 text-left hover:shadow-md hover:border-primary/30 transition-all group/card"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                                {child.code.slice(0, 2)}
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900 text-sm group-hover/card:text-primary transition">{child.name}</p>
                                <p className="text-[10px] font-mono text-gray-400">{child.code}</p>
                              </div>
                            </div>
                            <svg className="w-4 h-4 text-gray-300 group-hover/card:text-primary transition" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-500">
                            <span>{childTotal} staff</span>
                            {childSubs > 0 && <span>{childSubs} sub-dept{childSubs > 1 ? 's' : ''}</span>}
                            {child.head && <span>{child.head.firstName} {child.head.lastName}</span>}
                          </div>
                        </button>
                      );
                    })}

                    {/* Add sub-department */}
                    {isAdminOrAbove && (
                      <button
                        onClick={() => { setForm({ ...emptyForm, parentId: selected.id }); setEditingId(null); setShowModal(true); }}
                        className="rounded-xl border-2 border-dashed border-gray-200 p-4 text-center hover:border-primary/40 hover:bg-primary/5 transition-all flex flex-col items-center justify-center gap-1 min-h-[88px]"
                      >
                        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        <span className="text-xs font-medium text-gray-500">Add Sub-department</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* No sub-depts yet */}
              {(!selected.children || selected.children.length === 0) && (
                <div className="bg-white rounded-xl border p-8 text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gray-50 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
                  </div>
                  <p className="text-sm text-gray-500 font-medium">No sub-departments</p>
                  {isAdminOrAbove && (
                    <button
                      onClick={() => { setForm({ ...emptyForm, parentId: selected.id }); setEditingId(null); setShowModal(true); }}
                      className="mt-3 text-sm text-primary font-medium hover:underline"
                    >
                      + Add sub-department
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* No selection placeholder */
            <div className="bg-white rounded-xl border p-16 text-center flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-20 h-20 mb-5 bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl flex items-center justify-center">
                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              </div>
              <p className="text-gray-500 font-medium text-lg">Select a department</p>
              <p className="text-sm text-gray-400 mt-1">Choose from the tree to view details</p>
            </div>
          )}
        </div>
      </div>

      {renderModal()}
    </div>
  );
}
