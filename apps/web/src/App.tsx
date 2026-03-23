import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/auth.store';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AttendancePage from './pages/AttendancePage';
import UsersPage from './pages/UsersPage';
import DepartmentsPage from './pages/DepartmentsPage';
import LocationsPage from './pages/LocationsPage';
import LeavesPage from './pages/LeavesPage';
import QrCodesPage from './pages/QrCodesPage';
import ReportsPage from './pages/ReportsPage';
import ShiftsPage from './pages/ShiftsPage';
import AuditLogsPage from './pages/AuditLogsPage';
import HolidaysPage from './pages/HolidaysPage';
import ProfilePage from './pages/ProfilePage';
import DashboardLayout from './components/DashboardLayout';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'DEPARTMENT_HEAD'];
const MANAGER_ROLES = [...ADMIN_ROLES, 'SUPERVISOR'];

function RoleRoute({ children, roles }: { children: React.ReactNode; roles: string[] }) {
  const user = useAuthStore((s) => s.user);
  if (!roles.includes(user?.role || '')) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="users" element={<RoleRoute roles={ADMIN_ROLES}><UsersPage /></RoleRoute>} />
        <Route path="departments" element={<RoleRoute roles={ADMIN_ROLES}><DepartmentsPage /></RoleRoute>} />
        <Route path="locations" element={<RoleRoute roles={ADMIN_ROLES}><LocationsPage /></RoleRoute>} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route path="qr-codes" element={<RoleRoute roles={ADMIN_ROLES}><QrCodesPage /></RoleRoute>} />
        <Route path="reports" element={<RoleRoute roles={MANAGER_ROLES}><ReportsPage /></RoleRoute>} />
        <Route path="shifts" element={<RoleRoute roles={ADMIN_ROLES}><ShiftsPage /></RoleRoute>} />
        <Route path="holidays" element={<RoleRoute roles={ADMIN_ROLES}><HolidaysPage /></RoleRoute>} />
        <Route path="audit-logs" element={<RoleRoute roles={['SUPER_ADMIN', 'ADMIN']}><AuditLogsPage /></RoleRoute>} />
        <Route path="profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
