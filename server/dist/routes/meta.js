"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const schema_1 = require("../db/schema");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
router.get('/projects', auth_1.authenticate, (_req, res) => {
    res.json((0, schema_1.queryAll)('SELECT * FROM projects ORDER BY name'));
});
router.get('/commodities', auth_1.authenticate, (_req, res) => {
    res.json((0, schema_1.queryAll)('SELECT * FROM commodities ORDER BY name'));
});
router.get('/incoterms', auth_1.authenticate, (_req, res) => {
    res.json(['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
});
// Company settings
router.get('/settings', auth_1.authenticate, (_req, res) => {
    try {
        // Ensure table exists
        const db = (0, schema_1.getDbSync)();
        db.run(`CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
        const rows = (0, schema_1.queryAll)('SELECT key, value FROM company_settings');
        const settings = {};
        rows.forEach((r) => { settings[r.key] = r.value; });
        res.json(settings);
    }
    catch (e) {
        res.json({});
    }
});
router.put('/settings', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    try {
        const db = (0, schema_1.getDbSync)();
        db.run(`CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
        const updates = req.body;
        for (const [key, value] of Object.entries(updates)) {
            if (typeof value === 'string') {
                (0, schema_1.execSql)('INSERT OR REPLACE INTO company_settings (key, value) VALUES (?, ?)', [key, value]);
            }
        }
        const rows = (0, schema_1.queryAll)('SELECT key, value FROM company_settings');
        const settings = {};
        rows.forEach((r) => { settings[r.key] = r.value; });
        res.json(settings);
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
// Dashboard stats
router.get('/stats', auth_1.authenticate, (_req, res) => {
    try {
        const totalSuppliers = (0, schema_1.queryAll)('SELECT COUNT(*) as count FROM suppliers')[0]?.count || 0;
        const activeSuppliers = (0, schema_1.queryAll)("SELECT COUNT(*) as count FROM suppliers WHERE status = 'active'")[0]?.count || 0;
        const totalRoutes = (0, schema_1.queryAll)('SELECT COUNT(*) as count FROM transport_routes')[0]?.count || 0;
        const inboundRoutes = (0, schema_1.queryAll)("SELECT COUNT(*) as count FROM transport_routes WHERE route_type = 'inbound'")[0]?.count || 0;
        const outboundRoutes = (0, schema_1.queryAll)("SELECT COUNT(*) as count FROM transport_routes WHERE route_type = 'outbound'")[0]?.count || 0;
        const countries = (0, schema_1.queryAll)('SELECT COUNT(DISTINCT country) as count FROM suppliers')[0]?.count || 0;
        const byStatus = (0, schema_1.queryAll)('SELECT status, COUNT(*) as count FROM suppliers GROUP BY status');
        const byMode = (0, schema_1.queryAll)('SELECT transport_mode, COUNT(*) as count FROM transport_routes GROUP BY transport_mode');
        res.json({ totalSuppliers, activeSuppliers, totalRoutes, inboundRoutes, outboundRoutes, countries, byStatus, byMode });
    }
    catch (e) {
        res.status(500).json({ error: e.message });
    }
});
exports.default = router;
