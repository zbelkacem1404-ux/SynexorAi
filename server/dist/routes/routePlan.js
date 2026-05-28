"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const sync_1 = require("csv-stringify/sync");
const sync_2 = require("csv-parse/sync");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)({ storage: multer_1.default.memoryStorage() });
// CSV Export — with BOM for Excel UTF-8
router.get('/export/csv', auth_1.authenticate, (req, res) => {
    const direction = req.query.direction || '';
    let where = '';
    let params = [];
    if (direction && ['inbound', 'outbound', 'hub'].includes(direction)) {
        where = ' WHERE direction = ?';
        params = [direction];
    }
    const plans = (0, schema_1.queryAll)(`SELECT * FROM route_plans${where} ORDER BY route_description`, params);
    const rows = plans.map((p) => ({
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
    const csv = (0, sync_1.stringify)(rows, { header: true });
    const filename = direction ? `route_plan_${direction}.csv` : 'route_plan_all.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send('\ufeff' + csv);
});
// CSV Import
router.post('/import/csv', auth_1.authenticate, auth_1.requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    const direction = req.body.direction || 'inbound';
    let content = req.file.buffer.toString('utf-8');
    // Strip BOM
    if (content.charCodeAt(0) === 0xFEFF)
        content = content.slice(1);
    const records = (0, sync_2.parse)(content, { columns: true, skip_empty_lines: true, relax_column_count: true });
    let imported = 0;
    const errors = [];
    for (const r of records) {
        try {
            const route_desc = r['Route description'] || r['route_description'] || '';
            if (!route_desc) {
                errors.push('Skipped row with empty route description');
                continue;
            }
            const mode = (r['Transport mode'] || r['transport_mode'] || 'FTL').toUpperCase();
            if (!['FTL', 'LTL', 'MR', 'HUB'].includes(mode)) {
                errors.push(`Skipped "${route_desc}": invalid mode "${mode}"`);
                continue;
            }
            (0, schema_1.runSql)(`INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
          destination_id, destination_name, destination_zip, destination_city, destination_country,
          pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
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
            ]);
            imported++;
        }
        catch (e) {
            errors.push(`Error: ${e.message}`);
        }
    }
    res.json({ message: `Imported ${imported} route plans`, imported, errors: errors.slice(0, 20) });
});
// GET all route plans with pagination, search, filtering
router.get('/', auth_1.authenticate, (req, res) => {
    const { search, direction, mode, carrier, page = '1', limit = '50', sortBy = 'route_description', sortDir = 'asc' } = req.query;
    let where = [];
    let params = [];
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
        const modes = mode.split(',');
        where.push(`transport_mode IN (${modes.map(() => '?').join(',')})`);
        params.push(...modes);
    }
    if (carrier) {
        where.push('carrier LIKE ?');
        params.push(`%${carrier}%`);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const allowed = ['route_description', 'transport_mode', 'origin_name', 'destination_name', 'carrier', 'transit_time_days', 'direction', 'origin_country', 'destination_country'];
    const col = allowed.includes(sortBy) ? sortBy : 'route_description';
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
    const countRow = (0, schema_1.queryOne)(`SELECT COUNT(*) as total FROM route_plans ${whereClause}`, params);
    const total = countRow?.total || 0;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(200, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const plans = (0, schema_1.queryAll)(`SELECT * FROM route_plans ${whereClause} ORDER BY ${col} ${dir} LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
    // Get summary stats
    const stats = (0, schema_1.queryOne)(`SELECT
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
router.get('/:id', auth_1.authenticate, (req, res) => {
    const plan = (0, schema_1.queryOne)('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
    if (!plan)
        return res.status(404).json({ error: 'Route plan not found' });
    res.json(plan);
});
// CREATE
router.post('/', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const { route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country, destination_id, destination_name, destination_zip, destination_city, destination_country, pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction } = req.body;
    if (!route_description || !transport_mode)
        return res.status(400).json({ error: 'route_description and transport_mode required' });
    const { lastId: id } = (0, schema_1.runSql)(`INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
      destination_id, destination_name, destination_zip, destination_city, destination_country,
      pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [route_description, tour_description || null, transport_mode, origin_id || null, origin_name || null, origin_zip || null, origin_city || null, origin_country || null,
        destination_id || null, destination_name || null, destination_zip || null, destination_city || null, destination_country || null,
        pickup_date || null, pickup_time || null, delivery_date || null, arrival_time || null, carrier || null, equipment || null,
        transit_time_days || null, customs || null, direction || 'inbound']);
    const plan = (0, schema_1.queryOne)('SELECT * FROM route_plans WHERE id = ?', [id]);
    res.status(201).json(plan);
});
// UPDATE
router.put('/:id', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const existing = (0, schema_1.queryOne)('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
    if (!existing)
        return res.status(404).json({ error: 'Route plan not found' });
    const fields = ['route_description', 'tour_description', 'transport_mode', 'origin_id', 'origin_name', 'origin_zip', 'origin_city', 'origin_country',
        'destination_id', 'destination_name', 'destination_zip', 'destination_city', 'destination_country',
        'pickup_date', 'pickup_time', 'delivery_date', 'arrival_time', 'carrier', 'equipment', 'transit_time_days', 'customs', 'direction'];
    const sets = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => req.body[f] ?? existing[f]);
    (0, schema_1.execSql)(`UPDATE route_plans SET ${sets}, updated_at=datetime('now') WHERE id=?`, [...values, req.params.id]);
    const updated = (0, schema_1.queryOne)('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
    res.json(updated);
});
// DELETE
router.delete('/:id', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const existing = (0, schema_1.queryOne)('SELECT * FROM route_plans WHERE id = ?', [req.params.id]);
    if (!existing)
        return res.status(404).json({ error: 'Route plan not found' });
    (0, schema_1.execSql)('DELETE FROM route_plans WHERE id = ?', [req.params.id]);
    res.json({ message: 'Route plan deleted' });
});
// BULK DELETE by direction
router.delete('/bulk/:direction', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const dir = req.params.direction;
    if (!['inbound', 'outbound', 'hub'].includes(dir))
        return res.status(400).json({ error: 'Invalid direction' });
    (0, schema_1.execSql)('DELETE FROM route_plans WHERE direction = ?', [dir]);
    res.json({ message: `Deleted all ${dir} route plans` });
});
exports.default = router;
