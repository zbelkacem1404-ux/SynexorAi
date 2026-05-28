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
function generateSupplierId() {
    const last = (0, schema_1.queryOne)("SELECT supplier_id FROM suppliers ORDER BY id DESC LIMIT 1");
    if (!last)
        return 'SUP-0001';
    const num = parseInt(last.supplier_id.replace('SUP-', '')) + 1;
    return `SUP-${num.toString().padStart(4, '0')}`;
}
// CSV Export — must come BEFORE /:id to avoid route conflict
router.get('/export/csv', auth_1.authenticate, (req, res) => {
    const suppliers = (0, schema_1.queryAll)('SELECT * FROM suppliers ORDER BY company_name');
    const rows = suppliers.map((s) => {
        const contacts = (0, schema_1.queryAll)('SELECT * FROM contacts WHERE supplier_id = ?', [s.id]);
        const projects = (0, schema_1.queryAll)('SELECT p.name FROM projects p JOIN supplier_projects sp ON sp.project_id = p.id WHERE sp.supplier_id = ?', [s.id]);
        const commodities = (0, schema_1.queryAll)('SELECT c.name FROM commodities c JOIN supplier_commodities sc ON sc.commodity_id = c.id WHERE sc.supplier_id = ?', [s.id]);
        const routes = (0, schema_1.queryAll)('SELECT r.* FROM transport_routes r JOIN route_suppliers rs ON rs.route_id = r.id WHERE rs.supplier_id = ?', [s.id]);
        const primary = contacts.find((c) => c.type === 'primary');
        const secondary = contacts.find((c) => c.type === 'secondary');
        const escalation = contacts.filter((c) => c.type === 'escalation').sort((a, b) => (a.escalation_level || 0) - (b.escalation_level || 0));
        const carriers = [...new Set(routes.filter((r) => r.carrier_name).map((r) => r.carrier_name))];
        return {
            supplier_id: s.supplier_id,
            company_name: s.company_name,
            country: s.country,
            city: s.city,
            street_address: s.street_address || '',
            full_address: `${s.street_address || ''}, ${s.city}, ${s.country}`.replace(/^, /, ''),
            latitude: s.latitude || '',
            longitude: s.longitude || '',
            default_incoterm: s.default_incoterm || '',
            status: s.status,
            // Primary contact
            primary_contact_name: primary?.name || '',
            primary_contact_role: primary?.role_title || '',
            primary_contact_email: primary?.email || '',
            primary_contact_phone: primary?.phone || '',
            // Secondary contact
            secondary_contact_name: secondary?.name || '',
            secondary_contact_role: secondary?.role_title || '',
            secondary_contact_email: secondary?.email || '',
            secondary_contact_phone: secondary?.phone || '',
            // Escalation chain
            escalation_contacts: escalation.map((c) => `L${c.escalation_level || '?'}: ${c.name} (${c.role_title || ''})`).join(' | '),
            // Carriers & lanes
            assigned_carriers: carriers.join(', '),
            lanes: routes.map((r) => `${r.name} [${r.transport_mode}${r.shipment_type ? '/' + r.shipment_type.toUpperCase() : ''}] - ${r.carrier_name || 'N/A'} (${r.transit_days || '?'}d, ${r.route_type})`).join(' | '),
            lane_count: routes.length,
            // Commodities & Projects
            commodities: commodities.map((c) => c.name).join(', '),
            projects: projects.map((p) => p.name).join(', '),
            notes: s.notes || ''
        };
    });
    const csv = (0, sync_1.stringify)(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=suppliers_database.csv');
    // Add BOM for Excel UTF-8 compatibility
    res.send('\ufeff' + csv);
});
// CSV Import
router.post('/import/csv', auth_1.authenticate, auth_1.requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    const records = (0, sync_2.parse)(req.file.buffer.toString(), { columns: true, skip_empty_lines: true });
    let imported = 0;
    for (const record of records) {
        const supplier_id = generateSupplierId();
        try {
            (0, schema_1.runSql)(`INSERT INTO suppliers (supplier_id, company_name, country, city, street_address, latitude, longitude, default_incoterm, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [supplier_id, record.company_name || 'Unknown', record.country || 'Unknown', record.city || 'Unknown',
                record.street_address || null, record.latitude ? parseFloat(record.latitude) : null,
                record.longitude ? parseFloat(record.longitude) : null, record.default_incoterm || null,
                record.status || 'active', record.notes || null]);
            imported++;
        }
        catch (e) { /* skip bad rows */ }
    }
    res.json({ message: `Imported ${imported} suppliers`, imported });
});
// GET all suppliers with filters
router.get('/', auth_1.authenticate, (req, res) => {
    const { search, status, incoterm, project, commodity, page = '1', limit = '25', sortBy = 'company_name', sortDir = 'asc' } = req.query;
    let where = [];
    let params = [];
    if (search) {
        where.push("(s.company_name LIKE ? OR s.supplier_id LIKE ? OR s.country LIKE ? OR s.city LIKE ?)");
        const term = `%${search}%`;
        params.push(term, term, term, term);
    }
    if (status) {
        const statuses = status.split(',');
        where.push(`s.status IN (${statuses.map(() => '?').join(',')})`);
        params.push(...statuses);
    }
    if (incoterm) {
        const incoterms = incoterm.split(',');
        where.push(`s.default_incoterm IN (${incoterms.map(() => '?').join(',')})`);
        params.push(...incoterms);
    }
    if (project) {
        const projects = project.split(',');
        where.push(`s.id IN (SELECT supplier_id FROM supplier_projects WHERE project_id IN (${projects.map(() => '?').join(',')}))`);
        params.push(...projects);
    }
    if (commodity) {
        const commodities = commodity.split(',');
        where.push(`s.id IN (SELECT supplier_id FROM supplier_commodities WHERE commodity_id IN (${commodities.map(() => '?').join(',')}))`);
        params.push(...commodities);
    }
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const allowedSortCols = ['company_name', 'supplier_id', 'country', 'city', 'default_incoterm', 'status', 'created_at'];
    const col = allowedSortCols.includes(sortBy) ? sortBy : 'company_name';
    const dir = sortDir === 'desc' ? 'DESC' : 'ASC';
    const countRow = (0, schema_1.queryOne)(`SELECT COUNT(*) as total FROM suppliers s ${whereClause}`, params);
    const total = countRow?.total || 0;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const offset = (pageNum - 1) * limitNum;
    const suppliers = (0, schema_1.queryAll)(`SELECT s.* FROM suppliers s ${whereClause} ORDER BY s.${col} ${dir} LIMIT ? OFFSET ?`, [...params, limitNum, offset]);
    const enriched = suppliers.map((s) => {
        const contacts = (0, schema_1.queryAll)('SELECT * FROM contacts WHERE supplier_id = ?', [s.id]);
        const projects = (0, schema_1.queryAll)('SELECT p.* FROM projects p JOIN supplier_projects sp ON sp.project_id = p.id WHERE sp.supplier_id = ?', [s.id]);
        const commodities = (0, schema_1.queryAll)('SELECT c.* FROM commodities c JOIN supplier_commodities sc ON sc.commodity_id = c.id WHERE sc.supplier_id = ?', [s.id]);
        const routes = (0, schema_1.queryAll)('SELECT r.* FROM transport_routes r JOIN route_suppliers rs ON rs.route_id = r.id WHERE rs.supplier_id = ?', [s.id]);
        return { ...s, contacts, projects, commodities, routes };
    });
    res.json({ suppliers: enriched, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) });
});
// GET single supplier
router.get('/:id', auth_1.authenticate, (req, res) => {
    const supplier = (0, schema_1.queryOne)('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!supplier)
        return res.status(404).json({ error: 'Supplier not found' });
    const contacts = (0, schema_1.queryAll)('SELECT * FROM contacts WHERE supplier_id = ?', [supplier.id]);
    const projects = (0, schema_1.queryAll)('SELECT p.* FROM projects p JOIN supplier_projects sp ON sp.project_id = p.id WHERE sp.supplier_id = ?', [supplier.id]);
    const commodities = (0, schema_1.queryAll)('SELECT c.* FROM commodities c JOIN supplier_commodities sc ON sc.commodity_id = c.id WHERE sc.supplier_id = ?', [supplier.id]);
    const routes = (0, schema_1.queryAll)('SELECT r.* FROM transport_routes r JOIN route_suppliers rs ON rs.route_id = r.id WHERE rs.supplier_id = ?', [supplier.id]);
    // Get route plans linked to this supplier (by matching origin/destination name to supplier company_name)
    let routePlans = [];
    try {
        routePlans = (0, schema_1.queryAll)(`SELECT * FROM route_plans WHERE origin_name = ? OR destination_name = ? ORDER BY pickup_date DESC`, [supplier.company_name, supplier.company_name]);
    }
    catch { /* route_plans table might not exist yet */ }
    res.json({ ...supplier, contacts, projects, commodities, routes, routePlans });
});
// CREATE supplier
router.post('/', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const { company_name, country, city, street_address, latitude, longitude, default_incoterm, status, notes, contacts, project_ids, commodity_ids } = req.body;
    if (!company_name || !country || !city) {
        return res.status(400).json({ error: 'company_name, country, and city are required' });
    }
    const supplier_id = generateSupplierId();
    const { lastId: id } = (0, schema_1.runSql)(`INSERT INTO suppliers (supplier_id, company_name, country, city, street_address, latitude, longitude, default_incoterm, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [supplier_id, company_name, country, city, street_address || null, latitude || null, longitude || null, default_incoterm || null, status || 'active', notes || null]);
    if (contacts && Array.isArray(contacts)) {
        for (const c of contacts) {
            (0, schema_1.runSql)('INSERT INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, c.type, c.escalation_level || null, c.name, c.role_title || null, c.email || null, c.phone || null]);
        }
    }
    if (project_ids && Array.isArray(project_ids)) {
        for (const pid of project_ids)
            (0, schema_1.runSql)('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [id, pid]);
    }
    if (commodity_ids && Array.isArray(commodity_ids)) {
        for (const cid of commodity_ids)
            (0, schema_1.runSql)('INSERT OR IGNORE INTO supplier_commodities (supplier_id, commodity_id) VALUES (?, ?)', [id, cid]);
    }
    const supplier = (0, schema_1.queryOne)('SELECT * FROM suppliers WHERE id = ?', [id]);
    res.status(201).json(supplier);
});
// UPDATE supplier
router.put('/:id', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const existing = (0, schema_1.queryOne)('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!existing)
        return res.status(404).json({ error: 'Supplier not found' });
    const { company_name, country, city, street_address, latitude, longitude, default_incoterm, status, notes, contacts, project_ids, commodity_ids } = req.body;
    (0, schema_1.execSql)(`UPDATE suppliers SET company_name=?, country=?, city=?, street_address=?, latitude=?, longitude=?, default_incoterm=?, status=?, notes=?, updated_at=datetime('now') WHERE id=?`, [company_name || existing.company_name, country || existing.country, city || existing.city,
        street_address ?? existing.street_address, latitude ?? existing.latitude, longitude ?? existing.longitude,
        default_incoterm ?? existing.default_incoterm, status || existing.status, notes ?? existing.notes, req.params.id]);
    if (contacts && Array.isArray(contacts)) {
        (0, schema_1.execSql)('DELETE FROM contacts WHERE supplier_id = ?', [req.params.id]);
        for (const c of contacts) {
            (0, schema_1.runSql)('INSERT INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)', [req.params.id, c.type, c.escalation_level || null, c.name, c.role_title || null, c.email || null, c.phone || null]);
        }
    }
    if (project_ids && Array.isArray(project_ids)) {
        (0, schema_1.execSql)('DELETE FROM supplier_projects WHERE supplier_id = ?', [req.params.id]);
        for (const pid of project_ids)
            (0, schema_1.runSql)('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [req.params.id, pid]);
    }
    if (commodity_ids && Array.isArray(commodity_ids)) {
        (0, schema_1.execSql)('DELETE FROM supplier_commodities WHERE supplier_id = ?', [req.params.id]);
        for (const cid of commodity_ids)
            (0, schema_1.runSql)('INSERT OR IGNORE INTO supplier_commodities (supplier_id, commodity_id) VALUES (?, ?)', [req.params.id, cid]);
    }
    const updated = (0, schema_1.queryOne)('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    res.json(updated);
});
// DELETE supplier
router.delete('/:id', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const existing = (0, schema_1.queryOne)('SELECT * FROM suppliers WHERE id = ?', [req.params.id]);
    if (!existing)
        return res.status(404).json({ error: 'Supplier not found' });
    (0, schema_1.execSql)('DELETE FROM suppliers WHERE id = ?', [req.params.id]);
    res.json({ message: 'Supplier deleted' });
});
exports.default = router;
