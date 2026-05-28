import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import {
  TrendingUp, TrendingDown, Truck, DollarSign, Globe, AlertTriangle,
  Target, Zap, BarChart3, Package, Upload, Download, FileSpreadsheet, Trash2, RefreshCw,
  Lightbulb, ArrowRight, CheckCircle, Clock, Layers, Route, Users, Fuel, ChevronDown, ChevronUp
} from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  sub: string;
  status?: 'good' | 'warn' | 'bad' | 'neutral';
  icon: React.ReactNode;
  barValue?: number;
}

function KPICard({ label, value, sub, status = 'neutral', icon, barValue }: KPICardProps) {
  const colors = { good: 'text-green-400', warn: 'text-yellow-400', bad: 'text-red-400', neutral: 'text-white' };
  const barColors = { good: 'bg-green-500', warn: 'bg-yellow-500', bad: 'bg-red-500', neutral: 'bg-blue-500' };
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 relative overflow-hidden">
      <div className="absolute top-3 right-3 text-gray-600">{icon}</div>
      <div className="text-xs text-gray-400 mb-1">{label}</div>
      <div className={`text-2xl font-bold ${colors[status]}`}>{value}</div>
      <div className="text-[11px] text-gray-500 mt-0.5">{sub}</div>
      {barValue != null && (
        <div className="h-1 bg-gray-700 rounded mt-2 overflow-hidden">
          <div className={`h-full rounded ${barColors[status]}`} style={{ width: `${Math.min(barValue, 100)}%` }} />
        </div>
      )}
    </div>
  );
}

function AlertCard({ title, description, severity }: { title: string; description: string; severity: string }) {
  const borderColor = severity === 'critical' ? 'border-l-red-500' : severity === 'warning' ? 'border-l-yellow-500' : 'border-l-blue-500';
  return (
    <div className={`bg-gray-800 border border-gray-700 border-l-4 ${borderColor} rounded-r-lg p-3`}>
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="text-xs text-gray-400 mt-1">{description}</div>
    </div>
  );
}

function SimpleBarChart({ data, valueKey, labelKey, colorFn }: {
  data: { [key: string]: any }[];
  valueKey: string;
  labelKey: string;
  colorFn?: (val: number) => string;
}) {
  const maxVal = Math.max(...data.map(d => d[valueKey]), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="text-[10px] text-gray-400 w-24 truncate text-right">{d[labelKey]}</div>
          <div className="flex-1 h-5 bg-gray-700 rounded overflow-hidden relative">
            <div className="h-full rounded transition-all duration-500"
              style={{ width: `${(d[valueKey] / maxVal) * 100}%`, background: colorFn ? colorFn(d[valueKey]) : '#3b82f6' }} />
            <span className="absolute right-1 top-0 h-full flex items-center text-[10px] text-white font-mono">
              {typeof d[valueKey] === 'number' ? (d[valueKey] % 1 === 0 ? d[valueKey] : d[valueKey].toFixed(1)) : d[valueKey]}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrendLineChart({ data }: { data: { month: string; fillRate: number; target: number }[] }) {
  if (data.length < 2) return <div className="text-gray-500 text-sm p-4">Need at least 2 months of data</div>;
  const w = 100, h = 40, maxVal = 100;
  const points = data.map((d, i) => ({ x: (i / (data.length - 1)) * w, y: h - (d.fillRate / maxVal) * h }));
  const targetY = h - (data[0]?.target || 85) / maxVal * h;
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  return (
    <svg viewBox={`-2 -2 ${w + 4} ${h + 14}`} className="w-full h-40">
      <line x1="0" y1={targetY} x2={w} y2={targetY} stroke="#22c55e" strokeDasharray="3,3" strokeWidth="0.5" opacity="0.6" />
      <text x={w - 1} y={targetY - 1} fill="#22c55e" fontSize="3" textAnchor="end">Target {data[0]?.target || 85}%</text>
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="1.5" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="1.5" fill="#3b82f6" />
          <text x={p.x} y={p.y - 3} fill="#94a3b8" fontSize="3" textAnchor="middle">{data[i].fillRate}%</text>
          <text x={p.x} y={h + 6} fill="#6b7280" fontSize="2.8" textAnchor="middle">{data[i].month}</text>
        </g>
      ))}
    </svg>
  );
}

function DonutChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-gray-500 text-sm p-4">No mode data</div>;
  let cumulative = 0;
  const radius = 35, cx = 50, cy = 50;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="w-32 h-32">
        {data.map((d, i) => {
          const start = cumulative / total;
          cumulative += d.value;
          const end = cumulative / total;
          const startAngle = start * 2 * Math.PI - Math.PI / 2;
          const endAngle = end * 2 * Math.PI - Math.PI / 2;
          const x1 = cx + radius * Math.cos(startAngle);
          const y1 = cy + radius * Math.sin(startAngle);
          const x2 = cx + radius * Math.cos(endAngle);
          const y2 = cy + radius * Math.sin(endAngle);
          const largeArc = d.value / total > 0.5 ? 1 : 0;
          return (
            <path key={i}
              d={`M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={d.color} stroke="#1f2937" strokeWidth="1" />
          );
        })}
        <circle cx={cx} cy={cy} r="20" fill="#1f2937" />
      </svg>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-gray-400">{d.label}</span>
            <span className="text-white font-medium ml-auto">{d.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// AI Recommendation types
interface AIRecommendation {
  id: string;
  category: 'utilization' | 'cost' | 'network' | 'operational' | 'strategic';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  action: string;
  icon: React.ReactNode;
  metric?: string;
  savings?: string;
}

function generateRecommendations(kpi: any): AIRecommendation[] {
  if (!kpi?.hasData) return [];
  const recs: AIRecommendation[] = [];
  const u = kpi.utilization || {};
  const c = kpi.costs || {};
  const n = kpi.network || {};
  const o = kpi.operational || {};
  const a = kpi.advanced || {};

  // --- Utilization Recommendations ---
  if (u.avgFillRate < 70) {
    recs.push({
      id: 'low-fill-critical', category: 'utilization', priority: 'high',
      title: 'Consolidate Low-Volume Shipments',
      description: `Average fill rate is ${u.avgFillRate}%, well below the 85% target. Multiple partially-loaded trucks are leaving with excess capacity, driving up per-unit costs.`,
      impact: `Potential to eliminate ${a.truckReductionPct}% of truck movements by consolidating loads`,
      action: 'Switch low-volume FTL lanes to Milkrun or LTL. Group nearby suppliers into shared pickup routes.',
      icon: <Layers className="w-5 h-5" />, metric: `${u.avgFillRate}% → 85%`,
      savings: a.savingsPotential > 0 ? `€${Math.round(a.savingsPotential / 1000)}k/year` : undefined,
    });
  } else if (u.avgFillRate < 85) {
    recs.push({
      id: 'fill-improvement', category: 'utilization', priority: 'medium',
      title: 'Fine-Tune Load Planning',
      description: `Fill rate at ${u.avgFillRate}% — close to target but room for improvement. Tightening pickup windows and adjusting order frequency could push utilization higher.`,
      impact: 'Reduce empty space per truck by aligning supplier delivery windows',
      action: 'Review pickup schedules for suppliers with <80% fill rates. Consider fixed delivery days per route.',
      icon: <Target className="w-5 h-5" />, metric: `${u.avgFillRate}% → 85%`,
    });
  }

  if (u.emptyTruckRatio > 15) {
    recs.push({
      id: 'empty-trucks', category: 'utilization', priority: 'high',
      title: 'Eliminate Under-Utilized Truck Runs',
      description: `${u.emptyTruckRatio}% of trucks running below 40% capacity. These shipments cost nearly as much as full loads but carry far less.`,
      impact: `Converting these to consolidated runs could save ${Math.round(u.emptyTruckRatio * 0.6)}% of fleet costs`,
      action: 'Identify the worst-performing lanes below and convert from FTL to Milkrun. Merge nearby supplier pickups.',
      icon: <Truck className="w-5 h-5" />, metric: `${u.emptyTruckRatio}% → <10%`,
    });
  }

  if (u.deadheadRatio > 12) {
    recs.push({
      id: 'deadhead', category: 'utilization', priority: 'medium',
      title: 'Reduce Empty Return Kilometers',
      description: `Deadhead ratio at ${u.deadheadRatio}% — trucks returning empty from deliveries. This is wasted mileage that carriers still charge for.`,
      impact: 'Negotiate round-trip rates or find backhaul opportunities with outbound suppliers',
      action: 'Partner with outbound carriers to share return loads. Explore cross-docking at regional hubs.',
      icon: <Fuel className="w-5 h-5" />, metric: `${u.deadheadRatio}% → <10%`,
    });
  }

  // --- Cost Recommendations ---
  if (c.costPerPallet > 30) {
    recs.push({
      id: 'cost-per-pallet', category: 'cost', priority: 'high',
      title: 'High Per-Pallet Cost — Renegotiate Carrier Rates',
      description: `Cost per pallet at €${c.costPerPallet} — above the €20-25 industry target. Higher utilization alone could drop this significantly.`,
      impact: 'Reducing cost per pallet by €5 across all shipments yields major annual savings',
      action: 'Benchmark carrier rates against market. Bundle volumes across lanes for better tender pricing.',
      icon: <DollarSign className="w-5 h-5" />, metric: `€${c.costPerPallet} → €25`,
      savings: n.transportFrequency > 0 ? `€${Math.round((c.costPerPallet - 25) * n.avgShipmentSize * n.transportFrequency * 250 / 1000)}k/year` : undefined,
    });
  }

  if (a.freightPctOfValue > 5) {
    recs.push({
      id: 'freight-ratio', category: 'cost', priority: 'medium',
      title: 'Freight Cost Exceeds Material Value Benchmark',
      description: `Freight is ${a.freightPctOfValue}% of material value — above the 2-5% automotive benchmark. This erodes product margins.`,
      impact: 'Every 1% reduction in freight-to-value ratio improves net margin directly',
      action: 'Prioritize cost reduction on high-value material lanes. Shift long-distance FTL to rail where possible.',
      icon: <TrendingDown className="w-5 h-5" />, metric: `${a.freightPctOfValue}% → <5%`,
    });
  }

  // --- Network Recommendations ---
  if (n.avgShipmentSize < 18) {
    recs.push({
      id: 'small-shipments', category: 'network', priority: 'medium',
      title: 'Increase Average Shipment Size',
      description: `Average shipment is only ${n.avgShipmentSize} pallets vs 33-pallet truck capacity. Frequent small shipments inflate total transport cost.`,
      impact: `Doubling shipment size from ${n.avgShipmentSize} to ${Math.min(n.avgShipmentSize * 2, 33)} pallets halves the number of required trucks`,
      action: 'Implement min-order quantities per lane. Batch orders weekly instead of daily for low-volume suppliers.',
      icon: <Package className="w-5 h-5" />, metric: `${n.avgShipmentSize} → ${Math.min(28, Math.round(n.avgShipmentSize * 1.5))} plt`,
    });
  }

  if (n.consolidationRate < 40) {
    recs.push({
      id: 'consolidation', category: 'network', priority: 'medium',
      title: 'Increase Shipment Consolidation',
      description: `Only ${n.consolidationRate}% of shipments are consolidated. Most trucks serve single suppliers when regional grouping could combine loads.`,
      impact: 'Consolidation rates above 60% typically reduce transport costs by 15-25%',
      action: 'Create milkrun routes for geographically clustered suppliers. Set up weekly consolidated pickup days.',
      icon: <Route className="w-5 h-5" />, metric: `${n.consolidationRate}% → >60%`,
    });
  }

  // --- Operational Recommendations ---
  if (o.onTimeDispatch < 92) {
    recs.push({
      id: 'on-time', category: 'operational', priority: 'high',
      title: 'Improve On-Time Dispatch Rate',
      description: `On-time dispatch at ${o.onTimeDispatch}% — below the 95% target. Late dispatches cascade into production delays and urgent shipments.`,
      impact: 'Every 1% improvement in on-time reduces urgent shipment costs by approximately 3%',
      action: 'Implement carrier scorecards. Set automated alerts for delayed pickups. Consider backup carriers for critical lanes.',
      icon: <Clock className="w-5 h-5" />, metric: `${o.onTimeDispatch}% → 95%`,
    });
  }

  if (o.urgentPct > 5) {
    recs.push({
      id: 'urgent-reduction', category: 'operational', priority: 'high',
      title: 'Reduce Urgent Shipment Rate',
      description: `${o.urgentPct}% of shipments flagged as urgent — these typically cost 2-3x normal rates. Target is below 5%.`,
      impact: `Reducing urgent from ${o.urgentPct}% to 5% could save 15-30% on those lanes' costs`,
      action: 'Analyze root causes of urgency. Increase safety stock for critical parts. Improve demand forecasting.',
      icon: <AlertTriangle className="w-5 h-5" />, metric: `${o.urgentPct}% → <5%`,
    });
  }

  // --- Strategic Recommendations (always relevant) ---
  const modeMix = o.modeMix || [];
  const roadPct = modeMix.find((m: any) => m.mode === 'road')?.percentage || 0;
  if (roadPct > 80) {
    recs.push({
      id: 'mode-shift', category: 'strategic', priority: 'low',
      title: 'Diversify Transport Modes',
      description: `${roadPct}% of shipments by road. For routes over 500km, rail or intermodal can reduce costs by 20-40% and lower carbon footprint.`,
      impact: 'Shifting 10-15% of long-haul road to rail reduces emissions and cost per km',
      action: 'Identify routes >500km currently on road. Evaluate rail connections to RT HQ via Rijeka/Koper ports.',
      icon: <Globe className="w-5 h-5" />, metric: `Road ${roadPct}% → 65%`,
    });
  }

  // Supplier-specific recommendations from worst utilization
  const worstSuppliers = (kpi.worstUtilization || []).filter((w: any) => w.fill < 55);
  if (worstSuppliers.length > 0) {
    const names = worstSuppliers.slice(0, 3).map((w: any) => `${w.supplier} (${w.fill}%)`).join(', ');
    recs.push({
      id: 'worst-suppliers', category: 'utilization', priority: 'high',
      title: 'Target Worst-Performing Supplier Lanes',
      description: `These suppliers have critically low fill rates: ${names}. They're the biggest drag on overall utilization.`,
      impact: 'Fixing the bottom 3-5 lanes can improve overall fill rate by 5-10 percentage points',
      action: 'Convert these to milkrun (group nearby suppliers) or switch to LTL shared capacity. Discuss order batching with procurement.',
      icon: <Users className="w-5 h-5" />,
    });
  }

  // Sort by priority
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  return recs.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

function AIRecommendationsPanel({ kpi }: { kpi: any }) {
  const [expanded, setExpanded] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const recommendations = generateRecommendations(kpi);

  if (recommendations.length === 0) return null;

  const categories = [
    { key: 'all', label: 'All', count: recommendations.length },
    { key: 'utilization', label: 'Utilization', count: recommendations.filter(r => r.category === 'utilization').length },
    { key: 'cost', label: 'Cost', count: recommendations.filter(r => r.category === 'cost').length },
    { key: 'network', label: 'Network', count: recommendations.filter(r => r.category === 'network').length },
    { key: 'operational', label: 'Operations', count: recommendations.filter(r => r.category === 'operational').length },
    { key: 'strategic', label: 'Strategic', count: recommendations.filter(r => r.category === 'strategic').length },
  ].filter(c => c.count > 0);

  const filtered = selectedCategory === 'all' ? recommendations : recommendations.filter(r => r.category === selectedCategory);
  const highCount = recommendations.filter(r => r.priority === 'high').length;

  const priorityColors = {
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
    medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  const categoryColors: Record<string, string> = {
    utilization: '#3b82f6', cost: '#22c55e', network: '#f59e0b', operational: '#a855f7', strategic: '#6b7280'
  };

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-800/80 border border-gray-700 rounded-xl overflow-hidden">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-amber-400" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              AI Optimization Recommendations
              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded-full text-[10px] font-bold">{recommendations.length}</span>
              {highCount > 0 && (
                <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-[10px] font-bold">{highCount} HIGH PRIORITY</span>
              )}
            </h3>
            <p className="text-xs text-gray-400">Data-driven actions to optimize your supply chain performance</p>
          </div>
        </div>
        {expanded ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Category filter tabs */}
          <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
            {categories.map(cat => (
              <button key={cat.key} onClick={() => setSelectedCategory(cat.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  selectedCategory === cat.key
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 border border-transparent'
                }`}>
                {cat.label}
                <span className="ml-1.5 text-[10px] opacity-70">{cat.count}</span>
              </button>
            ))}
          </div>

          {/* Recommendation cards */}
          <div className="space-y-3">
            {filtered.map(rec => (
              <div key={rec.id} className="bg-gray-900/50 border border-gray-700/50 rounded-lg p-4 hover:border-gray-600/50 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: categoryColors[rec.category] + '20', color: categoryColors[rec.category] }}>
                    {rec.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-semibold text-white">{rec.title}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${priorityColors[rec.priority]}`}>
                        {rec.priority.toUpperCase()}
                      </span>
                      {rec.savings && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/20 text-green-400 border border-green-500/30">
                          {rec.savings}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed">{rec.description}</p>

                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <div className="bg-gray-800/80 rounded-md px-3 py-2">
                        <div className="text-[10px] text-gray-500 uppercase font-medium">Expected Impact</div>
                        <div className="text-xs text-gray-300 mt-0.5">{rec.impact}</div>
                      </div>
                      <div className="bg-gray-800/80 rounded-md px-3 py-2">
                        <div className="text-[10px] text-gray-500 uppercase font-medium flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" /> Recommended Action
                        </div>
                        <div className="text-xs text-blue-300 mt-0.5">{rec.action}</div>
                      </div>
                    </div>

                    {rec.metric && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-[10px] text-gray-500">TARGET:</span>
                        <span className="px-2 py-0.5 rounded bg-gray-800 text-[11px] font-mono text-amber-300">{rec.metric}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary footer */}
          <div className="mt-4 pt-3 border-t border-gray-700/50 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              <span className="text-gray-400 font-medium">{recommendations.length} recommendations</span> generated from {kpi.total} shipment records
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> {recommendations.filter(r => r.priority === 'high').length} High</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> {recommendations.filter(r => r.priority === 'medium').length} Medium</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> {recommendations.filter(r => r.priority === 'low').length} Low</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Status helper
function statusFor(val: number, goodBelow: number, warnBelow: number, invert = false): 'good' | 'warn' | 'bad' {
  if (invert) return val >= warnBelow ? 'good' : val >= goodBelow ? 'warn' : 'bad';
  return val <= goodBelow ? 'good' : val <= warnBelow ? 'warn' : 'bad';
}

export default function KPIDashboardPage() {
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [shipmentCount, setShipmentCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchKPI = async () => {
    setLoading(true);
    try {
      const [kpiRes, countRes] = await Promise.all([
        api.get('/kpi/compute'),
        api.get('/kpi/shipments', { params: { limit: 1 } })
      ]);
      setKpi(kpiRes.data);
      setShipmentCount(countRes.data.total || 0);
    } catch (e) {
      console.error('Failed to load KPI', e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchKPI();
    // Auto-refresh every 30 seconds so new bookings appear quickly
    const interval = setInterval(fetchKPI, 30000);
    // Also refresh when user returns to this tab
    const onFocus = () => fetchKPI();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(interval); window.removeEventListener('focus', onFocus); };
  }, []);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/kpi/shipments/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setImportResult(res.data);
      fetchKPI();
    } catch (err: any) {
      setImportResult({ error: err.response?.data?.error || 'Import failed' });
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExport = async () => {
    try {
      const res = await api.get('/kpi/shipments/export', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'shipments_kpi_export.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Export failed');
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Delete ALL shipment data? This cannot be undone.')) return;
    await api.delete('/kpi/shipments');
    fetchKPI();
    setImportResult(null);
  };

  const handleDownloadTemplate = (format: 'csv' | 'xlsx' = 'csv') => {
    if (format === 'xlsx') {
      // Download the pre-built Excel template
      const a = document.createElement('a');
      a.href = '/shipments_template.xlsx';
      a.download = 'shipments_template.xlsx';
      a.click();
      return;
    }
    const headers = [
      'Shipment Number', 'Shipment Date', 'Delivery Date', 'Supplier Name',
      'Route Name', 'Origin City', 'Origin Country', 'Transport Mode', 'Shipment Type',
      'Carrier', 'Pallets Shipped', 'Pallet Capacity', 'Weight (kg)', 'Volume (m3)',
      'Distance (km)', 'Total KM', 'Empty KM', 'Total Cost (EUR)', 'Material Value (EUR)',
      'On Time', 'Urgent', 'Consolidated', 'Status', 'Notes'
    ];
    const example = [
      'SH-001', '2025-01-15', '2025-01-17', 'Bosch (Stuttgart)',
      'Stuttgart-RT', 'Stuttgart', 'Germany', 'road', 'ftl',
      'DHL Freight', '28', '33', '18500', '45',
      '420', '420', '0', '780', '125000',
      'Yes', 'No', 'No', 'delivered', ''
    ];
    const csv = headers.join(',') + '\n' + example.join(',') + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'shipments_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-900">
        <div className="text-gray-400">Loading KPI data...</div>
      </div>
    );
  }

  const hasData = kpi?.hasData;
  const u = kpi?.utilization || { avgFillRate: 0, emptyTruckRatio: 0, deadheadRatio: 0, avgUtilization: 0 };
  const c = kpi?.costs || { costPerPallet: 0, costPerKm: 0, costPerTruck: 0, costPerKg: 0 };
  const n = kpi?.network || { avgShipmentSize: 0, consolidationRate: 0, avgDistance: 0, transportFrequency: 0 };
  const o = kpi?.operational || { onTimeDispatch: 0, urgentPct: 0, modeMix: [] };
  const a = kpi?.advanced || { freightPctOfValue: 0, targetFillRate: 85, currentFillRate: 0, truckReductionPct: 0, savingsPotential: 0 };
  const modeColors: Record<string, string> = { road: '#3b82f6', rail: '#22c55e', sea: '#f59e0b', air: '#a855f7', multimodal: '#6b7280' };
  const modeData = (o.modeMix || []).map((m: any) => ({ label: m.mode.charAt(0).toUpperCase() + m.mode.slice(1), value: m.percentage, color: modeColors[m.mode] || '#6b7280' }));
  const topMode = modeData[0];
  const dataSource = hasData
    ? `${kpi.total} records (shipments + bookings)`
    : 'No data yet — import CSV or book transports';

  // Generate alerts from real data
  const alerts: { title: string; description: string; severity: string }[] = [];
  if (hasData) {
    if (u.avgFillRate < 65) alerts.push({ title: `Average fill rate critically low: ${u.avgFillRate}%`, description: `Target is 85%. ${a.truckReductionPct}% truck reduction possible with optimization.`, severity: 'critical' });
    if (u.emptyTruckRatio > 15) alerts.push({ title: `${u.emptyTruckRatio}% of trucks below 40% utilization`, description: 'Consider milkrun consolidation for low-volume suppliers.', severity: 'critical' });
    if (c.costPerPallet > 30) alerts.push({ title: `Cost per pallet high: €${c.costPerPallet}`, description: 'Review carrier rates and consolidation opportunities.', severity: 'warning' });
    if (o.urgentPct > 10) alerts.push({ title: `${o.urgentPct}% urgent shipments`, description: 'High urgency rate indicates planning gaps. Target: <5%.', severity: 'warning' });
    if (o.onTimeDispatch < 90) alerts.push({ title: `On-time dispatch: ${o.onTimeDispatch}%`, description: 'Below 90% target. Review carrier performance and pickup windows.', severity: 'warning' });
    if (n.avgShipmentSize < 15) alerts.push({ title: `Small avg shipment: ${n.avgShipmentSize} pallets`, description: 'Consolidation potential. Truck capacity is 33 pallets.', severity: 'warning' });
    (kpi.worstUtilization || []).slice(0, 2).forEach((w: any) => {
      if (w.fill < 50) alerts.push({ title: `${w.supplier}: ${w.fill}% fill rate`, description: 'Milkrun or consolidation recommended.', severity: 'critical' });
    });
  } else {
    alerts.push({ title: 'No shipment data loaded', description: 'Import your shipment records via CSV or book transports in the Transport Booking page to see real KPIs.', severity: 'info' });
  }

  return (
    <div className="flex-1 overflow-y-auto bg-gray-900 p-5 space-y-5">
      {/* Header with Import/Export */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" /> KPI Dashboard
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">{dataSource}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg overflow-hidden border border-gray-600">
            <button onClick={() => handleDownloadTemplate('xlsx')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs font-medium transition-colors"
              title="Download Excel template with sample data + instructions">
              <FileSpreadsheet className="w-3.5 h-3.5" /> Excel Template
            </button>
            <button onClick={() => handleDownloadTemplate('csv')}
              className="flex items-center gap-1 px-2 py-1.5 bg-gray-700/60 hover:bg-gray-600 text-gray-400 text-xs transition-colors border-l border-gray-600"
              title="Download CSV template">
              CSV
            </button>
          </div>
          <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
            importing ? 'bg-gray-600 text-gray-400' : 'bg-green-700 hover:bg-green-600 text-white'
          }`}>
            <Upload className="w-3.5 h-3.5" /> {importing ? 'Importing...' : 'Import CSV'}
            <input ref={fileInputRef} type="file" accept=".csv,.txt" onChange={handleImport} className="hidden" disabled={importing} />
          </label>
          {shipmentCount > 0 && (
            <>
              <button onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-medium transition-colors">
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
              <button onClick={fetchKPI}
                className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-xs transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button onClick={handleClearAll}
                className="flex items-center gap-1 px-2 py-1.5 bg-gray-700 hover:bg-red-800 text-gray-400 hover:text-red-400 rounded-lg text-xs transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Import result toast */}
      {importResult && (
        <div className={`rounded-lg p-3 text-sm ${importResult.error ? 'bg-red-900/50 border border-red-700 text-red-300' : 'bg-green-900/50 border border-green-700 text-green-300'}`}>
          {importResult.error ? `Import error: ${importResult.error}` :
            `Successfully imported ${importResult.imported} of ${importResult.total} rows.${importResult.errors?.length ? ` ${importResult.errors.length} errors.` : ''}`}
          {importResult.errors?.length > 0 && (
            <details className="mt-1"><summary className="cursor-pointer text-xs text-gray-400">Show errors</summary>
              <ul className="text-xs mt-1 space-y-0.5">{importResult.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul>
            </details>
          )}
        </div>
      )}

          {/* Optimization Potential Banner */}
          <div className="bg-gradient-to-r from-indigo-900 to-blue-900 rounded-xl p-5 flex items-center justify-between border border-blue-700/30">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-bold text-white">Optimization Potential</h3>
              </div>
              <p className="text-sm text-gray-300">If all routes reach {a.targetFillRate}% utilization target</p>
              <p className="text-xs text-gray-400 mt-1">
                Current avg: {a.currentFillRate}% → Target: {a.targetFillRate}% → Truck reduction: {a.truckReductionPct}%
              </p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-green-400">
                {a.savingsPotential >= 1000000
                  ? `€${(a.savingsPotential / 1000000).toFixed(1)}M`
                  : `€${Math.round(a.savingsPotential / 1000)}k`}
              </div>
              <div className="text-xs text-gray-400">potential annual savings</div>
            </div>
          </div>

          {/* AI Recommendations */}
          <AIRecommendationsPanel kpi={kpi} />

          {/* 1. Truck Utilization */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Truck className="w-4 h-4" /> Truck Utilization
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <KPICard label="Avg Truck Fill Rate" value={`${u.avgFillRate}%`}
                sub="Target: >85% | Automotive benchmark" status={statusFor(u.avgFillRate, 60, 85, true)}
                icon={<Truck className="w-5 h-5" />} barValue={u.avgFillRate} />
              <KPICard label="Empty Truck Ratio" value={`${u.emptyTruckRatio}%`}
                sub="Trucks <40% utilization | Target: <10%" status={statusFor(u.emptyTruckRatio, 10, 20)}
                icon={<Package className="w-5 h-5" />} barValue={u.emptyTruckRatio} />
              <KPICard label="Deadhead Ratio" value={`${u.deadheadRatio}%`}
                sub="Empty KM / Total KM | Target: <15%" status={statusFor(u.deadheadRatio, 10, 15)}
                icon={<TrendingDown className="w-5 h-5" />} barValue={u.deadheadRatio} />
              <KPICard label="Avg Truck Utilization" value={`${u.avgUtilization}%`}
                sub="Weighted avg (pallets/capacity)" status={statusFor(u.avgUtilization, 60, 85, true)}
                icon={<BarChart3 className="w-5 h-5" />} barValue={u.avgUtilization} />
            </div>
          </div>

          {/* 2. Cost KPIs */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> Transport Costs
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <KPICard label="Cost per Pallet" value={`€${c.costPerPallet}`}
                sub="Avg across all shipments" status="neutral"
                icon={<DollarSign className="w-5 h-5" />} />
              <KPICard label="Cost per km" value={`€${c.costPerKm}`}
                sub="Total cost / total distance" status="neutral"
                icon={<DollarSign className="w-5 h-5" />} />
              <KPICard label="Cost per Truck" value={`€${c.costPerTruck}`}
                sub="Avg per shipment" status="neutral"
                icon={<Truck className="w-5 h-5" />} />
              <KPICard label="Cost per kg" value={`€${c.costPerKg}`}
                sub="Total cost / total weight" status="neutral"
                icon={<DollarSign className="w-5 h-5" />} />
            </div>
          </div>

          {/* 3. Network Efficiency */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Globe className="w-4 h-4" /> Network Efficiency
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <KPICard label="Avg Shipment Size" value={`${n.avgShipmentSize} plt`}
                sub="Capacity: 33 pallets" status={statusFor(n.avgShipmentSize, 10, 20, true)}
                icon={<Package className="w-5 h-5" />} />
              <KPICard label="Consolidation Rate" value={`${n.consolidationRate}%`}
                sub="Target: >60%" status={statusFor(n.consolidationRate, 30, 60, true)}
                icon={<Zap className="w-5 h-5" />} barValue={n.consolidationRate} />
              <KPICard label="Avg Distance / Shipment" value={`${n.avgDistance} km`}
                sub="Weighted average" status="neutral"
                icon={<Globe className="w-5 h-5" />} />
              <KPICard label="Transport Frequency" value={`${n.transportFrequency}/day`}
                sub="Avg trucks/day | Optimal: 2/day@90%" status="neutral"
                icon={<TrendingUp className="w-5 h-5" />} />
            </div>
          </div>

          {/* 4. Advanced */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Zap className="w-4 h-4" /> Advanced & Operational
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <KPICard label="Freight Cost as % of Value" value={`${a.freightPctOfValue}%`}
                sub="Automotive benchmark: 2–5%" status={statusFor(a.freightPctOfValue, 5, 8)}
                icon={<DollarSign className="w-5 h-5" />} barValue={a.freightPctOfValue * 10} />
              <KPICard label="On-time Dispatch" value={`${o.onTimeDispatch}%`}
                sub="Target: >95%" status={statusFor(o.onTimeDispatch, 85, 95, true)}
                icon={<TrendingUp className="w-5 h-5" />} barValue={o.onTimeDispatch} />
              <KPICard label="Urgent Shipments" value={`${o.urgentPct}%`}
                sub="Target: <5%" status={statusFor(o.urgentPct, 5, 10)}
                icon={<AlertTriangle className="w-5 h-5" />} barValue={o.urgentPct} />
              <KPICard label="Transport Mode Mix" value={topMode ? `${topMode.label} ${topMode.value}%` : 'N/A'}
                sub={modeData.slice(1).map((m: any) => `${m.label} ${m.value}%`).join(' | ')}
                status="neutral" icon={<BarChart3 className="w-5 h-5" />} />
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <h4 className="text-xs text-gray-400 uppercase font-semibold mb-3">Fill Rate by Supplier (Top 10)</h4>
              {(kpi.fillRateByRoute || []).length > 0 ?
                <SimpleBarChart data={kpi.fillRateByRoute} valueKey="value" labelKey="route"
                  colorFn={v => v >= 85 ? '#22c55e' : v >= 60 ? '#f59e0b' : '#ef4444'} /> :
                <div className="text-gray-500 text-sm">No per-supplier data</div>}
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <h4 className="text-xs text-gray-400 uppercase font-semibold mb-3">Cost per Pallet by Lane (€)</h4>
              {(kpi.costPerPalletByLane || []).length > 0 ?
                <SimpleBarChart data={kpi.costPerPalletByLane} valueKey="value" labelKey="lane"
                  colorFn={v => v > 30 ? '#ef4444' : v > 20 ? '#f59e0b' : '#22c55e'} /> :
                <div className="text-gray-500 text-sm">No per-lane cost data</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <h4 className="text-xs text-gray-400 uppercase font-semibold mb-3">Monthly Utilization Trend</h4>
              <TrendLineChart data={kpi.monthlyTrend || []} />
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <h4 className="text-xs text-gray-400 uppercase font-semibold mb-3">Transport Mode Split</h4>
              <DonutChart data={modeData} />
            </div>
          </div>

          {/* Tables */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <h4 className="text-xs text-gray-400 uppercase font-semibold mb-3">Top Expensive Lanes (Cost/Pallet)</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-2">Supplier → RT</th>
                    <th className="text-right py-2">Cost/Pallet</th>
                    <th className="text-right py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(kpi.expensiveLanes || []).map((l: any, i: number) => (
                    <tr key={i} className="border-b border-gray-700/30">
                      <td className="py-1.5 text-gray-300">{l.supplier}</td>
                      <td className="text-right text-white font-mono">€{l.cost.toFixed(2)}</td>
                      <td className="text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          l.status === 'critical' ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'
                        }`}>{l.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <h4 className="text-xs text-gray-400 uppercase font-semibold mb-3">Worst Utilization Lanes</h4>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700">
                    <th className="text-left py-2">Supplier</th>
                    <th className="text-right py-2">Avg Fill Rate</th>
                    <th className="text-right py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(kpi.worstUtilization || []).map((l: any, i: number) => (
                    <tr key={i} className="border-b border-gray-700/30">
                      <td className="py-1.5 text-gray-300">{l.supplier}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 bg-gray-700 rounded overflow-hidden">
                            <div className={`h-full rounded ${l.fill < 50 ? 'bg-red-500' : 'bg-yellow-500'}`}
                              style={{ width: `${l.fill}%` }} />
                          </div>
                          <span className="text-white font-mono">{l.fill}%</span>
                        </div>
                      </td>
                      <td className="text-right">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          l.fill < 50 ? 'bg-red-900/50 text-red-400' : 'bg-yellow-900/50 text-yellow-400'
                        }`}>{l.fill < 50 ? 'Critical' : 'Low'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Route Plan Network Summary */}
          {kpi.routePlan && kpi.routePlan.total_routes > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4" /> Route Plan Network
              </h3>
              <div className="grid grid-cols-5 gap-3">
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Total Routes</div>
                  <div className="text-xl font-bold text-white">{kpi.routePlan.total_routes}</div>
                  <div className="text-[10px] text-gray-500 mt-1">
                    {kpi.routePlan.inbound} in / {kpi.routePlan.outbound} out
                  </div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Mode Breakdown</div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-bold">FTL {kpi.routePlan.ftl}</span>
                    <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-400 rounded text-[10px] font-bold">LTL {kpi.routePlan.ltl}</span>
                    <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px] font-bold">MR {kpi.routePlan.milkrun}</span>
                    <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-bold">HUB {kpi.routePlan.hub}</span>
                  </div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Avg Transit Time</div>
                  <div className="text-xl font-bold text-white">{kpi.routePlan.avg_transit ? `${kpi.routePlan.avg_transit.toFixed(1)}d` : '—'}</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Unique Carriers</div>
                  <div className="text-xl font-bold text-white">{kpi.routePlan.unique_carriers}</div>
                </div>
                <div className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                  <div className="text-xs text-gray-400">Countries</div>
                  <div className="text-xl font-bold text-white">{kpi.routePlan.origin_countries}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{kpi.routePlan.origin_countries} origin / {kpi.routePlan.dest_countries} dest</div>
                </div>
              </div>
            </div>
          )}

          {/* Alerts */}
          {alerts.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Alerts & Optimization Opportunities
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {alerts.map((al, i) => (
                  <AlertCard key={i} title={al.title} description={al.description} severity={al.severity} />
                ))}
              </div>
            </div>
          )}
    </div>
  );
}
