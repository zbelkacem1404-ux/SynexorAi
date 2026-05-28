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
// Backfill: sync any existing bookings that don't have a shipments record yet
function syncBookingsToShipments() {
    try {
        const orphanBookings = (0, schema_1.queryAll)(`
      SELECT r.*, s.company_name as supplier_name, s.city as supplier_city
      FROM transport_requisitions r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      WHERE r.status != 'cancelled'
        AND r.req_number NOT IN (SELECT shipment_number FROM shipments)
    `);
        for (const b of orphanBookings) {
            try {
                (0, schema_1.runSql)(`INSERT OR IGNORE INTO shipments (shipment_number, shipment_date, delivery_date, supplier_id, supplier_name,
            origin_city, transport_mode, carrier_name, pallets_shipped, pallet_capacity,
            weight_kg, volume_m3, total_cost_eur, is_on_time, is_urgent, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [b.req_number, b.pickup_date, b.delivery_date || null,
                    b.supplier_id, b.supplier_name || null,
                    b.supplier_city || null, b.transport_mode || 'road',
                    b.assigned_forwarder || null, b.pallets || 0, 33,
                    b.weight_kg || 0, b.volume_m3 || 0,
                    b.assigned_price || 0, b.status === 'delivered' ? 1 : 0,
                    b.priority === 'urgent' ? 1 : 0, b.status]);
            }
            catch { /* skip individual failures */ }
        }
    }
    catch { /* table might not exist yet */ }
}
// GET /kpi/compute — compute all KPIs from shipments + bookings
router.get('/compute', auth_1.authenticate, (_req, res) => {
    // Backfill any bookings (including already-delivered) that are missing from shipments
    syncBookingsToShipments();
    // Pull from shipments table (now includes all synced bookings)
    const rawShipments = (0, schema_1.queryAll)('SELECT * FROM shipments ORDER BY shipment_date DESC');
    // Also pull all non-cancelled bookings from transport_requisitions
    let bookingRecords = [];
    try {
        bookingRecords = (0, schema_1.queryAll)(`
      SELECT r.*, s.company_name as supplier_name, s.city as supplier_city, s.country as supplier_country,
        tr.name as route_name_joined, tr.shipment_type as route_shipment_type, tr.carrier_name as route_carrier
      FROM transport_requisitions r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      LEFT JOIN transport_routes tr ON tr.id = r.route_id
      WHERE r.status != 'cancelled'
    `);
    }
    catch { /* table might not exist yet */ }
    // Convert bookings to shipment-like records for unified KPI computation
    const bookingAsShipments = bookingRecords.map((b) => ({
        shipment_number: b.req_number,
        shipment_date: b.pickup_date,
        delivery_date: b.delivery_date,
        supplier_id: b.supplier_id,
        supplier_name: b.supplier_name || `Supplier #${b.supplier_id}`,
        route_name: b.route_name_joined || '',
        origin_city: b.supplier_city || '',
        origin_country: b.supplier_country || '',
        transport_mode: b.transport_mode || 'road',
        shipment_type: b.route_shipment_type || 'ftl',
        carrier_name: b.assigned_forwarder || b.route_carrier || '',
        pallets_shipped: b.pallets || 0,
        pallet_capacity: 33,
        weight_kg: b.weight_kg || 0,
        volume_m3: b.volume_m3 || 0,
        distance_km: 0,
        total_km: 0,
        empty_km: 0,
        total_cost_eur: b.assigned_price || 0,
        material_value_eur: 0,
        is_on_time: b.status === 'delivered' ? 1 : 0,
        is_urgent: b.priority === 'urgent' ? 1 : 0,
        is_consolidated: b.route_shipment_type === 'milkrun' ? 1 : 0,
        status: b.status,
        _source: 'booking'
    }));
    // Merge: shipments + booking records (avoid duplicates by shipment_number)
    const existingNumbers = new Set(rawShipments.map((s) => s.shipment_number));
    const uniqueBookings = bookingAsShipments.filter((b) => !existingNumbers.has(b.shipment_number));
    const shipments = [...rawShipments, ...uniqueBookings];
    const total = shipments.length;
    // --- Truck Utilization ---
    const fillRates = shipments.filter((s) => s.pallet_capacity > 0)
        .map((s) => (s.pallets_shipped / s.pallet_capacity) * 100);
    const avgFillRate = fillRates.length > 0 ? fillRates.reduce((a, b) => a + b, 0) / fillRates.length : 0;
    const emptyTruckCount = fillRates.filter((r) => r < 40).length;
    const emptyTruckRatio = (emptyTruckCount / Math.max(fillRates.length, 1)) * 100;
    const totalKm = shipments.reduce((s, r) => s + (r.total_km || r.distance_km || 0), 0);
    const emptyKm = shipments.reduce((s, r) => s + (r.empty_km || 0), 0);
    const deadheadRatio = totalKm > 0 ? (emptyKm / totalKm) * 100 : 0;
    // Weighted utilization: sum(pallets_shipped) / sum(pallet_capacity) * 100
    const totalPalletsShipped = shipments.reduce((s, r) => s + (r.pallets_shipped || 0), 0);
    const totalPalletCapacity = shipments.reduce((s, r) => s + (r.pallet_capacity || 33), 0);
    const avgUtilization = totalPalletCapacity > 0 ? (totalPalletsShipped / totalPalletCapacity) * 100 : 0;
    // --- Cost KPIs ---
    const totalCost = shipments.reduce((s, r) => s + (r.total_cost_eur || 0), 0);
    const totalWeight = shipments.reduce((s, r) => s + (r.weight_kg || 0), 0);
    const totalDistance = shipments.reduce((s, r) => s + (r.distance_km || 0), 0);
    const costPerPallet = totalPalletsShipped > 0 ? totalCost / totalPalletsShipped : 0;
    const costPerKm = totalDistance > 0 ? totalCost / totalDistance : 0;
    const costPerTruck = total > 0 ? totalCost / total : 0;
    const costPerKg = totalWeight > 0 ? totalCost / totalWeight : 0;
    // --- Network Efficiency ---
    const avgShipmentSize = total > 0 ? totalPalletsShipped / total : 0;
    const consolidatedCount = shipments.filter((s) => s.is_consolidated).length;
    const consolidationRate = (consolidatedCount / Math.max(total, 1)) * 100;
    const avgDistance = total > 0 ? totalDistance / total : 0;
    // Transport frequency: shipments per unique day
    const uniqueDays = new Set(shipments.map((s) => s.shipment_date?.substring(0, 10))).size;
    const transportFrequency = uniqueDays > 0 ? total / uniqueDays : 0;
    // --- Operational ---
    const onTimeCount = shipments.filter((s) => s.is_on_time).length;
    const onTimeDispatch = (onTimeCount / Math.max(total, 1)) * 100;
    const urgentCount = shipments.filter((s) => s.is_urgent).length;
    const urgentPct = (urgentCount / Math.max(total, 1)) * 100;
    // Mode mix
    const modeMap = {};
    shipments.forEach((s) => { modeMap[s.transport_mode] = (modeMap[s.transport_mode] || 0) + 1; });
    const modeMix = Object.entries(modeMap).map(([mode, count]) => ({
        mode, percentage: Math.round((count / total) * 100)
    })).sort((a, b) => b.percentage - a.percentage);
    // --- Advanced ---
    const totalMaterialValue = shipments.reduce((s, r) => s + (r.material_value_eur || 0), 0);
    const freightPctOfValue = totalMaterialValue > 0 ? (totalCost / totalMaterialValue) * 100 : 0;
    const targetFillRate = 85;
    const truckReductionPct = avgFillRate > 0 ? Math.round((1 - avgFillRate / targetFillRate) * 100) : 0;
    const savingsPotential = totalCost * Math.max(0, 1 - avgFillRate / targetFillRate);
    // --- Per-supplier aggregations ---
    const supplierMap = {};
    shipments.forEach((s) => {
        const key = s.supplier_name || `Supplier #${s.supplier_id}`;
        if (!supplierMap[key])
            supplierMap[key] = { pallets: 0, capacity: 0, cost: 0, count: 0 };
        supplierMap[key].pallets += s.pallets_shipped || 0;
        supplierMap[key].capacity += s.pallet_capacity || 33;
        supplierMap[key].cost += s.total_cost_eur || 0;
        supplierMap[key].count += 1;
    });
    const fillRateByRoute = Object.entries(supplierMap)
        .map(([route, d]) => ({ route, value: d.capacity > 0 ? Math.round((d.pallets / d.capacity) * 100) : 0 }))
        .sort((a, b) => b.value - a.value).slice(0, 10);
    const costPerPalletByLane = Object.entries(supplierMap)
        .map(([lane, d]) => ({ lane, value: d.pallets > 0 ? Math.round((d.cost / d.pallets) * 100) / 100 : 0 }))
        .sort((a, b) => b.value - a.value).slice(0, 10);
    const worstUtilization = Object.entries(supplierMap)
        .map(([supplier, d]) => ({ supplier, fill: d.capacity > 0 ? Math.round((d.pallets / d.capacity) * 100) : 0 }))
        .sort((a, b) => a.fill - b.fill).slice(0, 5);
    const expensiveLanes = Object.entries(supplierMap)
        .map(([supplier, d]) => ({
        supplier: `${supplier} → RT`,
        cost: d.pallets > 0 ? Math.round((d.cost / d.pallets) * 100) / 100 : 0,
        status: (d.pallets > 0 && d.cost / d.pallets > 30) ? 'critical' : 'warning'
    }))
        .sort((a, b) => b.cost - a.cost).slice(0, 5);
    // Monthly trend
    const monthMap = {};
    shipments.forEach((s) => {
        const m = (s.shipment_date || '').substring(0, 7); // YYYY-MM
        if (!monthMap[m])
            monthMap[m] = { pallets: 0, capacity: 0 };
        monthMap[m].pallets += s.pallets_shipped || 0;
        monthMap[m].capacity += s.pallet_capacity || 33;
    });
    const monthlyTrend = Object.entries(monthMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-6)
        .map(([month, d]) => ({
        month: new Date(month + '-01').toLocaleString('en', { month: 'short' }),
        fillRate: d.capacity > 0 ? Math.round((d.pallets / d.capacity) * 100) : 0,
        target: targetFillRate
    }));
    // Route plan stats
    let routePlanStats = null;
    try {
        routePlanStats = (0, schema_1.queryOne)(`SELECT
      COUNT(*) as total_routes,
      SUM(CASE WHEN transport_mode='FTL' THEN 1 ELSE 0 END) as ftl,
      SUM(CASE WHEN transport_mode='LTL' THEN 1 ELSE 0 END) as ltl,
      SUM(CASE WHEN transport_mode='MR' THEN 1 ELSE 0 END) as milkrun,
      SUM(CASE WHEN transport_mode='HUB' THEN 1 ELSE 0 END) as hub,
      SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END) as inbound,
      SUM(CASE WHEN direction='outbound' THEN 1 ELSE 0 END) as outbound,
      AVG(transit_time_days) as avg_transit,
      COUNT(DISTINCT carrier) as unique_carriers,
      COUNT(DISTINCT origin_country) as origin_countries,
      COUNT(DISTINCT destination_country) as dest_countries
    FROM route_plans`);
    }
    catch { /* table might not exist */ }
    res.json({
        hasData: true,
        total,
        utilization: {
            avgFillRate: Math.round(avgFillRate * 10) / 10,
            emptyTruckRatio: Math.round(emptyTruckRatio * 10) / 10,
            deadheadRatio: Math.round(deadheadRatio * 10) / 10,
            avgUtilization: Math.round(avgUtilization * 10) / 10,
        },
        costs: {
            costPerPallet: Math.round(costPerPallet * 100) / 100,
            costPerKm: Math.round(costPerKm * 100) / 100,
            costPerTruck: Math.round(costPerTruck),
            costPerKg: Math.round(costPerKg * 100) / 100,
        },
        network: {
            avgShipmentSize: Math.round(avgShipmentSize * 10) / 10,
            consolidationRate: Math.round(consolidationRate * 10) / 10,
            avgDistance: Math.round(avgDistance),
            transportFrequency: Math.round(transportFrequency * 10) / 10,
        },
        operational: {
            onTimeDispatch: Math.round(onTimeDispatch * 10) / 10,
            urgentPct: Math.round(urgentPct * 10) / 10,
            modeMix,
        },
        advanced: {
            freightPctOfValue: Math.round(freightPctOfValue * 10) / 10,
            targetFillRate,
            currentFillRate: Math.round(avgFillRate * 10) / 10,
            truckReductionPct,
            savingsPotential: Math.round(savingsPotential),
        },
        fillRateByRoute,
        costPerPalletByLane,
        worstUtilization,
        expensiveLanes,
        monthlyTrend,
        routePlan: routePlanStats,
    });
});
// GET /kpi/shipments — list all shipments
router.get('/shipments', auth_1.authenticate, (req, res) => {
    const limit = parseInt(req.query.limit) || 500;
    const offset = parseInt(req.query.offset) || 0;
    const shipments = (0, schema_1.queryAll)('SELECT * FROM shipments ORDER BY shipment_date DESC LIMIT ? OFFSET ?', [limit, offset]);
    const countRow = (0, schema_1.queryOne)('SELECT COUNT(*) as cnt FROM shipments');
    res.json({ shipments, total: countRow?.cnt || 0 });
});
// POST /kpi/shipments — create single shipment
router.post('/shipments', auth_1.authenticate, auth_1.requireAdmin, (req, res) => {
    const s = req.body;
    if (!s.shipment_date || !s.pallets_shipped) {
        return res.status(400).json({ error: 'shipment_date and pallets_shipped required' });
    }
    const num = 'SH-' + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5);
    const { lastId } = (0, schema_1.runSql)(`INSERT INTO shipments (shipment_number, shipment_date, delivery_date, supplier_id, supplier_name,
      route_id, route_name, origin_city, origin_country, transport_mode, shipment_type, carrier_name,
      pallets_shipped, pallet_capacity, weight_kg, volume_m3, distance_km, total_km, empty_km,
      total_cost_eur, material_value_eur, is_on_time, is_urgent, is_consolidated, status, notes)
    VALUES (?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?)`, [num, s.shipment_date, s.delivery_date || null, s.supplier_id || null, s.supplier_name || null,
        s.route_id || null, s.route_name || null, s.origin_city || null, s.origin_country || null,
        s.transport_mode || 'road', s.shipment_type || 'ftl', s.carrier_name || null,
        s.pallets_shipped || 0, s.pallet_capacity || 33, s.weight_kg || 0, s.volume_m3 || 0,
        s.distance_km || 0, s.total_km || s.distance_km || 0, s.empty_km || 0,
        s.total_cost_eur || 0, s.material_value_eur || 0,
        s.is_on_time !== undefined ? (s.is_on_time ? 1 : 0) : 1,
        s.is_urgent ? 1 : 0, s.is_consolidated ? 1 : 0,
        s.status || 'delivered', s.notes || null]);
    const created = (0, schema_1.queryOne)('SELECT * FROM shipments WHERE id = ?', [lastId]);
    res.status(201).json(created);
});
// POST /kpi/shipments/import — bulk import from CSV
router.post('/shipments/import', auth_1.authenticate, auth_1.requireAdmin, upload.single('file'), (req, res) => {
    if (!req.file)
        return res.status(400).json({ error: 'No file uploaded' });
    let records;
    try {
        records = (0, sync_2.parse)(req.file.buffer.toString(), { columns: true, skip_empty_lines: true, trim: true });
    }
    catch (e) {
        return res.status(400).json({ error: `CSV parse error: ${e.message}` });
    }
    let imported = 0;
    const errors = [];
    for (const row of records) {
        try {
            const shipDate = row['Shipment Date'] || row['shipment_date'] || row['Date'];
            const pallets = parseFloat(row['Pallets Shipped'] || row['pallets_shipped'] || row['Pallets'] || '0');
            if (!shipDate) {
                errors.push(`Row ${imported + errors.length + 2}: missing date`);
                continue;
            }
            const num = row['Shipment Number'] || row['shipment_number'] || ('SH-' + String(Date.now()).slice(-6) + String(Math.random()).slice(2, 5));
            // Try to resolve supplier by name
            let supplierId = row['Supplier ID'] || row['supplier_id'] || null;
            const supplierName = row['Supplier Name'] || row['supplier_name'] || row['Supplier'] || '';
            if (!supplierId && supplierName) {
                const found = (0, schema_1.queryOne)('SELECT id FROM suppliers WHERE company_name = ? COLLATE NOCASE', [supplierName.trim()]);
                if (found)
                    supplierId = found.id;
            }
            const parseBool = (v) => {
                if (!v)
                    return 0;
                const lv = v.toString().toLowerCase().trim();
                return (lv === 'yes' || lv === 'y' || lv === '1' || lv === 'true') ? 1 : 0;
            };
            (0, schema_1.runSql)(`INSERT OR IGNORE INTO shipments (shipment_number, shipment_date, delivery_date, supplier_id, supplier_name,
          route_name, origin_city, origin_country, transport_mode, shipment_type, carrier_name,
          pallets_shipped, pallet_capacity, weight_kg, volume_m3, distance_km, total_km, empty_km,
          total_cost_eur, material_value_eur, is_on_time, is_urgent, is_consolidated, status, notes)
        VALUES (?,?,?,?,?, ?,?,?,?,?,?, ?,?,?,?,?,?,?, ?,?,?,?,?,?,?)`, [
                num, shipDate,
                row['Delivery Date'] || row['delivery_date'] || null,
                supplierId, supplierName,
                row['Route Name'] || row['route_name'] || null,
                row['Origin City'] || row['origin_city'] || null,
                row['Origin Country'] || row['origin_country'] || null,
                (row['Transport Mode'] || row['transport_mode'] || 'road').toLowerCase(),
                (row['Shipment Type'] || row['shipment_type'] || 'ftl').toLowerCase(),
                row['Carrier'] || row['carrier_name'] || null,
                pallets,
                parseFloat(row['Pallet Capacity'] || row['pallet_capacity'] || '33'),
                parseFloat(row['Weight (kg)'] || row['weight_kg'] || '0'),
                parseFloat(row['Volume (m3)'] || row['volume_m3'] || '0'),
                parseFloat(row['Distance (km)'] || row['distance_km'] || '0'),
                parseFloat(row['Total KM'] || row['total_km'] || row['Distance (km)'] || row['distance_km'] || '0'),
                parseFloat(row['Empty KM'] || row['empty_km'] || '0'),
                parseFloat(row['Total Cost (EUR)'] || row['total_cost_eur'] || '0'),
                parseFloat(row['Material Value (EUR)'] || row['material_value_eur'] || '0'),
                parseBool(row['On Time'] || row['is_on_time'] || 'yes'),
                parseBool(row['Urgent'] || row['is_urgent'] || 'no'),
                parseBool(row['Consolidated'] || row['is_consolidated'] || 'no'),
                row['Status'] || row['status'] || 'delivered',
                row['Notes'] || row['notes'] || null,
            ]);
            imported++;
        }
        catch (e) {
            errors.push(`Row ${imported + errors.length + 2}: ${e.message}`);
        }
    }
    res.json({ message: `Imported ${imported} shipments`, imported, errors, total: records.length });
});
// GET /kpi/shipments/export — export all shipments as CSV
router.get('/shipments/export', auth_1.authenticate, (req, res) => {
    const shipments = (0, schema_1.queryAll)('SELECT * FROM shipments ORDER BY shipment_date DESC');
    const rows = shipments.map((s) => ({
        'Shipment Number': s.shipment_number,
        'Shipment Date': s.shipment_date,
        'Delivery Date': s.delivery_date || '',
        'Supplier Name': s.supplier_name || '',
        'Route Name': s.route_name || '',
        'Origin City': s.origin_city || '',
        'Origin Country': s.origin_country || '',
        'Transport Mode': s.transport_mode,
        'Shipment Type': s.shipment_type,
        'Carrier': s.carrier_name || '',
        'Pallets Shipped': s.pallets_shipped,
        'Pallet Capacity': s.pallet_capacity,
        'Weight (kg)': s.weight_kg || 0,
        'Volume (m3)': s.volume_m3 || 0,
        'Distance (km)': s.distance_km || 0,
        'Total KM': s.total_km || 0,
        'Empty KM': s.empty_km || 0,
        'Total Cost (EUR)': s.total_cost_eur || 0,
        'Material Value (EUR)': s.material_value_eur || 0,
        'On Time': s.is_on_time ? 'Yes' : 'No',
        'Urgent': s.is_urgent ? 'Yes' : 'No',
        'Consolidated': s.is_consolidated ? 'Yes' : 'No',
        'Status': s.status,
        'Notes': s.notes || '',
    }));
    const csv = (0, sync_1.stringify)(rows, { header: true });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=shipments_kpi_export.csv');
    res.send(csv);
});
// DELETE /kpi/shipments — clear all shipments
router.delete('/shipments', auth_1.authenticate, auth_1.requireAdmin, (_req, res) => {
    (0, schema_1.execSql)('DELETE FROM shipments');
    res.json({ message: 'All shipments deleted' });
});
exports.default = router;
