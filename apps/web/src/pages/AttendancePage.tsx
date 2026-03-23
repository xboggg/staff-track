import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { toast } from 'sonner';
import { format, subDays } from 'date-fns';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'];
const CLOCK_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER'];

type ColumnKey = 'employee' | 'date' | 'clockIn' | 'clockOut' | 'hours' | 'overtime' | 'status' | 'location' | 'gps' | 'ip' | 'method' | 'department';

const ALL_COLUMNS: { key: ColumnKey; label: string; adminOnly?: boolean }[] = [
  { key: 'employee', label: 'Employee', adminOnly: true },
  { key: 'department', label: 'Department', adminOnly: true },
  { key: 'date', label: 'Date' },
  { key: 'clockIn', label: 'Clock In' },
  { key: 'clockOut', label: 'Clock Out' },
  { key: 'hours', label: 'Hours' },
  { key: 'overtime', label: 'Overtime' },
  { key: 'status', label: 'Status' },
  { key: 'location', label: 'Location' },
  { key: 'gps', label: 'GPS Coordinates', adminOnly: true },
  { key: 'ip', label: 'IP Address', adminOnly: true },
  { key: 'method', label: 'Clock Method', adminOnly: true },
];

export default function AttendancePage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const isAdmin = ADMIN_ROLES.includes(user?.role || '');
  const canManualClock = CLOCK_ADMIN_ROLES.includes(user?.role || '');
  const [view, setView] = useState<'all' | 'my'>(isAdmin ? 'all' : 'my');
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [visibleCols, setVisibleCols] = useState<Set<ColumnKey>>(new Set(['employee', 'date', 'clockIn', 'clockOut', 'hours', 'status', 'location', 'gps', 'ip']));
  const [showManualClock, setShowManualClock] = useState(false);
  const [manualForm, setManualForm] = useState({ userId: '', locationId: '', notes: '' });
  const tableRef = useRef<HTMLDivElement>(null);
  const perPage = 20;

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/departments')).data,
    enabled: isAdmin,
  });

  const { data: employees } = useQuery({
    queryKey: ['users-list'],
    queryFn: async () => (await api.get('/users')).data,
    enabled: canManualClock,
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
    enabled: canManualClock,
  });

  const adminClockInMutation = useMutation({
    mutationFn: (data: any) => api.post('/attendance/admin-clock-in', data),
    onSuccess: () => {
      toast.success('Employee clocked in successfully');
      setShowManualClock(false);
      setManualForm({ userId: '', locationId: '', notes: '' });
      queryClient.invalidateQueries({ queryKey: ['attendance-all'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to clock in employee'),
  });

  const adminClockOutMutation = useMutation({
    mutationFn: (data: any) => api.post('/attendance/admin-clock-out', data),
    onSuccess: () => {
      toast.success('Employee clocked out successfully');
      queryClient.invalidateQueries({ queryKey: ['attendance-all'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed to clock out employee'),
  });

  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ['attendance-all', startDate, endDate, page, search, statusFilter, deptFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ startDate, endDate, page: String(page), perPage: String(perPage) });
      if (search) params.set('search', search);
      if (statusFilter) params.set('status', statusFilter);
      if (deptFilter) params.set('departmentId', deptFilter);
      return (await api.get(`/attendance/all?${params}`)).data;
    },
    enabled: view === 'all' && isAdmin,
  });

  const { data: myRecords, isLoading: myLoading } = useQuery({
    queryKey: ['my-attendance', startDate, endDate],
    queryFn: async () => (await api.get(`/attendance/my-records?startDate=${startDate}&endDate=${endDate}`)).data,
    enabled: view === 'my',
  });

  const statusColors: Record<string, string> = {
    PRESENT: 'bg-green-100 text-green-800',
    LATE: 'bg-amber-100 text-amber-800',
    ABSENT: 'bg-red-100 text-red-800',
    ON_LEAVE: 'bg-purple-100 text-purple-800',
    HALF_DAY: 'bg-blue-100 text-blue-800',
    REMOTE: 'bg-teal-100 text-teal-800',
    AUTO_CLOCKED_OUT: 'bg-orange-100 text-orange-800',
  };

  const records = view === 'all' ? allData?.data : myRecords;
  const isLoading = view === 'all' ? allLoading : myLoading;
  const totalPages = view === 'all' ? allData?.totalPages || 1 : 1;

  const activeCols = ALL_COLUMNS.filter((c) => {
    if (c.adminOnly && view !== 'all') return false;
    return visibleCols.has(c.key);
  });

  const toggleCol = (key: ColumnKey) => {
    setVisibleCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getCellValue = (r: any, key: ColumnKey): string => {
    switch (key) {
      case 'employee': return `${r.user?.firstName || ''} ${r.user?.lastName || ''}`.trim();
      case 'department': return r.user?.department?.name || '-';
      case 'date': return format(new Date(r.date), 'EEE, MMM d yyyy');
      case 'clockIn': return r.clockIn ? new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
      case 'clockOut': return r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-';
      case 'hours': return r.totalMinutes ? `${Math.floor(r.totalMinutes / 60)}h ${r.totalMinutes % 60}m` : '-';
      case 'overtime': return r.overtimeMinutes ? `${Math.floor(r.overtimeMinutes / 60)}h ${r.overtimeMinutes % 60}m` : '-';
      case 'status': return r.status || '-';
      case 'location': return r.clockInLocation?.name || '-';
      case 'gps': return (r.clockInLatitude != null && r.clockInLongitude != null) ? `${r.clockInLatitude.toFixed(4)}, ${r.clockInLongitude.toFixed(4)}` : '-';
      case 'ip': return r.ipAddress || '-';
      case 'method': return r.clockInMethod || '-';
      default: return '-';
    }
  };

  // Export to CSV
  const exportCSV = () => {
    if (!records?.length) return;
    const headers = activeCols.map((c) => c.label);
    const rows = records.map((r: any) => activeCols.map((c) => getCellValue(r, c.key)));
    const csv = [headers.join(','), ...rows.map((row: string[]) => row.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print
  const handlePrint = () => {
    const printContent = tableRef.current;
    if (!printContent) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`
      <html><head><title>Attendance Records - ${startDate} to ${endDate}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { font-size: 18px; margin-bottom: 4px; }
        p { font-size: 12px; color: #666; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #f3f4f6; text-align: left; padding: 8px; border: 1px solid #e5e7eb; font-weight: 600; text-transform: uppercase; font-size: 10px; }
        td { padding: 6px 8px; border: 1px solid #e5e7eb; }
        tr:nth-child(even) { background: #f9fafb; }
        .badge { padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 500; }
        .PRESENT { background: #dcfce7; color: #166534; }
        .LATE { background: #fef3c7; color: #92400e; }
        .ABSENT { background: #fee2e2; color: #991b1b; }
        .AUTO_CLOCKED_OUT { background: #ffedd5; color: #9a3412; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <h1>TimeTrack - Attendance Records</h1>
      <p>${startDate} to ${endDate} · ${view === 'all' ? 'All Staff' : 'My Records'} · ${records?.length || 0} records · Printed: ${new Date().toLocaleString()}</p>
      <table>
        <thead><tr>${activeCols.map((c) => `<th>${c.label}</th>`).join('')}</tr></thead>
        <tbody>${(records || []).map((r: any) => `<tr>${activeCols.map((c) => {
          const val = getCellValue(r, c.key);
          if (c.key === 'status') return `<td><span class="badge ${val}">${val}</span></td>`;
          return `<td>${val}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table>
      </body></html>
    `);
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Records</h1>
          <p className="text-gray-500 mt-1">{view === 'all' ? `All staff · ${allData?.total || 0} records` : 'Your personal attendance'}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="flex bg-gray-100 rounded-lg p-1 mr-2">
              <button onClick={() => { setView('all'); setPage(1); }} className={`px-4 py-1.5 text-sm rounded-md transition ${view === 'all' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500'}`}>All Staff</button>
              <button onClick={() => setView('my')} className={`px-4 py-1.5 text-sm rounded-md transition ${view === 'my' ? 'bg-white shadow text-gray-900 font-medium' : 'text-gray-500'}`}>My Records</button>
            </div>
          )}
          {/* Column picker */}
          <div className="relative">
            <button onClick={() => setShowColumnPicker(!showColumnPicker)} className="p-2 border rounded-lg hover:bg-gray-50 text-gray-500" title="Toggle columns">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            {showColumnPicker && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-xl shadow-lg p-3 z-50 w-56">
                <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Visible Columns</p>
                {ALL_COLUMNS.filter((c) => !c.adminOnly || view === 'all').map((c) => (
                  <label key={c.key} className="flex items-center gap-2 py-1 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                    <input type="checkbox" checked={visibleCols.has(c.key)} onChange={() => toggleCol(c.key)} className="rounded" />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {/* Manual Clock-In */}
          {canManualClock && (
            <button onClick={() => setShowManualClock(true)} className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 font-medium">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z" /></svg>
              Manual Clock-In
            </button>
          )}
          {/* Export */}
          <button onClick={exportCSV} disabled={!records?.length} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40" title="Export CSV">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export
          </button>
          {/* Print */}
          <button onClick={handlePrint} disabled={!records?.length} className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50 disabled:opacity-40" title="Print">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
            Print
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border shadow-sm p-4">
        <div className="flex flex-wrap gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">From</label>
            <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setPage(1); }} className="px-3 py-1.5 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">To</label>
            <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setPage(1); }} className="px-3 py-1.5 border rounded-lg text-sm" />
          </div>
          {view === 'all' && (
            <>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Search</label>
                <input type="text" placeholder="Name, email, ID..." value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} className="px-3 py-1.5 border rounded-lg text-sm w-48" />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Status</label>
                <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="px-3 py-1.5 border rounded-lg text-sm">
                  <option value="">All Statuses</option>
                  <option value="PRESENT">Present</option>
                  <option value="LATE">Late</option>
                  <option value="ABSENT">Absent</option>
                  <option value="ON_LEAVE">On Leave</option>
                  <option value="AUTO_CLOCKED_OUT">Auto Clocked Out</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">Department</label>
                <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setPage(1); }} className="px-3 py-1.5 border rounded-lg text-sm">
                  <option value="">All Departments</option>
                  {(Array.isArray(departments) ? departments : departments?.data || []).map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden" ref={tableRef}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                {activeCols.map((c) => (
                  <th key={c.key} className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase whitespace-nowrap">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b">
                    {activeCols.map((_, j) => (
                      <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-20 animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : !records?.length ? (
                <tr><td colSpan={activeCols.length} className="py-12 text-center text-gray-400">No attendance records found for this period</td></tr>
              ) : (
                records.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    {activeCols.map((c) => {
                      if (c.key === 'employee') {
                        return (
                          <td key={c.key} className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium text-primary flex-shrink-0">
                                {r.user?.firstName?.[0]}{r.user?.lastName?.[0]}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">{r.user?.firstName} {r.user?.lastName}</p>
                                <p className="text-xs text-gray-400 truncate">{r.user?.employeeId || r.user?.email}</p>
                              </div>
                            </div>
                          </td>
                        );
                      }
                      if (c.key === 'status') {
                        return (
                          <td key={c.key} className="py-3 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[r.status] || 'bg-gray-100 text-gray-800'}`}>{r.status}</span>
                          </td>
                        );
                      }
                      if (c.key === 'gps') {
                        const hasCoords = r.clockInLatitude != null && r.clockInLongitude != null;
                        return (
                          <td key={c.key} className="py-3 px-4 text-xs font-mono">
                            {hasCoords ? (
                              <a href={`https://www.google.com/maps?q=${r.clockInLatitude},${r.clockInLongitude}`} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                                {r.clockInLatitude.toFixed(4)}, {r.clockInLongitude.toFixed(4)}
                              </a>
                            ) : '-'}
                          </td>
                        );
                      }
                      return <td key={c.key} className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">{getCellValue(r, c.key)}</td>;
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {view === 'all' && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">Page {page} of {totalPages} · {allData?.total || 0} records</p>
            <div className="flex gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-3 py-1 text-sm border rounded-lg hover:bg-white disabled:opacity-40">Previous</button>
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                const p = page <= 3 ? i + 1 : page + i - 2;
                if (p < 1 || p > totalPages) return null;
                return <button key={p} onClick={() => setPage(p)} className={`px-3 py-1 text-sm border rounded-lg ${p === page ? 'bg-primary text-white border-primary' : 'hover:bg-white'}`}>{p}</button>;
              })}
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="px-3 py-1 text-sm border rounded-lg hover:bg-white disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Clock-In Modal */}
      {showManualClock && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowManualClock(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">Manual Clock-In</h2>
            <p className="text-sm text-gray-500 mb-4">Clock in an employee on their behalf. This will be logged as a manual entry in the audit trail.</p>
            <form onSubmit={(e) => { e.preventDefault(); adminClockInMutation.mutate(manualForm); }} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
                <select required value={manualForm.userId} onChange={(e) => setManualForm({ ...manualForm, userId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select employee...</option>
                  {(Array.isArray(employees) ? employees : employees?.data || []).map((u: any) => (
                    <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.employeeId || u.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                <select required value={manualForm.locationId} onChange={(e) => setManualForm({ ...manualForm, locationId: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                  <option value="">Select location...</option>
                  {(locations || []).map((l: any) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                <input value={manualForm.notes} onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })} placeholder="Reason for manual clock-in..." className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowManualClock(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={adminClockInMutation.isPending} className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50">
                  {adminClockInMutation.isPending ? 'Clocking In...' : 'Clock In Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
