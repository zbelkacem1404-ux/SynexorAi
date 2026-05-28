import { Router, Request, Response } from 'express';
import { queryAll, execSql, runSql, getDbSync } from '../db/schema';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.get('/projects', authenticate, (_req: Request, res: Response) => {
  res.json(queryAll('SELECT * FROM projects ORDER BY name'));
});

router.get('/commodities', authenticate, (_req: Request, res: Response) => {
  res.json(queryAll('SELECT * FROM commodities ORDER BY name'));
});

router.get('/incoterms', authenticate, (_req: Request, res: Response) => {
  res.json(['EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP']);
});

// Company settings
router.get('/settings', authenticate, (_req: Request, res: Response) => {
  try {
    // Ensure table exists
    const db = getDbSync();
    db.run(`CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const rows = queryAll('SELECT key, value FROM company_settings');
    const settings: Record<string, string> = {};
    rows.forEach((r: any) => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (e) {
    res.json({});
  }
});

router.put('/settings', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    const db = getDbSync();
    db.run(`CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      if (typeof value === 'string') {
        execSql('INSERT OR REPLACE INTO company_settings (key, value) VALUES (?, ?)', [key, value]);
      }
    }
    const rows = queryAll('SELECT key, value FROM company_settings');
    const settings: Record<string, string> = {};
    rows.forEach((r: any) => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Dashboard stats
router.get('/stats', authenticate, (_req: Request, res: Response) => {
  try {
    const totalSuppliers = queryAll('SELECT COUNT(*) as count FROM suppliers')[0]?.count || 0;
    const activeSuppliers = queryAll("SELECT COUNT(*) as count FROM suppliers WHERE status = 'active'")[0]?.count || 0;
    const totalRoutes = queryAll('SELECT COUNT(*) as count FROM transport_routes')[0]?.count || 0;
    const inboundRoutes = queryAll("SELECT COUNT(*) as count FROM transport_routes WHERE route_type = 'inbound'")[0]?.count || 0;
    const outboundRoutes = queryAll("SELECT COUNT(*) as count FROM transport_routes WHERE route_type = 'outbound'")[0]?.count || 0;
    const countries = queryAll('SELECT COUNT(DISTINCT country) as count FROM suppliers')[0]?.count || 0;
    const byStatus = queryAll('SELECT status, COUNT(*) as count FROM suppliers GROUP BY status');
    const byMode = queryAll('SELECT transport_mode, COUNT(*) as count FROM transport_routes GROUP BY transport_mode');

    res.json({ totalSuppliers, activeSuppliers, totalRoutes, inboundRoutes, outboundRoutes, countries, byStatus, byMode });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
