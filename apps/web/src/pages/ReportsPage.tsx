import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';

export default function ReportsPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [view, setView] = useState<'summary' | 'detailed'>('summary');

  const { data: stats } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get('/attendance/dashboard')).data,
  });

  const { data: departments } = useQuery({
    queryKey: ['departments'],
    queryFn: async () => (await api.get('/departments')).data,
  });

  const { data: records, isLoading } = useQuery({
    queryKey: ['attendance-report', startDate, endDate],
    queryFn: async () => (await api.get(`/attendance/my-records?startDate=${startDate}&endDate=${endDate}`)).data,
  });

  const quickRanges = [
    { label: 'Today', fn: () => { const d = format(new Date(), 'yyyy-MM-dd'); setStartDate(d); setEndDate(d); } },
    { label: 'Last 7 Days', fn: () => { setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd')); setEndDate(format(new Date(), 'yyyy-MM-dd')); } },
    { label: 'This Month', fn: () => { setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd')); } },
    { label: 'Last Month', fn: () => { const d = subDays(startOfMonth(new Date()), 1); setStartDate(format(startOfMonth(d), 'yyyy-MM-dd')); setEndDate(format(endOfMonth(d), 'yyyy-MM-dd')); } },
  ];

  const exportCSV = useCallback(() => {
    if (!records?.length) { toast.error('No records to export'); return; }
    const headers = ['Date', 'Clock In', 'Clock Out', 'Hours', 'Overtime', 'Status'];
    const rows = records.map((r: any) => [
      new Date(r.date).toLocaleDateString('en-US'),
      r.clockIn ? new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
      r.totalMinutes ? `${Math.floor(r.totalMinutes / 60)}h ${r.totalMinutes % 60}m` : '',
      r.overtimeMinutes ? `${Math.floor(r.overtimeMinutes / 60)}h ${r.overtimeMinutes % 60}m` : '',
      r.status,
    ]);
    const csv = [headers, ...rows].map(r => r.map((c: string) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-report-${startDate}-to-${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report exported');
  }, [records, startDate, endDate]);

  const summary = records?.reduce((acc: any, r: any) => {
    acc.total++;
    if (r.status === 'PRESENT') acc.present++;
    if (r.status === 'LATE') acc.late++;
    if (r.status === 'ABSENT') acc.absent++;
    if (r.totalMinutes) acc.totalMinutes += r.totalMinutes;
    if (r.overtimeMinutes) acc.overtimeMinutes += r.overtimeMinutes;
    return acc;
  }, { total: 0, present: 0, late: 0, absent: 0, totalMinutes: 0, overtimeMinutes: 0 });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Reports & Analytics</h1><p className="text-gray-500 mt-1">Attendance reports and workforce analytics</p></div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex gap-2">
            {quickRanges.map((r) => <button key={r.label} onClick={r.fn} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">{r.label}</button>)}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" />
            <span className="text-gray-400">to</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" />
          </div>
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setView('summary')} className={`px-3 py-1.5 text-sm ${view === 'summary' ? 'bg-primary text-white' : 'bg-white'}`}>Summary</button>
            <button onClick={() => setView('detailed')} className={`px-3 py-1.5 text-sm ${view === 'detailed' ? 'bg-primary text-white' : 'bg-white'}`}>Detailed</button>
          </div>
          <button onClick={exportCSV} className="px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border p-4"><span className="text-xs text-gray-500">Working Days</span><p className="text-2xl font-bold mt-1">{summary.total}</p></div>
          <div className="bg-green-50 rounded-xl border p-4"><span className="text-xs text-gray-500">Present</span><p className="text-2xl font-bold mt-1 text-green-700">{summary.present}</p></div>
          <div className="bg-amber-50 rounded-xl border p-4"><span className="text-xs text-gray-500">Late</span><p className="text-2xl font-bold mt-1 text-amber-700">{summary.late}</p></div>
          <div className="bg-red-50 rounded-xl border p-4"><span className="text-xs text-gray-500">Absent</span><p className="text-2xl font-bold mt-1 text-red-700">{summary.absent}</p></div>
          <div className="bg-blue-50 rounded-xl border p-4"><span className="text-xs text-gray-500">Total Hours</span><p className="text-2xl font-bold mt-1 text-blue-700">{Math.floor(summary.totalMinutes / 60)}h</p></div>
          <div className="bg-purple-50 rounded-xl border p-4"><span className="text-xs text-gray-500">Overtime</span><p className="text-2xl font-bold mt-1 text-purple-700">{Math.floor(summary.overtimeMinutes / 60)}h</p></div>
        </div>
      )}

      {/* Department Summary */}
      {stats && departments && (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-6 py-4 border-b"><h3 className="font-semibold">Department Overview (Today)</h3></div>
          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((d: any) => (
              <div key={d.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">{d.name}</h4>
                  <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{d._count?.users || 0} staff</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-500 rounded-full h-2" style={{ width: '0%' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Records */}
      {view === 'detailed' && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b"><h3 className="font-semibold">Detailed Records</h3></div>
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Clock In</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Clock Out</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Overtime</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr></thead>
            <tbody>
              {isLoading ? [...Array(5)].map((_, i) => <tr key={i} className="border-b">{[...Array(6)].map((_, j) => <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-16 animate-pulse" /></td>)}</tr>)
                : records?.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm font-medium">{new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                    <td className="py-3 px-4 text-sm">{r.clockIn ? new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="py-3 px-4 text-sm">{r.clockOut ? new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                    <td className="py-3 px-4 text-sm">{r.totalMinutes ? `${Math.floor(r.totalMinutes / 60)}h ${r.totalMinutes % 60}m` : '-'}</td>
                    <td className="py-3 px-4 text-sm">{r.overtimeMinutes ? `${Math.floor(r.overtimeMinutes / 60)}h ${r.overtimeMinutes % 60}m` : '-'}</td>
                    <td className="py-3 px-4"><span className={`text-xs px-2 py-0.5 rounded-full ${r.status === 'PRESENT' ? 'bg-green-100 text-green-800' : r.status === 'LATE' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>{r.status}</span></td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
