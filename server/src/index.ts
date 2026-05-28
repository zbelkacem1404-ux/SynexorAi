import express from 'express';
import cors from 'cors';
import path from 'path';
import bcrypt from 'bcryptjs';
import { initializeDb, queryAll, runSql, execSql } from './db/schema';
import authRoutes from './routes/auth';
import supplierRoutes from './routes/suppliers';
import routeRoutes from './routes/routes';
import metaRoutes from './routes/meta';
import bookingRoutes from './routes/booking';
import kpiRoutes from './routes/kpi';
import routePlanRoutes from './routes/routePlan';
import forwarderRoutes from './routes/forwarders';
import routeOptimizerRoutes from './routes/route-optimizer';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static HTML dashboard
app.use('/dashboard', express.static(path.join(__dirname, '..', '..'), { extensions: ['html'] }));

// Serve React client build in production
const clientBuildPath = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientBuildPath));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/routes', routeRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/booking', bookingRoutes);
app.use('/api/kpi', kpiRoutes);
app.use('/api/route-plans', routePlanRoutes);
app.use('/api/forwarders', forwarderRoutes);
app.use('/api/route-optimizer', routeOptimizerRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// SPA fallback: serve React app for any non-API route
app.get('*', (_req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Auto-seed if database has no users (first run / fresh deploy)
async function autoSeed() {
  const users = queryAll('SELECT id FROM users LIMIT 1');
  if (users.length === 0) {
    console.log('No users found — auto-seeding database...');
    const adminHash = bcrypt.hashSync('admin123', 10);
    const viewerHash = bcrypt.hashSync('viewer123', 10);
    runSql('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', adminHash, 'admin']);
    runSql('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['viewer', viewerHash, 'viewer']);

    // Company settings
    execSql(`CREATE TABLE IF NOT EXISTS company_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    const settings: Record<string, string> = {
      company_name: 'RT', full_name: 'RT Automotive d.o.o.', industry: 'Automotive Tier 1 Supplier',
      hq_country: 'Croatia', hq_city: 'Zagreb', hq_address: 'Industrijska cesta 42, 10000 Zagreb',
      hq_latitude: '45.8150', hq_longitude: '15.9819', phone: '+385 1 234 5678',
      email: 'info@rt-automotive.hr', website: 'www.rt-automotive.hr', currency: 'EUR',
      default_port: 'Rijeka', default_airport: 'Zagreb Airport (ZAG)',
    };
    for (const [k, v] of Object.entries(settings)) {
      runSql('INSERT OR REPLACE INTO company_settings (key, value) VALUES (?, ?)', [k, v]);
    }
    console.log('Auto-seed complete: admin/admin123, viewer/viewer123');
  }
}

// Initialize database then start server
initializeDb().then(async () => {
  await autoSeed();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
