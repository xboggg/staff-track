import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth.store';
import { toast } from 'sonner';

// Admin roles can VIEW pending leaves but NOT approve/reject
const ADMIN_VIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const ALL_VIEWER_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD', 'SUPERVISOR'];

export default function LeavesPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userRole = user?.role || '';
  const isAdminViewer = ADMIN_VIEWER_ROLES.includes(userRole);
  const canView = ALL_VIEWER_ROLES.includes(userRole);
  const [showRequest, setShowRequest] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [form, setForm] = useState({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });

  // Load org's approval hierarchy to check if current user can approve at any level
  const { data: hierarchyData } = useQuery({
    queryKey: ['approval-hierarchy-info'],
    queryFn: async () => {
      try {
        return (await api.get('/leaves/approval-hierarchy')).data;
      } catch {
        // Non-SUPER_ADMIN won't have access — that's fine, we just need to know if they can approve
        return null;
      }
    },
  });

  // Determine which levels this user's role can approve
  const hierarchy = hierarchyData?.hierarchy || [];
  const canApproveLevels = hierarchy
    .filter((lvl: any) => lvl.roles.includes(userRole))
    .map((lvl: any) => lvl.level);
  const canApprove = canApproveLevels.length > 0 && !isAdminViewer;

  const { data: myLeaves, isLoading } = useQuery({
    queryKey: ['my-leaves'],
    queryFn: async () => (await api.get('/leaves/my-requests')).data,
  });

  const { data: pendingData } = useQuery({
    queryKey: ['pending-leaves'],
    queryFn: async () => (await api.get('/leaves/pending')).data,
    enabled: canView,
  });

  const pendingLeaves = pendingData?.data || [];

  const requestMutation = useMutation({
    mutationFn: (data: any) => api.post('/leaves', data),
    onSuccess: () => {
      toast.success('Leave request submitted — awaiting approval');
      setShowRequest(false);
      setForm({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, comments }: { id: string; comments?: string }) =>
      api.post(`/leaves/${id}/approve`, { comments }),
    onSuccess: () => {
      toast.success('Approved at your level');
      queryClient.invalidateQueries({ queryKey: ['pending-leaves'] });
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, rejectionReason }: { id: string; rejectionReason: string }) =>
      api.post(`/leaves/${id}/reject`, { rejectionReason }),
    onSuccess: () => {
      toast.success('Leave request rejected');
      setRejectId(null);
      setRejectReason('');
      queryClient.invalidateQueries({ queryKey: ['pending-leaves'] });
      queryClient.invalidateQueries({ queryKey: ['my-leaves'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  });

  const leaveTypes = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'COMPASSIONATE', 'STUDY', 'UNPAID'];

  const statusBadge = (s: string) => {
    const m: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
    };
    return m[s] || 'bg-gray-100 text-gray-800';
  };

  const levelIcon = (status: string) => {
    if (status === 'APPROVED') return <svg className="w-5 h-5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>;
    if (status === 'REJECTED') return <svg className="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>;
    return <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />;
  };

  // Check if user can act on a specific leave at its current level
  const canActOnLeave = (leave: any) => {
    if (isAdminViewer) return false;
    return canApproveLevels.includes(leave.currentLevel);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Leave Management</h1>
          <p className="text-gray-500 mt-1">
            {hierarchy.length > 0
              ? `${hierarchy.length}-level approval: ${hierarchy.map((h: any) => h.name).join(' → ')}`
              : 'Multi-level approval workflow'}
          </p>
        </div>
        <button onClick={() => setShowRequest(true)} className="px-4 py-2 bg-primary text-white rounded-lg font-medium hover:bg-primary/90">Request Leave</button>
      </div>

      {/* Pending approvals */}
      {canView && pendingLeaves.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4">
          <h3 className="font-semibold text-amber-800 mb-3">
            {canApprove ? `Pending Your Approval (${pendingLeaves.length})` : `All Pending Leaves (${pendingLeaves.length})`}
          </h3>
          {isAdminViewer && <p className="text-xs text-amber-600 mb-3">View only — only assigned approver roles can approve at their respective levels</p>}
          <div className="space-y-3">
            {pendingLeaves.map((l: any) => {
              const canAct = canActOnLeave(l);
              return (
              <div key={l.id} className="bg-white rounded-lg p-4 shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{l.user?.firstName} {l.user?.lastName}</p>
                      <span className="text-xs text-gray-400">{l.user?.department?.name}</span>
                    </div>
                    <p className="text-sm text-gray-600">{l.type} · {new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()} ({l.totalDays} days)</p>
                    {l.reason && <p className="text-sm text-gray-500 mt-1">{l.reason}</p>}

                    {/* Approval chain */}
                    <ApprovalChain approvals={l.approvals} currentLevel={l.currentLevel} levelIcon={levelIcon} />

                    {!canAct && canApprove && (
                      <p className="text-xs text-gray-400 mt-2">Awaiting {l.approvals?.find((a: any) => a.level === l.currentLevel)?.levelName || `Level ${l.currentLevel}`} approval</p>
                    )}
                  </div>
                  {canAct && (
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => approveMutation.mutate({ id: l.id })}
                        disabled={approveMutation.isPending}
                        className="px-3 py-1.5 bg-green-500 text-white rounded-lg text-sm hover:bg-green-600 disabled:opacity-50"
                      >Approve</button>
                      <button
                        onClick={() => setRejectId(l.id)}
                        className="px-3 py-1.5 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600"
                      >Reject</button>
                    </div>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Leave Requests */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-6 py-4 border-b"><h3 className="font-semibold">My Leave Requests</h3></div>
        <div className="divide-y">
          {isLoading ? [...Array(3)].map((_, i) => (
            <div key={i} className="p-4"><div className="h-4 bg-gray-200 rounded w-48 animate-pulse" /></div>
          )) : !(myLeaves?.data || myLeaves)?.length ? (
            <p className="px-6 py-8 text-center text-gray-400">No leave requests yet</p>
          ) : (
            (myLeaves?.data || myLeaves).map((l: any) => (
              <div key={l.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{l.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(l.status)}`}>{l.status}</span>
                      <span className="text-xs text-gray-400">{l.totalDays} day{l.totalDays > 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {new Date(l.startDate).toLocaleDateString()} — {new Date(l.endDate).toLocaleDateString()}
                    </p>
                    {l.reason && <p className="text-sm text-gray-400 mt-0.5">{l.reason}</p>}

                    {/* Rejection banner — visible to requester */}
                    {l.status === 'REJECTED' && (
                      <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-3">
                        <div className="flex items-start gap-2">
                          <svg className="w-4 h-4 text-red-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div>
                            <p className="text-sm font-medium text-red-700">Request Rejected</p>
                            {/* Find who rejected and at which level */}
                            {(() => {
                              const rejectedStep = l.approvals?.find((a: any) => a.status === 'REJECTED');
                              return rejectedStep ? (
                                <p className="text-xs text-red-600 mt-0.5">
                                  Rejected by {rejectedStep.approver?.firstName} {rejectedStep.approver?.lastName} at {rejectedStep.levelName} level
                                </p>
                              ) : null;
                            })()}
                            {l.rejectionReason && (
                              <p className="text-sm text-red-600 mt-1">
                                <span className="font-medium">Reason:</span> {l.rejectionReason}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Approval chain with comments */}
                <ApprovalChain approvals={l.approvals} currentLevel={l.currentLevel} levelIcon={levelIcon} showComments />
              </div>
            ))
          )}
        </div>
      </div>

      {/* Request Leave Modal */}
      {showRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowRequest(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Request Leave</h2>
            <p className="text-sm text-gray-500 mb-4">
              {hierarchy.length > 0
                ? `Requires approval from: ${hierarchy.map((h: any) => h.name).join(' → ')}`
                : 'Requires multi-level approval'}
            </p>
            <form onSubmit={(e) => { e.preventDefault(); requestMutation.mutate(form); }} className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
                <select required value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none">
                  {leaveTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label><input required type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">End Date</label><input required type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason</label><textarea required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-primary outline-none resize-none" /></div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowRequest(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                <button type="submit" disabled={requestMutation.isPending} className="px-4 py-2 bg-primary text-white rounded-lg font-medium disabled:opacity-50">{requestMutation.isPending ? 'Submitting...' : 'Submit'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setRejectId(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1">Reject Leave Request</h2>
            <p className="text-sm text-gray-500 mb-3">This reason will be visible to the employee who requested the leave.</p>
            <textarea
              placeholder="Reason for rejection (required) — e.g., insufficient notice period, team capacity, etc."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-red-300 outline-none resize-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => { setRejectId(null); setRejectReason(''); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button
                onClick={() => rejectMutation.mutate({ id: rejectId, rejectionReason: rejectReason })}
                disabled={!rejectReason.trim() || rejectMutation.isPending}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium disabled:opacity-50"
              >{rejectMutation.isPending ? 'Rejecting...' : 'Reject'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== APPROVAL CHAIN COMPONENT ==========
function ApprovalChain({
  approvals,
  currentLevel,
  levelIcon,
  showComments = false,
}: {
  approvals: any[];
  currentLevel: number;
  levelIcon: (status: string) => React.ReactNode;
  showComments?: boolean;
}) {
  if (!approvals?.length) return null;

  return (
    <div className="mt-3 space-y-0">
      <div className="flex items-center gap-0">
        {approvals.map((a: any, i: number) => (
          <div key={a.id} className="flex items-center">
            {i > 0 && <div className={`w-8 h-0.5 ${a.status === 'APPROVED' ? 'bg-green-300' : a.status === 'REJECTED' ? 'bg-red-300' : 'bg-gray-200'}`} />}
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs ${
              a.status === 'APPROVED' ? 'bg-green-50 text-green-700' :
              a.status === 'REJECTED' ? 'bg-red-50 text-red-700' :
              currentLevel === a.level ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' :
              'bg-gray-50 text-gray-400'
            }`}>
              {levelIcon(a.status)}
              <div>
                <span className="font-medium">{a.levelName}</span>
                {a.approver && (
                  <span className="block text-[10px] opacity-75">
                    {a.status === 'REJECTED' ? 'Rejected by ' : ''}{a.approver.firstName} {a.approver.lastName}
                  </span>
                )}
                {a.actedAt && (
                  <span className="block text-[10px] opacity-50">
                    {new Date(a.actedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Show comments/reasons from each step */}
      {showComments && approvals.some((a: any) => a.comments && a.status !== 'PENDING') && (
        <div className="mt-2 space-y-1 pl-1">
          {approvals
            .filter((a: any) => a.comments && a.status !== 'PENDING')
            .map((a: any) => (
              <div key={a.id} className={`text-xs flex items-start gap-1.5 ${a.status === 'REJECTED' ? 'text-red-600' : 'text-gray-500'}`}>
                <span className="font-medium shrink-0">{a.levelName}:</span>
                <span className="italic">"{a.comments}"</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
