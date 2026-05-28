import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { queryAll, runSql } from '../db/schema';

const router = Router();

// ─── City → approximate coordinates lookup ───────────────────────────────────
const CITY_COORDS: Record<string, [number, number]> = {
  // Germany
  'Stuttgart_Germany': [48.7758, 9.1829],
  'Regensburg_Germany': [49.0134, 12.1016],
  'Friedrichshafen_Germany': [47.6539, 9.4788],
  'Herzogenaurach_Germany': [49.5692, 10.8867],
  'Dettingen_Germany': [48.5295, 9.3817],
  'Lippstadt_Germany': [51.6724, 8.3435],
  'Stockdorf_Germany': [48.0748, 11.3779],
  'Reutlingen_Germany': [48.4927, 9.2041],
  'Memmingen_Germany': [47.9875, 10.1812],
  'Luedenscheid_Germany': [51.2210, 7.6311],
  'Cologne_Germany': [50.9333, 6.9603],
  'Dusseldorf_Germany': [51.2217, 6.7762],
  'Bremen_Germany': [53.0793, 8.8017],
  'Munich_Germany': [48.1351, 11.5820],
  'Frankfurt_Germany': [50.1109, 8.6821],
  'Hamburg_Germany': [53.5753, 10.0153],
  'Berlin_Germany': [52.5200, 13.4050],
  // France
  'Paris_France': [48.8566, 2.3522],
  'Nanterre_France': [48.8919, 2.2066],
  'Levallois-Perret_France': [48.8954, 2.2878],
  'Sandouville_France': [49.5166, 0.4969],
  'Sochaux_France': [47.5318, 6.7820],
  'Lyon_France': [45.7640, 4.8357],
  // Italy
  'Bologna_Italy': [44.4949, 11.3426],
  'Curno_Italy': [45.6999, 9.6205],
  'Sesto San Giovanni_Italy': [45.5354, 9.2295],
  'Melfi_Italy': [40.9952, 15.6510],
  'Milan_Italy': [45.4654, 9.1859],
  'Turin_Italy': [45.0703, 7.6869],
  // Poland
  'Krakow_Poland': [50.0647, 19.9450],
  'Wroclaw_Poland': [51.1079, 17.0385],
  'Czechowice_Poland': [49.9213, 18.9963],
  'Tychy_Poland': [50.1281, 18.9969],
  'Poznan_Poland': [52.4069, 16.9299],
  'Warsaw_Poland': [52.2298, 21.0118],
  // Netherlands / Belgium
  'Tilburg_Netherlands': [51.5607, 5.0838],
  'Ghent_Belgium': [51.0543, 3.7174],
  'Antwerp_Belgium': [51.2194, 4.4025],
  // Croatia
  'Zagreb_Croatia': [45.8150, 15.9820],
  'Zagreb_HR Croatia': [45.8150, 15.9820],
  // Other
  'Barcelona_Spain': [41.3851, 2.1734],
  'Madrid_Spain': [40.4168, -3.7038],
  'Prague_Czech Republic': [50.0755, 14.4378],
  'Vienna_Austria': [48.2082, 16.3738],
};

function geocodeCity(city: string, country: string): [number, number] | null {
  const key = `${city}_${country}`;
  if (CITY_COORDS[key]) return CITY_COORDS[key];
  // Partial match on city name
  const cityLower = city.toLowerCase();
  for (const [k, v] of Object.entries(CITY_COORDS)) {
    if (k.toLowerCase().startsWith(cityLower + '_')) return v;
  }
  return null;
}

// ─── Known destinations ───────────────────────────────────────────────────────
interface Plant { id: string; name: string; city: string; country: string; zip: string; lat: number; lng: number }
const KNOWN_PLANTS: Record<string, Plant> = {
  'RT-HQ':       { id: 'RT-HQ',       name: 'RT Automotive d.o.o.', city: 'Zagreb',      country: 'Croatia',   zip: '10000', lat: 45.815,  lng: 15.982 },
  'SANDOUVILLE': { id: 'SANDOUVILLE', name: 'Renault Assembly',      city: 'Sandouville', country: 'France',    zip: '76430', lat: 49.5166, lng: 0.4969 },
  'MELFI':       { id: 'MELFI',       name: 'FCA Plant',             city: 'Melfi',       country: 'Italy',     zip: '85025', lat: 40.9952, lng: 15.651 },
  'GHENT':       { id: 'GHENT',       name: 'Volvo Cars',            city: 'Ghent',       country: 'Belgium',   zip: '9000',  lat: 51.0543, lng: 3.7174 },
  'BREMEN':      { id: 'BREMEN',      name: 'Mercedes-Benz Plant',   city: 'Bremen',      country: 'Germany',   zip: '28309', lat: 53.0793, lng: 8.8017 },
  'POZNAN':      { id: 'POZNAN',      name: 'Volkswagen Plant',      city: 'Poznan',      country: 'Poland',    zip: '61001', lat: 52.4069, lng: 16.929 },
  'MUNICH':      { id: 'MUNICH',      name: 'BMW Plant',             city: 'Munich',      country: 'Germany',   zip: '80788', lat: 48.1351, lng: 11.582 },
  'COLOGNE':     { id: 'COLOGNE',     name: 'Ford Plant',            city: 'Cologne',     country: 'Germany',   zip: '50725', lat: 50.9333, lng: 6.9603 },
  'SOCHAUX':     { id: 'SOCHAUX',     name: 'PSA Peugeot',           city: 'Sochaux',     country: 'France',    zip: '25600', lat: 47.5318, lng: 6.7820 },
};

// Fallback plant for unknown destination IDs
const DEFAULT_PLANT = KNOWN_PLANTS['RT-HQ'];

// ─── Config defaults (overridable per request) ───────────────────────────────
interface OptimizerConfig {
  truckCapacityPlt: number;     // floor pallets in a standard trailer
  truckCapacityKg: number;
  ftlFillThreshold: number;     // fraction 0-1 → pallets/trip >= this → FTL
  mrMaxStops: number;
  mrMaxRadiusKm: number;        // max distance between any two suppliers in a milkrun
  hubDistanceKm: number;        // suppliers farther than this → HUB candidate
  ltlMaxPalletsPerTrip: number; // below this → LTL (too small to MR alone)
  costPerKmRoad: number;
  costPerKmMR: number;
  targetFillRateMin: number;    // aim for at least this fill rate
}

const DEFAULT_CONFIG: OptimizerConfig = {
  truckCapacityPlt: 33,
  truckCapacityKg: 24000,
  ftlFillThreshold: 0.65,
  mrMaxStops: 5,
  mrMaxRadiusKm: 300,
  hubDistanceKm: 600,
  ltlMaxPalletsPerTrip: 4,
  costPerKmRoad: 1.5,
  costPerKmMR: 1.8,
  targetFillRateMin: 0.60,
};

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SupplierVolume {
  id: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
  weeklyPallets: number;
  weightKgPerWeek: number;
  // Pallet dimensions (from CSV)
  palletLengthCm?: number;
  palletWidthCm?: number;
  palletHeightCm?: number;
  stackLevels?: number;
  effectivePallets?: number;  // weeklyPallets / stackLevels
  volumeM3PerWeek?: number;
  // Routing
  destinationId?: string;
  destinationName?: string;
  destinationCity?: string;
  destinationCountry?: string;
  destinationZip?: string;
  material?: string;
  priority?: string;
  timeWindow?: string;
}

interface FreqResult {
  freqPerWeek: number;
  palletsPerTrip: number;
  loadFactorPct: number;
  trucksPerWeek: number;
}

export interface GeneratedRoute {
  routeId: string;
  transportType: 'FTL' | 'MR' | 'LTL' | 'HUB';
  suppliers: SupplierVolume[];
  sequence: string[];           // ordered supplier names for display
  pickupDays: string[];         // e.g. ['M0','W0','F0']
  deliveryDayCode: string;      // e.g. 'T0'
  pickupTime: string;
  arrivalTime: string;
  freqPerWeek: number;
  trucksPerWeek: number;
  palletsPerTrip: number;
  loadFactorPct: number;
  totalPalletsWeekly: number;
  totalWeightKgWeekly: number;
  distanceKm: number;           // one-way km (MR: full loop km)
  estimatedCostEurWeekly: number;
  equipment: string;
  notes: string[];
  accepted?: boolean;           // user decision
}

interface OptimizerResult {
  routes: GeneratedRoute[];
  summary: {
    totalSuppliers: number;
    ftlCount: number; mrCount: number; ltlCount: number; hubCount: number;
    totalTrucksPerWeek: number;
    avgLoadFactor: number;
    estimatedWeeklyCostEur: number;
    suppliersWithNoRoute: string[];
  };
}

// ─── Haversine distance (km) ─────────────────────────────────────────────────
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Nearest-neighbour TSP for milkrun sequence ──────────────────────────────
function tspNearestNeighbour(stops: SupplierVolume[]): SupplierVolume[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  // Start from supplier furthest from plant (pick it up first on the way in)
  remaining.sort((a, b) => haversine(b.lat, b.lng, PLANT.lat, PLANT.lng) - haversine(a.lat, a.lng, PLANT.lat, PLANT.lng));
  const result: SupplierVolume[] = [remaining.shift()!];
  while (remaining.length) {
    const last = result[result.length - 1];
    let bestI = 0, bestD = Infinity;
    remaining.forEach((s, i) => {
      const d = haversine(last.lat, last.lng, s.lat, s.lng);
      if (d < bestD) { bestD = d; bestI = i; }
    });
    result.push(remaining.splice(bestI, 1)[0]);
  }
  return result;
}

// ─── Milkrun total route distance (loop: plant → stops → plant) ─────────────
function mrRouteKm(stops: SupplierVolume[]): number {
  if (!stops.length) return 0;
  let km = haversine(PLANT.lat, PLANT.lng, stops[0].lat, stops[0].lng);
  for (let i = 1; i < stops.length; i++) {
    km += haversine(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  }
  km += haversine(stops[stops.length - 1].lat, stops[stops.length - 1].lng, PLANT.lat, PLANT.lng);
  return Math.round(km);
}

// ─── Optimal pickup frequency ─────────────────────────────────────────────────
function calcFrequency(weeklyPallets: number, cfg: OptimizerConfig): FreqResult {
  const cap = cfg.truckCapacityPlt;
  // Try 5, 3, 2, 1 trips/week; pick lowest that keeps load ≥ targetFillRateMin
  for (const freq of [1, 2, 3, 5]) {
    const ppt = weeklyPallets / freq;
    if (ppt <= cap && ppt / cap >= cfg.targetFillRateMin) {
      return { freqPerWeek: freq, palletsPerTrip: ppt, loadFactorPct: Math.round((ppt / cap) * 100), trucksPerWeek: freq };
    }
  }
  // Volume exceeds 1 truck/day → multi-daily (just use 5)
  const ppt = weeklyPallets / 5;
  const trips = ppt > cap ? Math.ceil(weeklyPallets / cap) : 5;
  return {
    freqPerWeek: trips,
    palletsPerTrip: Math.min(cap, weeklyPallets / trips),
    loadFactorPct: Math.round((Math.min(cap, weeklyPallets / trips) / cap) * 100),
    trucksPerWeek: trips,
  };
}

// Day codes for frequency
const FREQ_PICKUPDAYS: Record<number, string[]> = {
  5: ['M0', 'T0', 'W0', 'R0', 'F0'],
  3: ['M0', 'W0', 'F0'],
  2: ['T0', 'R0'],
  1: ['M0'],
};
function pickupDaysForFreq(freq: number): string[] {
  if (freq >= 5) return FREQ_PICKUPDAYS[5];
  if (freq >= 3) return FREQ_PICKUPDAYS[3];
  if (freq >= 2) return FREQ_PICKUPDAYS[2];
  return FREQ_PICKUPDAYS[1];
}
function deliveryDayForPickup(pickupDays: string[], transitDays: number): string {
  const dayMap: Record<string, number> = { M: 1, T: 2, W: 3, R: 4, F: 5 };
  const revMap: Record<number, string> = { 1: 'M', 2: 'T', 3: 'W', 4: 'R', 5: 'F', 6: 'S' };
  if (!pickupDays.length) return 'T0';
  const pickLetter = pickupDays[0][0];
  const pickDay = dayMap[pickLetter] || 1;
  const delDay = pickDay + transitDays;
  const weekCode = delDay > 5 ? '1' : '0';
  const letter = revMap[((delDay - 1) % 5) + 1] || 'M';
  return `${letter}${weekCode}`;
}

// ─── Cost estimate ───────────────────────────────────────────────────────────
function estimateCost(distKm: number, freqPerWeek: number, type: string, cfg: OptimizerConfig): number {
  const ratePerKm = type === 'MR' ? cfg.costPerKmMR : cfg.costPerKmRoad;
  return Math.round(distKm * 2 * ratePerKm * freqPerWeek); // round-trip × freq
}

// ─── Route ID generator ───────────────────────────────────────────────────────
let routeCounter = 1;
function nextRouteId(type: string): string {
  return `OPT-${type}-${String(routeCounter++).padStart(3, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN OPTIMIZER ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function optimizeGroup(suppliers: SupplierVolume[], plant: Plant, cfg: OptimizerConfig): GeneratedRoute[] {
  const routes: GeneratedRoute[] = [];
  const assigned = new Set<string>();

  // Use effectivePallets (stacking-adjusted floor positions) for capacity decisions
  const withDist = suppliers.map(s => ({
    ...s,
    // Use effectivePallets if provided, otherwise fall back to weeklyPallets
    weeklyPallets: s.effectivePallets ?? s.weeklyPallets,
    distToPlant: haversine(s.lat, s.lng, plant.lat, plant.lng),
  }));

  // ── Pass 1: FTL candidates ───────────────────────────────────────────────
  const ftlThresholdPlt = cfg.truckCapacityPlt * cfg.ftlFillThreshold;

  for (const s of withDist) {
    const freq = calcFrequency(s.weeklyPallets, cfg);
    if (freq.palletsPerTrip >= ftlThresholdPlt) {
      const distKm = Math.round(s.distToPlant);
      const pickupDays = pickupDaysForFreq(freq.freqPerWeek);
      const transitDays = distKm < 300 ? 1 : distKm < 1000 ? 2 : 3;
      const deliveryDay = deliveryDayForPickup(pickupDays, transitDays);
      routes.push({
        routeId: nextRouteId('FTL'),
        transportType: 'FTL',
        suppliers: [s],
        sequence: [s.name],
        pickupDays,
        deliveryDayCode: deliveryDay,
        pickupTime: '06:00 - 14:00',
        arrivalTime: '08:00 - 16:00',
        freqPerWeek: freq.freqPerWeek,
        trucksPerWeek: freq.trucksPerWeek,
        palletsPerTrip: Math.round(freq.palletsPerTrip),
        loadFactorPct: freq.loadFactorPct,
        totalPalletsWeekly: s.weeklyPallets,
        totalWeightKgWeekly: s.weightKgPerWeek,
        distanceKm: distKm,
        estimatedCostEurWeekly: estimateCost(distKm, freq.freqPerWeek, 'FTL', cfg),
        equipment: 'Standard Trailer',
        notes: [`FTL — ${freq.loadFactorPct}% load factor, ${freq.freqPerWeek}×/week`],
      });
      assigned.add(s.id);
    }
  }

  // ── Pass 2: HUB candidates (far suppliers, not FTL) ─────────────────────
  const hubCandidates = withDist.filter(s => !assigned.has(s.id) && s.distToPlant > cfg.hubDistanceKm);

  // Cluster HUB candidates by proximity to each other
  const hubAssigned = new Set<string>();
  for (const anchor of hubCandidates) {
    if (hubAssigned.has(anchor.id)) continue;
    const cluster = hubCandidates.filter(s =>
      !hubAssigned.has(s.id) && haversine(anchor.lat, anchor.lng, s.lat, s.lng) < cfg.mrMaxRadiusKm
    ).slice(0, cfg.mrMaxStops);

    if (cluster.length === 0) continue;
    cluster.forEach(s => hubAssigned.add(s.id));
    cluster.forEach(s => assigned.add(s.id));

    const totalPlt = cluster.reduce((sum, s) => sum + s.weeklyPallets, 0);
    const totalKg = cluster.reduce((sum, s) => sum + s.weightKgPerWeek, 0);
    const freq = calcFrequency(totalPlt, cfg);
    // Hub center of gravity
    const hubLat = cluster.reduce((sum, s) => sum + s.lat, 0) / cluster.length;
    const hubLng = cluster.reduce((sum, s) => sum + s.lng, 0) / cluster.length;
    const distToHub = Math.round(cluster.reduce((sum, s) => sum + haversine(s.lat, s.lng, hubLat, hubLng), 0) / cluster.length);
    const distHubToPlant = Math.round(haversine(hubLat, hubLng, plant.lat, plant.lng));
    const totalDist = distToHub + distHubToPlant;
    const pickupDays = pickupDaysForFreq(freq.freqPerWeek);

    routes.push({
      routeId: nextRouteId('HUB'),
      transportType: 'HUB',
      suppliers: cluster,
      sequence: cluster.map(s => s.name),
      pickupDays,
      deliveryDayCode: deliveryDayForPickup(pickupDays, 3),
      pickupTime: '08:00 - 16:00',
      arrivalTime: '08:00 - 16:00',
      freqPerWeek: freq.freqPerWeek,
      trucksPerWeek: freq.trucksPerWeek,
      palletsPerTrip: Math.round(freq.palletsPerTrip),
      loadFactorPct: freq.loadFactorPct,
      totalPalletsWeekly: totalPlt,
      totalWeightKgWeekly: totalKg,
      distanceKm: totalDist,
      estimatedCostEurWeekly: estimateCost(totalDist, freq.freqPerWeek, 'HUB', cfg),
      equipment: 'Standard Trailer',
      notes: [
        `HUB consolidation — ${cluster.length} supplier(s)`,
        `Hub CoG ≈ ${hubLat.toFixed(2)}°N, ${hubLng.toFixed(2)}°E`,
        `Avg dist to hub: ~${distToHub} km · Hub to plant: ~${distHubToPlant} km`,
      ],
    });
  }

  // ── Pass 3: Milkrun clustering (remaining unassigned, not HUB) ──────────
  const mrCandidates = withDist.filter(s => !assigned.has(s.id) && s.weeklyPallets >= cfg.ltlMaxPalletsPerTrip);

  // Greedy clustering: find densest unassigned supplier, cluster nearby ones
  const mrAssigned = new Set<string>();
  // Sort by number of neighbours (desc) → densest first
  const mrSorted = [...mrCandidates].sort((a, b) => {
    const na = mrCandidates.filter(s => s.id !== a.id && haversine(a.lat, a.lng, s.lat, s.lng) < cfg.mrMaxRadiusKm).length;
    const nb = mrCandidates.filter(s => s.id !== b.id && haversine(b.lat, b.lng, s.lat, s.lng) < cfg.mrMaxRadiusKm).length;
    return nb - na;
  });

  for (const anchor of mrSorted) {
    if (mrAssigned.has(anchor.id)) continue;
    // Collect nearby suppliers within radius, up to maxStops-1 additional
    const neighbours = mrCandidates
      .filter(s => !mrAssigned.has(s.id) && s.id !== anchor.id && haversine(anchor.lat, anchor.lng, s.lat, s.lng) < cfg.mrMaxRadiusKm)
      .sort((a, b) => haversine(anchor.lat, anchor.lng, a.lat, a.lng) - haversine(anchor.lat, anchor.lng, b.lat, b.lng))
      .slice(0, cfg.mrMaxStops - 1);

    // Only form MR if >= 2 suppliers (otherwise leave for LTL)
    if (neighbours.length === 0) continue;

    const cluster = [anchor, ...neighbours];

    // Check combined volume: if combined load factor >= FTL threshold, check if individual FTL would be better
    const totalPlt = cluster.reduce((sum, s) => sum + s.weeklyPallets, 0);
    const totalKg = cluster.reduce((sum, s) => sum + s.weightKgPerWeek, 0);
    const freq = calcFrequency(totalPlt, cfg);

    // Too many trucks → split; otherwise accept cluster
    cluster.forEach(s => mrAssigned.add(s.id));
    cluster.forEach(s => assigned.add(s.id));

    const ordered = tspNearestNeighbour(cluster);
    const distKm = mrRouteKm(ordered);
    const pickupDays = pickupDaysForFreq(freq.freqPerWeek);
    const transitDays = Math.max(...cluster.map(s => s.distToPlant)) < 300 ? 1 : 2;

    routes.push({
      routeId: nextRouteId('MR'),
      transportType: 'MR',
      suppliers: ordered,
      sequence: ordered.map(s => s.name),
      pickupDays,
      deliveryDayCode: deliveryDayForPickup(pickupDays, transitDays),
      pickupTime: '06:00 - 14:00',
      arrivalTime: '08:00 - 15:00',
      freqPerWeek: freq.freqPerWeek,
      trucksPerWeek: freq.trucksPerWeek,
      palletsPerTrip: Math.round(freq.palletsPerTrip),
      loadFactorPct: freq.loadFactorPct,
      totalPalletsWeekly: totalPlt,
      totalWeightKgWeekly: totalKg,
      distanceKm: distKm,
      estimatedCostEurWeekly: estimateCost(distKm, freq.freqPerWeek, 'MR', cfg),
      equipment: 'Standard Trailer',
      notes: [
        `Milkrun — ${cluster.length} stops, ${distKm} km loop`,
        `${freq.loadFactorPct}% avg load factor, ${freq.freqPerWeek}×/week`,
      ],
    });
  }

  // ── Pass 4: LTL — remaining low-volume / standalone suppliers ───────────
  for (const s of withDist) {
    if (assigned.has(s.id)) continue;
    if (s.weeklyPallets <= 0) { assigned.add(s.id); continue; }

    const distKm = Math.round(s.distToPlant);
    const freq = calcFrequency(s.weeklyPallets, cfg);
    const pickupDays = pickupDaysForFreq(1);
    routes.push({
      routeId: nextRouteId('LTL'),
      transportType: 'LTL',
      suppliers: [s],
      sequence: [s.name],
      pickupDays,
      deliveryDayCode: deliveryDayForPickup(pickupDays, 2),
      pickupTime: '08:00 - 16:00',
      arrivalTime: '08:00 - 16:00',
      freqPerWeek: 1,
      trucksPerWeek: 1,
      palletsPerTrip: Math.round(s.weeklyPallets),
      loadFactorPct: Math.round((s.weeklyPallets / cfg.truckCapacityPlt) * 100),
      totalPalletsWeekly: s.weeklyPallets,
      totalWeightKgWeekly: s.weightKgPerWeek,
      distanceKm: distKm,
      estimatedCostEurWeekly: estimateCost(distKm, 1, 'LTL', cfg),
      equipment: 'Short Trailer',
      notes: [
        `LTL — low volume (${s.weeklyPallets} plt/week), shared load recommended`,
        `Destination: ${plant.name} (${plant.city})`,
      ],
    });
    assigned.add(s.id);
  }

  return routes;
}

// ─── Top-level optimizer: geocodes, groups by destination, runs optimizeGroup ─
function optimize(rawSuppliers: SupplierVolume[], config: Partial<OptimizerConfig> = {}): OptimizerResult {
  const cfg: OptimizerConfig = { ...DEFAULT_CONFIG, ...config };
  routeCounter = 1;
  const noRoute: string[] = [];

  // 1. Geocode suppliers that have no coordinates
  const suppliers = rawSuppliers.map(s => {
    if (s.lat && s.lng) return s;
    const coords = geocodeCity(s.city, s.country);
    if (coords) return { ...s, lat: coords[0], lng: coords[1] };
    noRoute.push(s.name + ' (no coordinates)');
    return s; // optimizer will skip if still 0,0
  });

  // 2. Group by destination ID
  const groups = new Map<string, SupplierVolume[]>();
  for (const s of suppliers) {
    const destId = s.destinationId || 'RT-HQ';
    if (!groups.has(destId)) groups.set(destId, []);
    groups.get(destId)!.push(s);
  }

  // 3. Run optimizer per group
  const allRoutes: GeneratedRoute[] = [];
  for (const [destId, group] of groups) {
    const plant = KNOWN_PLANTS[destId] ?? {
      ...DEFAULT_PLANT,
      id: destId,
      name: group[0].destinationName || destId,
      city: group[0].destinationCity || '',
      country: group[0].destinationCountry || '',
      zip: group[0].destinationZip || '',
      lat: geocodeCity(group[0].destinationCity || '', group[0].destinationCountry || '')?.[0] ?? DEFAULT_PLANT.lat,
      lng: geocodeCity(group[0].destinationCity || '', group[0].destinationCountry || '')?.[1] ?? DEFAULT_PLANT.lng,
    };
    const validGroup = group.filter(s => s.lat || s.lng); // skip ungeocodeable
    if (validGroup.length) allRoutes.push(...optimizeGroup(validGroup, plant, cfg));
  }

  const ftlCount  = allRoutes.filter(r => r.transportType === 'FTL').length;
  const mrCount   = allRoutes.filter(r => r.transportType === 'MR').length;
  const ltlCount  = allRoutes.filter(r => r.transportType === 'LTL').length;
  const hubCount  = allRoutes.filter(r => r.transportType === 'HUB').length;
  const totalTrucks = allRoutes.reduce((sum, r) => sum + r.trucksPerWeek, 0);
  const avgLoad = allRoutes.length ? Math.round(allRoutes.reduce((sum, r) => sum + r.loadFactorPct, 0) / allRoutes.length) : 0;
  const weeklyCost = allRoutes.reduce((sum, r) => sum + r.estimatedCostEurWeekly, 0);

  return {
    routes: allRoutes,
    summary: {
      totalSuppliers: rawSuppliers.length,
      ftlCount, mrCount, ltlCount, hubCount,
      totalTrucksPerWeek: totalTrucks,
      avgLoadFactor: avgLoad,
      estimatedWeeklyCostEur: weeklyCost,
      suppliersWithNoRoute: noRoute,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── ROUTES ───────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// POST /api/route-optimizer/analyze
// Body: { suppliers: SupplierVolume[], config?: Partial<OptimizerConfig> }
router.post('/analyze', authenticate, (req: Request, res: Response) => {
  try {
    const { suppliers, config } = req.body as { suppliers: SupplierVolume[]; config?: Partial<OptimizerConfig> };
    if (!Array.isArray(suppliers) || suppliers.length === 0) {
      return res.status(400).json({ error: 'suppliers array is required' });
    }
    // Only weeklyPallets is required; lat/lng are geocoded from city/country if missing
    const invalid = suppliers.filter(s => s.weeklyPallets == null || isNaN(s.weeklyPallets));
    if (invalid.length) {
      return res.status(400).json({ error: `${invalid.length} supplier(s) missing Pallets_per_Week`, invalid: invalid.map(s => s.name) });
    }
    const result = optimize(suppliers, config || {});
    res.json(result);
  } catch (err: any) {
    console.error('[ROUTE OPTIMIZER] analyze error:', err);
    res.status(500).json({ error: err.message || 'Optimization failed' });
  }
});

// POST /api/route-optimizer/apply
// Accepts approved routes and writes them to route_plans table
router.post('/apply', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const { routes } = req.body as { routes: GeneratedRoute[] };
    if (!Array.isArray(routes) || routes.length === 0) {
      return res.status(400).json({ error: 'routes array is required' });
    }

    const accepted = routes.filter(r => r.accepted !== false);
    let created = 0;

    for (const route of accepted) {
      const modeMap: Record<string, string> = { FTL: 'FTL', MR: 'MR', LTL: 'LTL', HUB: 'HUB' };
      const mode = modeMap[route.transportType] || 'FTL';

      // Determine destination plant from first supplier in route
      const firstSup = route.suppliers[0];
      const destId = firstSup?.destinationId || 'RT-HQ';
      const plant = KNOWN_PLANTS[destId] ?? DEFAULT_PLANT;

      if (route.transportType === 'MR') {
        // For milkrun: create one route plan entry per supplier stop
        route.suppliers.forEach((s, idx) => {
          const routeDesc = `${s.id}_${destId}/${mode.charAt(0)}${String(idx + 1).padStart(2, '0')}`;
          const tourDesc = route.routeId;
          runSql(
            `INSERT INTO route_plans (route_description, tour_description, transport_mode,
              origin_id, origin_name, origin_city, origin_country,
              destination_id, destination_name, destination_zip, destination_city, destination_country,
              pickup_date, pickup_time, delivery_date, arrival_time,
              equipment, transit_time_days, direction, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
            [routeDesc, tourDesc, mode,
              s.id, s.name, s.city, s.country,
              plant.id, plant.name, plant.zip, plant.city, plant.country,
              route.pickupDays[0] || 'M0', route.pickupTime,
              route.deliveryDayCode, route.arrivalTime,
              route.equipment, route.distanceKm > 300 ? 2 : 1,
              'inbound']
          );
          created++;
        });
      } else {
        // FTL / LTL / HUB — one entry per route
        const s = route.suppliers[0];
        const routeDesc = route.routeId;
        runSql(
          `INSERT INTO route_plans (route_description, tour_description, transport_mode,
            origin_id, origin_name, origin_city, origin_country,
            destination_id, destination_name, destination_zip, destination_city, destination_country,
            pickup_date, pickup_time, delivery_date, arrival_time,
            equipment, transit_time_days, direction, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [routeDesc, route.transportType, mode,
            s?.id || '', s?.name || '', s?.city || '', s?.country || '',
            plant.id, plant.name, plant.zip, plant.city, plant.country,
            route.pickupDays[0] || 'M0', route.pickupTime,
            route.deliveryDayCode, route.arrivalTime,
            route.equipment, route.distanceKm > 300 ? 2 : 1,
            'inbound']
        );
        created++;
      }
    }

    res.json({ created, message: `${created} route plan entries created from ${accepted.length} accepted routes` });
  } catch (err: any) {
    console.error('[ROUTE OPTIMIZER] apply error:', err);
    res.status(500).json({ error: err.message || 'Failed to apply routes' });
  }
});

// GET /api/route-optimizer/suppliers-with-coords
// Returns existing suppliers that have lat/lng (usable for optimizer)
router.get('/suppliers-with-coords', authenticate, (_req: Request, res: Response) => {
  try {
    const rows = queryAll(
      `SELECT s.id, s.supplier_id, s.company_name, s.city, s.country, s.latitude, s.longitude, s.default_incoterm
       FROM suppliers s
       WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL AND s.status = 'active'
       ORDER BY s.company_name`
    );
    res.json({ suppliers: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
