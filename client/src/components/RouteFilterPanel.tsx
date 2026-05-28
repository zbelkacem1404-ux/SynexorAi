import React, { useState, useMemo } from 'react';
import { Filter, X, ChevronDown, ChevronUp, Search, Route } from 'lucide-react';
import { TransportRoute, RouteFilters } from '../types';

interface Props {
  routes: TransportRoute[];
  filters: RouteFilters;
  onChange: (filters: RouteFilters) => void;
}

const SHIPMENT_TYPE_OPTIONS = [
  { value: 'FTL', label: 'FTL', color: '#3b82f6' },
  { value: 'LTL', label: 'LTL', color: '#8b5cf6' },
  { value: 'MR', label: 'MR', color: '#f59e0b' },
  { value: 'HUB', label: 'HUB', color: '#10b981' },
];

const TYPE_OPTIONS = [
  { value: 'inbound', label: 'Inbound', color: 'bg-blue-500' },
  { value: 'outbound', label: 'Outbound', color: 'bg-orange-500' },
];

export default function RouteFilterPanel({ routes, filters, onChange }: Props) {
  const [expanded, setExpanded] = useState(true);

  // Extract unique carriers and suppliers from routes
  const carriers = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => { if (r.carrier_name) set.add(r.carrier_name); });
    return Array.from(set).sort();
  }, [routes]);

  const allSuppliers = useMemo(() => {
    const map = new Map<number, string>();
    routes.forEach(r => {
      r.suppliers?.forEach(s => { map.set(s.id, s.company_name); });
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [routes]);

  // Extract unique route descriptions
  const routeDescriptions = useMemo(() => {
    const set = new Set<string>();
    routes.forEach(r => {
      if (r.routePlans?.length) {
        r.routePlans.forEach(rp => set.add(rp.route_description));
      } else if (r.route_description) {
        set.add(r.route_description);
      } else {
        set.add(r.name);
      }
    });
    return Array.from(set).sort();
  }, [routes]);

  const transitRange = useMemo(() => {
    let min = Infinity, max = 0;
    routes.forEach(r => {
      if (r.transit_days != null) {
        min = Math.min(min, r.transit_days);
        max = Math.max(max, r.transit_days);
      }
    });
    return { min: min === Infinity ? 0 : min, max: max || 30 };
  }, [routes]);

  const hasActiveFilters = !!(
    filters.search ||
    filters.routeDescription ||
    filters.transportMode?.length ||
    filters.routeType?.length ||
    filters.carrier?.length ||
    filters.supplier?.length ||
    filters.shipmentType?.length ||
    filters.transitDaysMin != null ||
    filters.transitDaysMax != null
  );

  const clearFilters = () => onChange({});

  const toggleArrayFilter = (key: 'transportMode' | 'routeType' | 'carrier' | 'shipmentType', value: string) => {
    const current = (filters as any)[key] || [];
    const next = current.includes(value)
      ? current.filter((v: string) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next.length ? next : undefined });
  };

  const toggleSupplier = (id: number) => {
    const current = filters.supplier || [];
    const next = current.includes(id)
      ? current.filter(v => v !== id)
      : [...current, id];
    onChange({ ...filters, supplier: next.length ? next : undefined });
  };

  return (
    <div className="border-b border-gray-700">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-xs font-medium text-gray-300 uppercase tracking-wide">Filters</span>
          {hasActiveFilters && (
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          )}
        </div>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              type="text"
              placeholder="Search routes, suppliers..."
              value={filters.search || ''}
              onChange={e => onChange({ ...filters, search: e.target.value || undefined })}
              className="w-full pl-7 pr-3 py-1.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {/* Route Description Filter */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase font-medium flex items-center gap-1">
              <Route className="w-3 h-3" /> Route Description
            </label>
            <div className="relative mt-1">
              <input
                type="text"
                placeholder="e.g. SUP-0019_RT-HQ/M01"
                value={filters.routeDescription || ''}
                onChange={e => onChange({ ...filters, routeDescription: e.target.value || undefined })}
                className="w-full px-2 py-1.5 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white font-mono placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
            </div>
            {routeDescriptions.length > 0 && filters.routeDescription && (
              <div className="mt-1 max-h-16 overflow-y-auto space-y-0.5">
                {routeDescriptions
                  .filter(d => d.toLowerCase().includes((filters.routeDescription || '').toLowerCase()))
                  .slice(0, 5)
                  .map(d => (
                    <button key={d} onClick={() => onChange({ ...filters, routeDescription: d })}
                      className="block w-full text-left px-2 py-0.5 text-[10px] font-mono text-gray-400 hover:text-white hover:bg-gray-700 rounded truncate">
                      {d}
                    </button>
                  ))
                }
              </div>
            )}
          </div>

          {/* Shipment / Transport Type (FTL/LTL/MR/HUB) */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase font-medium">Transport Mode</label>
            <div className="flex flex-wrap gap-1 mt-1">
              {SHIPMENT_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleArrayFilter('shipmentType', opt.value)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    (filters.shipmentType || []).includes(opt.value)
                      ? 'text-white'
                      : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600/60 hover:text-gray-300'
                  }`}
                  style={{
                    backgroundColor: (filters.shipmentType || []).includes(opt.value) ? opt.color : undefined
                  }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: opt.color }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Direction */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase font-medium">Direction</label>
            <div className="flex gap-1 mt-1">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => toggleArrayFilter('routeType', opt.value)}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                    (filters.routeType || []).includes(opt.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600/60 hover:text-gray-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Carrier */}
          {carriers.length > 0 && (
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-medium">Carrier</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {carriers.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleArrayFilter('carrier', c)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      (filters.carrier || []).includes(c)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600/60 hover:text-gray-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Supplier */}
          {allSuppliers.length > 0 && (
            <div>
              <label className="text-[10px] text-gray-500 uppercase font-medium">Supplier</label>
              <div className="flex flex-wrap gap-1 mt-1 max-h-20 overflow-y-auto">
                {allSuppliers.map(([id, name]) => (
                  <button
                    key={id}
                    onClick={() => toggleSupplier(id)}
                    className={`px-2 py-1 rounded text-[11px] font-medium transition-colors ${
                      (filters.supplier || []).includes(id)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-700/60 text-gray-400 hover:bg-gray-600/60 hover:text-gray-300'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transit Days Range */}
          <div>
            <label className="text-[10px] text-gray-500 uppercase font-medium">Transit Days</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="number"
                min={0}
                placeholder={`${transitRange.min}`}
                value={filters.transitDaysMin ?? ''}
                onChange={e => onChange({ ...filters, transitDaysMin: e.target.value ? Number(e.target.value) : undefined })}
                className="w-16 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-gray-500 text-xs">to</span>
              <input
                type="number"
                min={0}
                placeholder={`${transitRange.max}`}
                value={filters.transitDaysMax ?? ''}
                onChange={e => onChange({ ...filters, transitDaysMax: e.target.value ? Number(e.target.value) : undefined })}
                className="w-16 px-2 py-1 bg-gray-700/50 border border-gray-600/50 rounded text-xs text-white placeholder-gray-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <span className="text-gray-500 text-xs">days</span>
            </div>
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 transition-colors"
            >
              <X className="w-3 h-3" /> Clear all filters
            </button>
          )}
        </div>
      )}
    </div>
  );
}
