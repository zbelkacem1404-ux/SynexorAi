"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const schema_1 = require("./db/schema");
const auth_1 = __importDefault(require("./routes/auth"));
const suppliers_1 = __importDefault(require("./routes/suppliers"));
const routes_1 = __importDefault(require("./routes/routes"));
const meta_1 = __importDefault(require("./routes/meta"));
const booking_1 = __importDefault(require("./routes/booking"));
const kpi_1 = __importDefault(require("./routes/kpi"));
const routePlan_1 = __importDefault(require("./routes/routePlan"));
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
// Serve static HTML dashboard
app.use('/dashboard', express_1.default.static(path_1.default.join(__dirname, '..', '..'), { extensions: ['html'] }));
// Routes
app.use('/api/auth', auth_1.default);
app.use('/api/suppliers', suppliers_1.default);
app.use('/api/routes', routes_1.default);
app.use('/api/meta', meta_1.default);
app.use('/api/booking', booking_1.default);
app.use('/api/kpi', kpi_1.default);
app.use('/api/route-plans', routePlan_1.default);
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Initialize database then start server
(0, schema_1.initializeDb)().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
});
