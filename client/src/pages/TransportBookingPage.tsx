import React, { useState, useEffect, useMemo, useRef } from 'react';
import api from '../utils/api';
import { TransportRequisition, RequisitionStatus, Supplier, ForwarderQuote } from '../types';
import { useAuth } from '../contexts/AuthContext';
import {
  Plus, X, Send, Truck, Package, Clock, CheckCircle, AlertTriangle,
  FileText, DollarSign, User, Search, Zap, Trash2, ShieldAlert, RotateCcw, ArrowRight
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────
const STATUS_CONFIG: Record<RequisitionStatus, { label: string; icon: React.ReactNode; color: string; bgColor: string }> = {
  new: { label: 'New Requisitions', icon: <FileText className="w-4 h-4" />, color: 'text-blue-400', bgColor: 'bg-blue-900/20' },
  pending_approval: { label: 'Pending Approval', icon: <ShieldAlert className="w-4 h-4" />, color: 'text-amber-400', bgColor: 'bg-amber-900/20' },
  spot_requested: { label: 'Spot Requested', icon: <Send className="w-4 h-4" />, color: 'text-yellow-400', bgColor: 'bg-yellow-900/20' },
  quotes_received: { label: 'Quotes Received', icon: <DollarSign className="w-4 h-4" />, color: 'text-purple-400', bgColor: 'bg-purple-900/20' },
  assigned: { label: 'Assigned to Forwarder', icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-400', bgColor: 'bg-green-900/20' },
  in_transit: { label: 'In Transit', icon: <Truck className="w-4 h-4" />, color: 'text-orange-400', bgColor: 'bg-orange-900/20' },
  delivered: { label: 'Delivered', icon: <Package className="w-4 h-4" />, color: 'text-emerald-400', bgColor: 'bg-emerald-900/20' },
  cancelled: { label: 'Cancelled', icon: <X className="w-4 h-4" />, color: 'text-gray-400', bgColor: 'bg-gray-900/20' },
};
const PIPELINE_ORDER: RequisitionStatus[] = ['new', 'pending_approval', 'spot_requested', 'quotes_received', 'assigned', 'in_transit', 'delivered'];

const MODE_OPTIONS = [
  { value: 'FTL', label: 'FTL', color: '#3b82f6', desc: 'Full Truck Load — direct lane', prefix: 'F' },
  { value: 'LTL', label: 'LTL', color: '#8b5cf6', desc: 'Less Than Truck Load — shared capacity', prefix: 'L' },
  { value: 'MR', label: 'MR (Milkrun)', color: '#f59e0b', desc: 'Milkrun — chained pickup route', prefix: 'M' },
  { value: 'HUB', label: 'HUB', color: '#10b981', desc: 'Hub consolidation', prefix: 'H' },
];
const RT_HQ = { id: 'RT-HQ', name: 'RT Automotive d.o.o.', zip: '10000', city: 'Zagreb', country: 'HR Croatia' };
const DEFAULT_FORWARDERS = ['DHL Freight', 'Kuehne+Nagel', 'DB Schenker', 'CMA CGM', 'Interload', 'DSV', 'GEODIS', 'XPO Logistics', "Waberer's", 'Girteka', 'Raben Group', 'Dachser'];

// Day codes → JS weekday (0=Sun, 1=Mon, ..., 6=Sat)
const DAY_CODE_LABELS: Record<string, string> = {
  M0: 'Monday', T0: 'Tuesday', W0: 'Wednesday', R0: 'Thursday', F0: 'Friday', S0: 'Saturday', Z0: 'Sunday',
  M1: 'Monday +1w', T1: 'Tuesday +1w', W1: 'Wednesday +1w', R1: 'Thursday +1w', F1: 'Friday +1w', S1: 'Saturday +1w',
};
const DAY_CODE_WEEKDAY: Record<string, number> = {
  M0: 1, T0: 2, W0: 3, R0: 4, F0: 5, S0: 6, Z0: 0,
  M1: 1, T1: 2, W1: 3, R1: 4, F1: 5, S1: 6,
};

function getWeekdayFromDate(dateStr: string): number {
  if (!dateStr) return -1;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? -1 : d.getDay(); // 0=Sun..6=Sat
}
function weekdayName(day: number): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] || '?';
}

// Equipment types with internal dimensions (L×W×H in m) + max weight
// NOTE: maxPallets is the FALLBACK floor count for standard EUR pallets (1.2×0.8m).
// Actual capacity is dynamically calculated from pallet dimensions + stackability.
const EQUIPMENT_OPTIONS: { value: string; label: string; lengthM: number; widthM: number; heightM: number; maxPallets: number; maxWeightKg: number }[] = [
  { value: 'Standard Trailer', label: 'Standard Trailer (13.6m)', lengthM: 13.6, widthM: 2.45, heightM: 2.7, maxPallets: 33, maxWeightKg: 24000 },
  { value: 'Mega Trailer', label: 'Mega Trailer (13.6m, 3m H)', lengthM: 13.6, widthM: 2.45, heightM: 3.0, maxPallets: 33, maxWeightKg: 24000 },
  { value: 'Short Trailer', label: 'Short Trailer (7.7m)', lengthM: 7.7, widthM: 2.45, heightM: 2.7, maxPallets: 18, maxWeightKg: 12000 },
  { value: '40ft Container', label: '40ft Container', lengthM: 12.03, widthM: 2.35, heightM: 2.39, maxPallets: 24, maxWeightKg: 28000 },
  { value: '20ft Container', label: '20ft Container', lengthM: 5.9, widthM: 2.35, heightM: 2.39, maxPallets: 10, maxWeightKg: 21000 },
  { value: 'Swap Body', label: 'Swap Body (7.45m)', lengthM: 7.45, widthM: 2.45, heightM: 2.7, maxPallets: 16, maxWeightKg: 14000 },
  { value: 'Sprinter Van', label: 'Sprinter Van', lengthM: 4.3, widthM: 1.8, heightM: 1.9, maxPallets: 6, maxWeightKg: 1200 },
];

/**
 * Dynamic pallet capacity calculation based on actual pallet + truck dimensions.
 * Calculates how many pallets physically fit on the floor (considering both orientations),
 * then multiplies by stack levels (capped by truck height).
 */
function calcDynamicMaxPallets(
  truckL: number, truckW: number, truckH: number,
  palletL: number, palletW: number, palletH: number,
  stackLevels: number, fallbackMax: number
): { floorPallets: number; effectiveMax: number; maxStackLevels: number } {
  if (palletL <= 0 || palletW <= 0 || palletH <= 0) return { floorPallets: fallbackMax, effectiveMax: fallbackMax * stackLevels, maxStackLevels: stackLevels };

  // Try both orientations on the floor and pick the one that fits more pallets
  const orientA = Math.floor(truckL / palletL) * Math.floor(truckW / palletW);
  const orientB = Math.floor(truckL / palletW) * Math.floor(truckW / palletL);
  const floorPallets = Math.max(orientA, orientB);

  // Max stackable layers limited by truck height
  const maxStackByHeight = Math.max(1, Math.floor(truckH / palletH));
  const actualStackLevels = Math.min(stackLevels, maxStackByHeight);

  const effectiveMax = floorPallets * actualStackLevels;

  return { floorPallets, effectiveMax, maxStackLevels: maxStackByHeight };
}

/**
 * Helper: get the next valid date for a given weekday from a start date.
 */
function getNextDateForWeekday(weekday: number, afterDate?: string): string {
  const start = afterDate ? new Date(afterDate) : new Date();
  if (isNaN(start.getTime())) return '';
  const current = start.getDay();
  let daysUntil = weekday - current;
  if (daysUntil <= 0) daysUntil += 7;
  const target = new Date(start);
  target.setDate(target.getDate() + daysUntil);
  return target.toISOString().split('T')[0];
}

interface RoutePlan {
  id: number; route_description: string; tour_description?: string; transport_mode: string;
  origin_id?: string; origin_name?: string; origin_zip?: string; origin_city?: string; origin_country?: string;
  destination_id?: string; destination_name?: string; destination_zip?: string; destination_city?: string; destination_country?: string;
  pickup_date?: string; pickup_time?: string; delivery_date?: string; arrival_time?: string;
  carrier?: string; equipment?: string; transit_time_days?: number; customs?: string; direction: string;
}

interface MROrigin {
  id: string; supplierId: number | null; supplierCode: string;
  name: string; city: string; country: string; search: string;
  // Per-supplier cargo fields for milkrun breakdown
  pallets: string; weightKg: string; materialDescription: string;
  // Per-supplier pallet dimensions and stackability
  palletLength: string; palletWidth: string; palletHeight: string; stackLevels: number;
  // Tracks which route plan entry this stop was auto-populated from (for deviation detection)
  routePlanId?: number;
}

// ─── Main Page ───────────────────────────────────────────────────────
export default function TransportBookingPage() {
  const { isAdmin } = useAuth();
  const [requisitions, setRequisitions] = useState<TransportRequisition[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [routePlans, setRoutePlans] = useState<RoutePlan[]>([]);
  const [forwarders, setForwarders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewReqForm, setShowNewReqForm] = useState(false);
  const [showSpotModal, setShowSpotModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState<TransportRequisition | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [reqRes, supRes, rpRes, fwRes] = await Promise.all([
        api.get('/booking/requisitions'),
        api.get('/suppliers', { params: { limit: 500 } }),
        // Ensure all route plans are loaded for matching, avoid pagination cutoff
        api.get('/route-plans', { params: { limit: 5000, page: 1 } }),
        api.get('/forwarders')
      ]);
      setRequisitions(reqRes.data);
      setSuppliers(supRes.data.suppliers);
      const plans = Array.isArray(rpRes.data) ? rpRes.data : rpRes.data?.plans || [];
      setRoutePlans(plans);
      const forwarderNames = (Array.isArray(fwRes.data?.forwarders) ? fwRes.data.forwarders : []).map((f: any) => f.name).filter((n: any) => n);
      setForwarders(Array.from(new Set([...forwarderNames, ...DEFAULT_FORWARDERS])));
      console.info(`[ROUTE PLANS] loaded ${plans.length} plans for booking matching`);
    } catch (e) { console.error('Failed to load data', e); }
    setLoading(false);
  };
  useEffect(() => { fetchData(); }, []);
  const getReqsByStatus = (status: RequisitionStatus) => requisitions.filter(r => r.status === status);

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-gray-900">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white">Transport Booking Pipeline</h2>
          <p className="text-xs text-gray-500">Requisition → Spot Request → Quote → Assign → Transit → Delivered</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (<>
            <button onClick={() => setShowNewReqForm(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> New Requisition</button>
            <button onClick={() => setShowSpotModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium"><Send className="w-4 h-4" /> Launch Spot Request</button>
          </>)}
        </div>
      </div>
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          {PIPELINE_ORDER.map(status => {
            const config = STATUS_CONFIG[status]; const reqs = getReqsByStatus(status);
            return (
              <div key={status} className="w-72 flex flex-col bg-gray-800/50 border border-gray-700 rounded-xl shrink-0">
                <div className="p-3 border-b border-gray-700 flex items-center justify-between">
                  <div className="flex items-center gap-2"><span className={config.color}>{config.icon}</span><span className="text-sm font-semibold text-white">{config.label}</span></div>
                  <span className="px-2 py-0.5 bg-gray-700 rounded-full text-xs text-gray-400">{reqs.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {reqs.length === 0 ? <div className="text-center text-xs text-gray-600 py-8">No items</div>
                    : reqs.map(req => <ReqCard key={req.id} req={req} onClick={() => { setSelectedReq(req); setShowDetailModal(true); }} />)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showNewReqForm && (
        <NewRequisitionModal
          suppliers={suppliers}
          routePlans={routePlans}
          forwarders={forwarders}
          onClose={() => setShowNewReqForm(false)}
          onCreated={() => { setShowNewReqForm(false); fetchData(); }}
        />
      )}
      {showSpotModal && (
        <SpotRequestModal
          requisitions={requisitions.filter(r => r.status === 'new' && r.is_special_transport)}
          forwarders={forwarders}
          onClose={() => setShowSpotModal(false)}
          onSent={() => { setShowSpotModal(false); fetchData(); }}
        />
      )}
      {showDetailModal && selectedReq && (
        <RequisitionDetailModal
          req={selectedReq}
          forwarders={forwarders}
          onClose={() => { setShowDetailModal(false); setSelectedReq(null); }}
          onUpdate={() => { setShowDetailModal(false); setSelectedReq(null); fetchData(); }}
        />
      )}
    </div>
  );
}

// ─── ReqCard ─────────────────────────────────────────────────────────
function ReqCard({ req, onClick }: { req: TransportRequisition; onClick: () => void }) {
  const pc: Record<string, string> = { low: 'bg-green-900/40 text-green-400', medium: 'bg-yellow-900/40 text-yellow-400', high: 'bg-red-900/40 text-red-400', urgent: 'bg-red-800/60 text-red-300 animate-pulse' };
  const isSpecial = req.is_special_transport;
  return (
    <div onClick={onClick} className={`bg-gray-800 border rounded-lg p-3 cursor-pointer hover:-translate-y-0.5 transition-all ${isSpecial ? 'border-amber-600/60 hover:border-amber-500' : 'border-gray-700 hover:border-blue-600/50'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-blue-400">{req.req_number}</span>
        <div className="flex items-center gap-1">
          {isSpecial && <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-amber-900/40 text-amber-400 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Special</span>}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${pc[req.priority]}`}>{req.priority}</span>
        </div>
      </div>
      {req.route_description && <div className="text-xs font-mono text-cyan-400 mb-1">{req.route_description}</div>}
      <div className="text-sm text-white font-medium">{req.origin_name || req.supplier_name || 'Unknown'} → {req.destination_name || 'RT HQ'}</div>
      <div className="text-xs text-gray-500 mt-1">{req.pallets} plt · {req.shipment_type || req.transport_mode} · {req.material_description || 'N/A'}</div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {req.pickup_date}</span>
        <span className="flex items-center gap-1"><User className="w-3 h-3" /> {req.requestor_name}</span>
      </div>
      {req.assigned_forwarder && <div className="mt-1.5 px-2 py-0.5 bg-green-900/30 rounded text-[10px] text-green-400 text-center">{req.assigned_forwarder} {req.assigned_price ? `· €${req.assigned_price}` : ''}</div>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── Deviation Decision Modal (mandatory two-option interceptor) ──────
// ═══════════════════════════════════════════════════════════════════════
interface DeviationDecisionProps {
  deviations: string[];
  routePlanSuggestion: string | null;
  onAdjustToRoutePlan: () => void;
  onProceedAsUrgent: () => void;
  onCancel: () => void;
}

function DeviationDecisionModal({ deviations, routePlanSuggestion, onAdjustToRoutePlan, onProceedAsUrgent, onCancel }: DeviationDecisionProps) {
  const [justification, setJustification] = useState('');
  const [showJustificationField, setShowJustificationField] = useState(false);
  const [confirmingUrgent, setConfirmingUrgent] = useState(false);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={e => e.stopPropagation()}>
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg border-2 border-red-600/60 overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header with cancel button */}
        <div className="px-5 py-4 bg-red-900/40 border-b border-red-700/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-700/40 rounded-lg"><ShieldAlert className="w-6 h-6 text-red-400" /></div>
            <div>
              <h3 className="text-base font-bold text-red-300">Route Plan Deviation Detected</h3>
              <p className="text-xs text-red-400/80 mt-0.5">You can cancel and return to editing</p>
            </div>
          </div>
          <button onClick={onCancel} className="text-xs text-red-100 bg-red-700/40 px-3 py-1 rounded-lg hover:bg-red-600 transition-colors">Cancel</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Deviation list */}
          <div className="px-3 py-2.5 bg-gray-900/60 rounded-lg border border-gray-700">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Deviations from route plan:</div>
            <ul className="space-y-1.5">
              {deviations.map((d, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-red-300">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-red-500 shrink-0" />
                  <span>{d}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* AI Suggestion */}
          {routePlanSuggestion && (
            <div className="flex items-center gap-2 px-3 py-2 bg-indigo-900/20 border border-indigo-700/40 rounded-lg text-xs text-indigo-300">
              <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>{routePlanSuggestion}</span>
            </div>
          )}

          {/* Two action cards */}
          <div className="grid grid-cols-1 gap-3">
            {/* Option 1: Adjust to Route Plan */}
            <button type="button" onClick={onAdjustToRoutePlan}
              className="w-full text-left px-4 py-3.5 bg-green-900/20 border-2 border-green-700/50 hover:border-green-500 rounded-xl transition-all hover:bg-green-900/30 group">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-700/30 rounded-lg group-hover:bg-green-700/50 transition-colors">
                  <RotateCcw className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <div className="text-sm font-bold text-green-300">Adjust to Route Plan</div>
                  <div className="text-xs text-green-400/70 mt-0.5">Auto-correct all fields back to route-plan compliant values. No approval needed — standard flow.</div>
                </div>
                <CheckCircle className="w-5 h-5 text-green-500/50 group-hover:text-green-400 transition-colors" />
              </div>
            </button>

            {/* Option 2: Proceed as Urgent/Special */}
            {!showJustificationField ? (
              <button type="button" onClick={() => setShowJustificationField(true)}
                className="w-full text-left px-4 py-3.5 bg-amber-900/20 border-2 border-amber-700/50 hover:border-amber-500 rounded-xl transition-all hover:bg-amber-900/30 group">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-700/30 rounded-lg group-hover:bg-amber-700/50 transition-colors">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold text-amber-300">Proceed as Urgent / Special Transport</div>
                    <div className="text-xs text-amber-400/70 mt-0.5">Keep deviated values. Requires mandatory justification and Operations Supervisor approval before execution.</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-amber-500/50 group-hover:text-amber-400 transition-colors" />
                </div>
              </button>
            ) : (
              <div className="px-4 py-3.5 bg-amber-900/20 border-2 border-amber-600 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-amber-300">Justification Required</span>
                </div>
                <textarea
                  value={justification}
                  onChange={e => setJustification(e.target.value)}
                  placeholder="Explain why this transport must deviate from the route plan (e.g., urgent production need, supplier schedule change, emergency shipment)..."
                  className="w-full px-3 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none h-24"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-3">
                  <button type="button" onClick={() => setShowJustificationField(false)}
                    className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors">
                    ← Back
                  </button>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-amber-600">
                      {justification.trim().length < 10 ? `Min 10 characters (${justification.trim().length}/10)` : ''}
                    </div>
                    {!confirmingUrgent ? (
                      <button type="button"
                        disabled={justification.trim().length < 10}
                        onClick={() => setConfirmingUrgent(true)}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg text-sm font-semibold transition-colors">
                        Continue as Special Transport
                      </button>
                    ) : (
                      <button type="button"
                        onClick={() => {
                          // Store justification on the window so parent can read it
                          (window as any).__deviationJustification = justification.trim();
                          onProceedAsUrgent();
                        }}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-bold transition-colors animate-pulse">
                        Confirm — Submit as Special Transport
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 px-3 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded text-[10px] text-amber-500">
                  This requisition will be set to <strong>Pending Approval</strong> and routed to Operations Supervisors. Spot requests and carrier assignment are blocked until approved.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── New Requisition Modal ────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function NewRequisitionModal({ suppliers, routePlans, forwarders, onClose, onCreated }: {
  suppliers: Supplier[]; routePlans: RoutePlan[]; forwarders: string[]; onClose: () => void; onCreated: () => void;
}) {
  // Core
  const [requestorName, setRequestorName] = useState('');
  const [department, setDepartment] = useState('');
  const [priority, setPriority] = useState('medium');
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('inbound');
  const [transportMode, setTransportMode] = useState('FTL');

  // Origin/Destination
  const [originId, setOriginId] = useState('');
  const [originName, setOriginName] = useState('');
  const [originZip, setOriginZip] = useState('');
  const [originCity, setOriginCity] = useState('');
  const [originCountry, setOriginCountry] = useState('');
  const [destId, setDestId] = useState('');
  const [destName, setDestName] = useState('');
  const [destZip, setDestZip] = useState('');
  const [destCity, setDestCity] = useState('');
  const [destCountry, setDestCountry] = useState('');
  const [additionalOrigins, setAdditionalOrigins] = useState<MROrigin[]>([]);

  // Schedule — day codes from route plan + actual dates
  const [pickupDayCode, setPickupDayCode] = useState('');
  const [deliveryDayCode, setDeliveryDayCode] = useState('');
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');

  // Transport — route-plan locked values + current user selections
  const [routePlanCarrier, setRoutePlanCarrier] = useState(''); // locked from route plan
  const [routePlanTransportMode, setRoutePlanTransportMode] = useState(''); // locked from route plan
  const [routePlanEquipment, setRoutePlanEquipment] = useState(''); // locked from route plan
  const [carrier, setCarrier] = useState('');
  const [carrierOverridden, setCarrierOverridden] = useState(false);
  const [transportModeOverridden, setTransportModeOverridden] = useState(false);
  const [equipmentOverridden, setEquipmentOverridden] = useState(false);
  const [equipment, setEquipment] = useState('Standard Trailer');
  const [transitDays, setTransitDays] = useState('');
  const [customs, setCustoms] = useState('');

  // Cargo — pallet dimensions editable
  const [pallets, setPallets] = useState('');
  const [palletLength, setPalletLength] = useState('1.2');
  const [palletWidth, setPalletWidth] = useState('0.8');
  const [palletHeight, setPalletHeight] = useState('1.5');
  const [stackLevels, setStackLevels] = useState(1); // 1=no stacking, 2/3/4=stackable layers
  const [weightKg, setWeightKg] = useState('');
  const [volumeM3, setVolumeM3] = useState('');
  const [materialDescription, setMaterialDescription] = useState('');
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Search / match
  const [originSearch, setOriginSearch] = useState('');
  const [showOriginDropdown, setShowOriginDropdown] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [matchingPlans, setMatchingPlans] = useState<RoutePlan[]>([]); // all plans for this supplier
  const [matchedPlan, setMatchedPlan] = useState<RoutePlan | null>(null);
  const [isSpecialTransport, setIsSpecialTransport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeOriginSearch, setActiveOriginSearch] = useState<number | null>(null);
  const [showDeviationConfirm, setShowDeviationConfirm] = useState<{ field: 'pickup' | 'delivery'; value: string } | null>(null);
  const [deviationJustification, setDeviationJustification] = useState('');
  const [showDeviationDecision, setShowDeviationDecision] = useState(false);
  const [pendingDeviation, setPendingDeviation] = useState<{
    type: 'date' | 'carrier' | 'transportMode' | 'equipment';
    field?: 'pickup' | 'delivery';
    value?: string;
    newCarrier?: string;
    newMode?: string;
    newEquipment?: string;
  } | null>(null);
  const [deviationDecisionMade, setDeviationDecisionMade] = useState(false); // user already chose "Proceed as Urgent"
  // MR: expected total stop count from route plan (origin 1 + siblings); 0 = no route plan linked
  const [mrExpectedStopCount, setMrExpectedStopCount] = useState(0);

  // ─── Deviations (STRICT — checks ALL critical fields) ─────────
  const deviations = useMemo(() => {
    if (!matchedPlan) return [];
    const devs: string[] = [];
    // 1) Pickup day mismatch
    if (pickupDayCode && pickupDate) {
      const expected = DAY_CODE_WEEKDAY[pickupDayCode];
      const actual = getWeekdayFromDate(pickupDate);
      if (expected !== undefined && actual >= 0 && expected !== actual) {
        devs.push(`Pickup day: route plan requires ${DAY_CODE_LABELS[pickupDayCode] || pickupDayCode} (${weekdayName(expected)}), but selected date is ${weekdayName(actual)}`);
      }
    }
    // 2) Delivery day mismatch
    if (deliveryDayCode && deliveryDate) {
      const expected = DAY_CODE_WEEKDAY[deliveryDayCode];
      const actual = getWeekdayFromDate(deliveryDate);
      if (expected !== undefined && actual >= 0 && expected !== actual) {
        devs.push(`Delivery day: route plan requires ${DAY_CODE_LABELS[deliveryDayCode] || deliveryDayCode} (${weekdayName(expected)}), but selected date is ${weekdayName(actual)}`);
      }
    }
    // 3) Carrier changed
    if (carrierOverridden && carrier !== routePlanCarrier) {
      devs.push(`Carrier changed from route plan "${routePlanCarrier}" to "${carrier}"`);
    }
    // 4) Transport Type / Shipment Mode changed
    if (routePlanTransportMode && transportMode !== routePlanTransportMode) {
      devs.push(`Transport type changed from route plan "${routePlanTransportMode}" to "${transportMode}"`);
    }
    // 5) Equipment changed
    if (routePlanEquipment && equipment !== routePlanEquipment) {
      devs.push(`Equipment changed from route plan "${routePlanEquipment}" to "${equipment}"`);
    }
    // 6) MR stop count mismatch
    if (transportMode === 'MR' && mrExpectedStopCount > 0) {
      const currentCount = 1 + additionalOrigins.length;
      if (currentCount !== mrExpectedStopCount) {
        devs.push(`Milkrun stops: route plan requires ${mrExpectedStopCount} stop(s), currently ${currentCount} configured`);
      }
    }
    return devs;
  }, [matchedPlan, pickupDayCode, pickupDate, deliveryDayCode, deliveryDate, carrierOverridden, carrier, routePlanCarrier, routePlanTransportMode, transportMode, routePlanEquipment, equipment, mrExpectedStopCount, additionalOrigins.length]);

  const hasDeviations = deviations.length > 0;
  const isEffectiveSpecial = isSpecialTransport || hasDeviations;

  const routePlanCarriers = useMemo(() => {
    return Array.from(new Set(routePlans
      .map(rp => (rp.carrier || '').trim())
      .filter(c => c)));
  }, [routePlans]);

  const availableCarriers = useMemo(() => {
    return Array.from(new Set([...(forwarders || []), ...routePlanCarriers, ...DEFAULT_FORWARDERS])).sort();
  }, [forwarders, routePlanCarriers]);

  // ─── Volume auto-calc with DYNAMIC capacity ─────────────────────
  const equipOpt = EQUIPMENT_OPTIONS.find(e => e.value === equipment);
  const maxH = equipOpt?.heightM || 2.7;
  const truckL = equipOpt?.lengthM || 13.6;
  const truckW = equipOpt?.widthM || 2.45;
  const fallbackMaxPallets = equipOpt?.maxPallets || 33;

  // Dynamic capacity: calculate actual floor pallets from dimensions, then apply stacking
  const pL = parseFloat(palletLength) || 1.2;
  const pW = parseFloat(palletWidth) || 0.8;
  const pH = parseFloat(palletHeight) || 1.5;
  const { floorPallets: dynamicFloorPallets, effectiveMax: dynamicEffectiveMax, maxStackLevels } = useMemo(
    () => calcDynamicMaxPallets(truckL, truckW, maxH, pL, pW, pH, stackLevels, fallbackMaxPallets),
    [truckL, truckW, maxH, pL, pW, pH, stackLevels, fallbackMaxPallets]
  );
  // Use dynamic calculation (volume + dimension aware) instead of fixed 33
  const effectiveMaxPallets = dynamicEffectiveMax;

  useEffect(() => {
    const n = parseInt(pallets) || 0;
    if (n === 0) { setVolumeM3(''); return; }
    const palletVol = pL * pW * pH;
    if (stackLevels > 1) {
      // With stacking: pallets are stacked on the floor, limited by truck height
      const floorPallets = Math.ceil(n / stackLevels);
      const actualStackH = Math.min(stackLevels * pH, maxH);
      setVolumeM3((floorPallets * pL * pW * actualStackH).toFixed(2));
    } else {
      // No stacking: each pallet occupies its own floor position
      setVolumeM3((n * palletVol).toFixed(2));
    }
  }, [pallets, pL, pW, pH, stackLevels, equipment, maxH]);

  // ─── Utilization % calculations ───────────────────────────────────
  const maxWeightKg = equipOpt?.maxWeightKg || 24000;
  const truckVolume = (equipOpt?.lengthM || 13.6) * (equipOpt?.widthM || 2.45) * (equipOpt?.heightM || 2.7);
  const volumeUtil = volumeM3 && truckVolume ? Math.min(100, ((parseFloat(volumeM3) / truckVolume) * 100)) : 0;
  const weightUtil = weightKg && maxWeightKg ? Math.min(100, ((parseFloat(weightKg) / maxWeightKg) * 100)) : 0;
  const palletUtil = pallets ? Math.min(100, ((parseInt(pallets) / effectiveMaxPallets) * 100)) : 0;
  const weightExceeded = parseFloat(weightKg) > maxWeightKg;

  // MR milkrun: aggregate totals across all supplier stops for submission and display
  const mrTotalPallets = transportMode === 'MR'
    ? (parseInt(pallets) || 0) + additionalOrigins.reduce((sum, ao) => sum + (parseInt(ao.pallets) || 0), 0)
    : null;
  const mrTotalWeightKg = transportMode === 'MR'
    ? (parseFloat(weightKg) || 0) + additionalOrigins.reduce((sum, ao) => sum + (parseFloat(ao.weightKg) || 0), 0)
    : null;
  // MR total volume: sum each stop's volume using its own pallet dimensions
  function calcStopVolume(n: number, pL: number, pW: number, pH: number, stk: number, maxH: number): number {
    if (n <= 0 || pL <= 0 || pW <= 0 || pH <= 0) return 0;
    if (stk > 1) {
      const floor = Math.ceil(n / stk);
      const actualH = Math.min(stk * pH, maxH);
      return floor * pL * pW * actualH;
    }
    return n * pL * pW * pH;
  }
  const mrTotalVolume = transportMode === 'MR'
    ? parseFloat(volumeM3 || '0') + additionalOrigins.reduce((sum, ao) => {
        return sum + calcStopVolume(parseInt(ao.pallets) || 0, parseFloat(ao.palletLength) || 1.2, parseFloat(ao.palletWidth) || 0.8, parseFloat(ao.palletHeight) || 1.5, ao.stackLevels || 1, maxH);
      }, 0)
    : null;

  // MR capacity: compare FLOOR SLOTS used vs truck floor capacity.
  // Each stop's pallets stacked N× only occupy ceil(n/N) floor positions.
  // This correctly reflects that stackable cargo does NOT exceed capacity
  // just because the pallet count is high.
  function stopFloorSlots(n: number, pH: number, stk: number): number {
    if (n <= 0) return 0;
    const actualStk = Math.min(stk, Math.max(1, Math.floor(maxH / (pH > 0 ? pH : 1.5))));
    return Math.ceil(n / actualStk);
  }
  const mrTotalFloorSlots = transportMode === 'MR'
    ? stopFloorSlots(parseInt(pallets) || 0, pH, stackLevels) +
      additionalOrigins.reduce((sum, ao) =>
        sum + stopFloorSlots(parseInt(ao.pallets) || 0, parseFloat(ao.palletHeight) || 1.5, ao.stackLevels || 1), 0)
    : null;
  // Floor capacity of the truck (independent of stacking — fixed by truck dimensions)
  const mrFloorCapacity = dynamicFloorPallets; // already calculated from truck L/W and pallet L/W

  // ─── AI Smart Suggestion (exact format per spec — includes transport type) ──
  const aiSuggestion = useMemo(() => {
    if (!matchedPlan) return null;
    const parts: string[] = [];
    if (pickupDayCode) parts.push(`Pickup ${DAY_CODE_LABELS[pickupDayCode] || pickupDayCode} (${pickupDayCode})`);
    if (deliveryDayCode) parts.push(`Delivery ${DAY_CODE_LABELS[deliveryDayCode] || deliveryDayCode} (${deliveryDayCode})`);
    if (routePlanCarrier) parts.push(`Carrier ${routePlanCarrier}`);
    if (routePlanTransportMode) parts.push(`Transport Type ${routePlanTransportMode}`);
    if (routePlanEquipment) parts.push(`Equipment ${routePlanEquipment}`);
    return parts.length > 0 ? `Recommended route-compliant option: ${parts.join(', ')}` : null;
  }, [matchedPlan, pickupDayCode, deliveryDayCode, routePlanCarrier, routePlanTransportMode, routePlanEquipment]);

  // Route desc preview (needed early for AI deviation detection)
  const routeDescPreview = useMemo(() => {
    if (!originId || !destId) return '';
    const prefix = MODE_OPTIONS.find(m => m.value === transportMode)?.prefix || 'F';
    return `${originId}_${destId}/${prefix}xx`;
  }, [originId, destId, transportMode]);

  // ─── AI Deviation Detection Messages (real-time compliance check) ──
  const aiDeviationMessages = useMemo(() => {
    if (!matchedPlan) return [];
    const msgs: string[] = [];
    // Route mismatch detection
    if (matchedPlan.route_description && routeDescPreview && !routeDescPreview.includes('xx') &&
        matchedPlan.route_description !== routeDescPreview) {
      msgs.push(`Route mismatch: expected "${matchedPlan.route_description}", current "${routeDescPreview}"`);
    }
    // Lead time inconsistency
    if (pickupDate && deliveryDate && matchedPlan.transit_time_days) {
      const pickup = new Date(pickupDate);
      const delivery = new Date(deliveryDate);
      const diffDays = (delivery.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24);
      if (diffDays > 0 && Math.abs(diffDays - matchedPlan.transit_time_days) > 1) {
        msgs.push(`Lead time inconsistency: route plan expects ${matchedPlan.transit_time_days} day(s), scheduled gap is ${diffDays.toFixed(0)} day(s)`);
      }
    }
    // Carrier deviation
    if (carrierOverridden && carrier !== routePlanCarrier) {
      msgs.push(`Carrier deviation: route plan assigns "${routePlanCarrier}", but "${carrier}" selected`);
    }
    // Transport type deviation
    if (routePlanTransportMode && transportMode !== routePlanTransportMode) {
      msgs.push(`Transport type deviation: route plan requires "${routePlanTransportMode}", but "${transportMode}" selected`);
    }
    // Equipment deviation
    if (routePlanEquipment && equipment !== routePlanEquipment) {
      msgs.push(`Equipment deviation: route plan requires "${routePlanEquipment}", but "${equipment}" selected`);
    }
    return msgs;
  }, [matchedPlan, routeDescPreview, pickupDate, deliveryDate, carrierOverridden, carrier, routePlanCarrier, routePlanTransportMode, transportMode, routePlanEquipment, equipment]);

  // ─── Lead time check ──────────────────────────────────────────────
  const leadTimeWarning = useMemo(() => {
    if (!pickupDate || !deliveryDate) return null;
    const pickup = new Date(pickupDate);
    const delivery = new Date(deliveryDate);
    if (isNaN(pickup.getTime()) || isNaN(delivery.getTime())) return null;
    const diffDays = (delivery.getTime() - pickup.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays < 0) return 'Delivery date is before pickup date';
    const expectedTransit = transitDays ? parseFloat(transitDays) : (matchedPlan?.transit_time_days || null);
    if (expectedTransit && diffDays < expectedTransit) return `Lead time too short: ${diffDays.toFixed(0)} day(s) between pickup and delivery, but route plan expects ${expectedTransit} transit day(s)`;
    if (diffDays > 14) return `Lead time unusually long: ${diffDays.toFixed(0)} days between pickup and delivery`;
    return null;
  }, [pickupDate, deliveryDate, transitDays, matchedPlan]);

  // ─── Supplier search ─────────────────────────────────────────────
  const filteredSuppliers = useMemo(() => {
    if (!originSearch || originSearch.length < 1) return [];
    const q = originSearch.toLowerCase();
    return suppliers.filter(s => s.company_name.toLowerCase().includes(q) || s.supplier_id.toLowerCase().includes(q) || s.city.toLowerCase().includes(q)).slice(0, 10);
  }, [originSearch, suppliers]);

  const selectSupplier = (supplier: Supplier) => {
    setSelectedSupplierId(supplier.id);
    setShowOriginDropdown(false);
    if (direction === 'inbound') {
      setOriginId(supplier.supplier_id); setOriginName(supplier.company_name); setOriginCity(supplier.city); setOriginCountry(supplier.country); setOriginZip(''); setOriginSearch(supplier.company_name);
      setDestId(RT_HQ.id); setDestName(RT_HQ.name); setDestZip(RT_HQ.zip); setDestCity(RT_HQ.city); setDestCountry(RT_HQ.country);
    } else {
      setOriginId(RT_HQ.id); setOriginName(RT_HQ.name); setOriginZip(RT_HQ.zip); setOriginCity(RT_HQ.city); setOriginCountry(RT_HQ.country); setOriginSearch(RT_HQ.name);
      setDestId(supplier.supplier_id); setDestName(supplier.company_name); setDestZip(''); setDestCity(supplier.city); setDestCountry(supplier.country);
    }
    const matching = findMatchingPlans(supplier.supplier_id, supplier.company_name, direction);
    console.info(`[ROUTE MATCH] supplier ${supplier.supplier_id} (${supplier.company_name}), direction ${direction}, matched plans ${matching.length}`);
    setMatchingPlans(matching);

    if (matching.length === 0) {
      setMatchedPlan(null);
      setIsSpecialTransport(true);
      clearRoutePlanLocks();
      return;
    }

    if (matching.length === 1) {
      selectRoutePlan(matching[0]);
      return;
    }

    const normalizedMode = (transportMode || '').trim().toUpperCase();
    const bestMatch = matching.find(rp => (rp.transport_mode || '').trim().toUpperCase() === normalizedMode);
    if (bestMatch) { selectRoutePlan(bestMatch); return; }

    setMatchedPlan(null);
    setIsSpecialTransport(false);
    clearRoutePlanLocks();
  };

  const normalize = (value?: string) => (value || '').trim().toLowerCase();

  const findMatchingPlans = (supId: string, supName: string, dir: string) => {
    const normalizedSupId = normalize(supId);
    const normalizedSupName = normalize(supName);
    const targetDir = normalize(dir) || 'inbound';

    const candidatePlans = routePlans.filter(rp => {
      const rpOriginId = normalize(rp.origin_id);
      const rpOriginName = normalize(rp.origin_name);
      const rpDestId = normalize(rp.destination_id);
      const rpDestName = normalize(rp.destination_name);
      const rpDesc = normalize(rp.route_description);

      const originMatch = rpOriginId === normalizedSupId || rpOriginName === normalizedSupName;
      const destMatch = rpDestId === normalizedSupId || rpDestName === normalizedSupName;
      const descMatch = rpDesc.includes(normalizedSupId) || rpDesc.includes(normalizedSupName);

      return originMatch || destMatch || descMatch;
    });

    if (candidatePlans.length === 0) {
      console.warn('[ROUTE MATCH] No route plan found for supplier', supId, supName, 'direction', dir, 'admin route plan count', routePlans.length);
      return [];
    }

    const directionMatches = candidatePlans.filter(rp => normalize(rp.direction) === targetDir);
    if (directionMatches.length > 0) {
      return directionMatches;
    }

    // Fallback: if supplier has routes in other direction, show them for manual selection
    console.warn('[ROUTE MATCH] Supplier has routes but none match direction', targetDir, 'for supplier', supId, supName, 'found', candidatePlans.length, 'candidate routes');
    return candidatePlans;
  };

  const selectRoutePlan = (plan: RoutePlan) => {
    setMatchedPlan(plan); setIsSpecialTransport(false);
    // Lock transport mode from route plan
    const rpMode = plan.transport_mode || transportMode;
    setTransportMode(rpMode);
    setRoutePlanTransportMode(rpMode);
    setTransportModeOverridden(false);
    // Lock carrier from route plan
    const rpCarrier = plan.carrier || '';
    setRoutePlanCarrier(rpCarrier); setCarrier(rpCarrier); setCarrierOverridden(false);
    // Lock equipment from route plan
    const rpEquip = plan.equipment || 'Standard Trailer';
    setEquipment(rpEquip);
    setRoutePlanEquipment(rpEquip);
    setEquipmentOverridden(false);
    // Apply other plan fields
    setTransitDays(plan.transit_time_days?.toString() || '');
    setCustoms(plan.customs || '');
    setPickupDayCode(plan.pickup_date || ''); setDeliveryDayCode(plan.delivery_date || '');
    if (plan.pickup_time) setPickupTime(plan.pickup_time);
    if (plan.arrival_time) setArrivalTime(plan.arrival_time);
    // Clear dates so user must pick correct day
    setPickupDate(''); setDeliveryDate('');
    // MR: auto-populate all sibling stops from the same milkrun route plan
    if ((rpMode || '').toUpperCase() === 'MR') {
      autoPopulateMRStops(plan);
    } else {
      setAdditionalOrigins([]);
      setMrExpectedStopCount(0);
    }
  };

  const clearRoutePlanLocks = () => {
    setRoutePlanCarrier(''); setCarrier(''); setCarrierOverridden(false);
    setRoutePlanTransportMode(''); setTransportModeOverridden(false);
    setRoutePlanEquipment(''); setEquipmentOverridden(false);
    setPickupDayCode(''); setDeliveryDayCode('');
    setMrExpectedStopCount(0);
  };

  // ─── Deviation Decision Handlers ────────────────────────────────
  const triggerDeviationDecision = (pending: typeof pendingDeviation) => {
    setPendingDeviation(pending);
    setShowDeviationDecision(true);
  };

  // Compute what deviations WOULD exist if the pending change is applied
  const getPendingDeviations = (): string[] => {
    if (!pendingDeviation || !matchedPlan) return deviations;
    const devs = [...deviations];
    if (pendingDeviation.type === 'date' && pendingDeviation.field === 'pickup' && pendingDeviation.value) {
      const dayCode = pickupDayCode;
      if (dayCode && DAY_CODE_WEEKDAY[dayCode] !== undefined) {
        const actual = getWeekdayFromDate(pendingDeviation.value);
        if (actual >= 0 && actual !== DAY_CODE_WEEKDAY[dayCode]) {
          const msg = `Pickup day: route plan requires ${DAY_CODE_LABELS[dayCode] || dayCode} (${weekdayName(DAY_CODE_WEEKDAY[dayCode])}), but selected date is ${weekdayName(actual)}`;
          if (!devs.some(d => d.startsWith('Pickup day'))) devs.push(msg);
        }
      }
    }
    if (pendingDeviation.type === 'date' && pendingDeviation.field === 'delivery' && pendingDeviation.value) {
      const dayCode = deliveryDayCode;
      if (dayCode && DAY_CODE_WEEKDAY[dayCode] !== undefined) {
        const actual = getWeekdayFromDate(pendingDeviation.value);
        if (actual >= 0 && actual !== DAY_CODE_WEEKDAY[dayCode]) {
          const msg = `Delivery day: route plan requires ${DAY_CODE_LABELS[dayCode] || dayCode} (${weekdayName(DAY_CODE_WEEKDAY[dayCode])}), but selected date is ${weekdayName(actual)}`;
          if (!devs.some(d => d.startsWith('Delivery day'))) devs.push(msg);
        }
      }
    }
    if (pendingDeviation.type === 'carrier' && pendingDeviation.newCarrier) {
      const msg = `Carrier changed from route plan "${routePlanCarrier}" to "${pendingDeviation.newCarrier}"`;
      if (!devs.some(d => d.startsWith('Carrier changed'))) devs.push(msg);
    }
    if (pendingDeviation.type === 'transportMode' && pendingDeviation.newMode) {
      const msg = `Transport type changed from route plan "${routePlanTransportMode}" to "${pendingDeviation.newMode}"`;
      if (!devs.some(d => d.startsWith('Transport type changed'))) devs.push(msg);
    }
    if (pendingDeviation.type === 'equipment' && pendingDeviation.newEquipment) {
      const msg = `Equipment changed from route plan "${routePlanEquipment}" to "${pendingDeviation.newEquipment}"`;
      if (!devs.some(d => d.startsWith('Equipment changed'))) devs.push(msg);
    }
    return devs;
  };

  const handleAdjustToRoutePlan = () => {
    // Reset ALL fields to route plan values
    if (matchedPlan) {
      // Reset transport mode
      if (routePlanTransportMode) { setTransportMode(routePlanTransportMode); setTransportModeOverridden(false); }
      // Reset carrier
      if (routePlanCarrier) { setCarrier(routePlanCarrier); setCarrierOverridden(false); }
      // Reset equipment
      if (routePlanEquipment) { setEquipment(routePlanEquipment); setEquipmentOverridden(false); }
      // Reset dates — clear them so user picks correct days
      setPickupDate(''); setDeliveryDate('');
      // Reset special transport flag
      setIsSpecialTransport(false);
      setDeviationDecisionMade(false);
      setDeviationJustification('');
    }
    setShowDeviationDecision(false);
    setPendingDeviation(null);
    setShowDeviationConfirm(null);
  };

  const handleProceedAsUrgent = () => {
    // Apply the pending change
    if (pendingDeviation) {
      if (pendingDeviation.type === 'date') {
        if (pendingDeviation.field === 'pickup' && pendingDeviation.value) setPickupDate(pendingDeviation.value);
        if (pendingDeviation.field === 'delivery' && pendingDeviation.value) setDeliveryDate(pendingDeviation.value);
      }
      if (pendingDeviation.type === 'carrier') {
        setCarrierOverridden(true);
      }
      if (pendingDeviation.type === 'transportMode' && pendingDeviation.newMode) {
        setTransportMode(pendingDeviation.newMode);
        setTransportModeOverridden(true);
      }
      if (pendingDeviation.type === 'equipment') {
        setEquipmentOverridden(true);
      }
    }
    // Read justification from the modal via window hack
    const justText = (window as any).__deviationJustification || '';
    if (justText) setDeviationJustification(justText);
    delete (window as any).__deviationJustification;

    // Switch to Special Transport Mode
    setIsSpecialTransport(true);
    setDeviationDecisionMade(true);
    setShowDeviationDecision(false);
    setPendingDeviation(null);
    setShowDeviationConfirm(null);
  };

  const matchRoutePlan = (supId: string, supName: string, mode: string, dir: string) => {
    const matching = findMatchingPlans(supId, supName, dir);
    setMatchingPlans(matching);

    if (matching.length === 0) {
      setMatchedPlan(null);
      setIsSpecialTransport(true);
      clearRoutePlanLocks();
      return;
    }

    if (matching.length === 1) {
      selectRoutePlan(matching[0]);
      return;
    }

    // Multiple options: prefer exact mode match (FTL/LTL/MR/HUB)
    const normalizedMode = (mode || '').trim().toUpperCase();
    const bestMatch = matching.find(rp => (rp.transport_mode || '').trim().toUpperCase() === normalizedMode);

    if (bestMatch) {
      selectRoutePlan(bestMatch);
      return;
    }

    // Keep user in choice mode; this will show the selector panel
    setMatchedPlan(null);
    setIsSpecialTransport(false);
    clearRoutePlanLocks();
  };

  // Re-match route plan ONLY when direction changes (not transport mode — mode is locked by route plan)
  useEffect(() => {
    if (!selectedSupplierId) return;
    const sup = suppliers.find(s => s.id === selectedSupplierId);
    if (!sup) return;
    matchRoutePlan(sup.supplier_id, sup.company_name, transportMode, direction);
  }, [direction]); // Intentionally excludes transportMode — mode change is a deviation, not a re-match trigger

  // ─── MR: Auto-populate all sibling stops from the same milkrun route plan ──
  const autoPopulateMRStops = (plan: RoutePlan) => {
    const tourDesc = (plan.tour_description || '').trim();
    const planDir = (plan.direction || direction || 'inbound').trim().toLowerCase();

    let siblings: RoutePlan[] = [];

    // Primary strategy: group by tour_description (most reliable)
    if (tourDesc) {
      siblings = routePlans.filter(rp =>
        rp.id !== plan.id &&
        (rp.transport_mode || '').trim().toUpperCase() === 'MR' &&
        (rp.tour_description || '').trim() === tourDesc &&
        (rp.direction || 'inbound').trim().toLowerCase() === planDir
      );
    }

    // Fallback: group by route_description milkrun sequence suffix (*/M01, */M02 …)
    if (siblings.length === 0 && plan.route_description) {
      const mrBase = plan.route_description.replace(/\/M\d+$/, '');
      if (mrBase && mrBase !== plan.route_description) {
        siblings = routePlans.filter(rp =>
          rp.id !== plan.id &&
          (rp.transport_mode || '').trim().toUpperCase() === 'MR' &&
          (rp.direction || 'inbound').trim().toLowerCase() === planDir &&
          (rp.route_description || '').replace(/\/M\d+$/, '') === mrBase
        );
      }
    }

    if (siblings.length === 0) {
      // Only origin 1 — no sibling stops in route plan
      setMrExpectedStopCount(1);
      setAdditionalOrigins([]);
      return;
    }

    // Sort by route_description so M01 < M02 < M03 …
    siblings.sort((a, b) => (a.route_description || '').localeCompare(b.route_description || ''));

    const isInbound = planDir === 'inbound';
    const newOrigins: MROrigin[] = siblings.map((rp, i) => {
      const supCode = isInbound ? (rp.origin_id || '') : (rp.destination_id || '');
      const supName = isInbound ? (rp.origin_name || '') : (rp.destination_name || '');
      const supCity = isInbound ? (rp.origin_city || '') : (rp.destination_city || '');
      const supCountry = isInbound ? (rp.origin_country || '') : (rp.destination_country || '');
      const matched = suppliers.find(s =>
        s.supplier_id === supCode ||
        s.company_name.toLowerCase() === supName.toLowerCase()
      );
      return {
        id: `mr-rp-${rp.id}-${i}`,
        supplierId: matched?.id ?? null,
        supplierCode: supCode,
        name: supName,
        city: supCity,
        country: supCountry,
        search: supName,
        pallets: '', weightKg: '', materialDescription: '',
        palletLength: '1.2', palletWidth: '0.8', palletHeight: '1.5', stackLevels: 1,
        routePlanId: rp.id,
      };
    });

    setMrExpectedStopCount(1 + newOrigins.length);
    setAdditionalOrigins(newOrigins);
    console.info(`[MR AUTO-POPULATE] ${newOrigins.length} sibling stop(s) loaded from route plan "${plan.tour_description || plan.route_description}"`);
  };

  // MR origins
  const addMROrigin = () => setAdditionalOrigins(p => [...p, { id: `mr-${Date.now()}`, supplierId: null, supplierCode: '', name: '', city: '', country: '', search: '', pallets: '', weightKg: '', materialDescription: '', palletLength: '1.2', palletWidth: '0.8', palletHeight: '1.5', stackLevels: 1 }]);
  const removeMROrigin = (i: number) => {
    const stop = additionalOrigins[i];
    // If this stop was auto-populated from a route plan, removing it is a deviation
    if (stop?.routePlanId && mrExpectedStopCount > 0 && !isEffectiveSpecial && !deviationDecisionMade) {
      const confirmed = window.confirm(
        `"${stop.name || 'This stop'}" is part of the route plan milkrun.\n\nRemoving it will mark this requisition as a deviation (Special Transport), requiring supervisor approval.\n\nRemove anyway?`
      );
      if (!confirmed) return;
      setIsSpecialTransport(true);
      setDeviationDecisionMade(true);
    }
    setAdditionalOrigins(p => p.filter((_, j) => j !== i));
  };
  const updateMROrigin = (i: number, f: keyof MROrigin, v: string | number | null) => setAdditionalOrigins(p => p.map((o, j) => j === i ? { ...o, [f]: v } : o));
  const selectMRSupplier = (i: number, s: Supplier) => { setAdditionalOrigins(p => p.map((o, j) => j === i ? { ...o, supplierId: s.id, supplierCode: s.supplier_id, name: s.company_name, city: s.city, country: s.country, search: s.company_name } : o)); setActiveOriginSearch(null); };
  const getMRFiltered = (q: string) => { if (!q) return []; const lq = q.toLowerCase(); return suppliers.filter(s => s.company_name.toLowerCase().includes(lq) || s.supplier_id.toLowerCase().includes(lq)).slice(0, 8); };

  const modeToTransport: Record<string, string> = { FTL: 'road', LTL: 'road', MR: 'road', HUB: 'multimodal' };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requestorName || !originName || !pickupDate) { alert('Please fill: Requestor Name, Origin, Pickup Date'); return; }
    // For MR: require at least origin 1 to have pallets; warn if any additional origin is missing cargo
    if (transportMode === 'MR') {
      if (!pallets || parseInt(pallets) <= 0) { alert('Please specify pallets for Supplier 1 (Origin 1)'); return; }
      const missingCargo = additionalOrigins.filter(ao => ao.name && (!ao.pallets || parseInt(ao.pallets) <= 0));
      if (missingCargo.length > 0) {
        const names = missingCargo.map(ao => ao.name).join(', ');
        if (!window.confirm(`The following milkrun suppliers have no cargo specified: ${names}\n\nEach supplier must have its own cargo breakdown. Continue anyway?`)) return;
      }
    } else {
      if (!pallets) { alert('Please fill: Pallets'); return; }
    }
    if (isEffectiveSpecial && !deviationJustification.trim()) {
      // If they haven't gone through the deviation decision yet, trigger it
      if (hasDeviations && !deviationDecisionMade) {
        setShowDeviationDecision(true);
        return;
      }
      alert('Deviation justification is mandatory for special/urgent transports');
      return;
    }
    if (weightExceeded) { alert(`Weight (${weightKg} kg) exceeds equipment max (${maxWeightKg} kg). Reduce weight or change equipment.`); return; }
    setSaving(true);
    try {
      await api.post('/booking/requisitions', {
        requestor_name: requestorName, department: department || null,
        supplier_id: selectedSupplierId || null,
        priority: isEffectiveSpecial ? 'urgent' : priority,
        direction, shipment_type: transportMode,
        origin_id: originId || null, origin_name: originName || null, origin_zip: originZip || null, origin_city: originCity || null, origin_country: originCountry || null,
        destination_id: destId || null, destination_name: destName || null, destination_zip: destZip || null, destination_city: destCity || null, destination_country: destCountry || null,
        route_description: matchedPlan?.route_description || routeDescPreview || null,
        // For MR: additional_origins includes per-supplier cargo+dimensions; also include origin 1 for traceability
        additional_origins: transportMode === 'MR'
          ? JSON.stringify([
              { supplierId: selectedSupplierId, supplierCode: originId, name: originName, city: originCity, country: originCountry, pallets: pallets || '0', weightKg: weightKg || '0', materialDescription: materialDescription || '', palletLength: palletLength || '1.2', palletWidth: palletWidth || '0.8', palletHeight: palletHeight || '1.5', stackLevels: stackLevels },
              ...additionalOrigins
            ])
          : (additionalOrigins.length > 0 ? JSON.stringify(additionalOrigins) : null),
        pickup_day_code: pickupDayCode || null, delivery_day_code: deliveryDayCode || null,
        pickup_date: pickupDate, pickup_time: pickupTime || null, delivery_date: deliveryDate || null, arrival_time: arrivalTime || null,
        carrier: carrier || null, equipment: equipment || null, transit_days: transitDays ? parseFloat(transitDays) : null, customs: customs || null,
        // For MR: submit total pallets/weight across all stops; per-supplier detail is in additional_origins
        pallets: transportMode === 'MR' ? (mrTotalPallets ?? parseInt(pallets)) : parseInt(pallets),
        pallet_length: parseFloat(palletLength) || 1.2, pallet_width: parseFloat(palletWidth) || 0.8,
        pallet_height: parseFloat(palletHeight) || 1.5, stackable: stackLevels,
        weight_kg: transportMode === 'MR' ? (mrTotalWeightKg || null) : (weightKg ? parseFloat(weightKg) : null),
        volume_m3: volumeM3 ? parseFloat(volumeM3) : null,
        transport_mode: modeToTransport[transportMode] || 'road',
        material_description: materialDescription || null, special_instructions: specialInstructions || null,
        is_special_transport: isEffectiveSpecial,
        matched_route_plan_id: matchedPlan?.id || null,
        deviations: hasDeviations ? JSON.stringify(deviations) : null,
        deviation_justification: isEffectiveSpecial ? deviationJustification : null,
        approval_status: isEffectiveSpecial ? 'pending_approval' : 'approved',
        volume_util_pct: volumeUtil ? volumeUtil.toFixed(1) : null,
        weight_util_pct: weightUtil ? weightUtil.toFixed(1) : null,
      });
      onCreated();
    } catch (err: any) { alert(err.response?.data?.error || 'Failed to create'); }
    setSaving(false);
  };

  const modeOpt = MODE_OPTIONS.find(m => m.value === transportMode);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[94vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div><h2 className="text-lg font-bold text-white">New Transport Requisition</h2>
            <p className="text-xs text-gray-500 mt-0.5">Fields locked from Route Plan · Any change = Deviation (Special Transport)</p></div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* ─ Route Plan Selector (when multiple routes exist) ─ */}
          {selectedSupplierId && matchingPlans.length > 1 && !matchedPlan && (
            <div className="px-3 py-2 rounded-lg text-xs bg-blue-900/20 border border-blue-700/40">
              <div className="flex items-center gap-2 mb-2 text-blue-300 font-semibold">
                <Truck className="w-4 h-4" /> {matchingPlans.length} route plans available — select one:
              </div>
              <div className="space-y-1.5">
                {matchingPlans.map(rp => (
                  <button key={rp.id} type="button" onClick={() => selectRoutePlan(rp)}
                    className="w-full text-left px-3 py-2 bg-gray-700/60 hover:bg-blue-900/30 border border-gray-600 hover:border-blue-600 rounded-lg transition-colors flex items-center gap-3">
                    <span className="font-mono text-cyan-400 font-semibold text-sm">{rp.route_description}</span>
                    <span className="text-gray-400">{rp.transport_mode}</span>
                    {rp.tour_description && <span className="text-gray-500 text-[10px] truncate flex-1">{rp.tour_description}</span>}
                    <span className="text-gray-500 ml-auto">{rp.pickup_date || '?'}→{rp.delivery_date || '?'}</span>
                    {rp.carrier && <span className="text-green-400 text-[10px]">{rp.carrier}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─ Status banner ─ */}
          {selectedSupplierId && !hasDeviations && !isSpecialTransport && matchedPlan && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-green-900/30 border border-green-700/50 text-green-400">
              <CheckCircle className="w-4 h-4" />
              <span>Route plan: <strong className="font-mono">{matchedPlan.route_description}</strong> · Type: <strong>{routePlanTransportMode}</strong> · Carrier: <strong>{routePlanCarrier || 'TBD'}</strong> · Pickup: <strong>{pickupDayCode}</strong> → Delivery: <strong>{deliveryDayCode}</strong> · Equipment: <strong>{routePlanEquipment}</strong></span>
              {matchingPlans.length > 1 && (
                <button type="button" onClick={() => { setMatchedPlan(null); clearRoutePlanLocks(); setPickupDate(''); setDeliveryDate(''); }}
                  className="ml-auto text-[10px] text-gray-400 hover:text-blue-400 underline">Change route</button>
              )}
            </div>
          )}
          {selectedSupplierId && isSpecialTransport && !hasDeviations && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-amber-900/30 border border-amber-700/50 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              <span>No matching route plan — <strong>Special Transport</strong> (requires supervisor approval, manual carrier assignment)</span>
            </div>
          )}
          {/* ─ AI Smart Suggestion ─ */}
          {aiSuggestion && !hasDeviations && matchedPlan && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-indigo-900/20 border border-indigo-700/40 text-indigo-300">
              <Zap className="w-4 h-4 text-indigo-400 shrink-0" />
              <span><strong>AI Recommendation:</strong> {aiSuggestion}</span>
            </div>
          )}

          {hasDeviations && (
            <div className="px-3 py-2 rounded-lg text-xs bg-red-900/30 border border-red-700/50 text-red-400">
              <div className="flex items-center gap-2 font-semibold mb-1"><ShieldAlert className="w-4 h-4" /> DEVIATION DETECTED — Special/Urgent Transport</div>
              <div className="px-2 py-1.5 bg-amber-900/30 border border-amber-700/40 rounded mb-1.5 text-amber-300 font-medium">
                This action is considered a deviation from the route plan and will be treated as a Special / Urgent Transport.
              </div>
              <ul className="list-disc ml-5 space-y-0.5">
                {deviations.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
              <div className="mt-1.5 text-red-300">Standard flow blocked. Mandatory justification + Operations Supervisor approval required.</div>
              {aiSuggestion && (
                <div className="mt-2 flex items-center gap-2 px-2 py-1.5 bg-indigo-900/20 border border-indigo-700/30 rounded text-indigo-300">
                  <Zap className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span>{aiSuggestion}</span>
                </div>
              )}
            </div>
          )}

          {/* ─ AI Deviation Detection Messages ─ */}
          {aiDeviationMessages.length > 0 && !hasDeviations && (
            <div className="px-3 py-2 rounded-lg text-xs bg-orange-900/20 border border-orange-700/40 text-orange-400">
              <div className="flex items-center gap-2 font-semibold mb-1"><Zap className="w-4 h-4" /> AI Compliance Check</div>
              <ul className="list-disc ml-5 space-y-0.5">
                {aiDeviationMessages.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}

          {/* ─ Lead Time Warning ─ */}
          {leadTimeWarning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-yellow-900/20 border border-yellow-700/40 text-yellow-400">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{leadTimeWarning}</span>
            </div>
          )}

          {/* ─ Requestor ─ */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Requestor</div>
            <div className="grid grid-cols-3 gap-3">
              <FI label="Requestor Name *" value={requestorName} onChange={setRequestorName} />
              <FI label="Department" value={department} onChange={setDepartment} />
              <div><label className="text-xs text-gray-400">Priority *</label>
                <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none">
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select></div>
            </div>
          </div>

          {/* ─ Transport Config ─ */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Transport Configuration</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1 block">Direction *</label>
                <div className="flex gap-2">
                  {(['inbound', 'outbound'] as const).map(d => (
                    <button key={d} type="button" onClick={() => setDirection(d)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${direction === d ? 'bg-blue-900/40 border-blue-600 text-blue-300' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}>{d === 'inbound' ? '↓ Inbound' : '↑ Outbound'}</button>
                  ))}
                </div></div>
              <div><label className="text-xs text-gray-400 mb-1 block">
                Shipment Type *
                {routePlanTransportMode && !transportModeOverridden && !isEffectiveSpecial && <span className="text-green-400 ml-1">(locked: {routePlanTransportMode})</span>}
                {routePlanTransportMode && transportMode !== routePlanTransportMode && <span className="text-red-400 ml-1">(DEVIATION)</span>}
              </label>
                <div className="flex gap-1.5">
                  {MODE_OPTIONS.map(m => (
                    <button key={m.value} type="button"
                      onClick={() => {
                        // If route plan locks mode and user tries to change it → deviation
                        if (routePlanTransportMode && m.value !== routePlanTransportMode && !isEffectiveSpecial && !deviationDecisionMade) {
                          triggerDeviationDecision({ type: 'transportMode', newMode: m.value });
                        } else {
                          setTransportMode(m.value);
                        }
                      }}
                      className={`flex-1 px-2 py-2 rounded-lg text-xs font-semibold border transition-colors ${transportMode === m.value ? '' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}
                      style={transportMode === m.value ? { background: m.color + '30', borderColor: m.color, color: m.color } : {}}>{m.label}</button>
                  ))}
                </div></div>
            </div>
            {modeOpt && <div className="text-xs text-gray-500 mt-1 ml-1">{modeOpt.desc}</div>}
          </div>

          {routeDescPreview && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg">
              <span className="text-xs text-gray-500">Route Description:</span>
              <span className="font-mono text-sm text-cyan-400 font-semibold">{routeDescPreview}</span>
            </div>
          )}

          {/* ─ Origin 1 ─ */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">{direction === 'inbound' ? 'Origin 1 (Supplier)' : 'Origin (RT HQ)'}</div>
            <div className="grid grid-cols-5 gap-2">
              <div className="relative col-span-2">
                <label className="text-xs text-gray-400">{direction === 'inbound' ? 'Origin Name * (search)' : 'Origin Name'}</label>
                {direction === 'inbound' ? (
                  <div className="relative">
                    <input type="text" value={originSearch || originName}
                      onChange={e => { setOriginSearch(e.target.value); setOriginName(e.target.value); setShowOriginDropdown(true);
                        if (!e.target.value) { setSelectedSupplierId(null); setOriginId(''); setOriginCity(''); setOriginCountry(''); setMatchedPlan(null); setIsSpecialTransport(false); clearRoutePlanLocks(); }
                      }} onFocus={() => originSearch && setShowOriginDropdown(true)}
                      placeholder="Type supplier name..." className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                    <Search className="absolute right-2.5 top-3.5 w-3.5 h-3.5 text-gray-500" />
                    {showOriginDropdown && filteredSuppliers.length > 0 && (
                      <div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                        {filteredSuppliers.map(s => (
                          <button key={s.id} type="button" onClick={() => selectSupplier(s)} className="w-full px-3 py-2 text-left hover:bg-gray-600 text-sm text-white flex items-center gap-2 border-b border-gray-600/50 last:border-0">
                            <span className="text-blue-400 font-mono text-xs">{s.supplier_id}</span><span>{s.company_name}</span><span className="text-gray-500 text-xs ml-auto">{s.city}, {s.country}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : <input type="text" value={originName} readOnly className="w-full mt-1 px-3 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-gray-400 text-sm cursor-not-allowed" />}
              </div>
              <FI label="Origin ID" value={originId} onChange={setOriginId} />
              <FI label="City" value={originCity} onChange={setOriginCity} />
              <FI label="Country" value={originCountry} onChange={setOriginCountry} />
            </div>
            {/* MR: per-supplier cargo for Origin 1 */}
            {transportMode === 'MR' && (
              <div className="mt-2 pt-2 border-t border-gray-700/60">
                <div className="text-[10px] text-blue-400 uppercase tracking-wider mb-1.5">Cargo at this stop</div>
                <div className="grid grid-cols-7 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">Pallets *</label>
                    <input type="number" value={pallets} onChange={e => setPallets(e.target.value)} min="0"
                      className={`w-full mt-1 px-2 py-1.5 bg-gray-700 border rounded-lg text-white text-xs focus:outline-none ${!pallets ? 'border-blue-700/50' : 'border-gray-600'}`} />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">L (m)</label>
                    <input type="number" step="0.1" min="0.1" value={palletLength} onChange={e => setPalletLength(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">W (m)</label>
                    <input type="number" step="0.1" min="0.1" value={palletWidth} onChange={e => setPalletWidth(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">H (m)</label>
                    <input type="number" step="0.1" min="0.1" max="2.8" value={palletHeight} onChange={e => setPalletHeight(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Stack</label>
                    <select value={stackLevels} onChange={e => setStackLevels(parseInt(e.target.value))}
                      className={`w-full mt-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-none ${stackLevels > 1 ? 'bg-green-900/30 border-green-600 text-green-400' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                      <option value={3}>3×</option>
                      <option value={4}>4×</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Weight (kg)</label>
                    <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Material</label>
                    <input type="text" value={materialDescription} onChange={e => setMaterialDescription(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ─ MR additional origins ─ */}
          {transportMode === 'MR' && (
            <div className="space-y-2">
              {mrExpectedStopCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/20 border border-amber-700/40 rounded-lg text-[10px] text-amber-400">
                  <Truck className="w-3 h-3 shrink-0" />
                  <span>Route plan milkrun: <strong>{mrExpectedStopCount} stop(s)</strong> auto-loaded · Edit cargo per stop · Remove = deviation</span>
                </div>
              )}
              {additionalOrigins.map((ao, idx) => (
                <div key={ao.id} className={`pl-4 border-l-2 ${ao.routePlanId ? 'border-amber-600/70' : 'border-amber-600/30'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-amber-500 font-semibold">Origin {idx + 2}</span>
                      {ao.routePlanId && <span className="text-[9px] px-1 py-0.5 bg-amber-900/30 border border-amber-700/40 text-amber-600 rounded">Route Plan</span>}
                    </div>
                    <button type="button" onClick={() => removeMROrigin(idx)} className="p-0.5 hover:bg-red-900/40 rounded text-gray-500 hover:text-red-400" title={ao.routePlanId ? 'Remove stop (triggers deviation)' : 'Remove stop'}><Trash2 className="w-3 h-3" /></button>
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    <div className="relative col-span-2">
                      <label className="text-xs text-gray-400">Name</label>
                      <div className="relative">
                        <input type="text" value={ao.search || ao.name} onChange={e => { updateMROrigin(idx, 'search', e.target.value); updateMROrigin(idx, 'name', e.target.value); setActiveOriginSearch(idx); }}
                          onFocus={() => setActiveOriginSearch(idx)} placeholder="Type supplier..." className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                        {activeOriginSearch === idx && getMRFiltered(ao.search).length > 0 && (
                          <div className="absolute z-50 w-full mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-xl max-h-36 overflow-y-auto">
                            {getMRFiltered(ao.search).map(s => (
                              <button key={s.id} type="button" onClick={() => selectMRSupplier(idx, s)} className="w-full px-3 py-1.5 text-left hover:bg-gray-600 text-xs text-white flex items-center gap-2 border-b border-gray-600/50 last:border-0">
                                <span className="text-blue-400 font-mono">{s.supplier_id}</span><span>{s.company_name}</span><span className="text-gray-500 ml-auto">{s.city}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div><label className="text-xs text-gray-400">ID</label><input type="text" value={ao.supplierCode} onChange={e => updateMROrigin(idx, 'supplierCode', e.target.value)} className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" /></div>
                    <div><label className="text-xs text-gray-400">City</label><input type="text" value={ao.city} onChange={e => updateMROrigin(idx, 'city', e.target.value)} className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" /></div>
                    <div><label className="text-xs text-gray-400">Country</label><input type="text" value={ao.country} onChange={e => updateMROrigin(idx, 'country', e.target.value)} className="w-full mt-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" /></div>
                  </div>
                  {/* Per-supplier cargo for this milkrun stop */}
                  <div className="mt-2 pt-2 border-t border-amber-700/30">
                    <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-1.5">Cargo at this stop</div>
                    <div className="grid grid-cols-7 gap-2">
                      <div>
                        <label className="text-xs text-gray-400">Pallets</label>
                        <input type="number" value={ao.pallets} onChange={e => updateMROrigin(idx, 'pallets', e.target.value)} min="0"
                          className={`w-full mt-1 px-2 py-1.5 bg-gray-700 border rounded-lg text-white text-xs focus:outline-none ${!ao.pallets ? 'border-amber-700/50' : 'border-gray-600'}`} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">L (m)</label>
                        <input type="number" step="0.1" min="0.1" value={ao.palletLength} onChange={e => updateMROrigin(idx, 'palletLength', e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">W (m)</label>
                        <input type="number" step="0.1" min="0.1" value={ao.palletWidth} onChange={e => updateMROrigin(idx, 'palletWidth', e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">H (m)</label>
                        <input type="number" step="0.1" min="0.1" max="2.8" value={ao.palletHeight} onChange={e => updateMROrigin(idx, 'palletHeight', e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Stack</label>
                        <select value={ao.stackLevels} onChange={e => updateMROrigin(idx, 'stackLevels', parseInt(e.target.value))}
                          className={`w-full mt-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-colors focus:outline-none ${ao.stackLevels > 1 ? 'bg-green-900/30 border-green-600 text-green-400' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                          <option value={1}>1×</option>
                          <option value={2}>2×</option>
                          <option value={3}>3×</option>
                          <option value={4}>4×</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Weight (kg)</label>
                        <input type="number" value={ao.weightKg} onChange={e => updateMROrigin(idx, 'weightKg', e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400">Material</label>
                        <input type="text" value={ao.materialDescription} onChange={e => updateMROrigin(idx, 'materialDescription', e.target.value)}
                          className="w-full mt-1 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-xs focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button type="button" onClick={addMROrigin} className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/40 text-amber-400 rounded-lg text-xs font-medium"><Plus className="w-3.5 h-3.5" /> Add Origin {additionalOrigins.length + 2}</button>
            </div>
          )}

          {/* ─ Destination ─ */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">{direction === 'inbound' ? 'Destination (RT HQ)' : 'Destination (Supplier)'}</div>
            <div className="grid grid-cols-5 gap-2">
              <div className="col-span-2"><label className="text-xs text-gray-400">Destination Name</label>
                <input type="text" value={destName} readOnly={direction === 'inbound'} onChange={e => direction === 'outbound' && setDestName(e.target.value)}
                  className={`w-full mt-1 px-3 py-2 border border-gray-600 rounded-lg text-sm focus:outline-none ${direction === 'inbound' ? 'bg-gray-700/50 text-gray-400 cursor-not-allowed' : 'bg-gray-700 text-white focus:ring-2 focus:ring-blue-500'}`} /></div>
              <FI label="Dest ID" value={destId} onChange={setDestId} />
              <FI label="City" value={destCity} onChange={setDestCity} />
              <FI label="Country" value={destCountry} onChange={setDestCountry} />
            </div>
          </div>

          {/* ─ Schedule & Transport ─ */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">Schedule & Transport</div>
            {/* Day codes info row */}
            {(pickupDayCode || deliveryDayCode) && (
              <div className="flex items-center gap-4 mb-2 px-3 py-1.5 bg-blue-900/20 border border-blue-800/30 rounded-lg text-xs">
                <span className="text-gray-400">Route Plan:</span>
                {pickupDayCode && <span className="text-blue-300">Pickup <strong className="font-mono">{pickupDayCode}</strong> ({DAY_CODE_LABELS[pickupDayCode] || '?'})</span>}
                {pickupDayCode && deliveryDayCode && <span className="text-gray-600">→</span>}
                {deliveryDayCode && <span className="text-green-300">Delivery <strong className="font-mono">{deliveryDayCode}</strong> ({DAY_CODE_LABELS[deliveryDayCode] || '?'})</span>}
                <span className="text-gray-500 ml-auto">Select a date matching the required day</span>
              </div>
            )}
            <div className="grid grid-cols-4 gap-2">
              <div>
                <label className="text-xs text-gray-400">Pickup Date * {pickupDayCode && <span className="text-blue-400">({pickupDayCode} — {DAY_CODE_LABELS[pickupDayCode] || '?'}s only)</span>}</label>
                <input type="date" value={pickupDate} onChange={e => {
                  const val = e.target.value;
                  if (pickupDayCode && DAY_CODE_WEEKDAY[pickupDayCode] !== undefined && !deviationDecisionMade) {
                    const actual = getWeekdayFromDate(val);
                    if (actual >= 0 && actual !== DAY_CODE_WEEKDAY[pickupDayCode]) {
                      // Wrong weekday — show Deviation Decision Modal
                      triggerDeviationDecision({ type: 'date', field: 'pickup', value: val });
                      return;
                    }
                  }
                  setPickupDate(val);
                }}
                  className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    pickupDate && pickupDayCode && DAY_CODE_WEEKDAY[pickupDayCode] !== undefined && getWeekdayFromDate(pickupDate) !== DAY_CODE_WEEKDAY[pickupDayCode]
                      ? 'bg-red-900/30 border-red-600 text-red-300' : 'bg-gray-700 border-gray-600 text-white'
                  }`} />
                {pickupDate && pickupDayCode && DAY_CODE_WEEKDAY[pickupDayCode] !== undefined && getWeekdayFromDate(pickupDate) !== DAY_CODE_WEEKDAY[pickupDayCode] && (
                  <div className="text-[10px] text-red-400 mt-0.5 font-semibold">⚠ DEVIATION: Must be {DAY_CODE_LABELS[pickupDayCode]} — you picked {weekdayName(getWeekdayFromDate(pickupDate))}</div>
                )}
              </div>
              <FI label="Pickup Time" value={pickupTime} onChange={setPickupTime} placeholder="e.g. 08:00-15:00" />
              <div>
                <label className="text-xs text-gray-400">Delivery Date {deliveryDayCode && <span className="text-green-400">({deliveryDayCode} — {DAY_CODE_LABELS[deliveryDayCode] || '?'}s only)</span>}</label>
                <input type="date" value={deliveryDate} onChange={e => {
                  const val = e.target.value;
                  if (deliveryDayCode && DAY_CODE_WEEKDAY[deliveryDayCode] !== undefined && !deviationDecisionMade) {
                    const actual = getWeekdayFromDate(val);
                    if (actual >= 0 && actual !== DAY_CODE_WEEKDAY[deliveryDayCode]) {
                      triggerDeviationDecision({ type: 'date', field: 'delivery', value: val });
                      return;
                    }
                  }
                  setDeliveryDate(val);
                }}
                  className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    deliveryDate && deliveryDayCode && DAY_CODE_WEEKDAY[deliveryDayCode] !== undefined && getWeekdayFromDate(deliveryDate) !== DAY_CODE_WEEKDAY[deliveryDayCode]
                      ? 'bg-red-900/30 border-red-600 text-red-300' : 'bg-gray-700 border-gray-600 text-white'
                  }`} />
                {deliveryDate && deliveryDayCode && DAY_CODE_WEEKDAY[deliveryDayCode] !== undefined && getWeekdayFromDate(deliveryDate) !== DAY_CODE_WEEKDAY[deliveryDayCode] && (
                  <div className="text-[10px] text-red-400 mt-0.5 font-semibold">⚠ DEVIATION: Must be {DAY_CODE_LABELS[deliveryDayCode]} — you picked {weekdayName(getWeekdayFromDate(deliveryDate))}</div>
                )}
              </div>
              <FI label="Arrival Time" value={arrivalTime} onChange={setArrivalTime} placeholder="e.g. 06:00-12:00" />
            </div>

            {/* Old inline deviation dialog replaced by DeviationDecisionModal (see below) */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              {/* Carrier — hard-locked from route plan. Override triggers Special Transport Mode */}
              <div>
                <label className="text-xs text-gray-400">
                  Carrier {routePlanCarrier && !carrierOverridden && !isEffectiveSpecial && <span className="text-green-400">(locked by route plan)</span>}
                  {carrierOverridden && carrier !== routePlanCarrier && <span className="text-red-400">(DEVIATION)</span>}
                </label>
                {routePlanCarrier && !carrierOverridden && !isEffectiveSpecial ? (
                  <div className="flex gap-1 mt-1">
                    <div className="flex-1 px-3 py-2 bg-green-900/20 border border-green-700/40 rounded-lg text-green-400 text-sm font-medium truncate">{routePlanCarrier}</div>
                    <button type="button" onClick={() => {
                      if (!deviationDecisionMade) {
                        triggerDeviationDecision({ type: 'carrier' });
                      } else {
                        setCarrierOverridden(true);
                      }
                    }} className="px-2 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-[10px] text-gray-400 hover:text-amber-400" title="Override carrier (triggers Special Transport)">
                      ✏️
                    </button>
                  </div>
                ) : (
                  <select value={carrier} onChange={e => { setCarrier(e.target.value); if (routePlanCarrier && e.target.value !== routePlanCarrier) { setCarrierOverridden(true); setIsSpecialTransport(true); } }}
                    className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none ${
                      carrierOverridden && carrier !== routePlanCarrier ? 'bg-red-900/20 border-red-600 text-red-300' : 'bg-gray-700 border-gray-600 text-white focus:ring-2 focus:ring-blue-500'
                    }`}>
                    <option value="">Select carrier...</option>
                    {availableCarriers.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className="text-xs text-gray-400">
                  Equipment
                  {routePlanEquipment && !equipmentOverridden && !isEffectiveSpecial && <span className="text-green-400 ml-1">(locked)</span>}
                  {routePlanEquipment && equipment !== routePlanEquipment && <span className="text-red-400 ml-1">(DEVIATION)</span>}
                </label>
                {routePlanEquipment && !equipmentOverridden && !isEffectiveSpecial ? (
                  <div className="flex gap-1 mt-1">
                    <div className="flex-1 px-3 py-2 bg-green-900/20 border border-green-700/40 rounded-lg text-green-400 text-sm font-medium truncate">{routePlanEquipment}</div>
                    <button type="button" onClick={() => {
                      if (!deviationDecisionMade) {
                        triggerDeviationDecision({ type: 'equipment' });
                      } else {
                        setEquipmentOverridden(true);
                      }
                    }} className="px-2 py-2 bg-gray-700 hover:bg-gray-600 border border-gray-600 rounded-lg text-[10px] text-gray-400 hover:text-amber-400" title="Override equipment (triggers Special Transport)">
                      ✏️
                    </button>
                  </div>
                ) : (
                  <select value={equipment} onChange={e => {
                    setEquipment(e.target.value);
                    if (routePlanEquipment && e.target.value !== routePlanEquipment) {
                      setEquipmentOverridden(true);
                      setIsSpecialTransport(true);
                    }
                  }} className={`w-full mt-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    routePlanEquipment && equipment !== routePlanEquipment ? 'bg-red-900/20 border-red-600 text-red-300' : 'bg-gray-700 border-gray-600 text-white'
                  }`}>
                    {EQUIPMENT_OPTIONS.map(eq => <option key={eq.value} value={eq.value}>{eq.label}</option>)}
                  </select>
                )}
              </div>
              <FI label="Transit (days)" type="number" value={transitDays} onChange={setTransitDays} />
              <FI label="Customs" value={customs} onChange={setCustoms} placeholder="Yes / No" />
            </div>
          </div>

          {/* ─ Cargo ─ */}
          <div>
            {transportMode === 'MR' ? (
              /* ── MR mode: pallet dimensions + per-supplier summary ── */
              <>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                  Cargo Details — Milkrun
                  <span className="ml-2 text-gray-600 normal-case font-normal">
                    Max: {mrFloorCapacity} floor slot{mrFloorCapacity !== 1 ? 's' : ''} · stackable cargo uses fewer slots
                  </span>
                </div>

                {/* Per-supplier breakdown summary */}
                <div className="px-3 py-2.5 bg-amber-900/10 border border-amber-700/30 rounded-lg mb-3">
                  <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-2">Cargo per Supplier Stop</div>
                  <div className="space-y-1.5">
                    {/* Origin 1 row */}
                    <div className="py-1 border-b border-gray-700/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-400 font-medium">{originName || 'Supplier 1'} <span className="text-gray-600 text-[10px]">(Origin 1)</span></span>
                        <span className="text-xs text-white">
                          {parseInt(pallets) > 0 ? `${pallets} plt` : <span className="text-gray-500 italic text-[10px]">no cargo</span>}
                          {weightKg ? ` · ${weightKg} kg` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-gray-500 font-mono">{palletLength}×{palletWidth}×{palletHeight}m</span>
                        {stackLevels > 1 && <span className="text-[10px] text-green-500">{stackLevels}× stack</span>}
                        {materialDescription && <span className="text-[10px] text-gray-500 truncate">{materialDescription}</span>}
                      </div>
                    </div>
                    {/* Additional origin rows */}
                    {additionalOrigins.map((ao, idx) => (
                      <div key={ao.id} className="py-1 border-b border-gray-700/50 last:border-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-amber-400 font-medium">{ao.name || `Supplier ${idx + 2}`} <span className="text-gray-600 text-[10px]">(Origin {idx + 2})</span></span>
                          <span className="text-xs text-white">
                            {parseInt(ao.pallets) > 0 ? `${ao.pallets} plt` : <span className="text-gray-500 italic text-[10px]">no cargo</span>}
                            {ao.weightKg ? ` · ${ao.weightKg} kg` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-gray-500 font-mono">{ao.palletLength}×{ao.palletWidth}×{ao.palletHeight}m</span>
                          {ao.stackLevels > 1 && <span className="text-[10px] text-green-500">{ao.stackLevels}× stack</span>}
                          {ao.materialDescription && <span className="text-[10px] text-gray-500 truncate">{ao.materialDescription}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-amber-700/40 flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Total</span>
                    <span className="text-sm text-white font-bold">
                      {mrTotalPallets} plt
                      {mrTotalWeightKg ? ` · ${mrTotalWeightKg.toFixed(0)} kg` : ''}
                      {mrTotalVolume !== null && mrTotalVolume > 0 ? <span className="text-cyan-400 font-normal text-xs ml-1">· {mrTotalVolume.toFixed(2)} m³</span> : ''}
                    </span>
                  </div>
                  {mrTotalFloorSlots !== null && mrTotalFloorSlots > mrFloorCapacity && (
                    <div className="mt-1.5 text-[10px] text-red-400 font-semibold">⚠ Floor slots used ({mrTotalFloorSlots}) exceeds truck floor capacity ({mrFloorCapacity})</div>
                  )}
                  {mrTotalFloorSlots !== null && mrTotalFloorSlots <= mrFloorCapacity && mrTotalPallets !== null && mrTotalPallets > 0 && (
                    <div className="mt-1.5 text-[10px] text-green-500">✓ {mrTotalFloorSlots} of {mrFloorCapacity} floor slots used — cargo fits</div>
                  )}
                  {additionalOrigins.some(ao => !ao.pallets) && (
                    <div className="mt-1 text-[10px] text-amber-500">⚠ Some stops have no cargo specified — add cargo above in each supplier section</div>
                  )}
                </div>

                {/* MR utilization based on totals */}
                {mrTotalPallets !== null && mrTotalPallets > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="px-3 py-2 bg-gray-700/40 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500 uppercase">Floor Util.</span>
                        {(() => {
                          const slotPct = mrTotalFloorSlots != null && mrFloorCapacity > 0 ? (mrTotalFloorSlots / mrFloorCapacity) * 100 : 0;
                          return (
                            <>
                              <span className={`text-xs font-bold ${slotPct > 100 ? 'text-red-400' : slotPct > 80 ? 'text-yellow-400' : 'text-green-400'}`}>{Math.min(100, Math.round(slotPct))}%</span>
                              <div className="w-full h-1.5 bg-gray-600 rounded-full overflow-hidden mt-1">
                                <div className={`h-full rounded-full transition-all ${slotPct > 100 ? 'bg-red-500' : slotPct > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, slotPct)}%` }} />
                              </div>
                              <div className="text-[9px] text-gray-500 mt-0.5">{mrTotalFloorSlots ?? 0} / {mrFloorCapacity} floor slots · {mrTotalPallets} plt total</div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                    {mrTotalVolume !== null && mrTotalVolume > 0 && (
                      <div className="px-3 py-2 bg-gray-700/40 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-500 uppercase">Volume Util.</span>
                          <span className={`text-xs font-bold ${mrTotalVolume > truckVolume ? 'text-red-400' : (mrTotalVolume / truckVolume) * 100 > 80 ? 'text-yellow-400' : 'text-cyan-400'}`}>{Math.min(100, Math.round((mrTotalVolume / truckVolume) * 100))}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-600 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${mrTotalVolume > truckVolume ? 'bg-red-500' : (mrTotalVolume / truckVolume) * 100 > 80 ? 'bg-yellow-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(100, (mrTotalVolume / truckVolume) * 100)}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-500 mt-0.5">{mrTotalVolume.toFixed(2)} / {truckVolume.toFixed(1)} m³</div>
                      </div>
                    )}
                    {mrTotalWeightKg !== null && mrTotalWeightKg > 0 && (
                      <div className="px-3 py-2 bg-gray-700/40 rounded-lg">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-gray-500 uppercase">Weight Util.</span>
                          <span className={`text-xs font-bold ${mrTotalWeightKg > maxWeightKg ? 'text-red-400' : (mrTotalWeightKg / maxWeightKg) * 100 > 80 ? 'text-yellow-400' : 'text-blue-400'}`}>{Math.min(100, Math.round((mrTotalWeightKg / maxWeightKg) * 100))}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-gray-600 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${mrTotalWeightKg > maxWeightKg ? 'bg-red-500' : (mrTotalWeightKg / maxWeightKg) * 100 > 80 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, (mrTotalWeightKg / maxWeightKg) * 100)}%` }} />
                        </div>
                        <div className="text-[9px] text-gray-500 mt-0.5">{mrTotalWeightKg.toFixed(0)} / {maxWeightKg.toLocaleString()} kg</div>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* ── Non-MR: standard single cargo section ── */
              <>
                <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2">
                  Cargo Details
                  <span className="ml-2 text-gray-600 normal-case">
                    Max: {effectiveMaxPallets} pallets ({dynamicFloorPallets} floor × {stackLevels} layer{stackLevels > 1 ? 's' : ''})
                    {maxStackLevels < stackLevels && <span className="text-amber-500 ml-1">(max {maxStackLevels} layers fit in {equipment})</span>}
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-2">
                  <div>
                    <label className="text-xs text-gray-400">Pallets *</label>
                    <input type="number" value={pallets} onChange={e => setPallets(e.target.value)} min="0"
                      className={`w-full mt-1 px-2 py-2 bg-gray-700 border rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none ${parseInt(pallets) > effectiveMaxPallets ? 'border-red-500' : 'border-gray-600'}`} />
                    {parseInt(pallets) > effectiveMaxPallets && <div className="text-[10px] text-red-400 mt-0.5">Exceeds {effectiveMaxPallets}</div>}
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">L (m)</label>
                    <input type="number" step="0.1" min="0.1" value={palletLength} onChange={e => setPalletLength(e.target.value)}
                      className="w-full mt-1 px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">W (m)</label>
                    <input type="number" step="0.1" min="0.1" value={palletWidth} onChange={e => setPalletWidth(e.target.value)}
                      className="w-full mt-1 px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">H (m)</label>
                    <input type="number" step="0.1" min="0.1" max="2.8" value={palletHeight} onChange={e => setPalletHeight(e.target.value)}
                      className="w-full mt-1 px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Stack Lvl</label>
                    <select value={stackLevels} onChange={e => setStackLevels(parseInt(e.target.value))}
                      className={`w-full mt-1 px-2 py-2 rounded-lg text-sm font-medium border transition-colors focus:outline-none ${stackLevels > 1 ? 'bg-green-900/30 border-green-600 text-green-400' : 'bg-gray-700 border-gray-600 text-gray-400'}`}>
                      <option value={1}>1 (no stack)</option>
                      <option value={2}>2 layers</option>
                      <option value={3}>3 layers</option>
                      <option value={4}>4 layers</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Weight (kg)</label>
                    <input type="number" value={weightKg} onChange={e => setWeightKg(e.target.value)}
                      className="w-full mt-1 px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400">Vol (m³) <span className="text-[8px] text-cyan-600">auto</span></label>
                    <input type="text" value={volumeM3} readOnly
                      className="w-full mt-1 px-2 py-2 bg-gray-700/50 border border-gray-600 rounded-lg text-cyan-400 text-sm font-mono cursor-not-allowed" />
                  </div>
                </div>
                <FI label="Material Description" value={materialDescription} onChange={setMaterialDescription} />

                {/* ─ Utilization Gauges ─ */}
                {(parseInt(pallets) > 0 || parseFloat(weightKg) > 0) && (
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    <div className="px-3 py-2 bg-gray-700/40 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500 uppercase">Pallet Utilization</span>
                        <span className={`text-xs font-bold ${palletUtil > 100 ? 'text-red-400' : palletUtil > 80 ? 'text-yellow-400' : 'text-green-400'}`}>{palletUtil.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-600 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${palletUtil > 100 ? 'bg-red-500' : palletUtil > 80 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${Math.min(100, palletUtil)}%` }} />
                      </div>
                      <div className="text-[9px] text-gray-500 mt-0.5">{pallets || 0} / {effectiveMaxPallets} pallets</div>
                    </div>
                    <div className="px-3 py-2 bg-gray-700/40 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500 uppercase">Volume Utilization</span>
                        <span className={`text-xs font-bold ${volumeUtil > 100 ? 'text-red-400' : volumeUtil > 80 ? 'text-yellow-400' : 'text-cyan-400'}`}>{volumeUtil.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-600 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${volumeUtil > 100 ? 'bg-red-500' : volumeUtil > 80 ? 'bg-yellow-500' : 'bg-cyan-500'}`} style={{ width: `${Math.min(100, volumeUtil)}%` }} />
                      </div>
                      <div className="text-[9px] text-gray-500 mt-0.5">{volumeM3 || '0'} / {truckVolume.toFixed(1)} m³</div>
                    </div>
                    <div className="px-3 py-2 bg-gray-700/40 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-gray-500 uppercase">Weight Utilization</span>
                        <span className={`text-xs font-bold ${weightExceeded ? 'text-red-400' : weightUtil > 80 ? 'text-yellow-400' : 'text-blue-400'}`}>{weightUtil.toFixed(0)}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-600 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${weightExceeded ? 'bg-red-500' : weightUtil > 80 ? 'bg-yellow-500' : 'bg-blue-500'}`} style={{ width: `${Math.min(100, weightUtil)}%` }} />
                      </div>
                      <div className="text-[9px] text-gray-500 mt-0.5">{weightKg || '0'} / {maxWeightKg.toLocaleString()} kg</div>
                    </div>
                  </div>
                )}
                {weightExceeded && (
                  <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-red-900/30 border border-red-600 text-red-400 font-semibold">
                    <ShieldAlert className="w-3.5 h-3.5" /> Weight exceeds max capacity ({maxWeightKg.toLocaleString()} kg). Reduce load or change equipment.
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400">Special Instructions</label>
            <textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)}
              className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none h-14" />
          </div>

          {/* ─ Deviation Justification (mandatory for special/urgent) ─ */}
          {isEffectiveSpecial && (
            <div className="px-3 py-3 bg-amber-900/10 border border-amber-700/40 rounded-lg">
              <label className="text-xs text-amber-400 font-semibold flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Deviation Justification * <span className="text-[10px] text-amber-600 font-normal">(mandatory for supervisor approval)</span>
              </label>
              <textarea value={deviationJustification} onChange={e => setDeviationJustification(e.target.value)}
                placeholder="Explain why this transport deviates from the route plan (e.g., urgent production need, supplier schedule change, emergency shipment)..."
                className={`w-full px-3 py-2 bg-gray-700 border rounded-lg text-white text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none resize-none h-20 ${
                  !deviationJustification.trim() ? 'border-amber-600/60' : 'border-gray-600'
                }`} />
              <div className="mt-1.5 text-[10px] text-amber-600">
                This requisition will be set to <strong>Pending Approval</strong> and routed to Operations Supervisors for review.
              </div>
            </div>
          )}

          {/* ─ Submit ─ */}
          <div className="flex items-center justify-between pt-3 border-t border-gray-700">
            <div className="text-xs">
              {isEffectiveSpecial ? (
                <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {hasDeviations ? 'Deviation — requires supervisor approval' : 'Special Transport — requires approval'}</span>
              ) : matchedPlan ? (
                <span className="text-green-400 flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Auto-assign to {routePlanCarrier || 'carrier'} via Route Plan</span>
              ) : null}
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
              <button type="submit" disabled={saving}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${isEffectiveSpecial ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-800' : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800'}`}>
                {saving ? 'Submitting...' : isEffectiveSpecial ? 'Submit as Special Transport' : 'Submit Requisition'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* ─── Deviation Decision Modal (overlays on top) ─── */}
      {showDeviationDecision && (
        <DeviationDecisionModal
          deviations={getPendingDeviations()}
          routePlanSuggestion={aiSuggestion}
          onAdjustToRoutePlan={handleAdjustToRoutePlan}
          onProceedAsUrgent={handleProceedAsUrgent}
          onCancel={() => {
            setShowDeviationDecision(false);
            setPendingDeviation(null);
            setDeviationDecisionMade(false);
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── Spot Request Modal ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function SpotRequestModal({ requisitions, forwarders, onClose, onSent }: {
  requisitions: TransportRequisition[]; forwarders: string[]; onClose: () => void; onSent: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<number[]>(requisitions.map(r => r.id));
  const [selectedForwarders, setSelectedForwarders] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (selectedForwarders.length === 0) {
      setSelectedForwarders((forwarders && forwarders.length > 0)
        ? forwarders.slice(0, 2)
        : DEFAULT_FORWARDERS.slice(0, 2));
    }
  }, [forwarders, selectedForwarders]);
  const toggleId = (id: number) => setSelectedIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleFwd = (f: string) => setSelectedForwarders(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f]);
  const handleSend = async () => {
    if (selectedIds.length === 0 || selectedForwarders.length === 0) { alert('Select requisitions and forwarders'); return; }
    setSending(true);
    try { await api.post('/booking/spot-request', { requisition_ids: selectedIds, forwarders: selectedForwarders }); onSent(); }
    catch (err: any) { alert(err.response?.data?.error || 'Failed'); } setSending(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div><h2 className="text-lg font-bold text-white">Launch Spot Request</h2><p className="text-xs text-gray-500 mt-0.5">Manual carrier assignment for special/deviation transports</p></div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium">Special Transport Requisitions</label>
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {requisitions.length === 0 ? <p className="text-sm text-gray-500">No special transports pending. Route-plan transports are auto-assigned.</p>
                : requisitions.map(r => (
                  <label key={r.id} className="flex items-center gap-2 p-2 bg-gray-700/50 rounded-lg cursor-pointer hover:bg-gray-700 text-sm text-gray-300">
                    <input type="checkbox" checked={selectedIds.includes(r.id)} onChange={() => toggleId(r.id)} className="rounded bg-gray-700 border-gray-600" />
                    <span className="text-blue-400 font-semibold">{r.req_number}</span><span className="text-amber-400 text-xs">[Special]</span>
                    <span>| {r.origin_name || r.supplier_name} → {r.destination_name || 'RT HQ'} | {r.pallets} plt</span>
                  </label>
                ))}
            </div>
          </div>
          <div><label className="text-xs text-gray-400 uppercase font-medium">Forwarders</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {(forwarders && forwarders.length > 0 ? forwarders : DEFAULT_FORWARDERS).map(f => (
                <label key={f} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs cursor-pointer border transition-colors ${selectedForwarders.includes(f) ? 'bg-blue-900/40 border-blue-600 text-blue-300' : 'bg-gray-700 border-gray-600 text-gray-400 hover:border-gray-500'}`}>
                  <input type="checkbox" checked={selectedForwarders.includes(f)} onChange={() => toggleFwd(f)} className="hidden" />{f}</label>
              ))}
            </div></div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
            <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
            <button onClick={handleSend} disabled={sending || requisitions.length === 0} className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-800 text-white rounded-lg text-sm font-medium flex items-center gap-1.5"><Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send to Forwarders'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// ─── Detail Modal ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════
function RequisitionDetailModal({ req, forwarders, onClose, onUpdate }: {
  req: TransportRequisition; forwarders: string[]; onClose: () => void; onUpdate: () => void;
}) {
  const { isAdmin } = useAuth();
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteForm, setQuoteForm] = useState({ forwarder_name: '', price: '', transit_days: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const moveStatus = async (s: RequisitionStatus) => { setSaving(true); try { await api.put(`/booking/requisitions/${req.id}/status`, { status: s }); onUpdate(); } catch (e: any) { alert(e.response?.data?.error || 'Failed'); } setSaving(false); };
  const approveReject = async (action: 'approve' | 'reject') => { setSaving(true); try { await api.put(`/booking/requisitions/${req.id}/approve`, { action }); onUpdate(); } catch (e: any) { alert(e.response?.data?.error || 'Failed'); } setSaving(false); };
  const addQuote = async () => { if (!quoteForm.forwarder_name || !quoteForm.price) { alert('Forwarder and price required'); return; } setSaving(true); try { await api.post(`/booking/requisitions/${req.id}/quotes`, { forwarder_name: quoteForm.forwarder_name, price: parseFloat(quoteForm.price), currency: 'EUR', transit_days: quoteForm.transit_days ? parseInt(quoteForm.transit_days) : null, notes: quoteForm.notes || null }); onUpdate(); } catch (e: any) { alert(e.response?.data?.error || 'Failed'); } setSaving(false); };
  const assignFwd = async (q: ForwarderQuote) => { setSaving(true); try { await api.put(`/booking/requisitions/${req.id}/assign`, { forwarder_name: q.forwarder_name, price: q.price }); onUpdate(); } catch (e: any) { alert(e.response?.data?.error || 'Failed'); } setSaving(false); };
  const pc: Record<string, string> = { low: 'bg-green-900/40 text-green-400', medium: 'bg-yellow-900/40 text-yellow-400', high: 'bg-red-900/40 text-red-400', urgent: 'bg-red-800/60 text-red-300' };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div><h2 className="text-lg font-bold text-white">Requisition {req.req_number}</h2>
            <div className="flex items-center gap-2 mt-1"><span className={`px-2 py-0.5 rounded text-xs font-medium ${pc[req.priority]}`}>{req.priority.toUpperCase()}</span>
              {req.is_special_transport && <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-900/40 text-amber-400">Special Transport</span>}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="p-4 space-y-3">
          {req.route_description && <div className="px-3 py-2 bg-gray-700/50 rounded-lg"><span className="text-xs text-gray-500">Route: </span><span className="font-mono text-sm text-cyan-400 font-semibold">{req.route_description}</span></div>}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-gray-500 text-xs">Requestor</span><div className="text-white">{req.requestor_name}</div></div>
            <div><span className="text-gray-500 text-xs">Department</span><div className="text-white">{req.department || '-'}</div></div>
            <div><span className="text-gray-500 text-xs">Origin</span><div className="text-white">{req.origin_name || req.supplier_name || '-'}</div><div className="text-xs text-gray-500">{req.origin_id} · {req.origin_city}, {req.origin_country}</div></div>
            <div><span className="text-gray-500 text-xs">Destination</span><div className="text-white">{req.destination_name || 'RT HQ'}</div><div className="text-xs text-gray-500">{req.destination_id} · {req.destination_city}, {req.destination_country}</div></div>
            <div><span className="text-gray-500 text-xs">Type / Direction</span><div className="text-white">{req.shipment_type || req.transport_mode} · {req.direction || 'inbound'}</div></div>
            <div><span className="text-gray-500 text-xs">Pallets</span><div className="text-white">{req.pallets} {req.shipment_type === 'MR' ? <span className="text-amber-400 text-[10px]">(total — all stops)</span> : ''}</div></div>
            <div><span className="text-gray-500 text-xs">Pickup</span><div className="text-white">{req.pickup_date} {req.pickup_time || ''}</div></div>
            <div><span className="text-gray-500 text-xs">Delivery</span><div className="text-white">{req.delivery_date || '-'} {req.arrival_time || ''}</div></div>
            <div><span className="text-gray-500 text-xs">Carrier</span><div className="text-white">{req.carrier || '-'}</div></div>
            <div><span className="text-gray-500 text-xs">Equipment</span><div className="text-white">{req.equipment || '-'}</div></div>
          </div>
          {/* MR milkrun: per-supplier cargo breakdown */}
          {req.shipment_type === 'MR' && (req as any).additional_origins && (() => {
            try {
              const stops: { name?: string; supplierCode?: string; pallets?: string; weightKg?: string; materialDescription?: string }[] = JSON.parse((req as any).additional_origins);
              if (!stops.length) return null;
              return (
                <div className="px-3 py-2.5 bg-amber-900/10 border border-amber-700/30 rounded-lg">
                  <div className="text-[10px] text-amber-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Truck className="w-3 h-3" /> Milkrun — Cargo per Supplier Stop
                  </div>
                  <div className="space-y-1.5">
                    {stops.map((stop, i) => (
                      <div key={i} className="py-1 border-b border-gray-700/50 last:border-0">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className={`text-xs font-medium ${i === 0 ? 'text-blue-400' : 'text-amber-400'}`}>{stop.name || `Supplier ${i + 1}`}</span>
                            {stop.supplierCode && <span className="text-[10px] text-gray-500 ml-1.5 font-mono">{stop.supplierCode}</span>}
                            <span className="text-[10px] text-gray-600 ml-1">(Stop {i + 1})</span>
                          </div>
                          <div className="text-right">
                            <span className="text-xs text-white font-medium">{stop.pallets && parseInt(stop.pallets) > 0 ? `${stop.pallets} plt` : <span className="text-gray-500 italic text-[10px]">no cargo</span>}</span>
                            {stop.weightKg && parseFloat(stop.weightKg) > 0 && <span className="text-[10px] text-gray-400 ml-1.5">{stop.weightKg} kg</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          {(stop as any).palletLength && <span className="text-[10px] text-gray-500 font-mono">{(stop as any).palletLength}×{(stop as any).palletWidth}×{(stop as any).palletHeight}m</span>}
                          {(stop as any).stackLevels > 1 && <span className="text-[10px] text-green-500">{(stop as any).stackLevels}× stack</span>}
                          {stop.materialDescription && <span className="text-[10px] text-gray-500 truncate">{stop.materialDescription}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            } catch { return null; }
          })()}
          {req.special_instructions && <div><span className="text-gray-500 text-xs">Instructions</span><div className="text-white text-sm">{req.special_instructions}</div></div>}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/50 rounded-lg"><span className="text-xs text-gray-400">Status:</span><span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_CONFIG[req.status].color} ${STATUS_CONFIG[req.status].bgColor}`}>{STATUS_CONFIG[req.status].label}</span></div>

          {(req.status === 'quotes_received' || req.status === 'spot_requested') && (
            <div>
              <div className="flex items-center justify-between mb-2"><span className="text-xs text-gray-400 uppercase font-medium">Quotes ({req.quotes?.length || 0})</span>
                {isAdmin && <button onClick={() => setShowQuoteForm(!showQuoteForm)} className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded">+ Add Quote</button>}</div>
              {showQuoteForm && (
                <div className="p-3 bg-gray-700/50 rounded-lg mb-2 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div><label className="text-[10px] text-gray-400">Forwarder *</label><select value={quoteForm.forwarder_name} onChange={e => setQuoteForm({ ...quoteForm, forwarder_name: e.target.value })} className="w-full mt-0.5 px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:outline-none"><option value="">Select...</option>{(forwarders && forwarders.length > 0 ? forwarders : DEFAULT_FORWARDERS).map(f => <option key={f} value={f}>{f}</option>)}</select></div>
                    <FI label="Price (€) *" type="number" value={quoteForm.price} onChange={v => setQuoteForm({ ...quoteForm, price: v })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2"><FI label="Transit Days" type="number" value={quoteForm.transit_days} onChange={v => setQuoteForm({ ...quoteForm, transit_days: v })} /><FI label="Notes" value={quoteForm.notes} onChange={v => setQuoteForm({ ...quoteForm, notes: v })} /></div>
                  <button onClick={addQuote} disabled={saving} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium">{saving ? 'Adding...' : 'Add Quote'}</button>
                </div>
              )}
              {req.quotes && req.quotes.length > 0 && (
                <div className="space-y-1.5">{req.quotes.map((q, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 bg-gray-700/50 rounded-lg border border-gray-700">
                    <div><div className="text-sm text-white font-medium">{q.forwarder_name}</div><div className="text-xs text-gray-500">{q.transit_days ? `${q.transit_days}d` : ''} {q.notes || ''}</div></div>
                    <div className="text-right flex items-center gap-3"><div className="text-lg font-bold text-white">€{q.price}</div>
                      {isAdmin && req.status !== 'assigned' && <button onClick={() => assignFwd(q)} className="px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-medium">Assign</button>}
                    </div>
                  </div>
                ))}</div>
              )}
            </div>
          )}
          {req.assigned_forwarder && <div className="px-3 py-2.5 bg-green-900/20 border border-green-800/40 rounded-lg"><div className="text-xs text-green-500">Assigned Forwarder</div><div className="text-white font-semibold">{req.assigned_forwarder} {req.assigned_price ? `· €${req.assigned_price}` : ''}</div></div>}

          {/* Deviation details if any */}
          {(req as any).deviations && (
            <div className="px-3 py-2 bg-red-900/20 border border-red-800/30 rounded-lg">
              <div className="text-xs text-red-400 font-semibold mb-1 flex items-center gap-1"><ShieldAlert className="w-3 h-3" /> Deviations</div>
              <ul className="list-disc ml-4 text-xs text-red-300 space-y-0.5">
                {(() => { try { return JSON.parse((req as any).deviations); } catch { return []; } })().map((d: string, i: number) => <li key={i}>{d}</li>)}
              </ul>
              {(req as any).deviation_justification && (
                <div className="mt-1.5 text-xs"><span className="text-gray-500">Justification: </span><span className="text-amber-300">{(req as any).deviation_justification}</span></div>
              )}
            </div>
          )}

          {/* Utilization if available */}
          {((req as any).volume_util_pct || (req as any).weight_util_pct) && (
            <div className="flex gap-4 text-xs">
              {(req as any).volume_util_pct && <span className="text-cyan-400">Volume: {(req as any).volume_util_pct}%</span>}
              {(req as any).weight_util_pct && <span className="text-blue-400">Weight: {(req as any).weight_util_pct}%</span>}
            </div>
          )}

          {isAdmin && (
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
              {req.status === 'pending_approval' && <>
                <button onClick={() => approveReject('approve')} disabled={saving} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Approve</button>
                <button onClick={() => approveReject('reject')} disabled={saving} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"><X className="w-3 h-3" /> Reject</button>
              </>}
              {req.status === 'new' && !(req.is_special_transport && (req as any).approval_status !== 'approved') && <button onClick={() => moveStatus('spot_requested')} disabled={saving} className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"><Send className="w-3 h-3" /> Spot Request</button>}
              {req.status === 'spot_requested' && <button onClick={() => moveStatus('quotes_received')} disabled={saving} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium">Quotes Received</button>}
              {req.status === 'assigned' && <button onClick={() => moveStatus('in_transit')} disabled={saving} className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"><Truck className="w-3 h-3" /> In Transit</button>}
              {req.status === 'in_transit' && <button onClick={() => moveStatus('delivered')} disabled={saving} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Delivered</button>}
              {['new', 'pending_approval', 'spot_requested', 'quotes_received'].includes(req.status) && (
                <button onClick={() => {
                  if (window.confirm('Cancel this requisition? This cannot be undone.')) {
                    moveStatus('cancelled');
                  }
                }} disabled={saving} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Cancel Requisition</button>
              )}
              <button onClick={onClose} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Close</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Form Input ──────────────────────────────────────────────────────
function FI({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (<div><label className="text-xs text-gray-400">{label}</label>
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full mt-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" /></div>);
}
