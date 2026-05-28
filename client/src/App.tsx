import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SuppliersPage from './pages/SuppliersPage';
import SupplierDetailPage from './pages/SupplierDetailPage';
import RoutesPage from './pages/RoutesPage';
import SettingsPage from './pages/SettingsPage';
import KPIDashboardPage from './pages/KPIDashboardPage';
import TransportBookingPage from './pages/TransportBookingPage';
import RoutePlanPage from './pages/RoutePlanPage';
import ApprovalBoardPage from './pages/ApprovalBoardPage';

function ProtectedLayout() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" />;

  return (
    <div className="h-screen flex flex-col bg-dark">
      <Navbar />
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/suppliers" element={<SuppliersPage />} />
        <Route path="/suppliers/:id" element={<SupplierDetailPage />} />
        <Route path="/routes" element={<RoutesPage />} />
        <Route path="/kpi" element={<KPIDashboardPage />} />
        <Route path="/booking" element={<TransportBookingPage />} />
        <Route path="/route-plan" element={<RoutePlanPage />} />
        <Route path="/approval-board" element={<ApprovalBoardPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  );
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/*" element={<ProtectedLayout />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
