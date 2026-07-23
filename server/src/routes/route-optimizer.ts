import { Router, Request, Response } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth';
import { queryAll, queryOne, runSql, execSql } from '../db/schema';
import { regenerateRoutesFromPlans } from './routes';

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
  hubClusterRadiusKm: number;   // max distance between suppliers consolidating at the same hub (wider than a milkrun loop)
  ltlMaxPalletsPerTrip: number; // below this → LTL (too small to MR alone)
  costPerKmRoad: number;
  costPerKmMR: number;
  targetFillRateMin: number;    // fallback fill rate when true FTL is unreachable at any frequency
  maxTripsPerDay: number;       // upper bound on same-day pickups (2 = up to twice/day)
}

const DEFAULT_CONFIG: OptimizerConfig = {
  truckCapacityPlt: 33,
  truckCapacityKg: 24000,
  ftlFillThreshold: 0.65,
  mrMaxStops: 5,
  mrMaxRadiusKm: 300,
  hubDistanceKm: 600,
  hubClusterRadiusKm: 600,
  ltlMaxPalletsPerTrip: 4,
  costPerKmRoad: 1.5,
  costPerKmMR: 1.8,
  targetFillRateMin: 0.60,
  maxTripsPerDay: 1,
};

// Candidate pickup frequencies, in trips/week, from least- to most-frequent.
// Values below 1 are multi-week cycles (0.5 = every 2 weeks, 0.25 = every 4 weeks).
// maxTripsPerDay=1 caps the ladder at daily (5/week) — no same-day repeat pickups.
function buildFrequencyLadder(cfg: OptimizerConfig): number[] {
  const belowWeekly = [0.25, 1 / 3, 0.5];
  const weekly = [1, 2, 3, 5];
  const aboveDaily: number[] = [];
  for (let m = 2; m <= cfg.maxTripsPerDay; m++) aboveDaily.push(5 * m);
  return [...belowWeekly, ...weekly, ...aboveDaily];
}

// freq.palletsPerTrip is in capacity-space (stacking-adjusted floor positions) — correct for
// deciding truck count/frequency, but misleading as a user-facing "pallets on the truck" figure.
// The real physical pallet count per trip is the raw weekly volume spread across the chosen frequency.
function physicalPalletsPerTrip(rawWeeklyPallets: number, freqPerWeek: number): number {
  return freqPerWeek > 0 ? rawWeeklyPallets / freqPerWeek : rawWeeklyPallets;
}

// Human-readable cadence for a trips/week value
function frequencyLabel(freq: number): string {
  if (freq < 1) {
    const weeks = Math.round(1 / freq);
    return `Every ${weeks} week${weeks !== 1 ? 's' : ''}`;
  }
  if (freq === 5) return 'Daily';
  if (freq > 5 && freq % 5 === 0) return `${freq / 5}×/day`;
  return `${freq}×/week`;
}

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
  frequencyLabel: string;       // human-readable cadence, e.g. "Every 2 weeks", "2×/day"
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
function tspNearestNeighbour(stops: SupplierVolume[], plant: Plant = DEFAULT_PLANT): SupplierVolume[] {
  if (stops.length <= 1) return stops;
  const remaining = [...stops];
  // Start from supplier furthest from plant (pick it up first on the way in)
  remaining.sort((a, b) => haversine(b.lat, b.lng, plant.lat, plant.lng) - haversine(a.lat, a.lng, plant.lat, plant.lng));
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
function mrRouteKm(stops: SupplierVolume[], plant: Plant = DEFAULT_PLANT): number {
  if (!stops.length) return 0;
  let km = haversine(plant.lat, plant.lng, stops[0].lat, stops[0].lng);
  for (let i = 1; i < stops.length; i++) {
    km += haversine(stops[i - 1].lat, stops[i - 1].lng, stops[i].lat, stops[i].lng);
  }
  km += haversine(stops[stops.length - 1].lat, stops[stops.length - 1].lng, plant.lat, plant.lng);
  return Math.round(km);
}

// Stacking packs more physical pallets onto fewer floor positions, but each floor position then
// carries more weight — the truck's payload limit (kg) can bind before its floor-position count
// does. Returns the effective floor-position capacity once the weight ceiling is factored in.
function effectiveTruckCap(totalWeightKg: number, totalCapacityPallets: number, cfg: OptimizerConfig): number {
  if (totalCapacityPallets <= 0) return cfg.truckCapacityPlt;
  const kgPerFloorPosition = totalWeightKg / totalCapacityPallets;
  if (kgPerFloorPosition <= 0) return cfg.truckCapacityPlt;
  const weightConstrainedCap = cfg.truckCapacityKg / kgPerFloorPosition;
  return Math.min(cfg.truckCapacityPlt, weightConstrainedCap);
}

// ─── Optimal pickup frequency ─────────────────────────────────────────────────
// Always looks for a true FTL fit first, at the LEAST frequent cadence that achieves it —
// i.e. prefer one full truck every 2 weeks over five half-empty trucks every week.
// capOverride: effective capacity in floor positions, once weight limits are applied (see effectiveTruckCap).
function calcFrequency(weeklyPallets: number, cfg: OptimizerConfig, capOverride?: number): FreqResult {
  const cap = capOverride ?? cfg.truckCapacityPlt;
  const ladder = buildFrequencyLadder(cfg);
  const build = (freq: number, ppt: number): FreqResult => ({
    freqPerWeek: freq,
    palletsPerTrip: Math.min(cap, ppt),
    loadFactorPct: Math.round((Math.min(cap, ppt) / cap) * 100),
    trucksPerWeek: freq,
  });

  // 1) True FTL: lowest frequency whose load hits ftlFillThreshold without overflowing the truck
  for (const freq of ladder) {
    const ppt = weeklyPallets / freq;
    if (ppt <= cap && ppt / cap >= cfg.ftlFillThreshold) return build(freq, ppt);
  }
  // 2) No frequency reaches true FTL — settle for the lowest frequency meeting the softer target fill
  for (const freq of ladder) {
    const ppt = weeklyPallets / freq;
    if (ppt <= cap && ppt / cap >= cfg.targetFillRateMin) return build(freq, ppt);
  }
  // 3) Volume too large even at the highest frequency in the ladder → add extra trucks at max frequency
  const maxFreq = ladder[ladder.length - 1];
  if (weeklyPallets / maxFreq > cap) {
    const trips = Math.ceil(weeklyPallets / cap);
    return build(trips, weeklyPallets / trips);
  }
  // 4) Volume too small to reach even the soft target at any cadence — use the LEAST frequent
  //    rung available (e.g. once every 4 weeks) rather than defaulting to daily.
  const freq = ladder[0];
  return build(freq, weeklyPallets / freq);
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

// routeCounter must never restart at 1 while OPT-*-NNN ids from a previous session already exist
// in route_plans — doing so reliably collides (e.g. a second "OPT-FTL-001") and, since apply()
// used to blindly INSERT, silently duplicated routes instead of updating them.
function seedRouteCounter() {
  const rows = queryAll("SELECT route_description FROM route_plans WHERE route_description LIKE 'OPT-%'");
  let maxN = 0;
  for (const r of rows) {
    const m = (r.route_description || '').match(/^OPT-[A-Z]+-(\d+)$/);
    if (m) maxN = Math.max(maxN, parseInt(m[1]));
  }
  routeCounter = maxN + 1;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ─── MAIN OPTIMIZER ───────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function optimizeGroup(suppliers: SupplierVolume[], plant: Plant, cfg: OptimizerConfig): GeneratedRoute[] {
  const routes: GeneratedRoute[] = [];
  const assigned = new Set<string>();

  // capacityPallets (stacking-adjusted floor positions) drives truck-fill decisions;
  // weeklyPallets stays the raw physical count entered in Configure, for reporting.
  const withDist = suppliers.map(s => ({
    ...s,
    capacityPallets: s.effectivePallets ?? s.weeklyPallets,
    distToPlant: haversine(s.lat, s.lng, plant.lat, plant.lng),
  }));

  // ── Pass 1: FTL candidates ───────────────────────────────────────────────
  // Bin-pack into as many FULLY LOADED trucks as the weekly volume allows first — e.g. 45
  // capacity-pallets/week with a 33-pallet truck gives 1 truck at 100% load, not 2 trucks at
  // ~68% each. Whatever doesn't fill a complete truck becomes a remainder that flows into the
  // HUB/MR/LTL consolidation passes below, where it can combine with other suppliers' leftovers.
  // Working pool for passes 2-4: starts as a copy of withDist, mutated in place by pass 1
  // (replaced with a remainder entry, or dropped via `assigned`, per supplier).
  const pool = withDist.map(s => ({ ...s }));

  for (let i = 0; i < pool.length; i++) {
    const s = pool[i];
    // Weight can bind before floor positions do once pallets are stacked — use whichever is tighter.
    const effectiveCap = effectiveTruckCap(s.weightKgPerWeek, s.capacityPallets, cfg);
    const fullTrucks = Math.floor(s.capacityPallets / effectiveCap);

    if (fullTrucks >= 1) {
      const stackRatio = s.capacityPallets > 0 ? s.weeklyPallets / s.capacityPallets : 1;
      const rawUsed = fullTrucks * effectiveCap * stackRatio;      // physical pallets covered by the full-truck portion
      const kgUsed = s.weeklyPallets > 0 ? s.weightKgPerWeek * (rawUsed / s.weeklyPallets) : 0;
      const distKm = Math.round(s.distToPlant);
      const pickupDays = pickupDaysForFreq(fullTrucks);
      const transitDays = distKm < 300 ? 1 : distKm < 1000 ? 2 : 3;
      const deliveryDay = deliveryDayForPickup(pickupDays, transitDays);
      const remainderCapacity = s.capacityPallets - fullTrucks * effectiveCap;
      const remainderRaw = s.weeklyPallets - rawUsed;

      routes.push({
        routeId: nextRouteId('FTL'),
        transportType: 'FTL',
        suppliers: [s],
        sequence: [s.name],
        pickupDays,
        deliveryDayCode: deliveryDay,
        pickupTime: '06:00 - 14:00',
        arrivalTime: '08:00 - 16:00',
        freqPerWeek: fullTrucks,
        frequencyLabel: frequencyLabel(fullTrucks),
        trucksPerWeek: fullTrucks,
        palletsPerTrip: Math.round(effectiveCap * stackRatio),
        loadFactorPct: 100,
        totalPalletsWeekly: Math.round(rawUsed),
        totalWeightKgWeekly: Math.round(kgUsed),
        distanceKm: distKm,
        estimatedCostEurWeekly: estimateCost(distKm, fullTrucks, 'FTL', cfg),
        equipment: 'Standard Trailer',
        notes: [
          `FTL — 100% load factor (max full truckloads), ${frequencyLabel(fullTrucks)}`,
          ...(remainderCapacity > 0.01 ? [`${Math.round(remainderRaw)} pallets/week remain — consolidated below`] : []),
          ...(s.stackLevels && s.stackLevels > 1 ? [`Stacked ${s.stackLevels}× — floor positions, not physical pallet count, drive the load factor`] : []),
          ...(effectiveCap < cfg.truckCapacityPlt - 0.01 ? [`Weight-limited to ${Math.round(effectiveCap)} floor positions (truck payload cap), below the ${cfg.truckCapacityPlt}-position floor limit`] : []),
        ],
      });

      if (remainderCapacity > 0.01) {
        pool[i] = { ...s, weeklyPallets: remainderRaw, capacityPallets: remainderCapacity, weightKgPerWeek: s.weightKgPerWeek - kgUsed };
      } else {
        assigned.add(s.id);
      }
      continue;
    }

    // Volume doesn't fill even one truck — fall back to the frequency ladder (may still
    // qualify as FTL at a lower cadence, e.g. one full truck every 2 weeks).
    const freq = calcFrequency(s.capacityPallets, cfg, effectiveCap);
    if (freq.palletsPerTrip >= effectiveCap * cfg.ftlFillThreshold) {
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
        frequencyLabel: frequencyLabel(freq.freqPerWeek),
        trucksPerWeek: freq.trucksPerWeek,
        palletsPerTrip: Math.round(physicalPalletsPerTrip(s.weeklyPallets, freq.freqPerWeek)),
        loadFactorPct: freq.loadFactorPct,
        totalPalletsWeekly: s.weeklyPallets,
        totalWeightKgWeekly: s.weightKgPerWeek,
        distanceKm: distKm,
        estimatedCostEurWeekly: estimateCost(distKm, freq.freqPerWeek, 'FTL', cfg),
        equipment: 'Standard Trailer',
        notes: [
          `FTL — ${freq.loadFactorPct}% load factor, ${frequencyLabel(freq.freqPerWeek)}`,
          ...(s.stackLevels && s.stackLevels > 1 ? [`Stacked ${s.stackLevels}× — floor positions, not physical pallet count, drive the load factor`] : []),
        ],
      });
      assigned.add(s.id);
    }
  }

  // ── Pass 2: HUB candidates (far suppliers, not FTL) ─────────────────────
  const hubCandidates = pool.filter(s => !assigned.has(s.id) && s.distToPlant > cfg.hubDistanceKm);

  // Cluster HUB candidates by proximity to each other
  const hubAssigned = new Set<string>();
  for (const anchor of hubCandidates) {
    if (hubAssigned.has(anchor.id)) continue;
    const cluster = hubCandidates.filter(s =>
      !hubAssigned.has(s.id) && haversine(anchor.lat, anchor.lng, s.lat, s.lng) < cfg.hubClusterRadiusKm
    ).slice(0, cfg.mrMaxStops);

    if (cluster.length === 0) continue;
    cluster.forEach(s => hubAssigned.add(s.id));
    cluster.forEach(s => assigned.add(s.id));

    const totalPlt = cluster.reduce((sum, s) => sum + s.weeklyPallets, 0);
    const totalCapacityPlt = cluster.reduce((sum, s) => sum + s.capacityPallets, 0);
    const totalKg = cluster.reduce((sum, s) => sum + s.weightKgPerWeek, 0);
    const effectiveCap = effectiveTruckCap(totalKg, totalCapacityPlt, cfg);
    const freq = calcFrequency(totalCapacityPlt, cfg, effectiveCap);
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
      frequencyLabel: frequencyLabel(freq.freqPerWeek),
      trucksPerWeek: freq.trucksPerWeek,
      palletsPerTrip: Math.round(physicalPalletsPerTrip(totalPlt, freq.freqPerWeek)),
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
  // Any remaining supplier with volume is a candidate — small suppliers are exactly who
  // milkruns are for; excluding them here would just push them straight to standalone LTL.
  const mrCandidates = pool.filter(s => !assigned.has(s.id) && s.weeklyPallets > 0);

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
    const totalCapacityPlt = cluster.reduce((sum, s) => sum + s.capacityPallets, 0);
    const totalKg = cluster.reduce((sum, s) => sum + s.weightKgPerWeek, 0);
    const effectiveCap = effectiveTruckCap(totalKg, totalCapacityPlt, cfg);
    const freq = calcFrequency(totalCapacityPlt, cfg, effectiveCap);

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
      frequencyLabel: frequencyLabel(freq.freqPerWeek),
      trucksPerWeek: freq.trucksPerWeek,
      palletsPerTrip: Math.round(physicalPalletsPerTrip(totalPlt, freq.freqPerWeek)),
      loadFactorPct: freq.loadFactorPct,
      totalPalletsWeekly: totalPlt,
      totalWeightKgWeekly: totalKg,
      distanceKm: distKm,
      estimatedCostEurWeekly: estimateCost(distKm, freq.freqPerWeek, 'MR', cfg),
      equipment: 'Standard Trailer',
      notes: [
        `Milkrun — ${cluster.length} stops, ${distKm} km loop`,
        `${freq.loadFactorPct}% avg load factor, ${frequencyLabel(freq.freqPerWeek)}`,
      ],
    });
  }

  // ── Pass 4: LTL — remaining low-volume / standalone suppliers ───────────
  for (const s of pool) {
    if (assigned.has(s.id)) continue;
    if (s.weeklyPallets <= 0) { assigned.add(s.id); continue; }

    const distKm = Math.round(s.distToPlant);
    const effectiveCap = effectiveTruckCap(s.weightKgPerWeek, s.capacityPallets, cfg);
    const freq = calcFrequency(s.capacityPallets, cfg, effectiveCap);
    const pickupDays = pickupDaysForFreq(freq.freqPerWeek);
    routes.push({
      routeId: nextRouteId('LTL'),
      transportType: 'LTL',
      suppliers: [s],
      sequence: [s.name],
      pickupDays,
      deliveryDayCode: deliveryDayForPickup(pickupDays, 2),
      pickupTime: '08:00 - 16:00',
      arrivalTime: '08:00 - 16:00',
      freqPerWeek: freq.freqPerWeek,
      frequencyLabel: frequencyLabel(freq.freqPerWeek),
      trucksPerWeek: freq.trucksPerWeek,
      palletsPerTrip: Math.round(physicalPalletsPerTrip(s.weeklyPallets, freq.freqPerWeek)),
      loadFactorPct: freq.loadFactorPct,
      totalPalletsWeekly: s.weeklyPallets,
      totalWeightKgWeekly: s.weightKgPerWeek,
      distanceKm: distKm,
      estimatedCostEurWeekly: estimateCost(distKm, freq.freqPerWeek, 'LTL', cfg),
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
  seedRouteCounter();
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
    let updated = 0;

    // Upsert by route_description — re-applying the same or an overlapping optimizer run
    // must update existing route plan entries, never duplicate them.
    const upsertRoutePlan = (routeDesc: string, tourDesc: string | null, mode: string, origin: any, dest: any, route: GeneratedRoute) => {
      const values = [tourDesc, mode,
        origin.id, origin.name, origin.city, origin.country,
        dest.id, dest.name, dest.zip, dest.city, dest.country,
        route.pickupDays[0] || 'M0', route.pickupTime,
        route.deliveryDayCode, route.arrivalTime,
        route.equipment, route.distanceKm > 300 ? 2 : 1, 'inbound'];

      const existing = queryOne('SELECT id FROM route_plans WHERE route_description = ?', [routeDesc]);
      if (existing) {
        execSql(
          `UPDATE route_plans SET tour_description=?, transport_mode=?,
            origin_id=?, origin_name=?, origin_city=?, origin_country=?,
            destination_id=?, destination_name=?, destination_zip=?, destination_city=?, destination_country=?,
            pickup_date=?, pickup_time=?, delivery_date=?, arrival_time=?,
            equipment=?, transit_time_days=?, direction=?, updated_at=datetime('now')
           WHERE id=?`,
          [...values, existing.id]
        );
        updated++;
      } else {
        runSql(
          `INSERT INTO route_plans (route_description, tour_description, transport_mode,
            origin_id, origin_name, origin_city, origin_country,
            destination_id, destination_name, destination_zip, destination_city, destination_country,
            pickup_date, pickup_time, delivery_date, arrival_time,
            equipment, transit_time_days, direction, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'),datetime('now'))`,
          [routeDesc, ...values]
        );
        created++;
      }
    };

    for (const route of accepted) {
      const modeMap: Record<string, string> = { FTL: 'FTL', MR: 'MR', LTL: 'LTL', HUB: 'HUB' };
      const mode = modeMap[route.transportType] || 'FTL';

      // Determine destination plant from first supplier in route
      const firstSup = route.suppliers[0];
      const destId = firstSup?.destinationId || 'RT-HQ';
      const plant = KNOWN_PLANTS[destId] ?? DEFAULT_PLANT;

      if (route.transportType === 'MR' || route.suppliers.length > 1) {
        // Milkrun, or a multi-supplier HUB cluster: one route plan leg per stop, sharing a
        // tour_description so they're recognized as one physical tour (not lost/collapsed to one leg).
        route.suppliers.forEach((s, idx) => {
          const routeDesc = `${s.id}_${destId}/${mode.charAt(0)}${String(idx + 1).padStart(2, '0')}`;
          upsertRoutePlan(routeDesc, route.routeId, mode, { id: s.id, name: s.name, city: s.city, country: s.country }, plant, route);
        });
      } else {
        // FTL / LTL / single-supplier HUB — one entry per route. tour_description stays null:
        // it's a grouping key for multi-leg tours, not a place to restate the mode.
        const s = route.suppliers[0];
        upsertRoutePlan(route.routeId, null, mode,
          { id: s?.id || '', name: s?.name || '', city: s?.city || '', country: s?.country || '' }, plant, route);
      }
    }

    try { regenerateRoutesFromPlans(); } catch (e) { console.error('[route-optimizer] auto-sync to routes failed:', e); }
    res.json({ created, updated, message: `${created} new, ${updated} updated route plan entries from ${accepted.length} accepted routes` });
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
