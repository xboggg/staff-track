import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { toast } from 'sonner';

interface ApprovalLevel {
  level: number;
  name: string;
  roles: string[];
}

interface AvailableRole {
  value: string;
  label: string;
}

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Organization Settings</h1>
        <p className="text-gray-500 mt-1">Configure your organization's workflow and policies</p>
      </div>
      <ApprovalHierarchySettings />
    </div>
  );
}

function ApprovalHierarchySettings() {
  const queryClient = useQueryClient();
  const [levels, setLevels] = useState<ApprovalLevel[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AvailableRole[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['approval-hierarchy'],
    queryFn: async () => (await api.get('/leaves/approval-hierarchy')).data,
  });

  useEffect(() => {
    if (data) {
      setLevels(data.hierarchy);
      setAvailableRoles(data.availableRoles);
      setHasChanges(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (hierarchy: ApprovalLevel[]) => {
      return (await api.put('/leaves/approval-hierarchy', { hierarchy })).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['approval-hierarchy'] });
      toast.success('Approval hierarchy saved');
      setHasChanges(false);
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Failed to save');
    },
  });

  const addLevel = () => {
    if (levels.length >= 3) {
      toast.error('Maximum 3 approval levels allowed');
      return;
    }
    setLevels([...levels, { level: levels.length + 1, name: '', roles: [] }]);
    setHasChanges(true);
  };

  const removeLevel = (index: number) => {
    if (levels.length <= 1) {
      toast.error('At least 1 approval level is required');
      return;
    }
    const updated = levels.filter((_, i) => i !== index).map((lvl, i) => ({ ...lvl, level: i + 1 }));
    setLevels(updated);
    setHasChanges(true);
  };

  const updateLevel = (index: number, field: keyof ApprovalLevel, value: any) => {
    const updated = [...levels];
    updated[index] = { ...updated[index], [field]: value };
    setLevels(updated);
    setHasChanges(true);
  };

  const toggleRole = (index: number, role: string) => {
    const current = levels[index].roles;
    const updated = current.includes(role)
      ? current.filter((r) => r !== role)
      : [...current, role];
    updateLevel(index, 'roles', updated);
  };

  const handleSave = () => {
    // Validate before sending
    for (const lvl of levels) {
      if (!lvl.name.trim()) {
        toast.error(`Level ${lvl.level} needs a name`);
        return;
      }
      if (lvl.roles.length === 0) {
        toast.error(`Level ${lvl.level} needs at least one role`);
        return;
      }
    }
    saveMutation.mutate(levels);
  };

  const resetToDefault = () => {
    setLevels([
      { level: 1, name: 'Immediate Supervisor', roles: ['SUPERVISOR'] },
      { level: 2, name: 'Head of Department', roles: ['DEPARTMENT_HEAD'] },
      { level: 3, name: 'Head of HR', roles: ['HR_MANAGER'] },
    ]);
    setHasChanges(true);
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-32 bg-gray-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-lg">Leave Approval Hierarchy</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure who approves leave requests and in what order (1-3 levels)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={resetToDefault}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
          >
            Reset to Default
          </button>
          {levels.length < 3 && (
            <button
              onClick={addLevel}
              className="px-3 py-1.5 text-sm bg-violet-100 text-violet-700 hover:bg-violet-200 rounded-lg font-medium flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Level
            </button>
          )}
        </div>
      </div>

      <div className="p-6 space-y-4">
        {/* Visual flow */}
        <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
          <span className="text-sm text-gray-500">Employee submits</span>
          <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          {levels.map((lvl, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 text-sm font-medium text-violet-700 whitespace-nowrap">
                {lvl.name || `Level ${lvl.level}`}
              </div>
              {i < levels.length - 1 && (
                <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              )}
            </div>
          ))}
          <svg className="w-5 h-5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
          <span className="text-sm text-green-600 font-medium whitespace-nowrap">Approved</span>
        </div>

        {/* Level cards */}
        {levels.map((lvl, index) => (
          <div key={index} className="border rounded-xl p-5 relative">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-violet-600 text-white flex items-center justify-center text-sm font-bold">
                  {lvl.level}
                </div>
                <div>
                  <label className="text-xs text-gray-500 font-medium uppercase">Level {lvl.level} Name</label>
                  <input
                    type="text"
                    value={lvl.name}
                    onChange={(e) => updateLevel(index, 'name', e.target.value)}
                    placeholder="e.g., Immediate Supervisor"
                    className="block w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500"
                  />
                </div>
              </div>
              {levels.length > 1 && (
                <button
                  onClick={() => removeLevel(index)}
                  className="text-red-400 hover:text-red-600 p-1"
                  title="Remove level"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>

            <div>
              <label className="text-xs text-gray-500 font-medium uppercase mb-2 block">
                Roles that can approve at this level
              </label>
              <div className="flex flex-wrap gap-2">
                {availableRoles.map((role) => {
                  const isSelected = lvl.roles.includes(role.value);
                  return (
                    <button
                      key={role.value}
                      onClick={() => toggleRole(index, role.value)}
                      className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3.5 h-3.5 inline mr-1 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                      {role.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}

        {/* Info box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <svg className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800">
            <p className="font-medium">How it works</p>
            <p className="mt-1">When an employee submits a leave request, it goes through each level in order. A user with any of the assigned roles at each level can approve or reject. If rejected at any level, the entire request is rejected. New requests will use the updated hierarchy — existing pending requests keep their original chain.</p>
          </div>
        </div>
      </div>

      {/* Save bar */}
      {hasChanges && (
        <div className="px-6 py-4 border-t bg-amber-50 flex items-center justify-between rounded-b-xl">
          <span className="text-sm text-amber-700 font-medium">You have unsaved changes</span>
          <div className="flex gap-2">
            <button
              onClick={() => { setLevels(data?.hierarchy || []); setHasChanges(false); }}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-white"
            >
              Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 font-medium"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
