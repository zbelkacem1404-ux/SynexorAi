import React, { useState, useEffect } from 'react';
import { Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../utils/api';
import { Project, Supplier, TransportRoute, SupplierFilters } from '../types';

interface Props {
  filters: SupplierFilters;
  onChange: (filters: SupplierFilters) => void;
  suppliers?: Supplier[];
  routes?: TransportRoute[];
}

const INCOTERMS = ['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'];
const MODES = ['road', 'rail', 'sea', 'air', 'multimodal'];
const SHIPMENT_TYPES = [
  { value: 'ftl', label: 'FTL', color: '#3b82f6' },
  { value: 'ltl', label: 'LTL', color: '#8b5cf6' },
  { value: 'milkrun', label: 'Milkrun', color: '#f59e0b' },
];

export default function FilterPanel({ filters, onChange, suppliers = [], routes = [] }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    api.get('/meta/projects').then(r => setProjects(r.data));
  }, []);

  const toggle = (arr: string[] | undefined, val: string): string[] => {
    const current = arr || [];
    return current.includes(val) ? current.filter(v => v !== val) : [...current, val];
  };

  const toggleNum = (arr: number[] | undefined, val: number): number[] => {
    const current = arr || [];
    return current.includes(val) ? current.filter(v => v !== val) : [...current, val];
  };

  const carriers = [...new Set(routes.filter(r => r.carrier_name).map(r => r.carrier_name!))].sort();

  const activeCount = [
    filters.mode?.length || 0,
    filters.carrier?.length || 0,
    filters.supplier?.length || 0,
    filters.incoterm?.length || 0,
    filters.project?.length || 0,
    filters.shipmentType?.length || 0,
  ].reduce((a, b) => a + b, 0);

  if (collapsed) {
    return (
      <div className="absolute left-0 top-0 z-10 m-3">
        <button onClick={() => setCollapsed(false)}
          className="bg-dark text-white p-2 rounded-lg shadow-lg hover:bg-gray-700 flex items-center gap-1 border border-gray-600">
          <Filter className="w-4 h-4" />
          <ChevronRight className="w-4 h-4" />
          {activeCount > 0 && <span className="bg-brand-vibrant-pink text-white text-xs rounded-full px-1.5">{activeCount}</span>}
        </button>
      </div>
    );
  }

  return (
    <div className="absolute left-0 top-0 z-10 m-3 bg-dark/95 backdrop-blur text-white rounded-xl shadow-2xl w-72 max-h-[calc(100vh-8rem)] overflow-y-auto border border-gray-600">
      <div className="flex items-center justify-between p-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-vibrant-pink" />
          <span className="font-semibold text-sm">Filters</span>
          {activeCount > 0 && <span className="bg-brand-vibrant-pink text-white text-xs rounded-full px-1.5 py-0.5">{activeCount}</span>}
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <button onClick={() => onChange({ search: filters.search })}
              className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-700">Clear all</button>
          )}
          <button onClick={() => setCollapsed(true)} className="p-1 hover:bg-gray-700 rounded">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-4">
        {/* Transport Mode */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Mode</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {MODES.map(m => (
              <button key={m} onClick={() => onChange({ ...filters, mode: toggle(filters.mode, m) })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors capitalize ${
                  filters.mode?.includes(m) ? 'bg-brand-vibrant-pink text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>{m}</button>
            ))}
          </div>
        </div>

        {/* Transport Type (FTL/LTL/Milkrun) */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Transport Type</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {SHIPMENT_TYPES.map(st => (
              <button key={st.value} onClick={() => onChange({ ...filters, shipmentType: toggle(filters.shipmentType, st.value) })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  filters.shipmentType?.includes(st.value) ? 'text-white ring-1 ring-white/30' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
                style={{ backgroundColor: filters.shipmentType?.includes(st.value) ? st.color : undefined }}>
                <span className="w-2 h-2 rounded-full" style={{ background: st.color }} />
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Carrier */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Carrier</label>
          <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
            {carriers.length === 0 ? (
              <div className="text-xs text-gray-400 px-2 py-1">No carriers found</div>
            ) : carriers.map(c => (
              <label key={c} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 rounded px-2 py-1">
                <input type="checkbox" checked={filters.carrier?.includes(c) || false}
                  onChange={() => onChange({ ...filters, carrier: toggle(filters.carrier, c) })}
                  className="rounded bg-gray-800 border-gray-600 text-brand-vibrant-pink focus:ring-brand-vibrant-pink" />
                <span className="text-sm text-gray-300">{c}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Supplier */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Supplier</label>
          <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
            {suppliers.map(s => (
              <label key={s.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 rounded px-2 py-1">
                <input type="checkbox" checked={filters.supplier?.includes(s.id) || false}
                  onChange={() => onChange({ ...filters, supplier: toggleNum(filters.supplier, s.id) })}
                  className="rounded bg-gray-800 border-gray-600 text-brand-vibrant-pink focus:ring-brand-vibrant-pink" />
                <span className="text-sm text-gray-300 truncate">{s.company_name}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Incoterm */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Incoterm</label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {INCOTERMS.map(i => (
              <button key={i} onClick={() => onChange({ ...filters, incoterm: toggle(filters.incoterm, i) })}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  filters.incoterm?.includes(i) ? 'bg-brand-vibrant-pink text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}>{i}</button>
            ))}
          </div>
        </div>

        {/* Project */}
        <div>
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">Project</label>
          <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto">
            {projects.map(p => (
              <label key={p.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-700 rounded px-2 py-1">
                <input type="checkbox" checked={filters.project?.includes(p.id) || false}
                  onChange={() => onChange({ ...filters, project: toggleNum(filters.project, p.id) })}
                  className="rounded bg-gray-800 border-gray-600 text-brand-vibrant-pink focus:ring-brand-vibrant-pink" />
                <span className="text-sm text-gray-300">{p.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
