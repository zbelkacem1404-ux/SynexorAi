import React, { useEffect, useState, useCallback } from 'react';
import { ShieldCheck, CheckCircle2, XCircle, Clock, Filter, RefreshCw, AlertTriangle, Truck, Package, ChevronDown, X } from 'lucide-react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { ApprovalItem } from '../types';
import { Navigate } from 'react-router-dom';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending:  { label: 'Pending',  cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',  icon: <Clock className="w-3 h-3" /> },
  approved: { label: 'Approved', cls: 'bg-green-500/15 text-green-400 border-green-500/30',  icon: <CheckCircle2 className="w-3 h-3" /> },
  rejected: { label: 'Rejected', cls: 'bg-red-500/15  text-red-400  border-red-500/30',    icon: <XCircle className="w-3 h-3" /> },
};

const TYPE_CLR: Record<string, string> = {
  FTL: 'text-blue-400 bg-blue-400/10', LTL: 'text-purple-400 bg-purple-400/10',
  MR: 'text-pink-400 bg-pink-400/10',  HUB: 'text-green-400 bg-green-400/10',
};

// ── Reject modal ───────────────────────────────────────────────────────────────
function RejectModal({ item, onConfirm, onCancel }: {
  item: ApprovalItem;
  onConfirm: (notes: string) => void;
  onCancel: () => void;
}) {
  const [notes, setNotes] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-[#12121a] border border-red-500/30 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
            <XCircle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <div className="font-semibold text-white">Reject Requisition</div>
            <div className="text-sm text-gray-400">{item.req_number} · {item.supplier_name}</div>
          </div>
        </div>
        <p className="text-sm text-gray-300 mb-4">
          Provide a reason for rejection. This will be returned to the planner for correction.
        </p>
        <textarea
          className="w-full bg-[#0F0F14] border border-gray-700 rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-red-500/60 h-28"
          placeholder="Rejection reason (required)…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 rounded-lg border border-gray-700 text-gray-300 text-sm hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!notes.trim()}
            onClick={() => onConfirm(notes.trim())}
            className="flex-1 px-4 py-2 rounded-lg bg-red-500/80 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Detail popover ─────────────────────────────────────────────────────────────
function DeviationList({ deviations }: { deviations: string[] }) {
  if (!deviations.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {deviations.map((d, i) => (
        <li key={i} className="flex items-start gap-1.5 text-xs text-amber-300/80">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0 text-amber-500" />
          {d}
        </li>
      ))}
    </ul>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ApprovalBoardPage() {
  const { canApprove, isCarrier } = useAuth();

  if (isCarrier) return <Navigate to="/" replace />;

  const [items, setItems]               = useState<ApprovalItem[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType]     = useState<string>('all');
  const [search, setSearch]             = useState('');
  const [rejectTarget, setRejectTarget] = useState<ApprovalItem | null>(null);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [toast, setToast]               = useState<{ msg: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/booking/approval-board');
      setItems(data);
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load approval board');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  const doAction = async (item: ApprovalItem, action: 'approve' | 'reject', notes = '') => {
    setActionLoading(item.id);
    try {
      const { data } = await api.put(`/booking/requisitions/${item.id}/approve`, { action, approval_notes: notes });
      showToast(data.message, true);
      await load();
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Action failed', false);
    } finally {
      setActionLoading(null);
      setRejectTarget(null);
    }
  };

  // ── Derived stats ────────────────────────────────────────────────────────────
  const pending  = items.filter(i => i.approval_status === 'pending' || i.status === 'pending_approval');
  const approved = items.filter(i => i.approval_status === 'approved');
  const rejected = items.filter(i => i.approval_status === 'rejected');

  // ── Filtered view ────────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    const approvalSt = item.approval_status === 'pending' || item.status === 'pending_approval' ? 'pending' : item.approval_status;
    if (filterStatus !== 'all' && approvalSt !== filterStatus) return false;
    if (filterType !== 'all' && (item.shipment_type ?? '').toUpperCase() !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !item.req_number.toLowerCase().includes(q) &&
        !(item.supplier_name ?? '').toLowerCase().includes(q) &&
        !(item.requestor_name ?? '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

  return (
    <div className="flex-1 overflow-auto bg-[#0F0F14] p-6">
      {/* ── Toast ── */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium shadow-xl border ${
          toast.ok ? 'bg-green-500/20 border-green-500/40 text-green-300' : 'bg-red-500/20 border-red-500/40 text-red-300'
        }`}>
          {toast.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Approval Board</h1>
            <p className="text-sm text-gray-400">Deviation & special transport validation</p>
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-gray-400 border border-gray-700 hover:bg-gray-800 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Pending Approval', count: pending.length,  cls: 'border-amber-500/30 bg-amber-500/5',  text: 'text-amber-400', icon: <Clock className="w-5 h-5 text-amber-400" /> },
          { label: 'Approved',         count: approved.length, cls: 'border-green-500/30 bg-green-500/5',  text: 'text-green-400', icon: <CheckCircle2 className="w-5 h-5 text-green-400" /> },
          { label: 'Rejected',         count: rejected.length, cls: 'border-red-500/30   bg-red-500/5',    text: 'text-red-400',   icon: <XCircle className="w-5 h-5 text-red-400" /> },
        ].map(s => (
          <div key={s.label} className={`rounded-xl border ${s.cls} p-4 flex items-center gap-4`}>
            <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center">{s.icon}</div>
            <div>
              <div className={`text-2xl font-bold ${s.text}`}>{s.count}</div>
              <div className="text-xs text-gray-400">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-1.5 text-gray-400 text-sm">
          <Filter className="w-4 h-4" />
          <span>Filter:</span>
        </div>
        {/* Status filter */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-[#1a1a28] border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500/50"
        >
          <option value="all">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        {/* Type filter */}
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="bg-[#1a1a28] border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-amber-500/50"
        >
          <option value="all">All Types</option>
          <option value="FTL">FTL</option>
          <option value="LTL">LTL</option>
          <option value="MR">Milkrun</option>
          <option value="HUB">Hub</option>
        </select>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by requisition, supplier…"
          className="bg-[#1a1a28] border border-gray-700 text-gray-300 text-sm rounded-lg px-3 py-1.5 w-64 placeholder-gray-500 focus:outline-none focus:border-amber-500/50"
        />
        {(filterStatus !== 'all' || filterType !== 'all' || search) && (
          <button
            onClick={() => { setFilterStatus('all'); setFilterType('all'); setSearch(''); }}
            className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">{filtered.length} item{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-gray-500">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-red-400 text-sm p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
          <ShieldCheck className="w-10 h-10 opacity-30" />
          <span className="text-sm">No items match the current filters</span>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#12121a] border-b border-gray-800 text-gray-400 text-xs uppercase tracking-wide">
                <th className="px-4 py-3 text-left">Requisition</th>
                <th className="px-4 py-3 text-left">Supplier</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Deviations</th>
                <th className="px-4 py-3 text-left">Justification</th>
                <th className="px-4 py-3 text-left">Pickup</th>
                <th className="px-4 py-3 text-right">Pallets</th>
                <th className="px-4 py-3 text-left">Requested By</th>
                <th className="px-4 py-3 text-left">Status</th>
                {canApprove && <th className="px-4 py-3 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => {
                const approvalSt  = item.approval_status === 'pending' || item.status === 'pending_approval' ? 'pending' : item.approval_status ?? 'pending';
                const stCfg       = STATUS_CFG[approvalSt] ?? STATUS_CFG.pending;
                const typeCls     = TYPE_CLR[(item.shipment_type ?? 'FTL').toUpperCase()] ?? TYPE_CLR.FTL;
                const isPending   = approvalSt === 'pending';
                const isLoading   = actionLoading === item.id;

                return (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-800/60 transition-colors ${
                      isPending ? 'bg-amber-500/3 hover:bg-amber-500/6' : 'hover:bg-white/2'
                    } ${idx % 2 === 0 ? '' : 'bg-white/[0.01]'}`}
                  >
                    {/* Req number */}
                    <td className="px-4 py-3">
                      <div className="font-mono text-white font-semibold text-xs">{item.req_number}</div>
                      {item.approved_by && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          by {item.approved_by} · {fmtDate(item.approval_timestamp)}
                        </div>
                      )}
                    </td>

                    {/* Supplier */}
                    <td className="px-4 py-3">
                      <div className="text-gray-200 font-medium">{item.supplier_name ?? '—'}</div>
                      <div className="text-xs text-gray-500">{item.supplier_city}{item.supplier_country ? `, ${item.supplier_country}` : ''}</div>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold w-fit ${typeCls}`}>
                          <Truck className="w-3 h-3" />
                          {item.shipment_type ?? 'FTL'}
                        </span>
                        <span className="text-xs text-gray-500 uppercase">{item.transport_mode}</span>
                      </div>
                    </td>

                    {/* Deviations */}
                    <td className="px-4 py-3 max-w-xs">
                      {item.deviations.length > 0 ? (
                        <DeviationList deviations={item.deviations} />
                      ) : (
                        <span className="text-xs text-gray-600">Special transport</span>
                      )}
                    </td>

                    {/* Justification */}
                    <td className="px-4 py-3 max-w-[200px]">
                      {item.deviation_justification ? (
                        <p className="text-xs text-gray-300 line-clamp-2">{item.deviation_justification}</p>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                      {item.approval_notes && (
                        <p className={`text-xs mt-1 italic ${approvalSt === 'rejected' ? 'text-red-400/80' : 'text-green-400/80'}`}>
                          Note: {item.approval_notes}
                        </p>
                      )}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-gray-300 text-xs">{fmtDate(item.pickup_date)}</div>
                      {item.delivery_date && (
                        <div className="text-gray-500 text-xs">→ {fmtDate(item.delivery_date)}</div>
                      )}
                    </td>

                    {/* Pallets */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 text-gray-300">
                        <Package className="w-3 h-3 text-gray-500" />
                        <span className="font-medium">{item.pallets}</span>
                      </div>
                      {item.weight_kg && (
                        <div className="text-xs text-gray-500 text-right">{item.weight_kg.toLocaleString()} kg</div>
                      )}
                    </td>

                    {/* Requested by */}
                    <td className="px-4 py-3">
                      <div className="text-gray-300 text-xs">{item.requestor_name}</div>
                      {item.department && <div className="text-gray-500 text-xs">{item.department}</div>}
                      <div className="text-gray-600 text-xs">{fmtDate(item.created_at)}</div>
                    </td>

                    {/* Status badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${stCfg.cls}`}>
                        {stCfg.icon}
                        {stCfg.label}
                      </span>
                    </td>

                    {/* Actions */}
                    {canApprove && (
                      <td className="px-4 py-3">
                        {isPending ? (
                          <div className="flex items-center gap-2 justify-center">
                            <button
                              disabled={isLoading}
                              onClick={() => doAction(item, 'approve')}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/15 hover:bg-green-500/25 text-green-400 border border-green-500/30 text-xs font-medium transition-colors disabled:opacity-40"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              disabled={isLoading}
                              onClick={() => setRejectTarget(item)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 text-xs font-medium transition-colors disabled:opacity-40"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="text-center text-xs text-gray-600">—</div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reject modal ── */}
      {rejectTarget && (
        <RejectModal
          item={rejectTarget}
          onConfirm={notes => doAction(rejectTarget, 'reject', notes)}
          onCancel={() => setRejectTarget(null)}
        />
      )}
    </div>
  );
}
