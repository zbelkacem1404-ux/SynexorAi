import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../utils/api';
import { TransportRoute, Supplier, Waypoint, RouteFilters, ShipmentType, SHIPMENT_TYPE_CONFIG } from '../types';
import { useAuth } from '../contexts/AuthContext';
import SupplierMap from '../components/SupplierMap';
import RouteFilterPanel from '../components/RouteFilterPanel';
import { Plus, Edit, Trash2, X, MapPin, Anchor, ArrowRight, Truck } from 'lucide-react';
import L from 'leaflet';

// Build a display route description from route data: OriginID_DestinationID/TransportType
function getRouteDescription(r: TransportRoute): string {
  // If route has routePlans with descriptions, use the first one
  if (r.routePlans?.length) return r.routePlans[0].route_description;
  if (r.route_description) return r.route_description;
  // Fallback: derive from name
  return r.name;
}

function applyRouteFilters(routes: TransportRoute[], filters: RouteFilters): TransportRoute[] {
  return routes.filter(r => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchName = r.name.toLowerCase().includes(q);
      const matchCarrier = r.carrier_name?.toLowerCase().includes(q);
      const matchSupplier = r.suppliers?.some(s => s.company_name.toLowerCase().includes(q));
      const matchRouteDesc = getRouteDescription(r).toLowerCase().includes(q);
      if (!matchName && !matchCarrier && !matchSupplier && !matchRouteDesc) return false;
    }
    // Route description filter (separate dedicated filter)
    if (filters.routeDescription) {
      const q = filters.routeDescription.toLowerCase();
      const desc = getRouteDescription(r).toLowerCase();
      const nameMatch = r.name.toLowerCase().includes(q);
      if (!desc.includes(q) && !nameMatch) return false;
    }
    if (filters.transportMode?.length && !filters.transportMode.includes(r.transport_mode)) return false;
    if (filters.routeType?.length && !filters.routeType.includes(r.route_type)) return false;
    if (filters.carrier?.length && (!r.carrier_name || !filters.carrier.includes(r.carrier_name))) return false;
    if (filters.supplier?.length) {
      const routeSupplierIds = r.suppliers?.map(s => s.id) || [];
      if (!filters.supplier.some(id => routeSupplierIds.includes(id))) return false;
    }
    // Shipment type filter (FTL/LTL/MR matching route plan modes)
    if (filters.shipmentType?.length) {
      const st = (r.shipment_type || 'ftl').toLowerCase();
      const stMap: Record<string, string> = { ftl: 'FTL', ltl: 'LTL', milkrun: 'MR' };
      const routeMode = stMap[st] || 'FTL';
      if (!filters.shipmentType.includes(routeMode)) return false;
    }
    if (filters.transitDaysMin != null && (r.transit_days == null || r.transit_days < filters.transitDaysMin)) return false;
    if (filters.transitDaysMax != null && (r.transit_days == null || r.transit_days > filters.transitDaysMax)) return false;
    return true;
  });
}

export default function RoutesPage() {
  const { isAdmin } = useAuth();
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRoute, setEditRoute] = useState<TransportRoute | null>(null);
  const [routeFilters, setRouteFilters] = useState<RouteFilters>({});
  const [hq, setHq] = useState<{ lat: number; lng: number; name: string; city: string; country: string } | null>(null);

  const filteredRoutes = useMemo(() => applyRouteFilters(routes, routeFilters), [routes, routeFilters]);

  // When filters are active, only show suppliers that belong to filtered routes on the map
  const hasActiveFilters = useMemo(() => {
    const f = routeFilters;
    return !!(f.search || f.routeDescription || f.transportMode?.length || f.routeType?.length || f.carrier?.length || f.supplier?.length || f.shipmentType?.length || f.transitDaysMin != null || f.transitDaysMax != null);
  }, [routeFilters]);

  const mapSuppliers = useMemo(() => {
    if (!hasActiveFilters) return suppliers;
    const supplierIds = new Set<number>();
    filteredRoutes.forEach(r => {
      r.suppliers?.forEach(s => supplierIds.add(s.id));
    });
    return suppliers.filter(s => supplierIds.has(s.id));
  }, [hasActiveFilters, suppliers, filteredRoutes]);

  const fetchData = async () => {
    setLoading(true);
    const [rRes, sRes, settingsRes] = await Promise.all([
      api.get('/routes'),
      api.get('/suppliers', { params: { limit: 500 } }),
      api.get('/meta/settings')
    ]);
    setRoutes(rRes.data);
    setSuppliers(sRes.data.suppliers);
    const s = settingsRes.data;
    if (s.hq_latitude && s.hq_longitude) {
      setHq({ lat: parseFloat(s.hq_latitude), lng: parseFloat(s.hq_longitude), name: s.company_name || 'HQ', city: s.hq_city || '', country: s.hq_country || '' });
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this route?')) return;
    await api.delete(`/routes/${id}`);
    fetchData();
  };

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-900">
      {/* Route list sidebar */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-700 flex items-center justify-between">
          <h2 className="font-bold text-white text-sm">
            Transport Routes
            {!loading && filteredRoutes.length !== routes.length && (
              <span className="ml-1.5 text-xs font-normal text-gray-400">
                ({filteredRoutes.length}/{routes.length})
              </span>
            )}
          </h2>
          {isAdmin && (
            <button
              onClick={() => { setEditRoute(null); setShowForm(true); }}
              className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium"
            >
              <Plus className="w-3 h-3" /> New Route
            </button>
          )}
        </div>
        {!loading && routes.length > 0 && (
          <RouteFilterPanel routes={routes} filters={routeFilters} onChange={setRouteFilters} />
        )}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray-500 text-sm">Loading...</div>
          ) : filteredRoutes.length === 0 ? (
            <div className="p-4 text-gray-500 text-sm">
              {routes.length === 0 ? 'No routes yet' : 'No routes match filters'}
            </div>
          ) : filteredRoutes.map(r => {
            const st = (r.shipment_type || 'ftl') as ShipmentType;
            const stConfig = SHIPMENT_TYPE_CONFIG[st];
            return (
              <div key={r.id} className="p-3 border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: stConfig.color }} />
                      <span className="text-white text-sm font-medium font-mono">{getRouteDescription(r)}</span>
                    </div>
                    {r.tour_description && (
                      <div className="text-[10px] text-amber-400/80 ml-4 mt-0.5 italic">{r.tour_description}</div>
                    )}
                    <div className="text-xs text-gray-400 mt-1 ml-4 flex items-center gap-1.5">
                      <span>{r.route_type}</span>
                      <span>·</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: stConfig.color + '30', color: stConfig.color }}>
                        {stConfig.label}
                      </span>
                      <span>·</span>
                      <span>{r.transit_days ? `${r.transit_days}d` : 'N/A'}</span>
                    </div>
                    <div className="text-xs text-blue-400 ml-4 mt-0.5 flex items-center gap-1">
                      <Anchor className="w-3 h-3" />
                      RT {r.route_type === 'inbound' ? '(END)' : '(START)'}
                    </div>
                    {r.carrier_name && <div className="text-xs text-gray-500 ml-4">{r.carrier_name}</div>}
                    {r.suppliers && r.suppliers.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5 ml-4">
                        {r.suppliers.map(s => (
                          <span key={s.id} className="px-1.5 py-0.5 bg-gray-700 rounded text-[10px] text-gray-400">{s.company_name}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => { setEditRoute(r); setShowForm(true); }} className="p-1 hover:bg-gray-600 rounded text-gray-400 hover:text-white">
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r.id)} className="p-1 hover:bg-red-900/50 rounded text-gray-400 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <SupplierMap suppliers={mapSuppliers} routes={filteredRoutes} hq={hq} activeSupplierFilter={routeFilters.supplier} />
      </div>

      {showForm && (
        <RouteForm
          route={editRoute}
          suppliers={suppliers}
          hq={hq}
          onSave={() => { setShowForm(false); fetchData(); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}

// ------------- Route Form — Route Plan Report Structure -------------
const MODE_OPTIONS = [
  { value: 'FTL', label: 'FTL', color: '#3b82f6', desc: 'Full Truck Load — direct lane', prefix: 'F' },
  { value: 'LTL', label: 'LTL', color: '#8b5cf6', desc: 'Less Than Truck Load — shared capacity', prefix: 'L' },
  { value: 'MR', label: 'MR (Milkrun)', color: '#f59e0b', desc: 'Milkrun — chained pickup route', prefix: 'M' },
  { value: 'HUB', label: 'HUB', color: '#10b981', desc: 'Hub consolidation', prefix: 'H' },
];

const SHIPMENT_TO_TRANSPORT: Record<string, ShipmentType> = { FTL: 'ftl', LTL: 'ltl', MR: 'milkrun', HUB: 'ftl' };
const RT_HQ = { id: 'RT-HQ', name: 'RT Automotive d.o.o.', zip: '10000', city: 'Zagreb', country: 'HR Croatia' };

function RouteForm({ route, suppliers, hq, onSave, onClose }: {
  route: TransportRoute | null;
  suppliers: Supplier[];
  hq: { lat: number; lng: number; name: string; city: string; country: string } | null;
  onSave: () => void;
  onClose: () => void;
}) {
  // Core Route Plan fields
  const [direction, setDirection] = useState<'inbound' | 'outbound'>(route?.route_type === 'outbound' ? 'outbound' : 'inbound');
  const [transportMode, setTransportMode] = useState('FTL');
  const [tourDescription, setTourDescription] = useState('');
  const [carrierName, setCarrierName] = useState(route?.carrier_name || '');
  const [transitDays, setTransitDays] = useState(route?.transit_days?.toString() || '');
  const [supplierIds, setSupplierIds] = useState<number[]>(route?.suppliers?.map(s => s.id) || []);

  // Origin/Destination overrides (auto-filled but editable)
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

  // Schedule
  const [pickupDate, setPickupDate] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [equipment, setEquipment] = useState('Standard Trailer');
  const [customs, setCustoms] = useState('');
  const [saving, setSaving] = useState(false);

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const linesRef = useRef<L.LayerGroup | null>(null);

  // Populate from existing route if editing
  useEffect(() => {
    if (route) {
      const st = (route.shipment_type || 'ftl').toUpperCase();
      const modeMap: Record<string, string> = { FTL: 'FTL', LTL: 'LTL', MILKRUN: 'MR' };
      setTransportMode(modeMap[st] || 'FTL');
      setTourDescription(route.name || '');
    }
  }, []);

  // When switching to FTL, keep only first selected supplier
  useEffect(() => {
    if (transportMode === 'FTL' && supplierIds.length > 1) {
      setSupplierIds([supplierIds[0]]);
    }
  }, [transportMode]);

  // Auto-fill Origin & Destination when supplier or direction changes
  useEffect(() => {
    if (supplierIds.length === 0) {
      setOriginId(''); setOriginName(''); setOriginZip(''); setOriginCity(''); setOriginCountry('');
      setDestId(''); setDestName(''); setDestZip(''); setDestCity(''); setDestCountry('');
      return;
    }
    const firstSup = suppliers.find(s => s.id === supplierIds[0]);
    if (!firstSup) return;

    if (direction === 'inbound') {
      // Origin = Supplier, Destination = RT HQ
      setOriginId(firstSup.supplier_id || '');
      setOriginName(firstSup.company_name || '');
      setOriginZip('');
      setOriginCity(firstSup.city || '');
      setOriginCountry(firstSup.country || '');
      setDestId(RT_HQ.id);
      setDestName(RT_HQ.name);
      setDestZip(RT_HQ.zip);
      setDestCity(RT_HQ.city);
      setDestCountry(RT_HQ.country);
    } else {
      // Origin = RT HQ, Destination = Supplier
      setOriginId(RT_HQ.id);
      setOriginName(RT_HQ.name);
      setOriginZip(RT_HQ.zip);
      setOriginCity(RT_HQ.city);
      setOriginCountry(RT_HQ.country);
      setDestId(firstSup.supplier_id || '');
      setDestName(firstSup.company_name || '');
      setDestZip('');
      setDestCity(firstSup.city || '');
      setDestCountry(firstSup.country || '');
    }
  }, [supplierIds, direction, suppliers]);

  // Auto-generate route description: OriginID_DestinationID/TransportType
  // E.g. SUP-0019_RT-HQ/M01 (inbound MR), RT-HQ_SUP-0019/F01 (outbound FTL)
  const routeDescPreview = useMemo(() => {
    if (supplierIds.length === 0) return 'Select supplier(s) to preview';
    const modeOpt = MODE_OPTIONS.find(m => m.value === transportMode);
    const prefix = modeOpt?.prefix || 'F';
    const firstSup = suppliers.find(s => s.id === supplierIds[0]);
    const supId = firstSup?.supplier_id || 'SUP-????';
    // Format: OriginID_DestinationID/TransportType
    if (direction === 'inbound') {
      // Origin = Supplier, Destination = RT-HQ
      return `${supId}_RT-HQ/${prefix}xx`;
    } else {
      // Origin = RT-HQ, Destination = Supplier
      return `RT-HQ_${supId}/${prefix}xx`;
    }
  }, [supplierIds, direction, transportMode, suppliers]);

  // Auto-generate MR Tour description: "1st OriginID_DestinationID/Mxx"
  // Only for Milkrun — shows the first origin in the chain
  const autoTourDescription = useMemo(() => {
    if (transportMode !== 'MR' || supplierIds.length === 0) return '';
    const firstSup = suppliers.find(s => s.id === supplierIds[0]);
    const supId = firstSup?.supplier_id || 'SUP-????';
    if (direction === 'inbound') {
      return `1st ${supId}_RT-HQ/Mxx`;
    } else {
      return `1st RT-HQ_${supId}/Mxx`;
    }
  }, [transportMode, supplierIds, direction, suppliers]);

  const shipmentType = (SHIPMENT_TO_TRANSPORT[transportMode] || 'ftl') as ShipmentType;

  // Build waypoints for map + submission
  const fullWaypoints = useMemo(() => {
    const selectedSuppliers = supplierIds
      .map(id => suppliers.find(s => s.id === id))
      .filter(s => s && s.latitude != null && s.longitude != null) as Supplier[];
    if (!hq || selectedSuppliers.length === 0) return [];

    const rtWp: Waypoint = { lat: hq.lat, lng: hq.lng, label: `${hq.name} (HQ - Anchor)` };

    if (transportMode === 'MR') {
      const sorted = [...selectedSuppliers].sort((a, b) => {
        const distA = Math.sqrt(Math.pow(a.latitude! - hq.lat, 2) + Math.pow(a.longitude! - hq.lng, 2));
        const distB = Math.sqrt(Math.pow(b.latitude! - hq.lat, 2) + Math.pow(b.longitude! - hq.lng, 2));
        return direction === 'inbound' ? distB - distA : distA - distB;
      });
      const supplierWps = sorted.map(s => ({ lat: s.latitude!, lng: s.longitude!, label: `${s.company_name} (${s.city})` }));
      return direction === 'inbound' ? [...supplierWps, rtWp] : [rtWp, ...supplierWps];
    } else {
      const wps: Waypoint[] = selectedSuppliers.map(s => ({ lat: s.latitude!, lng: s.longitude!, label: `${s.company_name} (${s.city})` }));
      return direction === 'inbound' ? [...wps, rtWp] : [rtWp, ...wps];
    }
  }, [supplierIds, suppliers, direction, hq, transportMode]);

  // Init mini map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;
    const map = L.map(mapContainerRef.current, { center: hq ? [hq.lat, hq.lng] : [30, 10], zoom: hq ? 4 : 2 });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OSM' }).addTo(map);
    mapInstanceRef.current = map;
    markersRef.current = L.layerGroup().addTo(map);
    linesRef.current = L.layerGroup().addTo(map);

    if (hq) {
      const hqIcon = L.divIcon({
        className: 'hq-marker',
        html: `<div style="width:28px;height:28px;background:#2563eb;border:3px solid #fff;border-radius:6px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:9px;box-shadow:0 2px 8px rgba(0,0,0,0.4);">RT</div>`,
        iconSize: [28, 28], iconAnchor: [14, 14]
      });
      L.marker([hq.lat, hq.lng], { icon: hqIcon }).addTo(map).bindTooltip('RT HQ', { permanent: true, direction: 'top', offset: [0, -16] });
    }
    suppliers.forEach(s => {
      if (s.latitude == null || s.longitude == null) return;
      L.circleMarker([s.latitude, s.longitude], { radius: 5, fillColor: '#6b7280', color: '#374151', weight: 1, fillOpacity: 0.4 }).addTo(map).bindTooltip(s.company_name, { direction: 'top' });
    });

    return () => { map.remove(); mapInstanceRef.current = null; };
  }, []);

  // Update route lines on map preview
  useEffect(() => {
    if (!markersRef.current || !linesRef.current || !mapInstanceRef.current) return;
    markersRef.current.clearLayers();
    linesRef.current.clearLayers();

    const modeColor = MODE_OPTIONS.find(m => m.value === transportMode)?.color || '#3b82f6';
    const stConfig = SHIPMENT_TYPE_CONFIG[shipmentType];
    const selectedSuppliers = supplierIds
      .map(id => suppliers.find(s => s.id === id))
      .filter(s => s && s.latitude != null && s.longitude != null) as Supplier[];
    if (!hq || selectedSuppliers.length === 0) return;

    selectedSuppliers.forEach(s => {
      const marker = L.circleMarker([s.latitude!, s.longitude!], { radius: 8, fillColor: modeColor, color: '#fff', weight: 2, fillOpacity: 1 });
      marker.bindTooltip(s.company_name, { permanent: selectedSuppliers.length <= 6, direction: 'top', offset: [0, -10] });
      markersRef.current!.addLayer(marker);
    });

    if (transportMode === 'MR') {
      const sorted = [...selectedSuppliers].sort((a, b) => {
        const distA = Math.sqrt(Math.pow(a.latitude! - hq.lat, 2) + Math.pow(a.longitude! - hq.lng, 2));
        const distB = Math.sqrt(Math.pow(b.latitude! - hq.lat, 2) + Math.pow(b.longitude! - hq.lng, 2));
        return direction === 'inbound' ? distB - distA : distA - distB;
      });
      const coords: L.LatLngExpression[] = direction === 'inbound'
        ? [...sorted.map(s => [s.latitude!, s.longitude!] as L.LatLngTuple), [hq.lat, hq.lng]]
        : [[hq.lat, hq.lng], ...sorted.map(s => [s.latitude!, s.longitude!] as L.LatLngTuple)];
      linesRef.current!.addLayer(L.polyline(coords, { color: modeColor, weight: 3, opacity: 0.9 }));
      sorted.forEach((s, idx) => {
        const numMarker = L.divIcon({
          className: 'seq-marker',
          html: `<div style="width:18px;height:18px;background:${modeColor};border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;border:2px solid white;">${idx + 1}</div>`,
          iconSize: [18, 18], iconAnchor: [9, 9]
        });
        L.marker([s.latitude!, s.longitude!], { icon: numMarker }).addTo(markersRef.current!);
      });
    } else {
      selectedSuppliers.forEach(s => {
        const coords: L.LatLngExpression[] = [[s.latitude!, s.longitude!], [hq.lat, hq.lng]];
        linesRef.current!.addLayer(L.polyline(coords, { color: modeColor, weight: 3, opacity: 0.8, dashArray: stConfig.dash || undefined }));
      });
    }

    const allPoints: L.LatLngExpression[] = [[hq.lat, hq.lng], ...selectedSuppliers.map(s => [s.latitude!, s.longitude!] as L.LatLngExpression)];
    if (allPoints.length >= 2) mapInstanceRef.current.fitBounds(L.latLngBounds(allPoints as L.LatLngTuple[]).pad(0.15));
  }, [supplierIds, suppliers, hq, transportMode, direction]);

  const toggleSupplier = (id: number) => {
    if (transportMode === 'FTL') {
      setSupplierIds([id]);
    } else {
      setSupplierIds(prev => prev.includes(id) ? prev.filter(sid => sid !== id) : [...prev, id]);
    }
  };

  const inputCls = 'w-full px-2 py-1.5 bg-gray-700 border border-gray-600 rounded text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none';
  const labelCls = 'text-[10px] text-gray-500 mb-0.5 block';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supplierIds.length === 0) { alert('Select at least 1 supplier.'); return; }
    if (fullWaypoints.length < 2) { alert('Need at least 2 waypoints to create a route.'); return; }
    setSaving(true);
    try {
      // For MR, use user-provided tour description or auto-generated one
      const finalTourDesc = transportMode === 'MR'
        ? (tourDescription || autoTourDescription || null)
        : null;
      const body = {
        // Route name uses the route description pattern
        name: routeDescPreview,
        route_type: direction,
        transport_mode: transportMode === 'HUB' ? 'multimodal' : 'road',
        shipment_type: shipmentType,
        carrier_name: carrierName || null,
        transit_days: transitDays ? parseInt(transitDays) : null,
        waypoints: fullWaypoints,
        supplier_ids: supplierIds,
        // Route Plan specific fields
        route_plan_mode: transportMode,
        tour_description: finalTourDesc,
        origin_id: originId || null, origin_name: originName || null,
        origin_zip: originZip || null, origin_city: originCity || null, origin_country: originCountry || null,
        destination_id: destId || null, destination_name: destName || null,
        destination_zip: destZip || null, destination_city: destCity || null, destination_country: destCountry || null,
        pickup_date: pickupDate || null, pickup_time: pickupTime || null,
        delivery_date: deliveryDate || null, arrival_time: arrivalTime || null,
        equipment: equipment || null, customs: customs || null,
      };
      if (route) {
        await api.put(`/routes/${route.id}`, body);
      } else {
        await api.post('/routes', body);
      }
      onSave();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to save');
    }
    setSaving(false);
  };

  const modeOpt = MODE_OPTIONS.find(m => m.value === transportMode)!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold text-white">{route ? 'Edit Route' : 'Create Route'}</h2>
            <span className="text-xs text-gray-500">Route Plan aligned</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-700 rounded"><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">

          {/* === SECTION 1: Transport Mode + Direction === */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase font-medium mb-2 block">Transport Mode *</label>
              <div className="grid grid-cols-2 gap-2">
                {MODE_OPTIONS.map(opt => (
                  <button key={opt.value} type="button" onClick={() => setTransportMode(opt.value)}
                    className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                      transportMode === opt.value ? 'bg-opacity-20' : 'border-gray-600 hover:border-gray-500'
                    }`}
                    style={{
                      borderColor: transportMode === opt.value ? opt.color : undefined,
                      backgroundColor: transportMode === opt.value ? opt.color + '15' : undefined
                    }}>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ background: opt.color }} />
                      <span className="text-sm font-bold text-white">{opt.label}</span>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 uppercase font-medium mb-2 block">Direction *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setDirection('inbound')}
                    className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                      direction === 'inbound' ? 'border-blue-500 bg-blue-900/30' : 'border-gray-600 hover:border-gray-500'
                    }`}>
                    <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                      Supplier <ArrowRight className="w-3.5 h-3.5" /> <span className="text-blue-400">RT</span>
                    </div>
                    <div className="text-[10px] text-gray-400">Inbound</div>
                  </button>
                  <button type="button" onClick={() => setDirection('outbound')}
                    className={`p-2.5 rounded-lg border-2 text-center transition-all ${
                      direction === 'outbound' ? 'border-orange-500 bg-orange-900/30' : 'border-gray-600 hover:border-gray-500'
                    }`}>
                    <div className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                      <span className="text-orange-400">RT</span> <ArrowRight className="w-3.5 h-3.5" /> Supplier
                    </div>
                    <div className="text-[10px] text-gray-400">Outbound</div>
                  </button>
                </div>
              </div>
              {/* Route description preview */}
              <div className="px-3 py-2 bg-gray-900/70 rounded-lg border border-gray-700">
                <div className="text-[10px] text-gray-500 mb-1">Route description (auto-generated)</div>
                <div className="text-sm font-mono font-bold" style={{ color: modeOpt.color }}>
                  {routeDescPreview}
                </div>
                {supplierIds.length > 1 && <div className="text-[10px] text-gray-500 mt-0.5">{supplierIds.length} entries will be created</div>}
              </div>
            </div>
          </div>

          {/* === SECTION 2: Supplier Selection === */}
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium mb-1 block">
              {transportMode === 'FTL' ? 'Select Supplier (1 for FTL)' : transportMode === 'MR' ? 'Select Suppliers (Milkrun chain)' : 'Select Suppliers'}
            </label>
            <div className="max-h-32 overflow-y-auto space-y-0.5 border border-gray-700 rounded-lg p-2">
              {suppliers.map(s => {
                const hasCoords = s.latitude != null && s.longitude != null;
                const isSelected = supplierIds.includes(s.id);
                return (
                  <label key={s.id} className={`flex items-center gap-2 text-sm rounded px-2 py-1 cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-900/30 text-white' : 'text-gray-300 hover:bg-gray-700/50'
                  } ${!hasCoords ? 'opacity-40 cursor-not-allowed' : ''}`}>
                    <input
                      type={transportMode === 'FTL' ? 'radio' : 'checkbox'}
                      name="supplier-select"
                      checked={isSelected}
                      disabled={!hasCoords}
                      onChange={() => toggleSupplier(s.id)}
                      className="rounded bg-gray-700 border-gray-600 text-blue-600"
                    />
                    <span className="font-medium">{s.company_name}</span>
                    <span className="text-gray-500 text-xs">({s.city}, {s.country})</span>
                    <span className="text-gray-600 text-[10px] font-mono ml-auto">{s.supplier_id}</span>
                    {!hasCoords && <span className="text-red-500 text-[10px]">No coords</span>}
                    {isSelected && hasCoords && <MapPin className="w-3 h-3 text-green-400" />}
                  </label>
                );
              })}
            </div>
          </div>

          {/* === SECTION 3: Tour Description (MR only) === */}
          {transportMode === 'MR' && (
            <div className="border border-amber-700/40 rounded-lg p-3 bg-amber-900/10">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-400 uppercase font-medium">Additional Tour description (MR only)</span>
              </div>
              <div className="text-[10px] text-gray-500 mb-1.5">Auto-generated: <span className="text-amber-400 font-mono">{autoTourDescription || 'Select suppliers to preview'}</span></div>
              <input value={tourDescription} onChange={e => setTourDescription(e.target.value)}
                placeholder={autoTourDescription || 'e.g. 1st SUP-0019_RT-HQ/M01'}
                className={inputCls} />
              <div className="text-[10px] text-gray-600 mt-1">Format: 1st OriginID_DestinationID/Mxx — override above if needed</div>
            </div>
          )}

          {/* === SECTION 4: Origin & Destination (auto-filled) === */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-xs text-gray-400 uppercase font-medium">Origin</span>
                {direction === 'outbound' && <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 rounded text-white">RT HQ</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Origin ID</label><input value={originId} onChange={e => setOriginId(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Origin name</label><input value={originName} onChange={e => setOriginName(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Origin ZIP code</label><input value={originZip} onChange={e => setOriginZip(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Origin city</label><input value={originCity} onChange={e => setOriginCity(e.target.value)} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Origin country</label><input value={originCountry} onChange={e => setOriginCountry(e.target.value)} className={inputCls} /></div>
            </div>
            <div className="border border-gray-700 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-xs text-gray-400 uppercase font-medium">Destination</span>
                {direction === 'inbound' && <span className="text-[10px] px-1.5 py-0.5 bg-blue-600 rounded text-white">RT HQ</span>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className={labelCls}>Destination ID</label><input value={destId} onChange={e => setDestId(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Destination name</label><input value={destName} onChange={e => setDestName(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Destination ZIP code</label><input value={destZip} onChange={e => setDestZip(e.target.value)} className={inputCls} /></div>
                <div><label className={labelCls}>Destination city</label><input value={destCity} onChange={e => setDestCity(e.target.value)} className={inputCls} /></div>
              </div>
              <div><label className={labelCls}>Destination country</label><input value={destCountry} onChange={e => setDestCountry(e.target.value)} className={inputCls} /></div>
            </div>
          </div>

          {/* === SECTION 5: Schedule + Logistics === */}
          <div className="border border-gray-700 rounded-lg p-3">
            <div className="text-xs text-gray-400 uppercase font-medium mb-2">Schedule & Logistics</div>
            <div className="grid grid-cols-7 gap-2">
              <div>
                <label className={labelCls}>Pickup date</label>
                <select value={pickupDate} onChange={e => setPickupDate(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="M0">Mon (M0)</option><option value="T0">Tue (T0)</option>
                  <option value="W0">Wed (W0)</option><option value="R0">Thu (R0)</option>
                  <option value="F0">Fri (F0)</option><option value="S0">Sat (S0)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Pickup time</label>
                <select value={pickupTime} onChange={e => setPickupTime(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="06:00 - 12:00">06:00–12:00</option>
                  <option value="08:00 - 15:00">08:00–15:00</option>
                  <option value="08:00 - 18:00">08:00–18:00</option>
                  <option value="12:00 - 17:00">12:00–17:00</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Delivery date</label>
                <select value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="M0">Mon (M0)</option><option value="T0">Tue (T0)</option>
                  <option value="W0">Wed (W0)</option><option value="R0">Thu (R0)</option>
                  <option value="F0">Fri (F0)</option><option value="M1">Mon+1w</option>
                  <option value="T1">Tue+1w</option><option value="W1">Wed+1w</option>
                  <option value="R1">Thu+1w</option><option value="F1">Fri+1w</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Arrival time</label>
                <select value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className={inputCls}>
                  <option value="">—</option>
                  <option value="06:00 - 12:00">06:00–12:00</option>
                  <option value="08:00 - 15:00">08:00–15:00</option>
                  <option value="08:00 - 18:00">08:00–18:00</option>
                  <option value="12:00 - 17:00">12:00–17:00</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Carrier</label>
                <input value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder="e.g. DB Schenker" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Equipment</label>
                <select value={equipment} onChange={e => setEquipment(e.target.value)} className={inputCls}>
                  <option value="Standard Trailer">Std Trailer</option>
                  <option value="40ft Container">40ft Container</option>
                  <option value="Air Freight ULD">Air ULD</option>
                  <option value="Wagon">Wagon</option>
                  <option value="Swap Body">Swap Body</option>
                  <option value="Mega Trailer">Mega Trailer</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Customs</label>
                <select value={customs} onChange={e => setCustoms(e.target.value)} className={inputCls}>
                  <option value="">No</option>
                  <option value="Yes">Yes</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className={labelCls}>Transit time [d]</label>
                <input type="number" min="0" step="0.5" value={transitDays} onChange={e => setTransitDays(e.target.value)} placeholder="e.g. 2" className={inputCls} />
              </div>
              <div />
            </div>
          </div>

          {/* === SECTION 6: Map Preview === */}
          <div>
            <label className="text-xs text-gray-400 uppercase font-medium mb-2 block">
              Route Preview
              {supplierIds.length > 0 && (
                <span className="normal-case text-gray-500 ml-1">
                  ({supplierIds.length} supplier{supplierIds.length > 1 ? 's' : ''} → RT)
                </span>
              )}
            </label>
            <div className="h-56 rounded-lg overflow-hidden border border-gray-600" ref={mapContainerRef} />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium">
              {saving ? 'Saving...' : (route ? 'Update Route' : 'Create Route')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
