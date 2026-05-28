import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { Supplier, TransportRoute, getIncotermColor, SHIPMENT_TYPE_CONFIG, ShipmentType } from '../types';

// ── Interfaces (unchanged) ─────────────────────────────────────────────────────
interface HQLocation {
  lat: number; lng: number; name: string; city: string; country: string;
}
interface Props {
  suppliers: Supplier[];
  routes: TransportRoute[];
  onSupplierClick?: (supplier: Supplier) => void;
  singleSupplier?: boolean;
  hq?: HQLocation | null;
  activeSupplierFilter?: number[];
}
interface RouteEntry { color: string; path: [number, number][]; }
interface Particle  { t: number; speed: number; idx: number; }

// ── Design tokens ──────────────────────────────────────────────────────────────
const C = { ftl: '#7FBCD2', ltl: '#a855f7', milkrun: '#E8366D', hq: '#E8366D' };

// ── Bezier helpers ─────────────────────────────────────────────────────────────
function quadBezier(
  from: [number, number], to: [number, number], segments = 55
): [number, number][] {
  const mLat = (from[0] + to[0]) / 2;
  const mLng = (from[1] + to[1]) / 2;
  const dLat = to[0] - from[0];
  const dLng = to[1] - from[1];
  const k = 0.22;
  const cp: [number, number] = [mLat - dLng * k, mLng + dLat * k];
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, mt = 1 - t;
    pts.push([
      mt * mt * from[0] + 2 * mt * t * cp[0] + t * t * to[0],
      mt * mt * from[1] + 2 * mt * t * cp[1] + t * t * to[1],
    ]);
  }
  return pts;
}

function chainBezier(coords: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const seg = quadBezier(coords[i], coords[i + 1], 40);
    if (i > 0) seg.shift();
    out.push(...seg);
  }
  return out;
}

// ── Popup HTML ─────────────────────────────────────────────────────────────────
const PS = `font-family:system-ui,sans-serif;min-width:210px;`;

function routePopupHtml(route: TransportRoute, color: string): string {
  const icons: Record<string, string> = { sea: '🚢', air: '✈️', rail: '🚂', road: '🚛', multimodal: '📦' };
  const st    = (route.shipment_type ?? 'ftl') as ShipmentType;
  const label = SHIPMENT_TYPE_CONFIG[st]?.label ?? st.toUpperCase();
  return `<div style="${PS}">
    <div style="background:${color}20;border-bottom:1px solid ${color}40;padding:10px 14px;border-radius:10px 10px 0 0;">
      <div style="font-weight:700;font-size:14px;color:#fff;">${icons[route.transport_mode] ?? ''} ${route.name}</div>
      <span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${label}</span>
    </div>
    <div style="padding:10px 14px;font-size:12px;display:grid;gap:4px;color:#94a3b8;">
      <div>Mode: <b style="color:#e2e8f0">${route.transport_mode.toUpperCase()}</b></div>
      ${route.carrier_name ? `<div>Carrier: <b style="color:#e2e8f0">${route.carrier_name}</b></div>` : ''}
      ${route.transit_days ? `<div>Transit: <b style="color:#e2e8f0">${route.transit_days} days</b></div>` : ''}
      ${route.suppliers?.length ? `<div>Suppliers: <b style="color:#e2e8f0">${route.suppliers.length}</b></div>` : ''}
    </div>
  </div>`;
}

function supplierPopupHtml(s: Supplier, color: string): string {
  const sc = s.status === 'active' ? '#22c55e' : s.status === 'on-hold' ? '#f59e0b' : '#ef4444';
  return `<div style="${PS}">
    <div style="background:${color}20;border-bottom:1px solid ${color}40;padding:10px 14px;border-radius:10px 10px 0 0;">
      <div style="font-weight:700;font-size:14px;color:#fff;">${s.company_name}</div>
      <div style="font-size:12px;color:#94a3b8;">${s.city}, ${s.country}</div>
    </div>
    <div style="padding:10px 14px;font-size:12px;display:flex;gap:6px;flex-wrap:wrap;">
      <span style="background:${color};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700;">${s.default_incoterm ?? 'N/A'}</span>
      <span style="background:${sc};color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;">${s.status}</span>
    </div>
    <div style="padding:0 14px 10px">
      <button
        onclick="window.__mapSupplierNav(${s.id})"
        style="background:none;border:none;padding:0;color:#7FBCD2;font-size:12px;cursor:pointer;font-family:inherit;"
        onmouseenter="this.style.opacity='0.75'"
        onmouseleave="this.style.opacity='1'"
      >View Details →</button>
    </div>
  </div>`;
}

// ── Marker icon factories ──────────────────────────────────────────────────────
function mkSupplierIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div class="ctrl-supplier-pin" style="--c:${color}">
      <div class="ctrl-ping"></div>
      <div class="ctrl-pin-body">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </div>
    </div>`,
    iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -17],
  });
}

function mkHqIcon(abbr: string) {
  return L.divIcon({
    className: '',
    html: `<div class="ctrl-hq-pin">
      <div class="ctrl-hq-ring r1"></div>
      <div class="ctrl-hq-ring r2"></div>
      <div class="ctrl-hq-body">${abbr.slice(0, 2).toUpperCase()}</div>
    </div>`,
    iconSize: [46, 46], iconAnchor: [23, 23], popupAnchor: [0, -27],
  });
}

function mkStopIcon(n: number, color: string) {
  return L.divIcon({
    className: '',
    html: `<div class="ctrl-stop" style="--c:${color}">${n}</div>`,
    iconSize: [22, 22], iconAnchor: [11, 11],
  });
}

function mkArrow(angle: number, color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="transform:rotate(${angle}deg);filter:drop-shadow(0 0 3px ${color})">
      <svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,0 12,10 0,10" fill="${color}" opacity="0.85"/></svg>
    </div>`,
    iconSize: [12, 12], iconAnchor: [6, 6],
  });
}

function addArrows(path: [number, number][], color: string, layer: L.LayerGroup) {
  const step = Math.max(1, Math.floor(path.length / 6));
  for (let i = step; i < path.length - 2; i += step) {
    const angle = -(Math.atan2(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) * 180) / Math.PI + 90;
    L.marker([path[i][0], path[i][1]], { icon: mkArrow(angle, color), interactive: false }).addTo(layer);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
export default function SupplierMap({
  suppliers, routes, onSupplierClick, singleSupplier, hq, activeSupplierFilter,
}: Props) {
  const containerRef        = useRef<HTMLDivElement>(null);
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const mapRef              = useRef<L.Map | null>(null);
  const clusterRef          = useRef<L.MarkerClusterGroup | null>(null);
  const routeLayerRef       = useRef<L.LayerGroup | null>(null);
  const hqLayerRef          = useRef<L.LayerGroup | null>(null);
  const routeEntriesRef     = useRef<RouteEntry[]>([]);
  const particlesRef        = useRef<Particle[]>([]);
  const onClickRef          = useRef(onSupplierClick);
  const suppliersRef        = useRef(suppliers);

  // Keep refs current without re-running heavy effects
  useEffect(() => { onClickRef.current = onSupplierClick; }, [onSupplierClick]);
  useEffect(() => { suppliersRef.current = suppliers; }, [suppliers]);

  // Register a stable global handler the popup button calls via onclick=""
  useEffect(() => {
    (window as any).__mapSupplierNav = (id: number) => {
      const s = suppliersRef.current.find(sup => sup.id === id);
      if (!s) return;
      if (onClickRef.current) onClickRef.current(s);
      else window.location.href = `/suppliers/${id}`;
    };
    return () => { delete (window as any).__mapSupplierNav; };
  }, []);

  // ── Map init ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [48, 15], zoom: 4, minZoom: 2, maxZoom: 18,
      zoomControl: true, worldCopyJump: true,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(map);

    clusterRef.current = L.markerClusterGroup({
      maxClusterRadius: 50, spiderfyOnMaxZoom: true, showCoverageOnHover: false,
      iconCreateFunction: (cluster) => {
        const n   = cluster.getChildCount();
        const col = n > 20 ? C.milkrun : n > 8 ? C.ltl : C.ftl;
        return L.divIcon({
          className: '',
          html: `<div class="ctrl-cluster" style="--c:${col}">${n}</div>`,
          iconSize: [40, 40], iconAnchor: [20, 20],
        });
      },
    });
    map.addLayer(clusterRef.current);
    routeLayerRef.current = L.layerGroup().addTo(map);
    hqLayerRef.current    = L.layerGroup().addTo(map);

    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Particle canvas loop ──────────────────────────────────────────────────────
  useEffect(() => {
    let frame: number;
    const loop = () => {
      const map    = mapRef.current;
      const canvas = canvasRef.current;
      if (map && canvas) {
        const r = containerRef.current?.getBoundingClientRect();
        if (r && (canvas.width !== r.width || canvas.height !== r.height)) {
          canvas.width = r.width; canvas.height = r.height;
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          particlesRef.current.forEach(p => {
            const entry = routeEntriesRef.current[p.idx];
            if (!entry || entry.path.length < 2) return;
            p.t = (p.t + p.speed) % 1;
            const raw = p.t * (entry.path.length - 1);
            const i0  = Math.floor(raw);
            const i1  = Math.min(i0 + 1, entry.path.length - 1);
            const f   = raw - i0;
            const lat = entry.path[i0][0] + (entry.path[i1][0] - entry.path[i0][0]) * f;
            const lng = entry.path[i0][1] + (entry.path[i1][1] - entry.path[i0][1]) * f;
            try {
              const pt = map.latLngToContainerPoint([lat, lng]);
              ctx.beginPath(); ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
              ctx.fillStyle = entry.color + '28'; ctx.fill();
              ctx.beginPath(); ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
              ctx.fillStyle   = entry.color;
              ctx.shadowColor = entry.color; ctx.shadowBlur = 10;
              ctx.fill(); ctx.shadowBlur = 0;
            } catch { /* map not ready */ }
          });
        }
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  // ── Suppliers ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!clusterRef.current || !mapRef.current) return;
    clusterRef.current.clearLayers();
    const markers: L.Marker[] = [];

    suppliers.forEach(s => {
      if (s.latitude == null || s.longitude == null) return;
      const color  = getIncotermColor(s.default_incoterm);
      const marker = L.marker([s.latitude, s.longitude], { icon: mkSupplierIcon(color) });
      marker.bindPopup(supplierPopupHtml(s, color), { className: 'ctrl-popup', maxWidth: 260 });

      // Marker click → open popup only; navigation happens via window.__mapSupplierNav in the button
      marker.on('click', () => marker.openPopup());
      markers.push(marker);
    });

    clusterRef.current.addLayers(markers);

    if (singleSupplier && suppliers.length === 1 && suppliers[0].latitude && suppliers[0].longitude) {
      mapRef.current.setView([suppliers[0].latitude, suppliers[0].longitude], 10);
    } else if (markers.length > 0 && !singleSupplier) {
      mapRef.current.fitBounds(L.featureGroup(markers).getBounds().pad(0.15));
    }
  }, [suppliers, onSupplierClick, singleSupplier]);

  // ── Routes ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!routeLayerRef.current) return;
    routeLayerRef.current.clearLayers();
    routeEntriesRef.current = [];
    particlesRef.current    = [];
    const layer = routeLayerRef.current;

    function spawnParticles(path: [number, number][], color: string, n: number) {
      const idx = routeEntriesRef.current.length;
      routeEntriesRef.current.push({ color, path });
      for (let i = 0; i < n; i++) {
        particlesRef.current.push({ t: Math.random(), speed: 0.00065 + Math.random() * 0.0004, idx });
      }
    }

    routes.forEach(route => {
      if (!route.waypoints || route.waypoints.length < 2) return;

      const st     = (route.shipment_type ?? 'ftl') as ShipmentType;
      const color  = st === 'milkrun' ? C.milkrun : st === 'ltl' ? C.ltl : C.ftl;
      const isDash = st === 'ltl';
      const popup  = routePopupHtml(route, color);

      const allSups = route.suppliers ?? [];
      const sups    = activeSupplierFilter?.length
        ? allSups.filter(s => activeSupplierFilter.includes(s.id))
        : allSups;

      // ── Milkrun ────────────────────────────────────────────────────────────
      if (st === 'milkrun') {
        if (hq && sups.some(s => s.latitude != null)) {
          const valid  = sups.filter(s => s.latitude != null && s.longitude != null);
          const sorted = [...valid].sort((a, b) => {
            const da = Math.hypot(a.latitude! - hq.lat, a.longitude! - hq.lng);
            const db = Math.hypot(b.latitude! - hq.lat, b.longitude! - hq.lng);
            return route.route_type === 'inbound' ? db - da : da - db;
          });
          const coords: [number, number][] = route.route_type === 'inbound'
            ? [...sorted.map(s => [s.latitude!, s.longitude!] as [number, number]), [hq.lat, hq.lng]]
            : [[hq.lat, hq.lng], ...sorted.map(s => [s.latitude!, s.longitude!] as [number, number])];

          const path = chainBezier(coords);
          // Outer glow
          L.polyline(path as L.LatLngExpression[], { color, weight: 14, opacity: 0.10, interactive: false }).addTo(layer);
          // Main line
          const line = L.polyline(path as L.LatLngExpression[], { color, weight: 3, opacity: 0.9 });
          line.bindPopup(popup, { className: 'ctrl-popup', maxWidth: 260 }); line.addTo(layer);
          addArrows(path, color, layer);
          sorted.forEach((s, i) => L.marker([s.latitude!, s.longitude!], { icon: mkStopIcon(i + 1, color) }).addTo(layer));
          spawnParticles(path, color, 6);
        } else {
          const path = route.waypoints.map(w => [w.lat, w.lng]) as [number, number][];
          const line = L.polyline(path as L.LatLngExpression[], { color, weight: 3, opacity: 0.9 });
          line.bindPopup(popup, { className: 'ctrl-popup' }); line.addTo(layer);
          spawnParticles(path, color, 4);
        }
        return;
      }

      // ── FTL / LTL ──────────────────────────────────────────────────────────
      if (hq && sups.some(s => s.latitude != null)) {
        sups.forEach(s => {
          if (s.latitude == null || s.longitude == null) return;
          const path = quadBezier([s.latitude, s.longitude], [hq.lat, hq.lng]);
          if (!isDash) L.polyline(path as L.LatLngExpression[], { color, weight: 10, opacity: 0.09, interactive: false }).addTo(layer);
          const line = L.polyline(path as L.LatLngExpression[], { color, weight: isDash ? 2 : 2.5, opacity: 0.88, dashArray: isDash ? '10,6' : undefined });
          line.bindPopup(popup, { className: 'ctrl-popup', maxWidth: 260 }); line.addTo(layer);
          L.circleMarker([s.latitude, s.longitude], { radius: 4, fillColor: color, color: '#fff', weight: 1.5, fillOpacity: 1 })
            .bindTooltip(s.company_name, { direction: 'top', offset: [0, -6] }).addTo(layer);
          spawnParticles(path, color, isDash ? 1 : 2);
        });
      } else {
        const path = route.waypoints.map(w => [w.lat, w.lng]) as [number, number][];
        if (!isDash) L.polyline(path as L.LatLngExpression[], { color, weight: 8, opacity: 0.09, interactive: false }).addTo(layer);
        const line = L.polyline(path as L.LatLngExpression[], { color, weight: isDash ? 2 : 2.5, opacity: 0.88, dashArray: isDash ? '10,6' : undefined });
        line.bindPopup(popup, { className: 'ctrl-popup' }); line.addTo(layer);
        route.waypoints.forEach((wp, i) => {
          if (i === 0 || i === route.waypoints.length - 1) {
            L.circleMarker([wp.lat, wp.lng], { radius: 5, fillColor: i === 0 ? color : '#10b981', color: '#fff', weight: 2, fillOpacity: 1 })
              .bindTooltip(wp.label ?? '', { direction: 'top' }).addTo(layer);
          }
        });
        spawnParticles(path, color, 2);
      }
    });
  }, [routes, hq, activeSupplierFilter]);

  // ── HQ marker ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hqLayerRef.current || !mapRef.current || !hq) return;
    hqLayerRef.current.clearLayers();
    L.marker([hq.lat, hq.lng], { icon: mkHqIcon(hq.name), zIndexOffset: 1000 })
      .bindPopup(`<div style="${PS}">
        <div style="background:#E8366D20;border-bottom:1px solid #E8366D40;padding:10px 14px;border-radius:10px 10px 0 0;">
          <div style="font-weight:800;font-size:15px;color:#E8366D;">${hq.name}</div>
          <div style="font-size:12px;color:#94a3b8;">Headquarters &middot; ${hq.city}, ${hq.country}</div>
        </div></div>`, { className: 'ctrl-popup', maxWidth: 240 })
      .bindTooltip(hq.name, { permanent: true, direction: 'top', offset: [0, -28], className: 'ctrl-hq-tip' })
      .addTo(hqLayerRef.current);
  }, [hq]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 450 }} />
    </div>
  );
}
