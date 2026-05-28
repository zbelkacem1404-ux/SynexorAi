import { Router, Request, Response } from 'express';
import { queryAll, queryOne, runSql, execSql } from '../db/schema';
import { authenticate, requireAdmin } from '../middleware/auth';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import multer from 'multer';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// CSV Export — with BOM for Excel UTF-8
router.get('/export/csv', authenticate, (req: Request, res: Response) => {
  const direction = req.query.direction as string || '';
  let where = '';
  let params: any[] = [];

  if (direction && ['inbound', 'outbound', 'hub'].includes(direction)) {
    where = ' WHERE direction = ?';
    params = [direction];
  }

  const plans = queryAll(`SELECT * FROM route_plans${where} ORDER BY route_description`, params);

  const rows = plans.map((p: any) => ({
    'Route description': p.route_description,
    'Additional Tour description for MR': p.tour_description || '',
    'Transport mode': p.transport_mode,
    'Origin ID': p.origin_id || '',
    'Origin name': p.origin_name || '',
    'Origin ZIP code': p.origin_zip || '',
    'Origin city': p.origin_city || '',
    'Origin country': p.origin_country || '',
    'Destination ID': p.destination_id || '',
    'Destination name': p.destination_name || '',
    'Destination ZIP code': p.destination_zip || '',
    'Destination city': p.destination_city || '',
    'Destination country': p.destination_country || '',
    'Scheduled pickup date at origin': p.pickup_date || '',
    'Scheduled pickup time at origin': p.pickup_time || '',
    'Scheduled delivery date at destination': p.delivery_date || '',
    'Scheduled arrival time at destination': p.arrival_time || '',
    'Carrier': p.carrier || '',
    'Equipment': p.equipment || '',
    'Transit time [d]': p.transit_time_days ?? '',
    'Customs': p.customs || '',
  }));

  const csv = stringify(rows, { header: true });
  const filename = direction ? `route_plan_${direction}.csv` : 'route_plan_all.csv';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send('\ufeff' + csv);
});

// CSV Import
router.post('/import/csv', authenticate, requireAdmin, upload.single('file'), (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const direction = (req.body.direction as string) || 'inbound';
  let content = req.file.buffer.toString('utf-8');
  // Strip BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);

  const records = parse(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
  let imported = 0;
  const errors: string[] = [];

  for (const r of records) {
    try {
      const route_desc = r['Route description'] || r['route_description'] || '';
      if (!route_desc) { errors.push('Skipped row with empty route description'); continue; }

      const mode = (r['Transport mode'] || r['transport_mode'] || 'FTL').toUpperCase();
      if (!['FTL', 'LTL', 'MR', 'HUB'].includes(mode)) { errors.push(`Skipped "${route_desc}": invalid mode "${mode}"`); continue; }

      runSql(
        `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
          destination_id, destination_name, destination_zip, destination_city, destination_country,
          pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          route_desc,
          r['Additional Tour description for MR'] || r['tour_description'] || null,
          mode,
          r['Origin ID'] || r['origin_id'] || null,
          r['Origin name'] || r['origin_name'] || null,
          r['Origin ZIP code'] || r['origin_zip'] || null,
          r['Origin city'] || r['origin_city'] || null,
          r['Origin country'] || r['origin_country'] || null,
          r['Destination ID'] || r['destination_id'] || null,
          r['Destination name'] || r['destination_name'] || null,
          r['Destination ZIP code'] || r['destination_zip'] || null,
          r['Destination city'] || r['destination_city'] || null,
          r['Destination country'] || r['destination_country'] || null,
          r['Scheduled pickup date at origin'] || r['pickup_date'] || null,
          r['Scheduled pickup time at origin'] || r['pickup_time'] || null,
          r['Scheduled delivery date at destination'] || r['delivery_date'] || null,
          r['Scheduled arrival time at destination'] || r['arrival_time'] || null,
          r['Carrier'] || r['carrier'] || null,
          r['Equipment'] || r['equipment'] || null,
          r['Transit time [d]'] || r['transit_time_days'] ? parseFloat(r['Transit time [d]'] || r['transit_time_days']) : null,
          r['Customs'] || r['customs'] || null,
          direction,
        ]
      );
      imported++;
    } catch (e: any) {
      errors.push(`Error: ${e.message}`);
    }
  }

  res.json({ message: `Imported ${imported} route plans`, imported, errors: errors.slice(0, 20) });
});

// GET all route plans with pagination, search, filtering
router.get('/', authenticate, (req: Request, res: Response) => {
  const { search, direction, mode, carrier, page = '1', limit = '50', sortBy = 'route_description', sortDir = 'asc' } = req.query;

  let where: string[] = [];
  let params: any[] = [];

  if (search) {
    where.push("(route_description LIKE ? OR origin_name LIKE ? OR destination_name LIKE ? OR carrier LIKE ? OR origin_city LIKE ? OR destination_city LIKE ?)");
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term);
  }
  if (direction && direction !== 'all') {
    where.push('direction = ?');
    params.push(direction);
  }
  if (mode) {
    const modes = (mode as string).split(',');
    where.push(`transport_mode IN (${modes.map(() => '?').join(',')})`);
    params.push(...modes);
  }
  if (carrier) {
    where.push('carrier LIKE ?');
    params.push(`%${carrier}%`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const allowed = ['route_description', 'transport_mode', 'origin_name', 'destination_name', 'carrier', 'transit_time_days', 'direction', 'origin_country', 'destination_country'];
  const col = allowed.includes(sortBy as string) ? sortBy : 'route_description';
  const dir = sortDir === 'desc' ? 'DESC' : 'ASC';

  const countRow = queryOne(`SELECT COUNT(*) as total FROM route_plans ${whereClause}`, params);
  const total = countRow?.total || 0;
  const pageNum = Math.max(1, parseInt(page as string));
  const limitNum = Math.max(1, Math.min(200, parseInt(limit as string)));
  const offset = (pageNum - 1) * limitNum;

  const plans = queryAll(
    `SELECT * FROM route_plans ${whereClause} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );

  // Get summary stats
  const stats = queryOne(`SELECT
    COUNT(*) as total,
    SUM(CASE WHEN transport_mode='FTL' THEN 1 ELSE 0 END) as ftl_count,
    SUM(CASE WHEN transport_mode='LTL' THEN 1 ELSE 0 END) as ltl_count,
    SUM(CASE WHEN transport_mode='MR' THEN 1 ELSE 0 END) as mr_count,
    SUM(CASE WHEN transport_mode='HUB' THEN 1 ELSE 0 END) as hub_count,
    SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) as inbound_count,
    SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound_count,
    SUM(CASE WHEN direction='hub' THEN 1 ELSE 0 END) as hub_dir_count,
    AVG(transit_time_days) as avg_transit
  FROM route_plans`);

  res.json({ plans, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum), stats });
});

// GET single route plan
router.get('/:id', authenticate, (req: Request, res: Response) => {
  const plan = queryOne('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
  if (!plan) return res.status(404).json({ error: 'Route plan not found' });
  res.json(plan);
});

// CREATE
router.post('/', authenticate, requireAdmin, (req: Request, res: Response) => {
  const { route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
    destination_id, destination_name, destination_zip, destination_city, destination_country,
    pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction } = req.body;

  if (!route_description || !transport_mode) return res.status(400).json({ error: 'route_description and transport_mode required' });

  const { lastId: id } = runSql(
    `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
      destination_id, destination_name, destination_zip, destination_city, destination_country,
      pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [route_description, tour_description || null, transport_mode, origin_id || null, origin_name || null, origin_zip || null, origin_city || null, origin_country || null,
      destination_id || null, destination_name || null, destination_zip || null, destination_city || null, destination_country || null,
      pickup_date || null, pickup_time || null, delivery_date || null, arrival_time || null, carrier || null, equipment || null,
      transit_time_days || null, customs || null, direction || 'inbound']
  );

  const plan = queryOne('SELECT * FROM route_plans WHERE id = ?', [id]);
  res.status(201).json(plan);
});

// UPDATE
router.put('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Route plan not found' });

  const fields = ['route_description', 'tour_description', 'transport_mode', 'origin_id', 'origin_name', 'origin_zip', 'origin_city', 'origin_country',
    'destination_id', 'destination_name', 'destination_zip', 'destination_city', 'destination_country',
    'pickup_date', 'pickup_time', 'delivery_date', 'arrival_time', 'carrier', 'equipment', 'transit_time_days', 'customs', 'direction'];

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => req.body[f] ?? existing[f]);

  execSql(`UPDATE route_plans SET ${sets}, updated_at=datetime('now') WHERE id=?`, [...values, req.params.id]);
  const updated = queryOne('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
  res.json(updated);
});

// DELETE
router.delete('/:id', authenticate, requireAdmin, (req: Request, res: Response) => {
  const existing = queryOne('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Route plan not found' });
  execSql('DELETE FROM route_plans WHERE id = ?', [req.params.id]);
  res.json({ message: 'Route plan deleted' });
});

// BULK DELETE by direction
router.delete('/bulk/:direction', authenticate, requireAdmin, (req: Request, res: Response) => {
  const dir = req.params.direction;
  if (!['inbound', 'outbound', 'hub'].includes(dir)) return res.status(400).json({ error: 'Invalid direction' });
  execSql('DELETE FROM route_plans WHERE direction = ?', [dir]);
  res.json({ message: `Deleted all ${dir} route plans` });
});

export default router;
