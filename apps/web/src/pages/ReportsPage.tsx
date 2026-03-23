import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { toast } from 'sonner';

type ReportTab = 'attendance' | 'overtime' | 'ssnit' | 'paye' | 'leave';

const TABS: { key: ReportTab; label: string; icon: string; description: string }[] = [
  { key: 'attendance', label: 'Attendance', icon: '📊', description: 'Employee attendance summary' },
  { key: 'overtime', label: 'Overtime', icon: '⏰', description: 'Overtime hours & pay' },
  { key: 'ssnit', label: 'SSNIT Returns', icon: '🏛️', description: 'Monthly SSNIT contributions' },
  { key: 'paye', label: 'GRA PAYE', icon: '💰', description: 'Tax deduction report' },
  { key: 'leave', label: 'Leave', icon: '🌴', description: 'Leave utilization by type' },
];

function formatGHS(amount: number) {
  return `GH₵ ${amount.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ReportsPage() {
  const [tab, setTab] = useState<ReportTab>('attendance');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [downloading, setDownloading] = useState(false);

  const quickRanges = [
    { label: 'Today', fn: () => { const d = format(new Date(), 'yyyy-MM-dd'); setStartDate(d); setEndDate(d); } },
    { label: 'Last 7 Days', fn: () => { setStartDate(format(subDays(new Date(), 7), 'yyyy-MM-dd')); setEndDate(format(new Date(), 'yyyy-MM-dd')); } },
    { label: 'This Month', fn: () => { setStartDate(format(startOfMonth(new Date()), 'yyyy-MM-dd')); setEndDate(format(endOfMonth(new Date()), 'yyyy-MM-dd')); } },
    { label: 'Last Month', fn: () => { const d = subDays(startOfMonth(new Date()), 1); setStartDate(format(startOfMonth(d), 'yyyy-MM-dd')); setEndDate(format(endOfMonth(d), 'yyyy-MM-dd')); } },
  ];

  const usesDateRange = tab === 'attendance' || tab === 'overtime';
  const usesMonthYear = tab === 'ssnit' || tab === 'paye';

  // --- Queries ---
  const attendanceQuery = useQuery({
    queryKey: ['report-attendance', startDate, endDate],
    queryFn: async () => (await api.get(`/reports/attendance-summary?startDate=${startDate}&endDate=${endDate}`)).data,
    enabled: tab === 'attendance',
  });

  const overtimeQuery = useQuery({
    queryKey: ['report-overtime', startDate, endDate],
    queryFn: async () => (await api.get(`/reports/overtime-summary?startDate=${startDate}&endDate=${endDate}`)).data,
    enabled: tab === 'overtime',
  });

  const ssnitQuery = useQuery({
    queryKey: ['report-ssnit', month, year],
    queryFn: async () => (await api.get(`/reports/ssnit-returns?month=${month}&year=${year}`)).data,
    enabled: tab === 'ssnit',
  });

  const payeQuery = useQuery({
    queryKey: ['report-paye', month, year],
    queryFn: async () => (await api.get(`/reports/paye-report?month=${month}&year=${year}`)).data,
    enabled: tab === 'paye',
  });

  const leaveQuery = useQuery({
    queryKey: ['report-leave', year],
    queryFn: async () => (await api.get(`/reports/leave-utilization?year=${year}`)).data,
    enabled: tab === 'leave',
  });

  // --- CSV Download ---
  const downloadCsv = useCallback(async () => {
    setDownloading(true);
    try {
      let url = '';
      let filename = '';
      switch (tab) {
        case 'attendance':
          url = `/reports/attendance-summary/csv?startDate=${startDate}&endDate=${endDate}`;
          filename = `attendance-${startDate}-to-${endDate}.csv`;
          break;
        case 'overtime':
          url = `/reports/overtime-summary/csv?startDate=${startDate}&endDate=${endDate}`;
          filename = `overtime-${startDate}-to-${endDate}.csv`;
          break;
        case 'ssnit':
          url = `/reports/ssnit-returns/csv?month=${month}&year=${year}`;
          filename = `ssnit-returns-${year}-${String(month).padStart(2, '0')}.csv`;
          break;
        case 'paye':
          url = `/reports/paye-report/csv?month=${month}&year=${year}`;
          filename = `paye-report-${year}-${String(month).padStart(2, '0')}.csv`;
          break;
        case 'leave':
          url = `/reports/leave-utilization/csv?year=${year}`;
          filename = `leave-utilization-${year}.csv`;
          break;
      }
      const res = await api.get(url, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('Report downloaded');
    } catch {
      toast.error('Failed to download report');
    } finally {
      setDownloading(false);
    }
  }, [tab, startDate, endDate, month, year]);

  const isLoading = attendanceQuery.isLoading || overtimeQuery.isLoading || ssnitQuery.isLoading || payeQuery.isLoading || leaveQuery.isLoading;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports & Compliance</h1>
          <p className="text-gray-500 mt-1">Generate compliance reports for SSNIT, GRA, and workforce analytics</p>
        </div>
        <button
          onClick={downloadCsv}
          disabled={downloading || isLoading}
          className="px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2 font-medium shadow-sm"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          {downloading ? 'Downloading...' : 'Download CSV'}
        </button>
      </div>

      {/* Report Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-white border hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border p-4 shadow-sm">
        <div className="flex items-center gap-4 flex-wrap">
          {usesDateRange && (
            <>
              <div className="flex gap-2">
                {quickRanges.map((r) => (
                  <button key={r.label} onClick={r.fn} className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg">
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" />
                <span className="text-gray-400">to</span>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-1.5 rounded-lg border text-sm" />
              </div>
            </>
          )}
          {usesMonthYear && (
            <div className="flex items-center gap-3 ml-auto">
              <label className="text-sm text-gray-600 font-medium">Period:</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border text-sm"
              >
                {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border text-sm"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
          {tab === 'leave' && (
            <div className="flex items-center gap-3 ml-auto">
              <label className="text-sm text-gray-600 font-medium">Year:</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border text-sm"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Report Content */}
      {tab === 'attendance' && <AttendanceReport data={attendanceQuery.data} isLoading={attendanceQuery.isLoading} />}
      {tab === 'overtime' && <OvertimeReport data={overtimeQuery.data} isLoading={overtimeQuery.isLoading} />}
      {tab === 'ssnit' && <SsnitReport data={ssnitQuery.data} isLoading={ssnitQuery.isLoading} />}
      {tab === 'paye' && <PayeReport data={payeQuery.data} isLoading={payeQuery.isLoading} />}
      {tab === 'leave' && <LeaveReport data={leaveQuery.data} isLoading={leaveQuery.isLoading} />}
    </div>
  );
}

// ========== SKELETON ROWS ==========
function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="border-b">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-16 animate-pulse" /></td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ========== ATTENDANCE REPORT ==========
function AttendanceReport({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  const totals = data?.reduce((acc: any, r: any) => {
    acc.totalDays += r.totalDays;
    acc.present += r.present;
    acc.late += r.late;
    acc.absent += r.absent;
    acc.totalHours += r.totalHours;
    acc.overtimeHours += r.overtimeHours;
    return acc;
  }, { totalDays: 0, present: 0, late: 0, absent: 0, totalHours: 0, overtimeHours: 0 });

  return (
    <>
      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-white rounded-xl border p-4"><span className="text-xs text-gray-500">Employees</span><p className="text-2xl font-bold mt-1">{data?.length || 0}</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4"><span className="text-xs text-gray-500">Total Present</span><p className="text-2xl font-bold mt-1 text-green-700">{totals.present}</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4"><span className="text-xs text-gray-500">Total Late</span><p className="text-2xl font-bold mt-1 text-amber-700">{totals.late}</p></div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4"><span className="text-xs text-gray-500">Total Absent</span><p className="text-2xl font-bold mt-1 text-red-700">{totals.absent}</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4"><span className="text-xs text-gray-500">Total Hours</span><p className="text-2xl font-bold mt-1 text-blue-700">{Math.round(totals.totalHours)}h</p></div>
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4"><span className="text-xs text-gray-500">Overtime</span><p className="text-2xl font-bold mt-1 text-purple-700">{Math.round(totals.overtimeHours)}h</p></div>
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold">Attendance Summary by Employee</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee ID</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Days</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Present</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Late</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Absent</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Hours</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">OT Hours</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Rate</th>
            </tr></thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={10} /> : data?.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{r.employeeId}</td>
                  <td className="py-3 px-4 text-sm font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.department}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.totalDays}</td>
                  <td className="py-3 px-4 text-sm text-right text-green-700">{r.present}</td>
                  <td className="py-3 px-4 text-sm text-right text-amber-700">{r.late}</td>
                  <td className="py-3 px-4 text-sm text-right text-red-700">{r.absent}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.totalHours}h</td>
                  <td className="py-3 px-4 text-sm text-right text-purple-700">{r.overtimeHours}h</td>
                  <td className="py-3 px-4 text-sm text-right">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${r.attendanceRate >= 90 ? 'bg-green-100 text-green-800' : r.attendanceRate >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'}`}>
                      {r.attendanceRate}%
                    </span>
                  </td>
                </tr>
              ))}
              {!isLoading && (!data || data.length === 0) && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400">No attendance data for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ========== OVERTIME REPORT ==========
function OvertimeReport({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  const totalOTPay = data?.reduce((s: number, r: any) => s + r.overtimePay, 0) || 0;
  const totalOTHours = data?.reduce((s: number, r: any) => s + r.overtimeHours, 0) || 0;

  return (
    <>
      {data && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-purple-50 rounded-xl border border-purple-200 p-4"><span className="text-xs text-gray-500">Employees with OT</span><p className="text-2xl font-bold mt-1 text-purple-700">{data.length}</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4"><span className="text-xs text-gray-500">Total OT Hours</span><p className="text-2xl font-bold mt-1 text-blue-700">{Math.round(totalOTHours * 10) / 10}h</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4"><span className="text-xs text-gray-500">Total OT Pay</span><p className="text-2xl font-bold mt-1 text-green-700">{formatGHS(totalOTPay)}</p></div>
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Overtime Summary</h3>
          <span className="text-xs text-gray-400">Rate: 1.5x hourly (Ghana Labour Act 2003)</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee ID</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">OT Days</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">OT Hours</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Hourly Rate</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">OT Rate</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">OT Pay</th>
            </tr></thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={8} /> : data?.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{r.employeeId}</td>
                  <td className="py-3 px-4 text-sm font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.department}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.overtimeDays}</td>
                  <td className="py-3 px-4 text-sm text-right text-purple-700 font-medium">{r.overtimeHours}h</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(r.hourlyRate)}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(r.overtimeRate)}</td>
                  <td className="py-3 px-4 text-sm text-right text-green-700 font-medium">{formatGHS(r.overtimePay)}</td>
                </tr>
              ))}
              {!isLoading && (!data || data.length === 0) && (
                <tr><td colSpan={8} className="py-8 text-center text-gray-400">No overtime recorded for this period</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ========== SSNIT REPORT ==========
function SsnitReport({ data, isLoading }: { data: any; isLoading: boolean }) {
  return (
    <>
      {data?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4"><span className="text-xs text-gray-500">Employees</span><p className="text-2xl font-bold mt-1">{data.employeeCount}</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4"><span className="text-xs text-gray-500">Total Basic Salary</span><p className="text-xl font-bold mt-1 text-blue-700">{formatGHS(data.totals.basicSalary)}</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4"><span className="text-xs text-gray-500">Employee 5.5%</span><p className="text-xl font-bold mt-1 text-amber-700">{formatGHS(data.totals.employeeContribution)}</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4"><span className="text-xs text-gray-500">Employer 13%</span><p className="text-xl font-bold mt-1 text-green-700">{formatGHS(data.totals.employerContribution)}</p></div>
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">SSNIT Monthly Contribution Returns</h3>
            {data?.period && <p className="text-xs text-gray-400 mt-0.5">Period: {data.period}</p>}
          </div>
          <div className="bg-violet-100 text-violet-800 text-xs px-3 py-1 rounded-full font-medium">
            Total: {data?.totals ? formatGHS(data.totals.totalContribution) : '—'}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">S/N</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee ID</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">SSNIT No.</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Department</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Basic Salary</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Emp. 5.5%</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Empr. 13%</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total</th>
            </tr></thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={9} /> : data?.data?.map((r: any) => (
                <tr key={r.sn} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-400">{r.sn}</td>
                  <td className="py-3 px-4 text-sm font-mono">{r.employeeId}</td>
                  <td className="py-3 px-4 text-sm font-mono">{r.ssnitNumber}</td>
                  <td className="py-3 px-4 text-sm font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.department}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(r.basicSalary)}</td>
                  <td className="py-3 px-4 text-sm text-right text-amber-700">{formatGHS(r.employeeContribution)}</td>
                  <td className="py-3 px-4 text-sm text-right text-green-700">{formatGHS(r.employerContribution)}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium">{formatGHS(r.totalContribution)}</td>
                </tr>
              ))}
              {!isLoading && (!data?.data || data.data.length === 0) && (
                <tr><td colSpan={9} className="py-8 text-center text-gray-400">No employee data available</td></tr>
              )}
            </tbody>
            {data?.totals && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={5} className="py-3 px-4 text-sm text-right">TOTALS</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(data.totals.basicSalary)}</td>
                  <td className="py-3 px-4 text-sm text-right text-amber-700">{formatGHS(data.totals.employeeContribution)}</td>
                  <td className="py-3 px-4 text-sm text-right text-green-700">{formatGHS(data.totals.employerContribution)}</td>
                  <td className="py-3 px-4 text-sm text-right text-violet-700">{formatGHS(data.totals.totalContribution)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}

// ========== PAYE REPORT ==========
function PayeReport({ data, isLoading }: { data: any; isLoading: boolean }) {
  return (
    <>
      {data?.totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl border p-4"><span className="text-xs text-gray-500">Employees</span><p className="text-2xl font-bold mt-1">{data.employeeCount}</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4"><span className="text-xs text-gray-500">Gross Salary</span><p className="text-lg font-bold mt-1 text-blue-700">{formatGHS(data.totals.grossSalary)}</p></div>
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4"><span className="text-xs text-gray-500">SSNIT Deductions</span><p className="text-lg font-bold mt-1 text-amber-700">{formatGHS(data.totals.ssnitDeduction)}</p></div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4"><span className="text-xs text-gray-500">PAYE Tax</span><p className="text-lg font-bold mt-1 text-red-700">{formatGHS(data.totals.payeTax)}</p></div>
          <div className="bg-green-50 rounded-xl border border-green-200 p-4"><span className="text-xs text-gray-500">Net Salary</span><p className="text-lg font-bold mt-1 text-green-700">{formatGHS(data.totals.netSalary)}</p></div>
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h3 className="font-semibold">GRA PAYE Tax Deduction Report</h3>
            {data?.period && <p className="text-xs text-gray-400 mt-0.5">Period: {data.period} | Ghana Revenue Authority</p>}
          </div>
          <div className="bg-red-100 text-red-800 text-xs px-3 py-1 rounded-full font-medium">
            Total PAYE: {data?.totals ? formatGHS(data.totals.payeTax) : '—'}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">S/N</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee ID</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">TIN</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Dept</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Gross</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">SSNIT 5.5%</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Taxable</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">PAYE Tax</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Net</th>
            </tr></thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={10} /> : data?.data?.map((r: any) => (
                <tr key={r.sn} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-400">{r.sn}</td>
                  <td className="py-3 px-4 text-sm font-mono">{r.employeeId}</td>
                  <td className="py-3 px-4 text-sm font-mono">{r.tinNumber}</td>
                  <td className="py-3 px-4 text-sm font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.department}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(r.grossSalary)}</td>
                  <td className="py-3 px-4 text-sm text-right text-amber-700">{formatGHS(r.ssnitDeduction)}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(r.taxableIncome)}</td>
                  <td className="py-3 px-4 text-sm text-right text-red-700 font-medium">{formatGHS(r.payeTax)}</td>
                  <td className="py-3 px-4 text-sm text-right text-green-700 font-medium">{formatGHS(r.netSalary)}</td>
                </tr>
              ))}
              {!isLoading && (!data?.data || data.data.length === 0) && (
                <tr><td colSpan={10} className="py-8 text-center text-gray-400">No employee data available</td></tr>
              )}
            </tbody>
            {data?.totals && (
              <tfoot>
                <tr className="bg-gray-50 font-semibold">
                  <td colSpan={5} className="py-3 px-4 text-sm text-right">TOTALS</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(data.totals.grossSalary)}</td>
                  <td className="py-3 px-4 text-sm text-right text-amber-700">{formatGHS(data.totals.ssnitDeduction)}</td>
                  <td className="py-3 px-4 text-sm text-right">{formatGHS(data.totals.taxableIncome)}</td>
                  <td className="py-3 px-4 text-sm text-right text-red-700">{formatGHS(data.totals.payeTax)}</td>
                  <td className="py-3 px-4 text-sm text-right text-green-700">{formatGHS(data.totals.netSalary)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </>
  );
}

// ========== LEAVE REPORT ==========
function LeaveReport({ data, isLoading }: { data: any[]; isLoading: boolean }) {
  const totalDays = data?.reduce((s: number, r: any) => s + r.totalDaysTaken, 0) || 0;

  return (
    <>
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border p-4"><span className="text-xs text-gray-500">Employees</span><p className="text-2xl font-bold mt-1">{data.length}</p></div>
          <div className="bg-teal-50 rounded-xl border border-teal-200 p-4"><span className="text-xs text-gray-500">Total Leave Days</span><p className="text-2xl font-bold mt-1 text-teal-700">{totalDays}</p></div>
          <div className="bg-blue-50 rounded-xl border border-blue-200 p-4"><span className="text-xs text-gray-500">With Leave Taken</span><p className="text-2xl font-bold mt-1 text-blue-700">{data.filter((r: any) => r.totalDaysTaken > 0).length}</p></div>
          <div className="bg-gray-50 rounded-xl border p-4"><span className="text-xs text-gray-500">No Leave Taken</span><p className="text-2xl font-bold mt-1 text-gray-700">{data.filter((r: any) => r.totalDaysTaken === 0).length}</p></div>
        </div>
      )}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold">Leave Utilization by Employee</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b bg-gray-50">
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Employee ID</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Dept</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Total</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Annual</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Sick</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Maternity</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Paternity</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Comp.</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Study</th>
              <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase">Unpaid</th>
            </tr></thead>
            <tbody>
              {isLoading ? <SkeletonRows cols={11} /> : data?.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm font-mono">{r.employeeId}</td>
                  <td className="py-3 px-4 text-sm font-medium">{r.name}</td>
                  <td className="py-3 px-4 text-sm text-gray-600">{r.department}</td>
                  <td className="py-3 px-4 text-sm text-right font-medium">{r.totalDaysTaken}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.annual || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.sick || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.maternity || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.paternity || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.compassionate || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.study || '-'}</td>
                  <td className="py-3 px-4 text-sm text-right">{r.unpaid || '-'}</td>
                </tr>
              ))}
              {!isLoading && (!data || data.length === 0) && (
                <tr><td colSpan={11} className="py-8 text-center text-gray-400">No leave data for this year</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
