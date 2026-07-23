import { Router, Request, Response } from 'express';
import { queryAll, queryOne, runSql, execSql } from '../db/schema';
import { authenticate, requireAdmin } from '../middleware/auth';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import multer from 'multer';
import * as XLSX from 'xlsx';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// CSV Export routes
router.get('/export/csv', authenticate, (req: Request, res: Response) => {
  const routes = queryAll('SELECT * FROM transport_routes ORDER BY created_at DESC');

  const rows = routes.map((r: any) => {
    const suppliers = queryAll(
      'SELECT s.supplier_id, s.company_name FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ?',
      [r.id]
    );
    const waypoints = JSON.parse(r.waypoints);
    return {
      name: r.name,
      route_type: r.route_type,
      transport_mode: r.transport_mode,
      carrier_name: r.carrier_name || '',
      transit_days: r.transit_days || '',
      suppliers: suppliers.map((s: any) => s.supplier_id).join(';'),
      waypoints: waypoints.map((w: any) => `${w.lat},${w.lng}${w.label ? `,${w.label}` : ''}`).join(';')
    };
  });

  const csv = stringify(rows, { header: true });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=routes.csv');
  res.send(csv);
});

// CSV Import routes
router.post('/import/csv', authenticate, requireAdmin, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  let records: any[];
  try {
    const isExcel = /\.(xlsx|xls)$/i.test(req.file.originalname) ||
      req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      req.file.mimetype === 'application/vnd.ms-excel';

    if (isExcel) {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    } else {
      let content = req.file.buffer.toString('utf-8');
      if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
      records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
    }
  } catch (e: any) {
    return res.status(400).json({ error: `Could not read file: ${e.message || 'invalid or corrupt file'}` });
  }

  if (!records.length) return res.status(400).json({ error: 'File has no rows to import' });

  let imported = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const record of records) {
    const { name, route_type, transport_mode, carrier_name, transit_days, suppliers: supplierStr, waypoints: waypointStr } = record;
    try {
      if (!name || !route_type || !transport_mode) {
        errors.push(`Skipped "${name || 'unnamed'}": missing required fields`);
        continue;
      }

      // Parse waypoints: "lat,lng,label;lat,lng,label;..."
      const waypoints = (waypointStr || '').split(';').filter(Boolean).map((wp: string) => {
        const parts = wp.split(',');
        return { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]), label: parts[2] || '' };
      });

      if (waypoints.length < 2) {
        errors.push(`Skipped "${name}": needs at least 2 waypoints`);
        continue;
      }

      const existing = queryOne('SELECT id FROM transport_routes WHERE name = ?', [name]);
      let id: number;
      if (existing) {
        id = existing.id;
        execSql(
          `UPDATE transport_routes SET route_type=?, transport_mode=?, carrier_name=?, transit_days=?, waypoints=?, updated_at=datetime('now') WHERE id=?`,
          [route_type, transport_mode, carrier_name || null, transit_days ? parseInt(transit_days) : null, JSON.stringify(waypoints), id]
        );
        execSql('DELETE FROM route_suppliers WHERE route_id = ?', [id]);
        updated++;
      } else {
        id = runSql(
          'INSERT INTO transport_routes (name, route_type, transport_mode, carrier_name, transit_days, waypoints) VALUES (?, ?, ?, ?, ?, ?)',
          [name, route_type, transport_mode, carrier_name || null, transit_days ? parseInt(transit_days) : null, JSON.stringify(waypoints)]
        ).lastId;
        imported++;
      }

      // Link suppliers by supplier_id
      if (supplierStr) {
        const supplierIds = supplierStr.split(';').filter(Boolean);
        for (const sid of supplierIds) {
          const supplier = queryOne('SELECT id FROM suppliers WHERE supplier_id = ?', [sid.trim()]);
          if (supplier) {
            runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [id, supplier.id]);
          }
        }
      }
    } catch (e: any) {
      errors.push(`Error on "${name || 'unknown'}": ${e.message}`);
    }
  }

  res.json({ message: `Imported ${imported} new, updated ${updated} existing routes`, imported, updated, errors });
});

// JSON export (all data for Excel generation on client)
router.get('/export/json', authenticate, (req: Request, res: Response) => {
  const routes = queryAll('SELECT * FROM transport_routes ORDER BY created_at DESC');
  const enriched = routes.map((r: any) => {
    const suppliers = queryAll(
      'SELECT s.supplier_id, s.company_name FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ?',
      [r.id]
    );
    return { ...r, waypoints: JSON.parse(r.waypoints), suppliers };
  });
  res.json(enriched);
});

const EUROPE_COUNTRIES = new Set([
  'germany', 'france', 'spain', 'italy', 'austria', 'czech republic', 'poland', 'croatia', 'slovenia',
  'romania', 'hungary', 'slovakia', 'turkey', 'united kingdom', 'sweden', 'portugal', 'netherlands',
  'belgium', 'switzerland', 'ireland', 'denmark', 'finland', 'norway', 'greece', 'bulgaria', 'hr croatia',
]);

// Regenerate all routes (map lanes) from the current route plans (wipes existing routes).
// Exported so other routers (route plan CRUD, AI optimizer apply) can keep the map in sync
// automatically whenever route_plans changes, without an internal HTTP round-trip.
export function regenerateRoutesFromPlans(): { created: number; skipped: number } {
  const plans = queryAll('SELECT * FROM route_plans ORDER BY route_description');
  if (!plans.length) {
    execSql('DELETE FROM transport_routes');
    return { created: 0, skipped: 0 };
  }

  const settings = queryAll('SELECT key, value FROM company_settings');
  const settingsMap: Record<string, string> = {};
  for (const s of settings) settingsMap[s.key] = s.value;
  const hqLat = parseFloat(settingsMap.hq_latitude || '45.8150');
  const hqLng = parseFloat(settingsMap.hq_longitude || '15.9819');
  const hqName = settingsMap.full_name || 'HQ';

  execSql('DELETE FROM transport_routes');

  // route_plans.transport_mode (FTL/LTL/MR/HUB) -> frontend ShipmentType ('ftl'|'ltl'|'milkrun'|'hub')
  const SHIPMENT_TYPE_MAP: Record<string, string> = { FTL: 'ftl', LTL: 'ltl', MR: 'milkrun', HUB: 'hub' };
  const hqPoint = { lat: hqLat, lng: hqLng, label: hqName };

  const eligible = plans.filter((p: any) => p.direction === 'inbound' || p.direction === 'outbound');
  const skipped = plans.length - eligible.length;

  // Milkrun legs that share a tour_description are stops on ONE physical tour, not separate routes.
  // Sequence numbers (…/M01, /M02…) are assigned in stop order when the tour is created (manually or by the AI optimizer).
  const milkrunGroups = new Map<string, any[]>();
  const singleRows: any[] = [];
  for (const plan of eligible) {
    if (plan.transport_mode === 'MR' && plan.tour_description) {
      const key = `${plan.tour_description}::${plan.direction}`;
      if (!milkrunGroups.has(key)) milkrunGroups.set(key, []);
      milkrunGroups.get(key)!.push(plan);
    } else {
      singleRows.push(plan);
    }
  }

  let created = 0;
  let skippedNoSupplier = 0;

  const resolveSupplier = (plan: any) => {
    const code = plan.direction === 'outbound' ? plan.destination_id : plan.origin_id;
    return code ? queryOne('SELECT * FROM suppliers WHERE supplier_id = ?', [code]) : null;
  };

  // Single-supplier routes (FTL/LTL/HUB, or standalone MR legs with no shared tour)
  for (const plan of singleRows) {
    try {
      const supplier = resolveSupplier(plan);
      if (!supplier || supplier.latitude == null || supplier.longitude == null) { skippedNoSupplier++; continue; }

      const isEurope = EUROPE_COUNTRIES.has((supplier.country || '').trim().toLowerCase());
      const transport_mode = isEurope ? 'road' : 'sea';
      const shipment_type = SHIPMENT_TYPE_MAP[plan.transport_mode] || 'ftl';
      const supplierPoint = { lat: supplier.latitude, lng: supplier.longitude, label: supplier.company_name };
      const waypoints = plan.direction === 'outbound' ? [hqPoint, supplierPoint] : [supplierPoint, hqPoint];

      const { lastId: id } = runSql(
        `INSERT INTO transport_routes (name, route_description, tour_description, route_type, transport_mode, shipment_type, carrier_name, transit_days, waypoints)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [plan.route_description, plan.route_description, plan.tour_description || null, plan.direction, transport_mode,
          shipment_type, plan.carrier || null, plan.transit_time_days || null, JSON.stringify(waypoints)]
      );
      runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [id, supplier.id]);
      created++;
    } catch {
      skippedNoSupplier++;
    }
  }

  // Multi-stop milkrun tours: one route per tour_description, waypoints ordered by leg sequence number
  for (const [key, legs] of milkrunGroups) {
    try {
      const seqOf = (p: any) => parseInt((p.route_description.match(/\/M(\d+)$/) || [])[1] || '0');
      legs.sort((a, b) => seqOf(a) - seqOf(b));

      const stops: { point: any; supplierRowId: number }[] = [];
      for (const leg of legs) {
        const supplier = resolveSupplier(leg);
        if (!supplier || supplier.latitude == null || supplier.longitude == null) continue;
        stops.push({ point: { lat: supplier.latitude, lng: supplier.longitude, label: supplier.company_name }, supplierRowId: supplier.id });
      }
      if (!stops.length) { skippedNoSupplier += legs.length; continue; }

      const direction = legs[0].direction;
      const anyEurope = stops.some(s => {
        const sup = queryOne('SELECT country FROM suppliers WHERE id = ?', [s.supplierRowId]);
        return EUROPE_COUNTRIES.has((sup?.country || '').trim().toLowerCase());
      });
      const transport_mode = anyEurope ? 'road' : 'sea';
      const waypoints = direction === 'outbound'
        ? [hqPoint, ...stops.map(s => s.point)]
        : [...stops.map(s => s.point), hqPoint];

      const tourName = legs[0].tour_description;
      const { lastId: id } = runSql(
        `INSERT INTO transport_routes (name, route_description, tour_description, route_type, transport_mode, shipment_type, carrier_name, transit_days, waypoints)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [tourName, tourName, tourName, direction, transport_mode,
          'milkrun', legs[0].carrier || null, legs[0].transit_time_days || null, JSON.stringify(waypoints)]
      );
      for (const s of stops) runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [id, s.supplierRowId]);
      created++;
    } catch {
      skippedNoSupplier += legs.length;
    }
  }

  const totalSkipped = skipped + skippedNoSupplier;
  return { created, skipped: totalSkipped };
}

router.post('/generate-from-route-plans', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { created, skipped } = regenerateRoutesFromPlans();
  const plansCount = queryOne('SELECT COUNT(*) as c FROM route_plans')?.c || 0;
  if (!plansCount) return res.status(400).json({ error: 'No route plans found — generate route plans first' });
  res.json({ message: `Generated ${created} routes from ${plansCount} route plans${skipped ? ` (${skipped} skipped — no matching supplier or coordinates)` : ''}`, created, skipped });
});

// GET all routes
router.get('/', authenticate, (req: Request, res: Response) => {
  const routes = queryAll('SELECT * FROM transport_routes ORDER BY created_at DESC');

  const enriched = routes.map((r: any) => {
    const suppliers = queryAll(
      'SELECT s.id, s.supplier_id, s.company_name, s.latitude, s.longitude FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ?',
      [r.id]
    );
    // Get matching route plans by route name
    let routePlans: any[] = [];
    try {
      routePlans = queryAll(
        `SELECT id, route_description, transport_mode, origin_name, destination_name, carrier, transit_time_days, direction, pickup_date, delivery_date FROM route_plans WHERE route_description LIKE ?`,
        [`%${r.name}%`]
      );
    } catch { /* route_plans table might not exist */ }
    return { ...r, waypoints: JSON.parse(r.waypoints), suppliers, routePlans };
  });

  res.json(enriched);
});

// GET single route
router.get('/:id', authenticate, (req: Request, res: Response) => {
  const route = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  if (!route) return res.status(404).json({ error: 'Route not found' });

  const suppliers = queryAll(
    'SELECT s.id, s.supplier_id, s.company_name FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ?',
    [route.id]
  );

  res.json({ ...route, waypoints: JSON.parse(route.waypoints), suppliers });
});

// Helper: generate route_plan entries for a transport route.
// Returns the real route_description(s) actually persisted, and the resolved tour_description —
// callers use this to name the route itself, since the client only ever sends a preview value
// (e.g. ".../Mxx") with a placeholder sequence number, not the real one assigned here.
function generateRoutePlanEntries(routeId: number, body: any): { routeDescriptions: string[]; tourDescription: string | null } {
  const created: string[] = [];
  const { route_type, shipment_type, carrier_name, transit_days, supplier_ids,
    pickup_date, pickup_time, delivery_date, arrival_time, equipment, customs,
    route_plan_mode, tour_description,
    origin_id, origin_name, origin_zip, origin_city, origin_country,
    destination_id, destination_name, destination_zip, destination_city, destination_country } = body;

  const direction = route_type === 'outbound' ? 'outbound' : 'inbound';
  // Use route_plan_mode (FTL/LTL/MR/HUB) if provided, otherwise derive from shipment_type
  let modeCode = route_plan_mode || 'FTL';
  if (!route_plan_mode) {
    const st = (shipment_type || 'ftl').toUpperCase();
    modeCode = st === 'LTL' ? 'LTL' : st === 'MILKRUN' ? 'MR' : 'FTL';
  }
  const modePrefix = modeCode === 'MR' ? 'M' : modeCode === 'LTL' ? 'L' : modeCode === 'HUB' ? 'H' : 'F';
  const hq = { id: 'RT-HQ', name: 'RT Automotive d.o.o.', zip: '10000', city: 'Zagreb', country: 'HR Croatia' };
  const equip = equipment || 'Standard Trailer';

  // For MR: auto-generate tour description as "1st OriginID_DestinationID/Mxx" if not provided
  let tourDesc = tour_description || '';
  if (!tourDesc && modeCode === 'MR' && supplier_ids?.length > 0) {
    const firstSup = queryOne('SELECT * FROM suppliers WHERE id = ?', [supplier_ids[0]]);
    if (firstSup) {
      tourDesc = direction === 'inbound'
        ? `1st ${firstSup.supplier_id}_RT-HQ/M`
        : `1st RT-HQ_${firstSup.supplier_id}/M`;
    }
  }

  // Find next available sequence number for this mode prefix
  const existingDescs = queryAll("SELECT route_description FROM route_plans WHERE transport_mode = ?", [modeCode])
    .map((r: any) => r.route_description);

  if (!supplier_ids || supplier_ids.length === 0) {
    // No suppliers — use provided origin/dest or waypoints
    const waypoints = body.waypoints || [];
    const lastWp = waypoints[waypoints.length - 1];
    const dName = destination_name || lastWp?.label || 'Destination';
    const seq = getNextSequence(existingDescs, modePrefix);
    const routeDesc = direction === 'inbound'
      ? `${origin_id || 'SRC'}_RT-HQ/${modePrefix}${seq}`
      : `RT-HQ_${destination_id || 'DST'}/${modePrefix}${seq}`;

    try {
      runSql(
        `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
          destination_id, destination_name, destination_zip, destination_city, destination_country,
          pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [routeDesc, tourDesc, modeCode,
          origin_id || hq.id, origin_name || hq.name, origin_zip || '', origin_city || hq.city, origin_country || hq.country,
          destination_id || '', dName, destination_zip || '', destination_city || '', destination_country || '',
          pickup_date || '', pickup_time || '', delivery_date || '', arrival_time || '',
          carrier_name || '', equip, transit_days || null, customs || '', direction]
      );
      created.push(routeDesc);
    } catch { /* skip */ }
    return { routeDescriptions: created, tourDescription: tourDesc || null };
  }

  // For each supplier, create a route plan entry
  for (let si = 0; si < supplier_ids.length; si++) {
    const sup = queryOne('SELECT * FROM suppliers WHERE id = ?', [supplier_ids[si]]);
    if (!sup) continue;

    const seq = getNextSequence(existingDescs, modePrefix, si);
    const supOrigin = { id: sup.supplier_id, name: sup.company_name, zip: '', city: sup.city, country: sup.country };
    const org = direction === 'inbound' ? supOrigin : hq;
    const dst = direction === 'inbound' ? hq : supOrigin;

    const routeDesc = direction === 'inbound'
      ? `${sup.supplier_id}_RT-HQ/${modePrefix}${seq}`
      : `RT-HQ_${sup.supplier_id}/${modePrefix}${seq}`;
    existingDescs.push(routeDesc);

    try {
      runSql(
        `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
          destination_id, destination_name, destination_zip, destination_city, destination_country,
          pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [routeDesc, tourDesc, modeCode,
          // Use form-provided origin/dest for first supplier, auto-fill for rest
          si === 0 ? (origin_id || org.id) : org.id,
          si === 0 ? (origin_name || org.name) : org.name,
          si === 0 ? (origin_zip || '') : '',
          si === 0 ? (origin_city || org.city) : org.city,
          si === 0 ? (origin_country || org.country) : org.country,
          si === 0 ? (destination_id || dst.id) : dst.id,
          si === 0 ? (destination_name || dst.name) : dst.name,
          si === 0 ? (destination_zip || dst.zip || '') : (dst.zip || ''),
          si === 0 ? (destination_city || dst.city) : dst.city,
          si === 0 ? (destination_country || dst.country) : dst.country,
          pickup_date || '', pickup_time || '', delivery_date || '', arrival_time || '',
          carrier_name || '', equip, transit_days || null, customs || '', direction]
      );
      created.push(routeDesc);
    } catch { /* skip */ }
  }
  return { routeDescriptions: created, tourDescription: tourDesc || null };
}

function getNextSequence(existingDescs: string[], prefix: string, offset: number = 0): string {
  // Extract all sequence numbers for this prefix (e.g. F01, F02, M01, L01...)
  const re = new RegExp(`/${prefix}(\\d+)$`);
  const nums = existingDescs.map(d => {
    const m = d.match(re);
    return m ? parseInt(m[1]) : 0;
  }).filter(n => n > 0);
  const maxNum = nums.length > 0 ? Math.max(...nums) : 0;
  return String(maxNum + 1 + offset).padStart(2, '0');
}

// CREATE route
router.post('/', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { name, route_type, transport_mode, shipment_type, carrier_name, transit_days, waypoints, supplier_ids,
    tour_description } = req.body;

  if (!name || !route_type || !transport_mode || !waypoints || waypoints.length < 2) {
    return res.status(400).json({ error: 'name, route_type, transport_mode, and at least 2 waypoints required' });
  }

  // The route name now IS the route description (auto-generated from OriginID_DestID/Mode)
  const { lastId: id } = runSql(
    `INSERT INTO transport_routes (name, route_description, tour_description, route_type, transport_mode, shipment_type, carrier_name, transit_days, waypoints) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, name, tour_description || null, route_type, transport_mode, shipment_type || 'ftl', carrier_name || null, transit_days || null, JSON.stringify(waypoints)]
  );

  if (supplier_ids && Array.isArray(supplier_ids)) {
    for (const sid of supplier_ids) runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [id, sid]);
  }

  // Auto-create route_plan entries synced with this route. The client's `name` is only a preview
  // (e.g. ".../Mxx" with a placeholder sequence) — re-derive the route's real name from what
  // actually got persisted, so the placeholder never sticks.
  try {
    const { routeDescriptions, tourDescription } = generateRoutePlanEntries(id, { ...req.body, waypoints });
    if (routeDescriptions.length) {
      const realName = routeDescriptions.length > 1 ? (tourDescription || routeDescriptions[0]) : routeDescriptions[0];
      execSql('UPDATE transport_routes SET name=?, route_description=? WHERE id=?', [realName, realName, id]);
    }
  } catch (e) {
    console.log('Warning: failed to auto-generate route plan entries:', e);
  }

  const route = queryOne('SELECT * FROM transport_routes WHERE id = ?', [id]);
  const suppliers = queryAll(
    'SELECT s.id, s.supplier_id, s.company_name, s.latitude, s.longitude FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ?',
    [id]
  );
  res.status(201).json({ ...route, waypoints: JSON.parse(route.waypoints), suppliers });
});

// route_plans rows matching a transport_route: by shared tour_description (milkrun/HUB clusters,
// multiple legs) if the route has one, otherwise by route_description = the route's name (single leg).
function findLinkedRoutePlans(route: { name: string; tour_description: string | null }): any[] {
  if (route.tour_description) return queryAll('SELECT * FROM route_plans WHERE tour_description = ?', [route.tour_description]);
  return queryAll('SELECT * FROM route_plans WHERE route_description = ?', [route.name]);
}

// UPDATE route
router.put('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Route not found' });

  const { name, route_type, transport_mode, shipment_type, carrier_name, transit_days, waypoints, supplier_ids } = req.body;

  // Find route_plans rows linked to this route BEFORE anything changes, so the lookup still matches.
  const linked = findLinkedRoutePlans(existing);

  const finalName = name || existing.name;

  execSql(
    `UPDATE transport_routes SET name=?, route_type=?, transport_mode=?, shipment_type=?, carrier_name=?, transit_days=?, waypoints=?, updated_at=datetime('now') WHERE id=?`,
    [finalName, route_type || existing.route_type, transport_mode || existing.transport_mode,
     shipment_type ?? existing.shipment_type ?? 'ftl',
     carrier_name ?? existing.carrier_name, transit_days ?? existing.transit_days,
     waypoints ? JSON.stringify(waypoints) : existing.waypoints, req.params.id]
  );

  if (supplier_ids && Array.isArray(supplier_ids)) {
    execSql('DELETE FROM route_suppliers WHERE route_id = ?', [req.params.id]);
    for (const sid of supplier_ids) runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [req.params.id, sid]);
  }

  // Regenerate the linked route_plans leg(s) from scratch using the same generator CREATE uses —
  // this is what correctly gives each Milkrun/HUB stop its own leg (with its own supplier-derived
  // origin) while keeping them grouped under one shared tour_description, instead of the previous
  // ad-hoc sync which only ever touched a single leg's metadata.
  for (const plan of linked) execSql('DELETE FROM route_plans WHERE id = ?', [plan.id]);
  try {
    const { routeDescriptions, tourDescription } = generateRoutePlanEntries(Number(req.params.id), {
      ...req.body,
      name: finalName,
      waypoints: waypoints || JSON.parse(existing.waypoints),
    });
    // The client's route-description is only a preview (e.g. ".../Mxx" with a placeholder
    // sequence) — re-derive the route's real name from what actually got persisted above.
    if (routeDescriptions.length) {
      const realName = routeDescriptions.length > 1 ? (tourDescription || routeDescriptions[0]) : routeDescriptions[0];
      execSql('UPDATE transport_routes SET name=?, route_description=?, updated_at=datetime(\'now\') WHERE id=?', [realName, realName, req.params.id]);
    }
  } catch (e) {
    console.error('Warning: failed to regenerate route plan entries on edit:', e);
  }

  const updated = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  res.json({ ...updated, waypoints: JSON.parse(updated.waypoints) });
});

// DELETE route
router.delete('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Route not found' });

  // Delete the linked route_plans row(s) too — otherwise the next auto-sync (any route_plans
  // mutation triggers a full regenerate) would resurrect this route from the orphaned entries.
  const linked = findLinkedRoutePlans(existing);
  for (const plan of linked) execSql('DELETE FROM route_plans WHERE id = ?', [plan.id]);

  execSql('DELETE FROM transport_routes WHERE id = ?', [req.params.id]);
  res.json({ message: `Route deleted${linked.length ? ` (${linked.length} linked route plan entr${linked.length === 1 ? 'y' : 'ies'} removed)` : ''}` });
});

export default router;
