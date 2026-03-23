import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { toast } from 'sonner';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'];

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [clockingIn, setClockingIn] = useState(false);
  const isAdmin = ADMIN_ROLES.includes(user?.role || '');

  const { data: stats, isLoading } = useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => (await api.get('/attendance/dashboard')).data,
    refetchInterval: 30000,
    enabled: isAdmin,
  });

  const { data: todayStatus } = useQuery({
    queryKey: ['today-status'],
    queryFn: async () => (await api.get('/attendance/today')).data,
    refetchInterval: 10000,
  });

  const { data: locations } = useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await api.get('/locations')).data,
  });

  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity'],
    queryFn: async () => {
      const end = new Date().toISOString().split('T')[0];
      const start = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      return (await api.get(`/attendance/my-records?startDate=${start}&endDate=${end}`)).data;
    },
  });

  const { data: missedClockOutReport } = useQuery({
    queryKey: ['missed-clockout-report'],
    queryFn: async () => (await api.get('/attendance/missed-clockout-report')).data,
    enabled: isAdmin,
  });

  const clockInMutation = useMutation({
    mutationFn: (locationId: string) =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          api.post('/attendance/clock-in', { locationId, method: 'GPS' }).then(resolve).catch(reject);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => api.post('/attendance/clock-in', { locationId, method: 'GPS', latitude: pos.coords.latitude, longitude: pos.coords.longitude }).then(resolve).catch(reject),
          () => api.post('/attendance/clock-in', { locationId, method: 'GPS' }).then(resolve).catch(reject),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      }),
    onSuccess: () => { toast.success('Clocked in!'); queryClient.invalidateQueries({ queryKey: ['today-status'] }); queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }); setClockingIn(false); },
    onError: (e: any) => { toast.error(e.response?.data?.message || 'Clock in failed'); setClockingIn(false); },
  });

  const clockOutMutation = useMutation({
    mutationFn: () =>
      new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
          api.post('/attendance/clock-out', { method: 'GPS' }).then(resolve).catch(reject);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => api.post('/attendance/clock-out', { method: 'GPS', latitude: pos.coords.latitude, longitude: pos.coords.longitude }).then(resolve).catch(reject),
          () => api.post('/attendance/clock-out', { method: 'GPS' }).then(resolve).catch(reject),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      }),
    onSuccess: () => { toast.success('Clocked out!'); queryClient.invalidateQueries({ queryKey: ['today-status'] }); queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] }); },
    onError: (e: any) => { toast.error(e.response?.data?.message || 'Clock out failed'); },
  });

  const handleClock = () => {
    if (todayStatus?.isClockedIn && !todayStatus?.isClockedOut) clockOutMutation.mutate();
    else if (!todayStatus?.isClockedIn) {
      if (locations?.length === 1) clockInMutation.mutate(locations[0].id);
      else setClockingIn(true);
    }
  };

  const cards = [
    { label: 'Total Employees', value: stats?.totalEmployees ?? '-', color: 'bg-blue-500', bg: 'bg-blue-50' },
    { label: 'Present Today', value: stats?.presentToday ?? '-', color: 'bg-green-500', bg: 'bg-green-50' },
    { label: 'Absent Today', value: stats?.absentToday ?? '-', color: 'bg-red-500', bg: 'bg-red-50' },
    { label: 'Late Today', value: stats?.lateToday ?? '-', color: 'bg-amber-500', bg: 'bg-amber-50' },
    { label: 'On Leave', value: stats?.onLeaveToday ?? '-', color: 'bg-purple-500', bg: 'bg-purple-50' },
    { label: 'Still Clocked In', value: stats?.stillClockedIn ?? '-', color: 'bg-orange-500', bg: 'bg-orange-50' },
    { label: 'Attendance Rate', value: stats ? `${stats.attendanceRate}%` : '-', color: 'bg-teal-500', bg: 'bg-teal-50' },
  ];

  const timeWorked = () => {
    if (!todayStatus?.record?.clockIn) return null;
    const ms = (todayStatus.record.clockOut ? new Date(todayStatus.record.clockOut).getTime() : Date.now()) - new Date(todayStatus.record.clockIn).getTime();
    const m = Math.floor(ms / 60000);
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = { PRESENT: 'bg-green-100 text-green-800', LATE: 'bg-amber-100 text-amber-800', ABSENT: 'bg-red-100 text-red-800', AUTO_CLOCKED_OUT: 'bg-orange-100 text-orange-800' };
    return map[s] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user?.firstName}</h1>
        <p className="text-gray-500 mt-1">{isAdmin ? "Here's your workforce overview for today" : "Here's your attendance summary"}</p>
      </div>

      <div className="bg-white rounded-xl border p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${todayStatus?.isClockedOut ? 'bg-gray-400' : todayStatus?.isClockedIn ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
              <h2 className="font-semibold text-lg">{todayStatus?.isClockedOut ? 'Shift Complete' : todayStatus?.isClockedIn ? 'Currently Clocked In' : 'Not Clocked In'}</h2>
            </div>
            <div className="mt-2 text-sm text-gray-500 space-y-1">
              {todayStatus?.record?.clockIn && <p>Clock in: {new Date(todayStatus.record.clockIn).toLocaleTimeString()}</p>}
              {todayStatus?.record?.clockOut && <p>Clock out: {new Date(todayStatus.record.clockOut).toLocaleTimeString()}</p>}
              {timeWorked() && <p className="font-medium text-gray-700">Time worked: {timeWorked()}</p>}
            </div>
          </div>
          {!todayStatus?.isClockedOut && (
            <button onClick={handleClock} disabled={clockInMutation.isPending || clockOutMutation.isPending}
              className={`px-8 py-3 rounded-xl font-semibold text-white transition shadow-lg disabled:opacity-50 ${todayStatus?.isClockedIn ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}>
              {clockInMutation.isPending || clockOutMutation.isPending ? 'Processing...' : todayStatus?.isClockedIn ? 'Clock Out' : 'Clock In'}
            </button>
          )}
        </div>
        {clockingIn && locations?.length > 1 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm font-medium text-gray-700 mb-2">Select location:</p>
            <div className="flex flex-wrap gap-2">
              {locations.map((l: any) => <button key={l.id} onClick={() => clockInMutation.mutate(l.id)} className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100">{l.name}</button>)}
            </div>
          </div>
        )}
      </div>

      {/* Missed Clock-Out Info for Employee */}
      {todayStatus?.missedClockOuts && (todayStatus.missedClockOuts.monthlyCount > 0 || todayStatus.missedClockOuts.totalCount > 0) && (
        <div className={`rounded-xl border p-4 ${
          todayStatus.missedClockOuts.penalty?.level === 'CRITICAL' ? 'bg-red-50 border-red-200' :
          todayStatus.missedClockOuts.penalty?.level === 'SERIOUS' ? 'bg-orange-50 border-orange-200' :
          todayStatus.missedClockOuts.penalty?.level === 'CAUTION' ? 'bg-amber-50 border-amber-200' :
          todayStatus.missedClockOuts.monthlyCount > 0 ? 'bg-yellow-50 border-yellow-200' :
          'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              todayStatus.missedClockOuts.penalty ? 'bg-red-100' : 'bg-amber-100'
            }`}>
              <svg className="w-4 h-4 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm">
                {todayStatus.missedClockOuts.penalty
                  ? `${todayStatus.missedClockOuts.penalty.level} - Missed Clock-Outs`
                  : 'Missed Clock-Outs'}
              </p>
              <p className="text-sm mt-0.5 opacity-80">
                {todayStatus.missedClockOuts.penalty
                  ? todayStatus.missedClockOuts.penalty.message
                  : `You have missed clocking out ${todayStatus.missedClockOuts.monthlyCount} time(s) this month. Please remember to clock out.`}
              </p>
              <div className="flex items-center gap-4 mt-2">
                <span className="text-xs bg-white/60 px-2 py-1 rounded">This month: <strong>{todayStatus.missedClockOuts.monthlyCount}</strong></span>
                <span className="text-xs bg-white/60 px-2 py-1 rounded">All time: <strong>{todayStatus.missedClockOuts.totalCount}</strong></span>
              </div>
              {todayStatus.missedClockOuts.recentDates?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {todayStatus.missedClockOuts.recentDates.map((d: any, i: number) => (
                    <span key={i} className="text-xs bg-white/60 px-2 py-0.5 rounded">
                      {new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {d.hours && ` (${d.hours}h)`}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
          {isLoading ? [...Array(6)].map((_, i) => <div key={i} className="bg-white rounded-xl border p-4 animate-pulse"><div className="h-4 bg-gray-200 rounded w-20 mb-3" /><div className="h-8 bg-gray-200 rounded w-12" /></div>)
            : cards.map((c) => (
              <div key={c.label} className={`rounded-xl border p-4 ${c.bg}`}>
                <div className="flex items-center gap-2 mb-2"><div className={`w-2 h-2 rounded-full ${c.color}`} /><span className="text-xs text-gray-500 font-medium">{c.label}</span></div>
                <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              </div>
            ))}
        </div>
      )}

      {!isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'This Week', value: recentActivity?.filter((r: any) => r.status === 'PRESENT' || r.status === 'LATE').length ?? 0, sub: 'days attended', color: 'bg-green-50', dot: 'bg-green-500' },
            { label: 'Late Arrivals', value: recentActivity?.filter((r: any) => r.status === 'LATE').length ?? 0, sub: 'this week', color: 'bg-amber-50', dot: 'bg-amber-500' },
            { label: 'Avg Hours', value: (() => { const withTime = recentActivity?.filter((r: any) => r.totalMinutes); if (!withTime?.length) return '-'; return `${(withTime.reduce((a: number, r: any) => a + r.totalMinutes, 0) / withTime.length / 60).toFixed(1)}h`; })(), sub: 'per day', color: 'bg-blue-50', dot: 'bg-blue-500' },
            { label: 'Status', value: todayStatus?.isClockedOut ? 'Done' : todayStatus?.isClockedIn ? 'Active' : 'Pending', sub: 'today', color: todayStatus?.isClockedIn ? 'bg-green-50' : 'bg-gray-50', dot: todayStatus?.isClockedIn ? 'bg-green-500' : 'bg-gray-400' },
          ].map((c) => (
            <div key={c.label} className={`rounded-xl border p-4 ${c.color}`}>
              <div className="flex items-center gap-2 mb-2"><div className={`w-2 h-2 rounded-full ${c.dot}`} /><span className="text-xs text-gray-500 font-medium">{c.label}</span></div>
              <p className="text-2xl font-bold text-gray-900">{c.value}</p>
              <p className="text-xs text-gray-400 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Admin: Missed Clock-Out Report */}
      {isAdmin && missedClockOutReport?.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
              <h3 className="font-semibold">Missed Clock-Outs This Month</h3>
            </div>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded-full font-medium">{missedClockOutReport.length} staff</span>
          </div>
          <div className="divide-y">
            {missedClockOutReport.map((r: any) => (
              <div key={r.user?.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-xs font-medium text-primary">
                    {r.user?.firstName?.[0]}{r.user?.lastName?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{r.user?.firstName} {r.user?.lastName}</p>
                    <p className="text-xs text-gray-400">{r.user?.department?.name || r.user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{r.missedCount}x</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    r.penaltyLevel === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                    r.penaltyLevel === 'SERIOUS' ? 'bg-orange-100 text-orange-800' :
                    r.penaltyLevel === 'CAUTION' ? 'bg-amber-100 text-amber-800' :
                    r.penaltyLevel === 'WARNING' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-600'
                  }`}>{r.penaltyLevel}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold">Recent Activity (7 Days)</h3></div>
        <div className="divide-y">
          {!recentActivity?.length ? <p className="px-6 py-8 text-center text-gray-400">No recent activity</p>
            : recentActivity.slice(0, 7).map((r: any) => (
              <div key={r.id} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${r.status === 'PRESENT' ? 'bg-green-500' : r.status === 'LATE' ? 'bg-amber-500' : r.status === 'AUTO_CLOCKED_OUT' ? 'bg-orange-500' : 'bg-red-500'}`} />
                  <span className="text-sm font-medium">{new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(r.status)}`}>{r.status}</span>
                </div>
                <span className="text-sm text-gray-500">
                  {r.clockIn && new Date(r.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  {r.clockOut && ` - ${new Date(r.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  {r.totalMinutes != null && <span className="ml-2 font-medium text-gray-700">{Math.floor(r.totalMinutes / 60)}h {r.totalMinutes % 60}m</span>}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
