import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Map, Database, LogOut, Route, FileSpreadsheet, Settings, BarChart3, Package, ClipboardList, ShieldCheck } from 'lucide-react';
import ImportExportModal from './ImportExportModal';

const ROLE_BADGE: Record<string, string> = {
  admin:      'bg-brand-vibrant-pink text-white',
  supervisor: 'bg-amber-500 text-black',
  planner:    'bg-blue-600 text-white',
  operations: 'bg-purple-600 text-white',
  carrier:    'bg-green-700 text-white',
  viewer:     'bg-gray-600 text-gray-300',
};

export default function Navbar() {
  const { user, logout, isAdmin, canApprove, isCarrier } = useAuth();
  const location = useLocation();
  const [showImportExport, setShowImportExport] = useState(false);

  const navLinks = [
    { to: '/', label: 'Map Dashboard', icon: Map, hidden: false },
    { to: '/kpi', label: 'KPI Dashboard', icon: BarChart3, hidden: false },
    { to: '/suppliers', label: 'Suppliers', icon: Database, hidden: false },
    { to: '/routes', label: 'Routes', icon: Route, hidden: false },
    { to: '/booking', label: 'Transport Booking', icon: Package, hidden: false },
    { to: '/route-plan', label: 'Route Plan', icon: ClipboardList, hidden: false },
    { to: '/approval-board', label: 'Approval Board', icon: ShieldCheck, hidden: !canApprove },
    { to: '/settings', label: 'Settings', icon: Settings, hidden: false },
  ].filter(l => !l.hidden);

  return (
    <>
      <nav className="bg-dark border-b border-gray-700 px-4 py-2 flex items-center justify-between z-50 relative">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 flex-shrink-0">
            <svg width="38" height="27" viewBox="0 0 100 72" className="flex-shrink-0" aria-hidden="true">
              <path d="M 2,8 L 56,8 L 70,18 L 56,28 L 2,28 Z" fill="#FFFFFF"/>
              <path d="M 98,44 L 44,44 L 30,54 L 44,64 L 98,64 Z" fill="#FFFFFF"/>
              <circle cx="52" cy="36" r="6.5" fill="#E8366D"/>
            </svg>
            <div className="flex flex-col leading-tight">
              <span className="text-base font-bold text-white font-primary">Synexor<span className="text-brand-vibrant-pink">AI</span></span>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            {navLinks.map(({ to, label, icon: Icon }) => {
              const isActive = location.pathname === to;
              const isApproval = to === '/approval-board';
              return (
                <Link
                  key={to}
                  to={to}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 transition-colors ${
                    isActive
                      ? isApproval
                        ? 'bg-amber-500/15 text-amber-400'
                        : 'bg-brand-vibrant-pink/10 text-brand-vibrant-pink'
                      : isApproval
                        ? 'text-amber-500/70 hover:text-amber-400 hover:bg-amber-500/10'
                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {!isCarrier && (
            <button
              onClick={() => setShowImportExport(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
              title="Import / Export Data"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span className="hidden sm:inline">Import/Export</span>
            </button>
          )}
          <span className="text-sm text-gray-400">
            {user?.username}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_BADGE[user?.role ?? 'viewer'] ?? ROLE_BADGE.viewer}`}>
              {user?.role}
            </span>
          </span>
          <button
            onClick={logout}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-md transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </nav>
      {showImportExport && (
        <ImportExportModal
          onClose={() => setShowImportExport(false)}
          onImportComplete={() => window.location.reload()}
        />
      )}
    </>
  );
}
