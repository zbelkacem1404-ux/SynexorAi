import { Router, Request, Response } from 'express';
import { queryAll, queryOne, runSql, execSql } from '../db/schema';
import { authenticate, requireAdmin } from '../middleware/auth';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import multer from 'multer';

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

  const records = parse(req.file.buffer.toString(), { columns: true, skip_empty_lines: true });
  let imported = 0;
  const errors: string[] = [];

  for (const record of records) {
    try {
      const { name, route_type, transport_mode, carrier_name, transit_days, suppliers: supplierStr, waypoints: waypointStr } = record;
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

      const { lastId: id } = runSql(
        'INSERT INTO transport_routes (name, route_type, transport_mode, carrier_name, transit_days, waypoints) VALUES (?, ?, ?, ?, ?, ?)',
        [name, route_type, transport_mode, carrier_name || null, transit_days ? parseInt(transit_days) : null, JSON.stringify(waypoints)]
      );

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

      imported++;
    } catch (e: any) {
      errors.push(`Error on "${record.name || 'unknown'}": ${e.message}`);
    }
  }

  res.json({ message: `Imported ${imported} routes`, imported, errors });
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

// Helper: generate route_plan entries for a transport route
function generateRoutePlanEntries(routeId: number, body: any) {
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
    } catch { /* skip */ }
    return;
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
    } catch { /* skip */ }
  }
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

  // Auto-create route_plan entries synced with this route
  try {
    generateRoutePlanEntries(id, { ...req.body, waypoints });
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

// UPDATE route
router.put('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Route not found' });

  const { name, route_type, transport_mode, shipment_type, carrier_name, transit_days, waypoints, supplier_ids } = req.body;

  execSql(
    `UPDATE transport_routes SET name=?, route_type=?, transport_mode=?, shipment_type=?, carrier_name=?, transit_days=?, waypoints=?, updated_at=datetime('now') WHERE id=?`,
    [name || existing.name, route_type || existing.route_type, transport_mode || existing.transport_mode,
     shipment_type ?? existing.shipment_type ?? 'ftl',
     carrier_name ?? existing.carrier_name, transit_days ?? existing.transit_days,
     waypoints ? JSON.stringify(waypoints) : existing.waypoints, req.params.id]
  );

  if (supplier_ids && Array.isArray(supplier_ids)) {
    execSql('DELETE FROM route_suppliers WHERE route_id = ?', [req.params.id]);
    for (const sid of supplier_ids) runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [req.params.id, sid]);
  }

  const updated = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  res.json({ ...updated, waypoints: JSON.parse(updated.waypoints) });
});

// DELETE route
router.delete('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM transport_routes WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Route not found' });
  execSql('DELETE FROM transport_routes WHERE id = ?', [req.params.id]);
  res.json({ message: 'Route deleted' });
});

export default router;
