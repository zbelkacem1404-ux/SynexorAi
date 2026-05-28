import express from 'express';
import cors from 'cors';
import path from 'path';
import { initializeDb } from './db/schema';
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

// Initialize database then start server
initializeDb().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
