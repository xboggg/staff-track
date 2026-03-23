import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

export default function AuditLogsPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['audit-logs'],
    queryFn: async () => {
      try { return (await api.get('/audit-logs?perPage=50')).data; } catch { return { data: [] }; }
    },
  });

  const actionColors: Record<string, string> = {
    CLOCK_IN: 'bg-green-100 text-green-800',
    CLOCK_OUT: 'bg-blue-100 text-blue-800',
    LOGIN: 'bg-indigo-100 text-indigo-800',
    LOGOUT: 'bg-gray-100 text-gray-800',
    FAILED_LOGIN: 'bg-red-100 text-red-800',
    LEAVE_REQUEST: 'bg-purple-100 text-purple-800',
    LEAVE_APPROVE: 'bg-green-100 text-green-800',
    LEAVE_REJECT: 'bg-red-100 text-red-800',
    USER_CREATE: 'bg-blue-100 text-blue-800',
    RECORD_EDIT: 'bg-amber-100 text-amber-800',
    SETTINGS_CHANGE: 'bg-orange-100 text-orange-800',
  };

  const items = logs?.data || logs || [];

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">Audit Logs</h1><p className="text-gray-500 mt-1">Immutable activity trail for compliance and security</p></div>

      <div className="bg-white rounded-xl border shadow-sm">
        <table className="w-full">
          <thead><tr className="border-b bg-gray-50">
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Time</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Action</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Entity</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">IP Address</th>
            <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase">Details</th>
          </tr></thead>
          <tbody>
            {isLoading ? [...Array(10)].map((_, i) => <tr key={i} className="border-b">{[...Array(5)].map((_, j) => <td key={j} className="py-3 px-4"><div className="h-4 bg-gray-200 rounded w-20 animate-pulse" /></td>)}</tr>)
              : !items.length ? <tr><td colSpan={5} className="py-12 text-center text-gray-400">No audit logs yet. Actions will be recorded here automatically.</td></tr>
              : items.map((l: any) => (
                <tr key={l.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-500">{new Date(l.timestamp).toLocaleString()}</td>
                  <td className="py-3 px-4"><span className={`text-xs px-2 py-0.5 rounded-full ${actionColors[l.action] || 'bg-gray-100 text-gray-800'}`}>{l.action}</span></td>
                  <td className="py-3 px-4 text-sm"><span className="text-gray-500">{l.entityType}</span> <span className="font-mono text-xs text-gray-400">{l.entityId?.slice(0, 8)}</span></td>
                  <td className="py-3 px-4 text-sm font-mono text-gray-500">{l.ipAddress || '-'}</td>
                  <td className="py-3 px-4 text-xs text-gray-400 max-w-[200px] truncate">{l.newValue ? JSON.stringify(l.newValue) : '-'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
