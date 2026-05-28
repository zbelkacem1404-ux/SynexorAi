import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  X, Zap, CheckCircle, AlertTriangle, Truck,
  RotateCcw, ChevronRight, Play, PackageCheck, Search,
  Plus, Minus, Users
} from 'lucide-react';
import { Supplier } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────
interface VolumeConfig {
  pallets: number;
  heightCm: number;
  stackLevels: number;
  destinationId: string;
}

interface SupplierVolume {
  id: string; name: string; city: string; country: string;
  lat: number; lng: number;
  weeklyPallets: number; weightKgPerWeek: number;
  palletLengthCm: number; palletWidthCm: number; palletHeightCm: number;
  stackLevels: number;
  volumeM3PerWeek: number;
  effectivePallets: number;
  destinationId?: string; destinationName?: string;
  destinationCity?: string; destinationCountry?: string; destinationZip?: string;
}

interface GeneratedRoute {
  routeId: string;
  transportType: 'FTL' | 'MR' | 'LTL' | 'HUB';
  suppliers: SupplierVolume[];
  sequence: string[];
  pickupDays: string[];
  deliveryDayCode: string;
  pickupTime: string; arrivalTime: string;
  freqPerWeek: number; trucksPerWeek: number;
  palletsPerTrip: number; loadFactorPct: number;
  totalPalletsWeekly: number; totalWeightKgWeekly: number;
  distanceKm: number; estimatedCostEurWeekly: number;
  equipment: string; notes: string[];
  accepted: boolean;
}

interface Summary {
  totalSuppliers: number; ftlCount: number; mrCount: number;
  ltlCount: number; hubCount: number; totalTrucksPerWeek: number;
  avgLoadFactor: number; estimatedWeeklyCostEur: number;
  suppliersWithNoRoute: string[];
}

interface OptimizerConfig {
  truckCapacityPlt: number; ftlFillThreshold: number;
  mrMaxStops: number; mrMaxRadiusKm: number;
  hubDistanceKm: number; ltlMaxPalletsPerTrip: number;
  costPerKmRoad: number; costPerKmMR: number;
}

const DEFAULT_CONFIG: OptimizerConfig = {
  truckCapacityPlt: 33, ftlFillThreshold: 0.65,
  mrMaxStops: 5, mrMaxRadiusKm: 300,
  hubDistanceKm: 600, ltlMaxPalletsPerTrip: 4,
  costPerKmRoad: 1.5, costPerKmMR: 1.8,
};

const TYPE_COLORS: Record<string, string> = {
  FTL: '#3b82f6', MR: '#f59e0b', LTL: '#8b5cf6', HUB: '#10b981',
};
const TYPE_BG: Record<string, string> = {
  FTL: 'bg-blue-900/30 border-blue-700/50', MR: 'bg-amber-900/30 border-amber-700/50',
  LTL: 'bg-purple-900/30 border-purple-700/50', HUB: 'bg-green-900/30 border-green-700/50',
};

const DESTINATIONS = [
  { id: 'RT-HQ',       label: 'RT-HQ — Zagreb, Croatia' },
  { id: 'SANDOUVILLE', label: 'Sandouville — Renault (FR)' },
  { id: 'MELFI',       label: 'Melfi — FCA (IT)' },
  { id: 'GHENT',       label: 'Ghent — Volvo (BE)' },
  { id: 'BREMEN',      label: 'Bremen — Mercedes (DE)' },
  { id: 'POZNAN',      label: 'Poznan — VW (PL)' },
  { id: 'MUNICH',      label: 'Munich — BMW (DE)' },
  { id: 'COLOGNE',     label: 'Cologne — Ford (DE)' },
  { id: 'SOCHAUX',     label: 'Sochaux — PSA (FR)' },
];

const DEFAULT_VOLUME: VolumeConfig = {
  pallets: 10, heightCm: 160, stackLevels: 1, destinationId: 'RT-HQ',
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function RouteOptimizerModal({ onClose, onApplied }: { onClose: () => void; onApplied: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [config, setConfig] = useState<OptimizerConfig>(DEFAULT_CONFIG);
  const [routes, setRoutes] = useState<GeneratedRoute[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<string | null>(null);

  // Step 1: DB supplier selection
  const [dbSuppliers, setDbSuppliers] = useState<Supplier[]>([]);
  const [loadingDb, setLoadingDb] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Map<number, VolumeConfig>>(new Map());

  useEffect(() => {
    api.get('/suppliers', { params: { limit: '500', status: 'active' } })
      .then(r => setDbSuppliers(r.data.suppliers ?? []))
      .catch(() => setDbSuppliers([]))
      .finally(() => setLoadingDb(false));
  }, []);

  const filteredDb = useMemo(() => {
    const q = search.toLowerCase();
    return dbSuppliers.filter(s =>
      s.company_name.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q) ||
      s.country?.toLowerCase().includes(q) ||
      s.supplier_id?.toLowerCase().includes(q)
    );
  }, [dbSuppliers, search]);

  const toggleSelect = (sup: Supplier) => {
    setSelected(prev => {
      const next = new Map(prev);
      if (next.has(sup.id)) { next.delete(sup.id); }
      else { next.set(sup.id, { ...DEFAULT_VOLUME }); }
      return next;
    });
  };

  const updateVolume = (id: number, patch: Partial<VolumeConfig>) => {
    setSelected(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  };

  // Build SupplierVolume[] from selected DB suppliers + volume configs
  const buildSupplierVolumes = (): SupplierVolume[] => {
    const result: SupplierVolume[] = [];
    for (const [id, vol] of selected) {
      const s = dbSuppliers.find(x => x.id === id);
      if (!s) continue;
      const palletL = 120, palletW = 80;
      const volumeM3 = vol.pallets * (palletL / 100) * (palletW / 100) * (vol.heightCm / 100);
      const dest = DESTINATIONS.find(d => d.id === vol.destinationId);
      result.push({
        id: s.supplier_id || String(s.id),
        name: s.company_name,
        city: s.city,
        country: s.country,
        lat: s.latitude ?? 0,
        lng: s.longitude ?? 0,
        weeklyPallets: vol.pallets,
        weightKgPerWeek: vol.pallets * 400,
        palletLengthCm: palletL,
        palletWidthCm: palletW,
        palletHeightCm: vol.heightCm,
        stackLevels: vol.stackLevels,
        volumeM3PerWeek: volumeM3,
        effectivePallets: vol.pallets / vol.stackLevels,
        destinationId: vol.destinationId,
        destinationName: dest?.label.split(' — ')[1],
      });
    }
    return result;
  };

  // ─── Step 2 → 3: Run optimizer ───────────────────────────────────────────
  const runOptimizer = async () => {
    const suppliers = buildSupplierVolumes();
    setAnalyzing(true);
    try {
      const res = await api.post('/route-optimizer/analyze', { suppliers, config });
      setRoutes((res.data.routes as GeneratedRoute[]).map(r => ({ ...r, accepted: true })));
      setSummary(res.data.summary);
      setStep(3);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Optimization failed');
    }
    setAnalyzing(false);
  };

  // ─── Step 4: Apply accepted routes ───────────────────────────────────────
  const applyRoutes = async () => {
    setApplying(true);
    try {
      const res = await api.post('/route-optimizer/apply', { routes });
      setApplyResult(res.data.message);
      setStep(4);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to apply routes');
    }
    setApplying(false);
  };

  const toggleRoute = (idx: number) => {
    setRoutes(prev => prev.map((r, i) => i === idx ? { ...r, accepted: !r.accepted } : r));
  };
  const acceptedCount = routes.filter(r => r.accepted).length;
  const selectedSuppliers = dbSuppliers.filter(s => selected.has(s.id));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-700">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-brand-vibrant-pink/20 rounded-lg">
              <Zap className="w-5 h-5 text-brand-vibrant-pink" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">AI Route Optimizer</h2>
              <p className="text-xs text-gray-500">Select suppliers → configure volumes → AI designs optimal transport network</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-0 px-6 py-3 border-b border-gray-700/60 bg-gray-800/50 shrink-0">
          {[
            { n: 1, label: 'Select Suppliers' },
            { n: 2, label: 'Configure' },
            { n: 3, label: 'Review Routes' },
            { n: 4, label: 'Applied' },
          ].map(({ n, label }, i) => (
            <React.Fragment key={n}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${step === n ? 'bg-brand-vibrant-pink/20 text-brand-vibrant-pink' : step > n ? 'text-green-400' : 'text-gray-500'}`}>
                {step > n ? <CheckCircle className="w-3.5 h-3.5" /> : <span className="w-4 h-4 rounded-full border border-current flex items-center justify-center text-[10px]">{n}</span>}
                {label}
              </div>
              {i < 3 && <ChevronRight className="w-3.5 h-3.5 text-gray-600 mx-1" />}
            </React.Fragment>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-hidden flex flex-col p-6">

          {/* ── Step 1: Supplier selection ── */}
          {step === 1 && (
            <div className="flex gap-4 flex-1 min-h-0">

              {/* Left: DB supplier list */}
              <div className="flex flex-col w-80 shrink-0 min-h-0">
                <div className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-2">
                  <Users className="w-3.5 h-3.5" /> Supplier Database
                  {!loadingDb && <span className="ml-auto text-gray-600">{dbSuppliers.length} active</span>}
                </div>
                <div className="relative mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <input
                    value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search suppliers…"
                    className="w-full bg-gray-700/60 border border-gray-600 rounded-lg pl-8 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-brand-vibrant-pink/60"
                  />
                </div>
                <div className="flex-1 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900/40">
                  {loadingDb ? (
                    <div className="p-4 text-center text-xs text-gray-500">Loading suppliers…</div>
                  ) : filteredDb.length === 0 ? (
                    <div className="p-4 text-center text-xs text-gray-500">No suppliers found</div>
                  ) : filteredDb.map(s => {
                    const isSel = selected.has(s.id);
                    return (
                      <button key={s.id} onClick={() => toggleSelect(s)}
                        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left border-b border-gray-700/40 hover:bg-gray-700/40 transition-colors ${isSel ? 'bg-brand-vibrant-pink/10' : ''}`}>
                        <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSel ? 'bg-brand-vibrant-pink border-brand-vibrant-pink' : 'border-gray-600'}`}>
                          {isSel && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-white truncate">{s.company_name}</div>
                          <div className="text-[10px] text-gray-500">{s.city}, {s.country}</div>
                        </div>
                        {isSel ? <Minus className="w-3 h-3 text-brand-vibrant-pink ml-auto shrink-0" /> : <Plus className="w-3 h-3 text-gray-600 ml-auto shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right: Selected suppliers + volume config */}
              <div className="flex-1 flex flex-col min-h-0">
                <div className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-brand-vibrant-pink" />
                  Selected for Optimization
                  <span className={`ml-auto font-bold ${selected.size > 0 ? 'text-brand-vibrant-pink' : 'text-gray-600'}`}>
                    {selected.size} supplier{selected.size !== 1 ? 's' : ''}
                  </span>
                </div>

                {selected.size === 0 ? (
                  <div className="flex-1 flex items-center justify-center border-2 border-dashed border-gray-700 rounded-xl text-center">
                    <div>
                      <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                      <div className="text-sm text-gray-500">Select suppliers from the list on the left</div>
                      <div className="text-xs text-gray-600 mt-1">Each supplier needs pallets/week and destination</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto rounded-lg border border-gray-700">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-700/60 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-400 font-medium">Supplier</th>
                          <th className="px-2 py-2 text-left text-gray-400 font-medium">Plt/Wk</th>
                          <th className="px-2 py-2 text-left text-gray-400 font-medium">H (cm)</th>
                          <th className="px-2 py-2 text-left text-gray-400 font-medium">Stack</th>
                          <th className="px-2 py-2 text-left text-gray-400 font-medium">Destination</th>
                          <th className="px-2 py-2 text-left text-gray-400 font-medium">Vol m³</th>
                          <th className="px-1 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedSuppliers.map(s => {
                          const vol = selected.get(s.id)!;
                          const volM3 = (vol.pallets * 1.2 * 0.8 * vol.heightCm / 100).toFixed(1);
                          return (
                            <tr key={s.id} className="border-t border-gray-700/50 hover:bg-gray-700/20">
                              <td className="px-3 py-1.5">
                                <div className="text-white font-medium truncate max-w-[160px]">{s.company_name}</div>
                                <div className="text-[10px] text-gray-500">{s.city}, {s.country}</div>
                              </td>
                              <td className="px-2 py-1.5">
                                <input type="number" min="1" max="500" value={vol.pallets}
                                  onChange={e => updateVolume(s.id, { pallets: Math.max(1, parseInt(e.target.value) || 1) })}
                                  className="w-16 bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-amber-400 font-semibold text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                              </td>
                              <td className="px-2 py-1.5">
                                <input type="number" min="80" max="300" value={vol.heightCm}
                                  onChange={e => updateVolume(s.id, { heightCm: Math.max(80, parseInt(e.target.value) || 160) })}
                                  className="w-16 bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-gray-300 text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                              </td>
                              <td className="px-2 py-1.5">
                                <select value={vol.stackLevels}
                                  onChange={e => updateVolume(s.id, { stackLevels: parseInt(e.target.value) })}
                                  className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-1 text-cyan-400 text-center focus:outline-none focus:border-brand-vibrant-pink/60">
                                  <option value={1}>1×</option>
                                  <option value={2}>2×</option>
                                  <option value={3}>3×</option>
                                </select>
                              </td>
                              <td className="px-2 py-1.5">
                                <select value={vol.destinationId}
                                  onChange={e => updateVolume(s.id, { destinationId: e.target.value })}
                                  className="w-44 bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-gray-300 text-xs focus:outline-none focus:border-brand-vibrant-pink/60">
                                  {DESTINATIONS.map(d => (
                                    <option key={d.id} value={d.id}>{d.label}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5 text-purple-400 font-mono">{volM3}</td>
                              <td className="px-1 py-1.5">
                                <button onClick={() => toggleSelect(s)} className="p-1 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400 transition-colors">
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {selected.size > 0 && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span>Pallet size fixed at EUR 120×80 cm</span>
                    <span className="ml-auto text-gray-600">
                      Total: <span className="text-white font-semibold">
                        {Array.from(selected.values()).reduce((s, v) => s + v.pallets, 0)} plt/wk
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: Configure ── */}
          {step === 2 && (
            <div className="space-y-5 overflow-y-auto">
              <div className="text-sm text-gray-400 mb-2">Fine-tune the classification thresholds. Defaults are calibrated for standard European road transport.</div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { key: 'truckCapacityPlt', label: 'Truck Capacity (pallets)', desc: 'Standard trailer floor count', min: 10, max: 60, step: 1 },
                  { key: 'ftlFillThreshold', label: 'FTL Fill Threshold (0–1)', desc: 'Load factor to qualify as FTL', min: 0.3, max: 1, step: 0.05 },
                  { key: 'mrMaxStops', label: 'Max Milkrun Stops', desc: 'Max suppliers per milkrun route', min: 2, max: 8, step: 1 },
                  { key: 'mrMaxRadiusKm', label: 'Milkrun Cluster Radius (km)', desc: 'Max distance between milkrun suppliers', min: 50, max: 800, step: 25 },
                  { key: 'hubDistanceKm', label: 'HUB Distance Threshold (km)', desc: 'Suppliers farther → HUB flow', min: 200, max: 2000, step: 50 },
                  { key: 'ltlMaxPalletsPerTrip', label: 'LTL Max Pallets / Trip', desc: 'Below this → LTL (not MR)', min: 1, max: 15, step: 1 },
                  { key: 'costPerKmRoad', label: 'Cost / km FTL (EUR)', desc: 'Road transport cost rate', min: 0.5, max: 5, step: 0.1 },
                  { key: 'costPerKmMR', label: 'Cost / km Milkrun (EUR)', desc: 'Milkrun cost rate (higher due to stops)', min: 0.5, max: 5, step: 0.1 },
                ] as { key: keyof OptimizerConfig; label: string; desc: string; min: number; max: number; step: number }[]).map(({ key, label, desc, min, max, step: s }) => (
                  <div key={key} className="bg-gray-700/40 rounded-lg p-3">
                    <label className="text-xs text-white font-medium">{label}</label>
                    <div className="text-[10px] text-gray-500 mb-2">{desc}</div>
                    <div className="flex items-center gap-2">
                      <input type="range" min={min} max={max} step={s} value={config[key] as number}
                        onChange={e => setConfig(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        className="flex-1 accent-brand-vibrant-pink" />
                      <span className="text-sm font-mono text-brand-vibrant-pink w-12 text-right">{(config[key] as number).toString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 3: Review routes ── */}
          {step === 3 && summary && (
            <div className="space-y-4 overflow-y-auto">
              <div className="grid grid-cols-4 gap-3">
                {[
                  { label: 'FTL Routes', value: summary.ftlCount, color: 'text-blue-400' },
                  { label: 'Milkrun Routes', value: summary.mrCount, color: 'text-amber-400' },
                  { label: 'LTL Routes', value: summary.ltlCount, color: 'text-purple-400' },
                  { label: 'HUB Routes', value: summary.hubCount, color: 'text-green-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-gray-700/40 rounded-lg px-3 py-2 text-center">
                    <div className={`text-2xl font-bold ${color}`}>{value}</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-700/40 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">Trucks / Week</div>
                  <div className="text-lg font-bold text-white">{summary.totalTrucksPerWeek}</div>
                </div>
                <div className="bg-gray-700/40 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">Avg Load Factor</div>
                  <div className={`text-lg font-bold ${summary.avgLoadFactor >= 75 ? 'text-green-400' : summary.avgLoadFactor >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>{summary.avgLoadFactor}%</div>
                </div>
                <div className="bg-gray-700/40 rounded-lg px-3 py-2">
                  <div className="text-[10px] text-gray-500 mb-0.5">Est. Weekly Cost</div>
                  <div className="text-lg font-bold text-white">€{summary.estimatedWeeklyCostEur.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs text-gray-400">{acceptedCount} of {routes.length} routes accepted — click to toggle</div>
                <div className="flex gap-2">
                  <button onClick={() => setRoutes(p => p.map(r => ({ ...r, accepted: true })))} className="text-[10px] text-green-400 hover:underline">Accept all</button>
                  <button onClick={() => setRoutes(p => p.map(r => ({ ...r, accepted: false })))} className="text-[10px] text-red-400 hover:underline">Reject all</button>
                </div>
              </div>
              <div className="space-y-2">
                {routes.map((route, idx) => (
                  <div key={route.routeId} onClick={() => toggleRoute(idx)}
                    className={`rounded-lg border p-3 cursor-pointer transition-all ${route.accepted ? TYPE_BG[route.transportType] : 'bg-gray-700/20 border-gray-700/30 opacity-50'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: TYPE_COLORS[route.transportType] + '30', color: TYPE_COLORS[route.transportType], border: `1px solid ${TYPE_COLORS[route.transportType]}60` }}>{route.transportType}</span>
                        <span className="text-xs font-mono text-gray-400">{route.routeId}</span>
                        <span className="text-xs text-white font-medium truncate">{route.sequence.join(' → ')}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-right">
                        <div>
                          <div className={`font-bold ${route.loadFactorPct >= 75 ? 'text-green-400' : route.loadFactorPct >= 55 ? 'text-yellow-400' : 'text-red-400'}`}>{route.loadFactorPct}%</div>
                          <div className="text-[10px] text-gray-500">load</div>
                        </div>
                        <div><div className="font-bold text-white">{route.palletsPerTrip} plt</div><div className="text-[10px] text-gray-500">/trip</div></div>
                        <div><div className="font-bold text-white">{route.freqPerWeek}×/wk</div><div className="text-[10px] text-gray-500">{route.pickupDays.join(', ')}</div></div>
                        <div><div className="font-bold text-cyan-400">{route.distanceKm} km</div><div className="text-[10px] text-gray-500">distance</div></div>
                        <div><div className="font-bold text-white">€{route.estimatedCostEurWeekly.toLocaleString()}</div><div className="text-[10px] text-gray-500">/week</div></div>
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${route.accepted ? 'bg-green-500 border-green-400' : 'bg-gray-600 border-gray-500'}`}>
                          {route.accepted && <CheckCircle className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                    </div>
                    {route.notes.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {route.notes.map((n, i) => <span key={i} className="text-[10px] text-gray-500 bg-gray-700/40 px-1.5 py-0.5 rounded">{n}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {summary.suppliersWithNoRoute.length > 0 && (
                <div className="px-3 py-2 bg-yellow-900/20 border border-yellow-700/40 rounded-lg text-xs text-yellow-400">
                  <AlertTriangle className="w-3.5 h-3.5 inline mr-1" />
                  No route assigned to: {summary.suppliersWithNoRoute.join(', ')}
                </div>
              )}
            </div>
          )}

          {/* ── Step 4: Done ── */}
          {step === 4 && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-4">
              <div className="p-4 bg-green-900/30 rounded-full">
                <PackageCheck className="w-12 h-12 text-green-400" />
              </div>
              <div className="text-xl font-bold text-white">Routes Applied!</div>
              <div className="text-sm text-gray-400 max-w-sm">{applyResult}</div>
              <button onClick={() => { onApplied(); onClose(); }}
                className="mt-4 px-6 py-2.5 bg-brand-vibrant-pink hover:bg-brand-deep-burgundy text-white rounded-lg font-medium transition-colors">
                View in Route Plan
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 4 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-700 bg-gray-800/80 shrink-0">
            <div>
              {step > 1 && step < 4 && (
                <button onClick={() => setStep(prev => (prev - 1) as 1 | 2 | 3 | 4)} className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">
                  <RotateCcw className="w-3.5 h-3.5" /> Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step === 1 && (
                <button disabled={selected.size === 0} onClick={() => setStep(2)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors">
                  Configure <ChevronRight className="w-4 h-4" />
                </button>
              )}
              {step === 2 && (
                <button disabled={analyzing} onClick={runOptimizer}
                  className="flex items-center gap-1.5 px-4 py-2 bg-brand-vibrant-pink hover:bg-brand-deep-burgundy disabled:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors">
                  {analyzing ? <><RotateCcw className="w-4 h-4 animate-spin" /> Analyzing…</> : <><Play className="w-4 h-4" /> Run AI Optimizer</>}
                </button>
              )}
              {step === 3 && (
                <button disabled={applying || acceptedCount === 0} onClick={applyRoutes}
                  className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:text-gray-400 text-white rounded-lg text-sm font-medium transition-colors">
                  {applying ? <><RotateCcw className="w-4 h-4 animate-spin" /> Applying…</> : <><Truck className="w-4 h-4" /> Apply {acceptedCount} Route{acceptedCount !== 1 ? 's' : ''} to Plan</>}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
