import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { Supplier, TransportRoute, SupplierFilters } from '../types';
import SupplierMap from '../components/SupplierMap';
import FilterPanel from '../components/FilterPanel';

export default function DashboardPage() {
  const navigate = useNavigate();
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [allRoutes, setAllRoutes] = useState<TransportRoute[]>([]);
  const [filters, setFilters] = useState<SupplierFilters>({});
  const [loading, setLoading] = useState(true);
  const [hq, setHq] = useState<{ lat: number; lng: number; name: string; city: string; country: string } | null>(null);

  const handleSupplierClick = useCallback((s: Supplier) => {
    navigate(`/suppliers/${s.id}`);
  }, [navigate]);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [suppRes, routeRes, settingsRes] = await Promise.all([
          api.get('/suppliers', { params: { limit: '500' } }),
          api.get('/routes'),
          api.get('/meta/settings')
        ]);
        setAllSuppliers(suppRes.data.suppliers);
        setAllRoutes(routeRes.data);

        const s = settingsRes.data;
        if (s.hq_latitude && s.hq_longitude) {
          setHq({
            lat: parseFloat(s.hq_latitude),
            lng: parseFloat(s.hq_longitude),
            name: s.company_name || 'HQ',
            city: s.hq_city || '',
            country: s.hq_country || ''
          });
        }
      } catch (err) {
        console.error('Failed to load data', err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  // Client-side filtering for routes
  const filteredRoutes = useMemo(() => {
    let r = allRoutes;
    if (filters.mode?.length) r = r.filter(rt => filters.mode!.includes(rt.transport_mode));
    if (filters.shipmentType?.length) r = r.filter(rt => filters.shipmentType!.includes(rt.shipment_type || 'ftl'));
    if (filters.carrier?.length) r = r.filter(rt => rt.carrier_name && filters.carrier!.includes(rt.carrier_name));
    if (filters.supplier?.length) r = r.filter(rt => rt.suppliers?.some(s => filters.supplier!.includes(s.id)));
    if (filters.project?.length) r = r.filter(rt => {
      const routeSupIds = rt.suppliers?.map(s => s.id) || [];
      return allSuppliers.some(sup => routeSupIds.includes(sup.id) && sup.projects?.some(p => filters.project!.includes(p.id)));
    });
    return r;
  }, [allRoutes, allSuppliers, filters]);

  // Client-side filtering for suppliers
  const filteredSuppliers = useMemo(() => {
    let s = allSuppliers;
    if (filters.incoterm?.length) s = s.filter(sup => sup.default_incoterm && filters.incoterm!.includes(sup.default_incoterm));
    if (filters.project?.length) s = s.filter(sup => sup.projects?.some(p => filters.project!.includes(p.id)));
    if (filters.supplier?.length) s = s.filter(sup => filters.supplier!.includes(sup.id));
    if (filters.mode?.length || filters.shipmentType?.length || filters.carrier?.length) {
      const supplierIdsInRoutes = new Set(filteredRoutes.flatMap(rt => rt.suppliers?.map(s => s.id) || []));
      s = s.filter(sup => supplierIdsInRoutes.has(sup.id));
    }
    return s;
  }, [allSuppliers, filteredRoutes, filters]);

  return (
    <div className="relative flex-1 overflow-hidden">
      {loading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/50">
          <div className="bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg">Loading map data...</div>
        </div>
      )}
      <FilterPanel filters={filters} onChange={setFilters} suppliers={allSuppliers} routes={allRoutes} />
      <SupplierMap suppliers={filteredSuppliers} routes={filteredRoutes} hq={hq} onSupplierClick={handleSupplierClick} />

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-10 bg-gray-800/95 backdrop-blur text-white rounded-lg shadow-lg p-3">
        <div className="text-xs font-semibold text-gray-400 uppercase mb-2">Incoterm Colors</div>
        <div className="space-y-1">
          {[
            { code: 'EXW', color: '#22c55e' },
            { code: 'FOB', color: '#3b82f6' },
            { code: 'CIF', color: '#f97316' },
            { code: 'DDP', color: '#ef4444' },
            { code: 'FCA', color: '#a855f7' },
            { code: 'Other', color: '#6b7280' },
          ].map(({ code, color }) => (
            <div key={code} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-full border border-white/30" style={{ background: color }} />
              <span>{code}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-700 mt-2 pt-2 space-y-1">
          <div className="text-[10px] text-gray-500 uppercase font-medium mb-1">Network</div>
          <div className="flex items-center gap-2 text-xs">
            <div className="w-4 h-4 bg-blue-600 rounded border-2 border-white text-[6px] font-black text-white flex items-center justify-center">RT</div>
            <span>RT HQ</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#3b82f6" strokeWidth="2" /></svg>
            <span>FTL (Direct)</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg width="24" height="4"><line x1="0" y1="2" x2="24" y2="2" stroke="#8b5cf6" strokeWidth="2" strokeDasharray="4,3" /></svg>
            <span>LTL (Shared)</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <svg width="24" height="8" viewBox="0 0 24 8"><polyline points="0,4 8,1 16,7 24,4" fill="none" stroke="#f59e0b" strokeWidth="2" /></svg>
            <span>Milkrun</span>
          </div>
        </div>
      </div>
    </div>
  );
}
