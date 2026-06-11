import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout/Layout';
import Login from './pages/Login';
import ManagerDashboard from './pages/Dashboard/ManagerDashboard';
import CallerDashboard from './pages/Dashboard/CallerDashboard';
import LeadsPage from './pages/Leads/LeadsPage';
import LeadDetail from './pages/Leads/LeadDetail';
import FollowUpsPage from './pages/FollowUps/FollowUpsPage';
import AttendancePage from './pages/Attendance/AttendancePage';
import ReportsPage from './pages/Reports/ReportsPage';
import AlertsPage from './pages/Alerts/AlertsPage';
import ActivityLogsPage from './pages/ActivityLogs/ActivityLogsPage';
import UsersPage from './pages/Users/UsersPage';
import Spinner from './components/UI/Spinner';

const ProtectedRoute = ({ children, managerOnly }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="flex items-center justify-center h-screen"><Spinner size="lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  if (managerOnly && user.role !== 'manager') return <Navigate to="/dashboard" replace />;
  return children;
};

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-gray-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-primary-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400">Loading Varco CRM...</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" replace /> : <Login />}
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route
          path="dashboard"
          element={user?.role === 'manager' ? <ManagerDashboard /> : <CallerDashboard />}
        />
        <Route path="leads" element={<LeadsPage />} />
        <Route path="leads/:id" element={<LeadDetail />} />
        <Route path="follow-ups" element={<FollowUpsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route
          path="reports"
          element={<ProtectedRoute managerOnly><ReportsPage /></ProtectedRoute>}
        />
        <Route
          path="alerts"
          element={<ProtectedRoute managerOnly><AlertsPage /></ProtectedRoute>}
        />
        <Route
          path="activity-logs"
          element={<ProtectedRoute managerOnly><ActivityLogsPage /></ProtectedRoute>}
        />
        <Route
          path="users"
          element={<ProtectedRoute managerOnly><UsersPage /></ProtectedRoute>}
        />
      </Route>

      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
