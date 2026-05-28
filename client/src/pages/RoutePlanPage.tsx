import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Search, Download, Upload, Plus, Trash2, ChevronLeft, ChevronRight, ArrowUpDown, X, Sparkles } from 'lucide-react';
import RouteOptimizerModal from '../components/RouteOptimizerModal';

interface RoutePlan {
  id: number;
  route_description: string;
  tour_description?: string;
  transport_mode: 'FTL' | 'LTL' | 'MR' | 'HUB';
  origin_id?: string;
  origin_name?: string;
  origin_zip?: string;
  origin_city?: string;
  origin_country?: string;
  destination_id?: string;
  destination_name?: string;
  destination_zip?: string;
  destination_city?: string;
  destination_country?: string;
  pickup_date?: string;
  pickup_time?: string;
  delivery_date?: string;
  arrival_time?: string;
  carrier?: string;
  equipment?: string;
  transit_time_days?: number;
  customs?: string;
  direction: 'inbound' | 'outbound' | 'hub';
}

interface Stats {
  total: number;
  ftl_count: number;
  ltl_count: number;
  mr_count: number;
  hub_count: number;
  inbound_count: number;
  outbound_count: number;
  hub_dir_count: number;
  avg_transit: number;
}

const MODE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  FTL: { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'FTL' },
  LTL: { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'LTL' },
  MR: { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'Milkrun' },
  HUB: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'HUB' },
};

const DIR_STYLES: Record<string, { bg: string; text: string }> = {
  inbound: { bg: 'bg-emerald-900/30', text: 'text-emerald-400' },
  outbound: { bg: 'bg-red-900/30', text: 'text-red-400' },
  hub: { bg: 'bg-amber-900/30', text: 'text-amber-400' },
};

export default function RoutePlanPage() {
  const { isAdmin } = useAuth();
  const [plans, setPlans] = useState<RoutePlan[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [modeFilter, setModeFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState('route_description');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [importDirection, setImportDirection] = useState('inbound');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/route-plans', {
        params: {
          search, direction, mode: modeFilter.join(',') || undefined,
          page, limit: 50, sortBy, sortDir
        }
      });
      setPlans(data.plans);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setStats(data.stats);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [search, direction, modeFilter, page, sortBy, sortDir]);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('asc'); }
  };

  const handleExport = async (dir?: string) => {
    try {
      const params = dir ? `?direction=${dir}` : '';
      const { data } = await api.get(`/route-plans/export/csv${params}`, { responseType: 'blob' });
      const blob = new Blob([data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = dir ? `route_plan_${dir}.csv` : 'route_plan_all.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed. Make sure the server is running.');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('direction', importDirection);
    try {
      const { data } = await api.post('/route-plans/import/csv', formData);
      alert(`Imported ${data.imported} route plans${data.errors?.length ? `\n${data.errors.length} errors` : ''}`);
      fetchPlans();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Import failed');
    }
    e.target.value = '';
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this route plan?')) return;
    await api.delete(`/route-plans/${id}`);
    fetchPlans();
  };

  const toggleMode = (m: string) => {
    setModeFilter(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
    setPage(1);
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortBy !== col) return <ArrowUpDown className="w-3 h-3 text-gray-600 ml-1 inline" />;
    return <span className="text-blue-400 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="flex-1 bg-gray-900 px-4 py-4 overflow-auto">
      <div className="w-full">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold text-white">Route Plan</h1>
            <p className="text-sm text-gray-400">{total} route entries</p>
          </div>
          <div className="flex items-center gap-2">
            {/* AI Optimizer */}
            <button
              onClick={() => setShowOptimizer(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg text-sm font-medium"
            >
              <Sparkles className="w-4 h-4" /> AI Optimize
            </button>
            {/* Export dropdown */}
            <div className="relative group">
              <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">
                <Download className="w-4 h-4" /> Export CSV
              </button>
              <div className="absolute right-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10 min-w-[160px]">
                <button onClick={() => handleExport()} className="w-full text-left px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 rounded-t-lg">All Routes</button>
                <button onClick={() => handleExport('inbound')} className="w-full text-left px-3 py-2 text-sm text-emerald-400 hover:bg-gray-700">Inbound Only</button>
                <button onClick={() => handleExport('outbound')} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-gray-700">Outbound Only</button>
                <button onClick={() => handleExport('hub')} className="w-full text-left px-3 py-2 text-sm text-amber-400 hover:bg-gray-700 rounded-b-lg">Hub Only</button>
              </div>
            </div>
            {isAdmin && (
              <>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
                <div className="flex items-center gap-1 bg-gray-700 rounded-lg">
                  <select value={importDirection} onChange={e => setImportDirection(e.target.value)}
                    className="bg-transparent text-gray-300 text-xs px-2 py-2 border-r border-gray-600 focus:outline-none">
                    <option value="inbound">Inbound</option>
                    <option value="outbound">Outbound</option>
                    <option value="hub">Hub</option>
                  </select>
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2 hover:bg-gray-600 text-white rounded-r-lg text-sm">
                    <Upload className="w-4 h-4" /> Import
                  </button>
                </div>
                <button onClick={() => setShowAddForm(true)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
                  <Plus className="w-4 h-4" /> Add Route
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stats bar */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-4">
            <StatCard label="Total" value={stats.total} color="text-white" />
            <StatCard label="FTL" value={stats.ftl_count} color="text-blue-400" />
            <StatCard label="LTL" value={stats.ltl_count} color="text-purple-400" />
            <StatCard label="Milkrun" value={stats.mr_count} color="text-amber-400" />
            <StatCard label="HUB" value={stats.hub_count} color="text-green-400" />
            <StatCard label="Inbound" value={stats.inbound_count} color="text-emerald-400" />
            <StatCard label="Outbound" value={stats.outbound_count} color="text-red-400" />
            <StatCard label="Avg Transit" value={stats.avg_transit ? `${stats.avg_transit.toFixed(1)}d` : '—'} color="text-gray-300" />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input type="text" value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search routes, origins, destinations, carriers..."
              className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          {/* Direction filter */}
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
            {['all', 'inbound', 'outbound', 'hub'].map(d => (
              <button key={d} onClick={() => { setDirection(d); setPage(1); }}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  direction === d ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {d === 'all' ? 'All' : d.charAt(0).toUpperCase() + d.slice(1)}
              </button>
            ))}
          </div>
          {/* Mode filter */}
          <div className="flex items-center gap-1">
            {Object.entries(MODE_STYLES).map(([m, style]) => (
              <button key={m} onClick={() => toggleMode(m)}
                className={`px-2.5 py-1.5 rounded text-xs font-bold transition-colors ${
                  modeFilter.includes(m) ? `${style.bg} ${style.text} ring-1 ring-current` :
                  'bg-gray-800 text-gray-500 hover:text-gray-300'
                }`}>
                {style.label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="text-[10px] text-gray-400 uppercase bg-gray-800/80 border-b border-gray-700">
                <tr>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white whitespace-nowrap" onClick={() => handleSort('route_description')}>
                    Route <SortIcon col="route_description" />
                  </th>
                  <th className="px-2 py-2.5">Tour Desc</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('transport_mode')}>
                    Mode <SortIcon col="transport_mode" />
                  </th>
                  <th className="px-2 py-2.5">Orig ID</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('origin_name')}>
                    Origin <SortIcon col="origin_name" />
                  </th>
                  <th className="px-2 py-2.5">ZIP</th>
                  <th className="px-2 py-2.5">City</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('origin_country')}>
                    Country <SortIcon col="origin_country" />
                  </th>
                  <th className="px-2 py-2.5">Dest ID</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('destination_name')}>
                    Destination <SortIcon col="destination_name" />
                  </th>
                  <th className="px-2 py-2.5">ZIP</th>
                  <th className="px-2 py-2.5">City</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('destination_country')}>
                    Country <SortIcon col="destination_country" />
                  </th>
                  <th className="px-2 py-2.5">Pickup</th>
                  <th className="px-2 py-2.5">Time</th>
                  <th className="px-2 py-2.5">Delivery</th>
                  <th className="px-2 py-2.5">Time</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('carrier')}>
                    Carrier <SortIcon col="carrier" />
                  </th>
                  <th className="px-2 py-2.5">Equip</th>
                  <th className="px-2 py-2.5 cursor-pointer hover:text-white" onClick={() => handleSort('transit_time_days')}>
                    Transit <SortIcon col="transit_time_days" />
                  </th>
                  <th className="px-2 py-2.5">Customs</th>
                  <th className="px-2 py-2.5">Dir</th>
                  {isAdmin && <th className="px-2 py-2.5"></th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={23} className="px-4 py-8 text-center text-gray-500">Loading...</td></tr>
                ) : plans.length === 0 ? (
                  <tr><td colSpan={23} className="px-4 py-8 text-center text-gray-500">
                    No route plans found. Import a CSV file to get started.
                  </td></tr>
                ) : plans.map((p, i) => {
                  const ms = MODE_STYLES[p.transport_mode] || MODE_STYLES.FTL;
                  const ds = DIR_STYLES[p.direction] || DIR_STYLES.inbound;
                  return (
                    <tr key={p.id} className={`border-b border-gray-700/30 hover:bg-gray-700/20 transition-colors ${i % 2 === 0 ? '' : 'bg-gray-800/40'}`}>
                      <td className="px-2 py-2 text-gray-200 font-medium whitespace-nowrap max-w-[140px] truncate" title={p.route_description}>{p.route_description}</td>
                      <td className="px-2 py-2 text-gray-400 max-w-[120px] truncate" title={p.tour_description}>{p.tour_description || ''}</td>
                      <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ms.bg} ${ms.text}`}>{p.transport_mode}</span></td>
                      <td className="px-2 py-2 text-gray-500 font-mono">{p.origin_id}</td>
                      <td className="px-2 py-2 text-gray-300 max-w-[140px] truncate" title={p.origin_name}>{p.origin_name}</td>
                      <td className="px-2 py-2 text-gray-500">{p.origin_zip}</td>
                      <td className="px-2 py-2 text-gray-400">{p.origin_city}</td>
                      <td className="px-2 py-2 text-gray-400">{p.origin_country}</td>
                      <td className="px-2 py-2 text-gray-500 font-mono">{p.destination_id}</td>
                      <td className="px-2 py-2 text-gray-300 max-w-[140px] truncate" title={p.destination_name}>{p.destination_name}</td>
                      <td className="px-2 py-2 text-gray-500">{p.destination_zip}</td>
                      <td className="px-2 py-2 text-gray-400">{p.destination_city}</td>
                      <td className="px-2 py-2 text-gray-400">{p.destination_country}</td>
                      <td className="px-2 py-2 text-amber-300 font-medium">{p.pickup_date}</td>
                      <td className="px-2 py-2 text-amber-300/70">{p.pickup_time}</td>
                      <td className="px-2 py-2 text-amber-300 font-medium">{p.delivery_date}</td>
                      <td className="px-2 py-2 text-amber-300/70">{p.arrival_time}</td>
                      <td className="px-2 py-2 text-blue-300 max-w-[160px] truncate" title={p.carrier}>{p.carrier}</td>
                      <td className="px-2 py-2 text-gray-400">{p.equipment}</td>
                      <td className="px-2 py-2 text-center font-bold" style={{
                        color: (p.transit_time_days || 0) > 5 ? '#ef4444' : (p.transit_time_days || 0) > 3 ? '#f59e0b' : '#10b981'
                      }}>{p.transit_time_days ?? ''}</td>
                      <td className="px-2 py-2 text-gray-400">{p.customs}</td>
                      <td className="px-2 py-2"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ds.bg} ${ds.text}`}>{p.direction}</span></td>
                      {isAdmin && (
                        <td className="px-2 py-2">
                          <button onClick={() => handleDelete(p.id)}
                            className="p-1 hover:bg-red-900/50 rounded text-gray-500 hover:text-red-400">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700">
            <span className="text-xs text-gray-500">
              Showing {plans.length > 0 ? (page - 1) * 50 + 1 : 0}–{Math.min(page * 50, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-400 px-2">Page {page} of {totalPages || 1}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages || totalPages === 0}
                className="p-1.5 rounded hover:bg-gray-700 disabled:opacity-30 text-gray-400">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Form Modal */}
      {showAddForm && (
        <AddRoutePlanForm onSave={() => { setShowAddForm(false); fetchPlans(); }} onClose={() => setShowAddForm(false)} />
      )}

      {/* AI Route Optimizer Modal */}
      {showOptimizer && (
        <RouteOptimizerModal
          onClose={() => setShowOptimizer(false)}
          onApplied={() => { setShowOptimizer(false); fetchPlans(); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-2.5 border border-gray-700/50">
      <div className="text-[10px] text-gray-500 uppercase font-medium">{label}</div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
    </div>
  );
}

function AddRoutePlanForm({ onSave, onClose }: { onSave: () => void; onClose: () => void }) {
  const [form, setForm] = useState({
    route_description: '', tour_description: '', transport_mode: 'FTL',
    origin_id: '', origin_name: '', origin_zip: '', origin_city: '', origin_country: '',
    destination_id: '', destination_name: '', destination_zip: '', destination_city: '', destination_country: '',
    pickup_date: '', pickup_time: '', delivery_date: '', arrival_time: '',
    carrier: '', equipment: 'Standard', transit_time_days: '', customs: '', direction: 'inbound'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/route-plans', {
        ...form,
        transit_time_days: form.transit_time_days ? parseFloat(form.transit_time_days) : null
      });
      onSave();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to create');
    }
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-white">Add Route Plan Entry</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded text-gray-400"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-400 mb-1 block">Route Description *</label>
              <input value={form.route_description} onChange={e => set('route_description', e.target.value)} required
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Direction</label>
              <select value={form.direction} onChange={e => set('direction', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm">
                <option value="inbound">Inbound</option>
                <option value="outbound">Outbound</option>
                <option value="hub">Hub</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Transport Mode *</label>
              <select value={form.transport_mode} onChange={e => set('transport_mode', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm">
                <option value="FTL">FTL</option>
                <option value="LTL">LTL</option>
                <option value="MR">Milkrun</option>
                <option value="HUB">HUB</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Tour Description</label>
              <input value={form.tour_description} onChange={e => set('tour_description', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Carrier</label>
              <input value={form.carrier} onChange={e => set('carrier', e.target.value)}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
          </div>
          <div className="border-t border-gray-700 pt-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Origin</h3>
            <div className="grid grid-cols-5 gap-2">
              <input placeholder="ID" value={form.origin_id} onChange={e => set('origin_id', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="Name" value={form.origin_name} onChange={e => set('origin_name', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="ZIP" value={form.origin_zip} onChange={e => set('origin_zip', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="City" value={form.origin_city} onChange={e => set('origin_city', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="Country" value={form.origin_country} onChange={e => set('origin_country', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
          </div>
          <div className="border-t border-gray-700 pt-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase mb-2">Destination</h3>
            <div className="grid grid-cols-5 gap-2">
              <input placeholder="ID" value={form.destination_id} onChange={e => set('destination_id', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="Name" value={form.destination_name} onChange={e => set('destination_name', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="ZIP" value={form.destination_zip} onChange={e => set('destination_zip', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="City" value={form.destination_city} onChange={e => set('destination_city', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
              <input placeholder="Country" value={form.destination_country} onChange={e => set('destination_country', e.target.value)} className="px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-6 gap-2 border-t border-gray-700 pt-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Pickup Date</label>
              <input value={form.pickup_date} onChange={e => set('pickup_date', e.target.value)} placeholder="M0"
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Pickup Time</label>
              <input value={form.pickup_time} onChange={e => set('pickup_time', e.target.value)} placeholder="08:00 - 15:00"
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Delivery Date</label>
              <input value={form.delivery_date} onChange={e => set('delivery_date', e.target.value)} placeholder="W1"
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Arrival Time</label>
              <input value={form.arrival_time} onChange={e => set('arrival_time', e.target.value)} placeholder="08:00 - 18:00"
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Transit (days)</label>
              <input type="number" step="0.1" value={form.transit_time_days} onChange={e => set('transit_time_days', e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Equipment</label>
              <input value={form.equipment} onChange={e => set('equipment', e.target.value)}
                className="w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-sm" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Create Route</button>
          </div>
        </form>
      </div>
    </div>
  );
}
