import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { TransportRoute, Supplier } from '../types';
import { Save, Building2, MapPin, Globe, Phone, Mail, Plane, Ship, AlertCircle, CheckCircle, Truck, Anchor, Package } from 'lucide-react';
import L from 'leaflet';

interface CompanySettings {
  [key: string]: string;
}

const SETTING_FIELDS = [
  { key: 'company_name', label: 'Company Name', icon: Building2, placeholder: 'RT' },
  { key: 'full_name', label: 'Full Legal Name', icon: Building2, placeholder: 'RT Automotive d.o.o.' },
  { key: 'industry', label: 'Industry', icon: Globe, placeholder: 'Automotive Tier 1 Supplier' },
  { key: 'hq_country', label: 'HQ Country', icon: MapPin, placeholder: 'Croatia' },
  { key: 'hq_city', label: 'HQ City', icon: MapPin, placeholder: 'Zagreb' },
  { key: 'hq_address', label: 'HQ Address', icon: MapPin, placeholder: 'Industrijska cesta 42' },
  { key: 'hq_latitude', label: 'HQ Latitude', icon: MapPin, placeholder: '45.8150' },
  { key: 'hq_longitude', label: 'HQ Longitude', icon: MapPin, placeholder: '15.9819' },
  { key: 'phone', label: 'Phone', icon: Phone, placeholder: '+385 1 234 5678' },
  { key: 'email', label: 'Email', icon: Mail, placeholder: 'info@company.com' },
  { key: 'website', label: 'Website', icon: Globe, placeholder: 'www.company.com' },
  { key: 'currency', label: 'Currency', icon: Globe, placeholder: 'EUR' },
  { key: 'default_port', label: 'Default Port', icon: Ship, placeholder: 'Rijeka' },
  { key: 'default_airport', label: 'Default Airport', icon: Plane, placeholder: 'Zagreb Airport (ZAG)' },
];

// Mini map showing HQ location
function HQMiniMap({ lat, lng, name }: { lat: number; lng: number; name: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: [lat, lng], zoom: 6, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

    const icon = L.divIcon({
      className: 'hq-marker',
      html: `<div style="width:36px;height:36px;background:#2563eb;border:4px solid #fff;border-radius:8px;box-shadow:0 0 0 3px #2563eb,0 4px 12px rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:11px;font-family:sans-serif;">RT</div>`,
      iconSize: [36, 36], iconAnchor: [18, 18]
    });
    L.marker([lat, lng], { icon }).addTo(map).bindTooltip(`${name} HQ`, { permanent: true, direction: 'top', offset: [0, -22] });
    L.circleMarker([lat, lng], { radius: 25, fillColor: '#2563eb', color: '#2563eb', weight: 2, opacity: 0.3, fillOpacity: 0.1 }).addTo(map);

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [lat, lng, name]);

  return <div ref={containerRef} className="w-full h-full rounded-lg" />;
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [settings, setSettings] = useState<CompanySettings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [routes, setRoutes] = useState<TransportRoute[]>([]);
  const [topSuppliers, setTopSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [settingsRes, statsRes, routesRes, suppRes] = await Promise.all([
          api.get('/meta/settings'),
          api.get('/meta/stats'),
          api.get('/routes'),
          api.get('/suppliers', { params: { limit: 10, sortBy: 'created_at', sortDir: 'desc' } })
        ]);
        setSettings(settingsRes.data);
        setStats(statsRes.data);
        setRoutes(routesRes.data);
        setTopSuppliers(suppRes.data.suppliers);
      } catch (err) {
        console.error('Failed to load settings', err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setResult(null);
    try {
      const res = await api.put('/meta/settings', settings);
      setSettings(res.data);
      setResult({ success: true, message: 'Settings saved successfully' });
    } catch (err: any) {
      setResult({ success: false, message: err.response?.data?.error || 'Failed to save' });
    }
    setSaving(false);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center text-gray-400">Loading settings...</div>;

  const hasHQ = settings.hq_latitude && settings.hq_longitude;
  const modeIcons: Record<string, string> = { sea: '🚢', air: '✈️', rail: '🚂', road: '🚛', multimodal: '📦' };

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Company header card */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="flex flex-col sm:flex-row">
            {/* HQ Map */}
            {hasHQ && (
              <div className="w-full sm:w-80 h-48 sm:h-auto shrink-0">
                <HQMiniMap
                  lat={parseFloat(settings.hq_latitude)}
                  lng={parseFloat(settings.hq_longitude)}
                  name={settings.company_name || 'RT'}
                />
              </div>
            )}
            {/* Company info */}
            <div className="flex-1 p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                      <span className="text-sm font-black text-white">RT</span>
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-white">{settings.full_name || settings.company_name || 'RT Automotive'}</h1>
                      <p className="text-sm text-gray-400">{settings.industry || 'Automotive Supplier'}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    {settings.hq_address && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <MapPin className="w-3.5 h-3.5 text-gray-500" />
                        <span>{settings.hq_address}</span>
                      </div>
                    )}
                    {settings.hq_city && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Globe className="w-3.5 h-3.5 text-gray-500" />
                        <span>{settings.hq_city}, {settings.hq_country}</span>
                      </div>
                    )}
                    {settings.phone && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Phone className="w-3.5 h-3.5 text-gray-500" />
                        <span>{settings.phone}</span>
                      </div>
                    )}
                    {settings.email && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Mail className="w-3.5 h-3.5 text-gray-500" />
                        <span>{settings.email}</span>
                      </div>
                    )}
                    {settings.website && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Globe className="w-3.5 h-3.5 text-gray-500" />
                        <span>{settings.website}</span>
                      </div>
                    )}
                    {settings.default_port && (
                      <div className="flex items-center gap-2 text-gray-400">
                        <Anchor className="w-3.5 h-3.5 text-gray-500" />
                        <span>Port: {settings.default_port}</span>
                      </div>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
                  >
                    <Save className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {result && (
          <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${result.success ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            {result.success ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {result.message}
          </div>
        )}

        {/* Stats overview */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              { label: 'Total Suppliers', value: stats.totalSuppliers, color: 'text-blue-400' },
              { label: 'Active', value: stats.activeSuppliers, color: 'text-green-400' },
              { label: 'Countries', value: stats.countries, color: 'text-purple-400' },
              { label: 'Total Routes', value: stats.totalRoutes, color: 'text-orange-400' },
              { label: 'Inbound', value: stats.inboundRoutes, color: 'text-cyan-400' },
              { label: 'Outbound', value: stats.outboundRoutes, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Routes & Suppliers side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Routes by mode */}
          {stats && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-orange-400" /> Routes by Transport Mode
              </h3>
              <div className="space-y-2">
                {stats.byMode?.map((m: any) => {
                  const total = stats.totalRoutes || 1;
                  const pct = Math.round((m.count / total) * 100);
                  return (
                    <div key={m.transport_mode}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{modeIcons[m.transport_mode] || '📦'}</span>
                          <span className="text-sm text-gray-300 capitalize">{m.transport_mode}</span>
                        </div>
                        <span className="text-xs text-gray-400">{m.count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Suppliers by status */}
          {stats && (
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-400" /> Suppliers by Status
              </h3>
              <div className="space-y-2">
                {stats.byStatus?.map((s: any) => {
                  const total = stats.totalSuppliers || 1;
                  const pct = Math.round((s.count / total) * 100);
                  const colors: Record<string, string> = { active: 'bg-green-500', 'on-hold': 'bg-yellow-500', inactive: 'bg-red-500' };
                  return (
                    <div key={s.status}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${colors[s.status] || 'bg-gray-500'}`} />
                          <span className="text-sm text-gray-300 capitalize">{s.status}</span>
                        </div>
                        <span className="text-xs text-gray-400">{s.count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[s.status] || 'bg-gray-500'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Top supplier countries */}
              <div className="mt-4 pt-3 border-t border-gray-700">
                <h4 className="text-xs text-gray-500 uppercase mb-2">Recent Suppliers</h4>
                <div className="space-y-1">
                  {topSuppliers.slice(0, 5).map(s => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <a href={`/suppliers/${s.id}`} className="text-blue-400 hover:text-blue-300 truncate max-w-[60%]">{s.company_name}</a>
                      <span className="text-gray-500">{s.city}, {s.country}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Connected Routes list */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">All Transport Routes</h2>
            <span className="text-xs text-gray-500">{routes.length} routes</span>
          </div>
          <div className="divide-y divide-gray-700/50 max-h-80 overflow-y-auto">
            {routes.map(r => (
              <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-700/20">
                <span className="text-base">{modeIcons[r.transport_mode] || '📦'}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white font-medium truncate">{r.name}</div>
                  <div className="text-xs text-gray-500">
                    {r.carrier_name && `${r.carrier_name} · `}{r.transit_days ? `${r.transit_days}d` : 'N/A'}
                    {r.suppliers && r.suppliers.length > 0 && ` · ${r.suppliers.length} supplier${r.suppliers.length > 1 ? 's' : ''}`}
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-medium ${r.route_type === 'inbound' ? 'bg-blue-900/50 text-blue-400' : 'bg-orange-900/50 text-orange-400'}`}>
                  {r.route_type}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Company Information Form */}
        <div className="bg-gray-800 rounded-lg border border-gray-700">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wide">Edit Company Information</h2>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SETTING_FIELDS.map(({ key, label, icon: Icon, placeholder }) => (
              <div key={key}>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1">
                  <Icon className="w-3 h-3" /> {label}
                </label>
                <input
                  type="text"
                  value={settings[key] || ''}
                  onChange={e => setSettings({ ...settings, [key]: e.target.value })}
                  placeholder={placeholder}
                  disabled={!isAdmin}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            ))}
          </div>
          {isAdmin && (
            <div className="p-4 border-t border-gray-700 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </div>

        {/* Data management */}
        {isAdmin && (
          <div className="bg-gray-800 rounded-lg border border-red-900/50">
            <div className="p-4 border-b border-red-900/50">
              <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide">Data Management</h2>
            </div>
            <div className="p-4 text-sm text-gray-400">
              <p>To re-seed the database with fresh demo data, run in your terminal:</p>
              <code className="block mt-2 p-2 bg-gray-900 rounded text-green-400 text-xs font-mono">
                cd server && npm run seed
              </code>
              <p className="mt-2 text-red-400 text-xs">Warning: This will replace all existing data.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
