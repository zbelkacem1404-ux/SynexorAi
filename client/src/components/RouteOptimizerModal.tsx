import React, { useState, useEffect, useMemo } from 'react';
import api from '../utils/api';
import {
  X, Zap, CheckCircle, AlertTriangle, Truck,
  RotateCcw, ChevronRight, Play, PackageCheck, Search,
  Plus, Minus, Users
} from 'lucide-react';
import { Supplier } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────
type FrequencyBasis =
  | 'every4weeks' | 'every3weeks' | 'every2weeks'
  | 'weekly' | 'twicePerWeek' | 'thricePerWeek'
  | 'daily' | 'twicePerDay' | 'thricePerDay';

// occurrencesPerWeek: how many times/week this basis fires — "pallets" entered on the line
// is the quantity PER OCCURRENCE (e.g. twicePerDay + 5 pallets = 5 pallets each drop, 10x/week = 50/week)
const FREQUENCY_OPTIONS: { value: FrequencyBasis; label: string; occurrencesPerWeek: number }[] = [
  { value: 'every4weeks', label: 'Every 4 weeks', occurrencesPerWeek: 0.25 },
  { value: 'every3weeks', label: 'Every 3 weeks', occurrencesPerWeek: 1 / 3 },
  { value: 'every2weeks', label: 'Every 2 weeks', occurrencesPerWeek: 0.5 },
  { value: 'weekly', label: 'Weekly', occurrencesPerWeek: 1 },
  { value: 'twicePerWeek', label: '2×/week', occurrencesPerWeek: 2 },
  { value: 'thricePerWeek', label: '3×/week', occurrencesPerWeek: 3 },
  { value: 'daily', label: 'Daily', occurrencesPerWeek: 5 },
  { value: 'twicePerDay', label: '2×/day', occurrencesPerWeek: 10 },
  { value: 'thricePerDay', label: '3×/day', occurrencesPerWeek: 15 },
];
const FREQUENCY_OPTION_MAP: Record<FrequencyBasis, number> = Object.fromEntries(
  FREQUENCY_OPTIONS.map(o => [o.value, o.occurrencesPerWeek])
) as Record<FrequencyBasis, number>;

interface PackageLine {
  id: string;
  pallets: number;
  frequencyBasis: FrequencyBasis;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  weightKgPerPallet: number;
  stackLevels: number;
}

interface VolumeConfig {
  destinationId: string;
  packages: PackageLine[];
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
  freqPerWeek: number; frequencyLabel: string; trucksPerWeek: number;
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
  truckCapacityPlt: number; truckCapacityKg: number; ftlFillThreshold: number;
  mrMaxStops: number; mrMaxRadiusKm: number;
  hubDistanceKm: number; hubClusterRadiusKm: number;
  ltlMaxPalletsPerTrip: number;
  costPerKmRoad: number; costPerKmMR: number;
  maxTripsPerDay: number;
}

const DEFAULT_CONFIG: OptimizerConfig = {
  truckCapacityPlt: 33, truckCapacityKg: 24000, ftlFillThreshold: 0.65,
  mrMaxStops: 5, mrMaxRadiusKm: 300,
  hubDistanceKm: 600, hubClusterRadiusKm: 600,
  ltlMaxPalletsPerTrip: 4,
  costPerKmRoad: 1.5, costPerKmMR: 1.8,
  maxTripsPerDay: 1,
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

let lineIdCounter = 0;
const genLineId = () => `pkg-${++lineIdCounter}-${Date.now()}`;

const DEFAULT_PACKAGE_LINE = (): PackageLine => ({
  id: genLineId(), pallets: 10, frequencyBasis: 'weekly', lengthCm: 120, widthCm: 80, heightCm: 160, weightKgPerPallet: 400, stackLevels: 1,
});

const DEFAULT_VOLUME = (): VolumeConfig => ({
  destinationId: 'RT-HQ', packages: [DEFAULT_PACKAGE_LINE()],
});

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
      else { next.set(sup.id, DEFAULT_VOLUME()); }
      return next;
    });
  };

  const selectAll = () => {
    setSelected(prev => {
      const next = new Map(prev);
      for (const s of filteredDb) {
        if (!next.has(s.id)) next.set(s.id, DEFAULT_VOLUME());
      }
      return next;
    });
  };

  const clearAll = () => setSelected(new Map());

  const updateVolume = (id: number, patch: Partial<Omit<VolumeConfig, 'packages'>>) => {
    setSelected(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, ...patch });
      return next;
    });
  };

  const addPackageLine = (id: number) => {
    setSelected(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, packages: [...cur.packages, DEFAULT_PACKAGE_LINE()] });
      return next;
    });
  };

  const removePackageLine = (id: number, lineId: string) => {
    setSelected(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur && cur.packages.length > 1) next.set(id, { ...cur, packages: cur.packages.filter(p => p.id !== lineId) });
      return next;
    });
  };

  const updatePackageLine = (id: number, lineId: string, patch: Partial<PackageLine>) => {
    setSelected(prev => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (cur) next.set(id, { ...cur, packages: cur.packages.map(p => p.id === lineId ? { ...p, ...patch } : p) });
      return next;
    });
  };

  // Weekly-equivalent pallet count for a line, converting daily quantities up by workdays/week
  const weeklyEquivalent = (p: PackageLine) => p.pallets * (FREQUENCY_OPTION_MAP[p.frequencyBasis] ?? 1);

  // Aggregate a supplier's package lines into one effective volume — the optimizer's
  // truck-capacity math runs on totals (pallets/weight/effective floor positions), not per-line dimensions.
  const aggregatePackages = (packages: PackageLine[]) => {
    const totalPallets = packages.reduce((sum, p) => sum + weeklyEquivalent(p), 0);
    const totalWeight = packages.reduce((sum, p) => sum + weeklyEquivalent(p) * p.weightKgPerPallet, 0);
    const totalVolumeM3 = packages.reduce((sum, p) => sum + weeklyEquivalent(p) * (p.lengthCm / 100) * (p.widthCm / 100) * (p.heightCm / 100), 0);
    const effectivePallets = packages.reduce((sum, p) => sum + weeklyEquivalent(p) / p.stackLevels, 0);
    const maxHeight = Math.max(...packages.map(p => p.heightCm));
    const minStack = Math.min(...packages.map(p => p.stackLevels));
    const avgLength = totalPallets > 0 ? packages.reduce((sum, p) => sum + weeklyEquivalent(p) * p.lengthCm, 0) / totalPallets : 120;
    const avgWidth = totalPallets > 0 ? packages.reduce((sum, p) => sum + weeklyEquivalent(p) * p.widthCm, 0) / totalPallets : 80;
    return { totalPallets, totalWeight, totalVolumeM3, effectivePallets, maxHeight, minStack, avgLength, avgWidth };
  };

  // Build SupplierVolume[] from selected DB suppliers + volume configs
  const buildSupplierVolumes = (): SupplierVolume[] => {
    const result: SupplierVolume[] = [];
    for (const [id, vol] of selected) {
      const s = dbSuppliers.find(x => x.id === id);
      if (!s || vol.packages.length === 0) continue;
      const agg = aggregatePackages(vol.packages);
      const dest = DESTINATIONS.find(d => d.id === vol.destinationId);
      result.push({
        id: s.supplier_id || String(s.id),
        name: s.company_name,
        city: s.city,
        country: s.country,
        lat: s.latitude ?? 0,
        lng: s.longitude ?? 0,
        weeklyPallets: agg.totalPallets,
        weightKgPerWeek: agg.totalWeight,
        palletLengthCm: Math.round(agg.avgLength),
        palletWidthCm: Math.round(agg.avgWidth),
        palletHeightCm: agg.maxHeight,
        stackLevels: agg.minStack,
        volumeM3PerWeek: agg.totalVolumeM3,
        effectivePallets: agg.effectivePallets,
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
                <div className="flex items-center gap-2 mb-2">
                  <button onClick={selectAll} disabled={loadingDb || filteredDb.length === 0}
                    className="flex-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg text-[11px] font-medium transition-colors">
                    Select All{search ? ` (${filteredDb.length})` : ''}
                  </button>
                  <button onClick={clearAll} disabled={selected.size === 0}
                    className="flex-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-gray-300 rounded-lg text-[11px] font-medium transition-colors">
                    Clear All
                  </button>
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
                  <div className="flex-1 overflow-y-auto rounded-lg border border-gray-700 divide-y divide-gray-700">
                    {selectedSuppliers.map(s => {
                      const vol = selected.get(s.id)!;
                      const agg = aggregatePackages(vol.packages);
                      return (
                        <div key={s.id} className="bg-gray-900/30">
                          {/* Supplier header row */}
                          <div className="flex items-center gap-2 px-3 py-2 bg-gray-700/30">
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-white font-medium truncate">{s.company_name}</div>
                              <div className="text-[10px] text-gray-500">{s.city}, {s.country}</div>
                            </div>
                            <select value={vol.destinationId}
                              onChange={e => updateVolume(s.id, { destinationId: e.target.value })}
                              className="w-44 bg-gray-700 border border-gray-600 rounded px-1.5 py-1 text-gray-300 text-[11px] focus:outline-none focus:border-brand-vibrant-pink/60">
                              {DESTINATIONS.map(d => (
                                <option key={d.id} value={d.id}>{d.label}</option>
                              ))}
                            </select>
                            <div className="text-right shrink-0 text-[11px]">
                              <div className="text-amber-400 font-semibold">{agg.totalPallets} plt/wk</div>
                              <div className="text-purple-400 font-mono">{agg.totalVolumeM3.toFixed(1)} m³ · {Math.round(agg.totalWeight)} kg</div>
                            </div>
                            <button onClick={() => toggleSelect(s)} className="p-1 hover:bg-red-900/30 rounded text-gray-500 hover:text-red-400 transition-colors shrink-0">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* Package lines */}
                          <table className="w-full text-[11px]">
                            <thead>
                              <tr className="text-gray-500">
                                <th className="px-3 py-1 text-left font-medium" title="Pallets per pickup, at the frequency selected in Basis">Plt / pickup</th>
                                <th className="px-2 py-1 text-left font-medium">Basis</th>
                                <th className="px-2 py-1 text-left font-medium">L (cm)</th>
                                <th className="px-2 py-1 text-left font-medium">W (cm)</th>
                                <th className="px-2 py-1 text-left font-medium">H (cm)</th>
                                <th className="px-2 py-1 text-left font-medium">kg/plt</th>
                                <th className="px-2 py-1 text-left font-medium">Stack</th>
                                <th className="px-1 py-1"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {vol.packages.map(p => (
                                <tr key={p.id} className="hover:bg-gray-700/20">
                                  <td className="px-3 py-1">
                                    <input type="number" min="1" max="500" value={p.pallets}
                                      onChange={e => updatePackageLine(s.id, p.id, { pallets: Math.max(1, parseInt(e.target.value) || 1) })}
                                      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-amber-400 font-semibold text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <select value={p.frequencyBasis}
                                      onChange={e => updatePackageLine(s.id, p.id, { frequencyBasis: e.target.value as FrequencyBasis })}
                                      className="w-28 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-emerald-400 text-center focus:outline-none focus:border-brand-vibrant-pink/60">
                                      {FREQUENCY_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                      ))}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1">
                                    <input type="number" min="20" max="300" value={p.lengthCm}
                                      onChange={e => updatePackageLine(s.id, p.id, { lengthCm: Math.max(20, parseInt(e.target.value) || 120) })}
                                      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300 text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input type="number" min="20" max="300" value={p.widthCm}
                                      onChange={e => updatePackageLine(s.id, p.id, { widthCm: Math.max(20, parseInt(e.target.value) || 80) })}
                                      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300 text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input type="number" min="20" max="300" value={p.heightCm}
                                      onChange={e => updatePackageLine(s.id, p.id, { heightCm: Math.max(20, parseInt(e.target.value) || 160) })}
                                      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300 text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <input type="number" min="1" max="2000" value={p.weightKgPerPallet}
                                      onChange={e => updatePackageLine(s.id, p.id, { weightKgPerPallet: Math.max(1, parseInt(e.target.value) || 400) })}
                                      className="w-16 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-gray-300 text-center focus:outline-none focus:border-brand-vibrant-pink/60" />
                                  </td>
                                  <td className="px-2 py-1">
                                    <select value={p.stackLevels}
                                      onChange={e => updatePackageLine(s.id, p.id, { stackLevels: parseInt(e.target.value) })}
                                      className="w-14 bg-gray-700 border border-gray-600 rounded px-1 py-0.5 text-cyan-400 text-center focus:outline-none focus:border-brand-vibrant-pink/60">
                                      <option value={1}>1×</option>
                                      <option value={2}>2×</option>
                                      <option value={3}>3×</option>
                                    </select>
                                  </td>
                                  <td className="px-1 py-1">
                                    <button onClick={() => removePackageLine(s.id, p.id)} disabled={vol.packages.length <= 1}
                                      className="p-1 hover:bg-red-900/30 rounded text-gray-600 hover:text-red-400 disabled:opacity-30 disabled:hover:bg-transparent transition-colors">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <button onClick={() => addPackageLine(s.id)}
                            className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-brand-vibrant-pink hover:underline">
                            <Plus className="w-3 h-3" /> Add pallet type
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {selected.size > 0 && (
                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                    <span>Set each pallet type's actual dimensions, weight, and pickup frequency (weekly, biweekly, daily, twice/day…) — the optimizer converts everything to a weekly total</span>
                    <span className="ml-auto text-gray-600">
                      Total: <span className="text-white font-semibold">
                        {Array.from(selected.values()).reduce((sum, v) => sum + aggregatePackages(v.packages).totalPallets, 0)} plt/wk
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
              <div className="text-sm text-gray-400 mb-2">
                Fine-tune the classification thresholds. Defaults are calibrated for standard European road transport.
                The optimizer always looks for a full truckload (FTL) first, at the least frequent pickup cadence that still fills the truck —
                from once every few weeks up to <span className="text-white font-medium">Max Pickups / Day</span> for very high-volume lanes.
              </div>
              <div className="grid grid-cols-2 gap-4">
                {([
                  { key: 'truckCapacityPlt', label: 'Truck Capacity (pallets)', desc: 'Standard trailer floor count', min: 10, max: 60, step: 1 },
                  { key: 'truckCapacityKg', label: 'Truck Payload Limit (kg)', desc: 'Max weight — can bind before floor space when pallets are stacked', min: 5000, max: 40000, step: 500 },
                  { key: 'ftlFillThreshold', label: 'FTL Fill Threshold (0–1)', desc: 'Load factor to qualify as FTL', min: 0.3, max: 1, step: 0.05 },
                  { key: 'mrMaxStops', label: 'Max Milkrun Stops', desc: 'Max suppliers per milkrun route', min: 2, max: 8, step: 1 },
                  { key: 'mrMaxRadiusKm', label: 'Milkrun Cluster Radius (km)', desc: 'Max distance between milkrun suppliers', min: 50, max: 800, step: 25 },
                  { key: 'hubDistanceKm', label: 'HUB Distance Threshold (km)', desc: 'Suppliers farther → HUB flow', min: 200, max: 2000, step: 50 },
                  { key: 'hubClusterRadiusKm', label: 'HUB Cluster Radius (km)', desc: 'Max distance between suppliers sharing a hub — wider than a milkrun loop', min: 100, max: 1500, step: 50 },
                  { key: 'ltlMaxPalletsPerTrip', label: 'LTL Max Pallets / Trip', desc: 'Below this → LTL (not MR)', min: 1, max: 15, step: 1 },
                  { key: 'costPerKmRoad', label: 'Cost / km FTL (EUR)', desc: 'Road transport cost rate', min: 0.5, max: 5, step: 0.1 },
                  { key: 'costPerKmMR', label: 'Cost / km Milkrun (EUR)', desc: 'Milkrun cost rate (higher due to stops)', min: 0.5, max: 5, step: 0.1 },
                  { key: 'maxTripsPerDay', label: 'Max Pickups / Day', desc: 'Upper bound for same-day pickups on high-volume lanes (e.g. 2 = up to twice/day)', min: 1, max: 4, step: 1 },
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
                        <div><div className="font-bold text-white">{route.frequencyLabel}</div><div className="text-[10px] text-gray-500">{route.pickupDays.join(', ')}</div></div>
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
