import { Router, Request, Response } from 'express';
import { queryAll, queryOne, runSql, execSql, getDbSync, saveDb } from '../db/schema';
import { authenticate, requireAdmin, requireSupervisor, requireInternal } from '../middleware/auth';

const router = Router();

// Ensure booking tables exist (with new route-plan-aligned columns)
function ensureBookingTables() {
  const db = getDbSync();
  db.run(`CREATE TABLE IF NOT EXISTS transport_requisitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    req_number TEXT UNIQUE NOT NULL,
    requestor_name TEXT NOT NULL,
    department TEXT,
    supplier_id INTEGER REFERENCES suppliers(id),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
    direction TEXT NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound')),
    shipment_type TEXT DEFAULT 'FTL',
    origin_id TEXT,
    origin_name TEXT,
    origin_zip TEXT,
    origin_city TEXT,
    origin_country TEXT,
    destination_id TEXT,
    destination_name TEXT,
    destination_zip TEXT,
    destination_city TEXT,
    destination_country TEXT,
    route_description TEXT,
    pickup_date TEXT NOT NULL,
    pickup_time TEXT,
    delivery_date TEXT,
    arrival_time TEXT,
    carrier TEXT,
    equipment TEXT,
    transit_days REAL,
    customs TEXT,
    pallets INTEGER NOT NULL,
    weight_kg REAL,
    volume_m3 REAL,
    transport_mode TEXT NOT NULL DEFAULT 'road',
    material_description TEXT,
    special_instructions TEXT,
    is_special_transport INTEGER DEFAULT 0,
    matched_route_plan_id INTEGER,
    status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','pending_approval','spot_requested','quotes_received','assigned','in_transit','delivered','cancelled')),
    assigned_forwarder TEXT,
    assigned_price REAL,
    route_id INTEGER REFERENCES transport_routes(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS forwarder_quotes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisition_id INTEGER NOT NULL REFERENCES transport_requisitions(id) ON DELETE CASCADE,
    forwarder_name TEXT NOT NULL,
    price REAL NOT NULL,
    currency TEXT DEFAULT 'EUR',
    transit_days INTEGER,
    valid_until TEXT,
    notes TEXT,
    selected INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // Migrations for new columns on existing tables
  const newCols = [
    { col: 'direction', sql: "ALTER TABLE transport_requisitions ADD COLUMN direction TEXT DEFAULT 'inbound'" },
    { col: 'shipment_type', sql: "ALTER TABLE transport_requisitions ADD COLUMN shipment_type TEXT DEFAULT 'FTL'" },
    { col: 'origin_id', sql: "ALTER TABLE transport_requisitions ADD COLUMN origin_id TEXT" },
    { col: 'origin_name', sql: "ALTER TABLE transport_requisitions ADD COLUMN origin_name TEXT" },
    { col: 'origin_zip', sql: "ALTER TABLE transport_requisitions ADD COLUMN origin_zip TEXT" },
    { col: 'origin_city', sql: "ALTER TABLE transport_requisitions ADD COLUMN origin_city TEXT" },
    { col: 'origin_country', sql: "ALTER TABLE transport_requisitions ADD COLUMN origin_country TEXT" },
    { col: 'destination_id', sql: "ALTER TABLE transport_requisitions ADD COLUMN destination_id TEXT" },
    { col: 'destination_name', sql: "ALTER TABLE transport_requisitions ADD COLUMN destination_name TEXT" },
    { col: 'destination_zip', sql: "ALTER TABLE transport_requisitions ADD COLUMN destination_zip TEXT" },
    { col: 'destination_city', sql: "ALTER TABLE transport_requisitions ADD COLUMN destination_city TEXT" },
    { col: 'destination_country', sql: "ALTER TABLE transport_requisitions ADD COLUMN destination_country TEXT" },
    { col: 'route_description', sql: "ALTER TABLE transport_requisitions ADD COLUMN route_description TEXT" },
    { col: 'pickup_time', sql: "ALTER TABLE transport_requisitions ADD COLUMN pickup_time TEXT" },
    { col: 'arrival_time', sql: "ALTER TABLE transport_requisitions ADD COLUMN arrival_time TEXT" },
    { col: 'carrier', sql: "ALTER TABLE transport_requisitions ADD COLUMN carrier TEXT" },
    { col: 'equipment', sql: "ALTER TABLE transport_requisitions ADD COLUMN equipment TEXT" },
    { col: 'transit_days', sql: "ALTER TABLE transport_requisitions ADD COLUMN transit_days REAL" },
    { col: 'customs', sql: "ALTER TABLE transport_requisitions ADD COLUMN customs TEXT" },
    { col: 'is_special_transport', sql: "ALTER TABLE transport_requisitions ADD COLUMN is_special_transport INTEGER DEFAULT 0" },
    { col: 'matched_route_plan_id', sql: "ALTER TABLE transport_requisitions ADD COLUMN matched_route_plan_id INTEGER" },
    { col: 'additional_origins', sql: "ALTER TABLE transport_requisitions ADD COLUMN additional_origins TEXT" },
    { col: 'pickup_day_code', sql: "ALTER TABLE transport_requisitions ADD COLUMN pickup_day_code TEXT" },
    { col: 'delivery_day_code', sql: "ALTER TABLE transport_requisitions ADD COLUMN delivery_day_code TEXT" },
    { col: 'pallet_height', sql: "ALTER TABLE transport_requisitions ADD COLUMN pallet_height REAL" },
    { col: 'stackable', sql: "ALTER TABLE transport_requisitions ADD COLUMN stackable INTEGER DEFAULT 0" },
    { col: 'pallet_length', sql: "ALTER TABLE transport_requisitions ADD COLUMN pallet_length REAL" },
    { col: 'pallet_width', sql: "ALTER TABLE transport_requisitions ADD COLUMN pallet_width REAL" },
    { col: 'deviations', sql: "ALTER TABLE transport_requisitions ADD COLUMN deviations TEXT" },
    { col: 'deviation_justification', sql: "ALTER TABLE transport_requisitions ADD COLUMN deviation_justification TEXT" },
    { col: 'approval_status', sql: "ALTER TABLE transport_requisitions ADD COLUMN approval_status TEXT DEFAULT 'approved'" },
    { col: 'volume_util_pct', sql: "ALTER TABLE transport_requisitions ADD COLUMN volume_util_pct REAL" },
    { col: 'weight_util_pct', sql: "ALTER TABLE transport_requisitions ADD COLUMN weight_util_pct REAL" },
    { col: 'approved_by', sql: "ALTER TABLE transport_requisitions ADD COLUMN approved_by TEXT" },
    { col: 'approval_timestamp', sql: "ALTER TABLE transport_requisitions ADD COLUMN approval_timestamp TEXT" },
    { col: 'approval_notes', sql: "ALTER TABLE transport_requisitions ADD COLUMN approval_notes TEXT" },
  ];
  for (const m of newCols) {
    try { db.run(`SELECT ${m.col} FROM transport_requisitions LIMIT 1`); }
    catch { try { db.run(m.sql); } catch { /* already exists */ } }
  }

  // Migration: fix CHECK constraint to include 'pending_approval' status
  // SQLite doesn't support ALTER CONSTRAINT, so we recreate the table
  try {
    const schemaRow = db.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='transport_requisitions'");
    const schemaSql = schemaRow[0]?.values[0]?.[0] as string || '';
    if (schemaSql && !schemaSql.includes('pending_approval')) {
      console.log('[MIGRATION] Recreating transport_requisitions to add pending_approval status...');
      // Ensure all columns exist before migration (they may have been added as ALTER TABLE)
      const migCols = [
        ['deviation_justification', 'TEXT'],
        ['approval_status', "TEXT DEFAULT 'approved'"],
        ['volume_util_pct', 'REAL'],
        ['weight_util_pct', 'REAL']
      ];
      for (const [col, def] of migCols) {
        try { db.run(`SELECT ${col} FROM transport_requisitions LIMIT 1`); }
        catch { try { db.run(`ALTER TABLE transport_requisitions ADD COLUMN ${col} ${def}`); } catch {} }
      }
      db.run(`ALTER TABLE transport_requisitions RENAME TO _tr_old`);
      // Recreate with correct constraint
      db.run(`CREATE TABLE transport_requisitions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        req_number TEXT UNIQUE NOT NULL,
        requestor_name TEXT NOT NULL,
        department TEXT,
        supplier_id INTEGER REFERENCES suppliers(id),
        priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low','medium','high','urgent')),
        direction TEXT NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound')),
        shipment_type TEXT DEFAULT 'FTL',
        origin_id TEXT, origin_name TEXT, origin_zip TEXT, origin_city TEXT, origin_country TEXT,
        destination_id TEXT, destination_name TEXT, destination_zip TEXT, destination_city TEXT, destination_country TEXT,
        route_description TEXT, additional_origins TEXT,
        pickup_day_code TEXT, delivery_day_code TEXT,
        pickup_date TEXT NOT NULL, pickup_time TEXT, delivery_date TEXT, arrival_time TEXT,
        carrier TEXT, equipment TEXT, transit_days REAL, customs TEXT,
        pallets INTEGER NOT NULL, pallet_height REAL, pallet_length REAL, pallet_width REAL, stackable INTEGER DEFAULT 0,
        weight_kg REAL, volume_m3 REAL,
        transport_mode TEXT NOT NULL DEFAULT 'road',
        material_description TEXT, special_instructions TEXT,
        is_special_transport INTEGER DEFAULT 0,
        matched_route_plan_id INTEGER,
        deviations TEXT, deviation_justification TEXT,
        approval_status TEXT DEFAULT 'approved',
        volume_util_pct REAL, weight_util_pct REAL,
        status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','pending_approval','spot_requested','quotes_received','assigned','in_transit','delivered','cancelled')),
        assigned_forwarder TEXT, assigned_price REAL,
        route_id INTEGER REFERENCES transport_routes(id),
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )`);
      // Copy data — use column intersection
      db.run(`INSERT INTO transport_requisitions (
        id, req_number, requestor_name, department, supplier_id, priority,
        direction, shipment_type,
        origin_id, origin_name, origin_zip, origin_city, origin_country,
        destination_id, destination_name, destination_zip, destination_city, destination_country,
        route_description, additional_origins, pickup_day_code, delivery_day_code,
        pickup_date, pickup_time, delivery_date, arrival_time,
        carrier, equipment, transit_days, customs,
        pallets, pallet_height, pallet_length, pallet_width, stackable,
        weight_kg, volume_m3, transport_mode, material_description, special_instructions,
        is_special_transport, matched_route_plan_id, deviations, deviation_justification,
        approval_status, volume_util_pct, weight_util_pct,
        status, assigned_forwarder, assigned_price, route_id, created_at, updated_at
      ) SELECT
        id, req_number, requestor_name, department, supplier_id, priority,
        COALESCE(direction, 'inbound'), COALESCE(shipment_type, 'FTL'),
        origin_id, origin_name, origin_zip, origin_city, origin_country,
        destination_id, destination_name, destination_zip, destination_city, destination_country,
        route_description, additional_origins, pickup_day_code, delivery_day_code,
        pickup_date, pickup_time, delivery_date, arrival_time,
        carrier, equipment, transit_days, customs,
        pallets, pallet_height, pallet_length, pallet_width, COALESCE(stackable, 0),
        weight_kg, volume_m3, COALESCE(transport_mode, 'road'), material_description, special_instructions,
        COALESCE(is_special_transport, 0), matched_route_plan_id, deviations, deviation_justification,
        COALESCE(approval_status, 'approved'), volume_util_pct, weight_util_pct,
        status, assigned_forwarder, assigned_price, route_id, created_at, updated_at
      FROM _tr_old`);
      db.run(`DROP TABLE _tr_old`);
      saveDb();
      console.log('[MIGRATION] transport_requisitions table recreated with pending_approval status');
    }
  } catch (e: any) {
    console.error('[MIGRATION ERROR]', e.message || e);
  }
}

// GET all requisitions with supplier info and quotes
router.get('/requisitions', authenticate, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const requisitions = queryAll(`
      SELECT r.*, s.company_name as supplier_name, s.city as supplier_city
      FROM transport_requisitions r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      ORDER BY r.created_at DESC
    `);

    const enriched = requisitions.map((r: any) => {
      const quotes = queryAll('SELECT * FROM forwarder_quotes WHERE requisition_id = ? ORDER BY price ASC', [r.id]);
      return { ...r, quotes, is_special_transport: !!r.is_special_transport };
    });

    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET single requisition
router.get('/requisitions/:id', authenticate, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const requisition = queryOne(`
      SELECT r.*, s.company_name as supplier_name, s.city as supplier_city
      FROM transport_requisitions r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      WHERE r.id = ?
    `, [req.params.id]);

    if (!requisition) return res.status(404).json({ error: 'Requisition not found' });

    const quotes = queryAll('SELECT * FROM forwarder_quotes WHERE requisition_id = ? ORDER BY price ASC', [requisition.id]);
    res.json({ ...requisition, quotes, is_special_transport: !!requisition.is_special_transport });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Helper: Server-side deviation detection against route plan ────
function detectDeviations(
  plan: any,
  pickup_date: string | null, delivery_date: string | null,
  carrier: string | null, shipment_type: string | null, equipment: string | null
): string[] {
  const DAY_CODE_WEEKDAY: Record<string, number> = { M0:1,T0:2,W0:3,R0:4,F0:5,S0:6,Z0:0,M1:1,T1:2,W1:3,R1:4,F1:5,S1:6 };
  const WEEKDAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const deviationList: string[] = [];

  // 1) Pickup day mismatch
  if (plan.pickup_date && pickup_date) {
    const expected = DAY_CODE_WEEKDAY[plan.pickup_date];
    const actual = new Date(pickup_date).getDay();
    if (expected !== undefined && actual !== expected) {
      deviationList.push(`Pickup day: route plan requires ${plan.pickup_date} (${WEEKDAY_NAMES[expected]}), selected ${WEEKDAY_NAMES[actual]}`);
    }
  }
  // 2) Delivery day mismatch
  if (plan.delivery_date && delivery_date) {
    const expected = DAY_CODE_WEEKDAY[plan.delivery_date];
    const actual = new Date(delivery_date).getDay();
    if (expected !== undefined && actual !== expected) {
      deviationList.push(`Delivery day: route plan requires ${plan.delivery_date} (${WEEKDAY_NAMES[expected]}), selected ${WEEKDAY_NAMES[actual]}`);
    }
  }
  // 3) Carrier mismatch
  if (plan.carrier && carrier && carrier !== plan.carrier) {
    deviationList.push(`Carrier: route plan requires "${plan.carrier}", selected "${carrier}"`);
  }
  // 4) Transport type mismatch
  if (plan.transport_mode && shipment_type && shipment_type !== plan.transport_mode) {
    deviationList.push(`Transport type: route plan requires "${plan.transport_mode}", selected "${shipment_type}"`);
  }
  // 5) Equipment mismatch
  if (plan.equipment && equipment && equipment !== plan.equipment) {
    deviationList.push(`Equipment: route plan requires "${plan.equipment}", selected "${equipment}"`);
  }
  return deviationList;
}

// CREATE requisition (route-plan aligned, with SERVER-SIDE deviation enforcement)
router.post('/requisitions', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const {
      requestor_name, department, supplier_id, priority,
      direction, shipment_type,
      origin_id, origin_name, origin_zip, origin_city, origin_country,
      destination_id, destination_name, destination_zip, destination_city, destination_country,
      route_description, additional_origins,
      pickup_day_code, delivery_day_code,
      pickup_date, pickup_time, delivery_date, arrival_time,
      carrier, equipment, transit_days, customs,
      pallets, pallet_height, pallet_length, pallet_width, stackable, weight_kg, volume_m3,
      transport_mode, material_description, special_instructions,
      is_special_transport: clientSpecial, matched_route_plan_id, deviations: clientDeviations,
      deviation_justification, approval_status: clientApproval, volume_util_pct, weight_util_pct
    } = req.body;

    if (!requestor_name || !pickup_date || !pallets) {
      return res.status(400).json({ error: 'requestor_name, pickup_date, and pallets are required' });
    }

    // ═══ SERVER-SIDE DEVIATION DETECTION (authoritative — overrides frontend) ═══
    let serverDeviations: string[] = [];
    let isDeviation = false;
    let resolvedPlan: any = null;

    // Step 1: If we have a matched route plan, compare ALL fields server-side
    if (matched_route_plan_id) {
      resolvedPlan = queryOne('SELECT * FROM route_plans WHERE id = ?', [matched_route_plan_id]);
      if (resolvedPlan) {
        serverDeviations = detectDeviations(resolvedPlan, pickup_date, delivery_date, carrier, shipment_type, equipment);
        isDeviation = serverDeviations.length > 0;
      }
    }

    // Step 2: Also try to find a matching route plan by supplier if none provided
    // (catches case where frontend didn't link a plan but one exists)
    if (!matched_route_plan_id && supplier_id && !clientSpecial) {
      const sup = queryOne('SELECT supplier_id, company_name FROM suppliers WHERE id = ?', [supplier_id]);
      if (sup) {
        const dir = direction || 'inbound';
        const plans = queryAll(
          `SELECT * FROM route_plans WHERE direction = ? AND (origin_id = ? OR origin_name = ? OR destination_id = ? OR destination_name = ?)`,
          [dir, sup.supplier_id, sup.company_name, sup.supplier_id, sup.company_name]
        );
        if (plans.length > 0) {
          // Route plan exists for this supplier but wasn't matched — check each one
          for (const plan of plans) {
            const devs = detectDeviations(plan, pickup_date, delivery_date, carrier, shipment_type, equipment);
            if (devs.length === 0) {
              // Found a compliant plan — use it
              resolvedPlan = plan;
              serverDeviations = [];
              isDeviation = false;
              break;
            }
            // Track deviations from the first plan as reference
            if (!resolvedPlan) {
              resolvedPlan = plan;
              serverDeviations = devs;
              isDeviation = true;
            }
          }
        }
      }
    }

    // Step 3: Determine final deviation state
    // Server-side detection overrides client-side — if server detects deviation, it IS a deviation
    const finalIsSpecial = isDeviation || !!clientSpecial;
    const finalDeviations = serverDeviations.length > 0
      ? JSON.stringify(serverDeviations)
      : (clientDeviations || null);

    // Step 4: If deviation detected, REQUIRE justification
    if (finalIsSpecial && !deviation_justification?.trim()) {
      const deviationMsg = serverDeviations.length > 0
        ? `Deviation detected: ${serverDeviations.join('; ')}. `
        : '';
      return res.status(400).json({
        error: `${deviationMsg}This requisition does not comply with the assigned route plan and will be treated as Special / Urgent Transport. Deviation justification is mandatory.`,
        deviations: serverDeviations,
        requires_justification: true
      });
    }

    // Step 5: Determine status — deviation → pending_approval, compliant → new
    const finalStatus = finalIsSpecial ? 'pending_approval' : 'new';
    const finalApproval = finalIsSpecial ? 'pending' : 'approved';
    const finalPriority = finalIsSpecial ? 'urgent' : (priority || 'medium');

    // Generate req_number
    const lastReq = queryOne('SELECT req_number FROM transport_requisitions ORDER BY id DESC LIMIT 1');
    let nextNum = 1001;
    if (lastReq?.req_number) {
      const num = parseInt(lastReq.req_number.replace('TR-', ''));
      if (!isNaN(num)) nextNum = num + 1;
    }
    const req_number = `TR-${nextNum}`;

    // INSERT with server-determined status (NOT client-determined)
    const { lastId: id } = runSql(
      `INSERT INTO transport_requisitions (
        req_number, requestor_name, department, supplier_id, priority,
        direction, shipment_type,
        origin_id, origin_name, origin_zip, origin_city, origin_country,
        destination_id, destination_name, destination_zip, destination_city, destination_country,
        route_description, additional_origins,
        pickup_day_code, delivery_day_code,
        pickup_date, pickup_time, delivery_date, arrival_time,
        carrier, equipment, transit_days, customs,
        pallets, pallet_height, pallet_length, pallet_width, stackable, weight_kg, volume_m3,
        transport_mode, material_description, special_instructions,
        is_special_transport, matched_route_plan_id, deviations,
        deviation_justification, approval_status, volume_util_pct, weight_util_pct,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req_number, requestor_name, department || null, supplier_id || null, finalPriority,
        direction || 'inbound', shipment_type || 'FTL',
        origin_id || null, origin_name || null, origin_zip || null, origin_city || null, origin_country || null,
        destination_id || null, destination_name || null, destination_zip || null, destination_city || null, destination_country || null,
        route_description || null, additional_origins || null,
        pickup_day_code || null, delivery_day_code || null,
        pickup_date, pickup_time || null, delivery_date || null, arrival_time || null,
        carrier || null, equipment || null, transit_days || null, customs || null,
        pallets, pallet_height || null, pallet_length || null, pallet_width || null, stackable || 1, weight_kg || null, volume_m3 || null,
        transport_mode || 'road', material_description || null, special_instructions || null,
        finalIsSpecial ? 1 : 0, matched_route_plan_id || (resolvedPlan?.id || null), finalDeviations,
        deviation_justification || null, finalApproval, volume_util_pct || null, weight_util_pct || null,
        finalStatus
      ]
    );

    const created = queryOne(`
      SELECT r.*, s.company_name as supplier_name, s.city as supplier_city
      FROM transport_requisitions r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      WHERE r.id = ?
    `, [id]);

    // Auto-create shipment record with dynamic capacity
    try {
      const pL = pallet_length || 1.2;
      const pW = pallet_width || 0.8;
      const pH = pallet_height || 1.5;
      const stk = stackable || 1;
      const equipDims: Record<string, {l:number,w:number,h:number}> = {
        'Standard Trailer': {l:13.6,w:2.45,h:2.7}, 'Mega Trailer': {l:13.6,w:2.45,h:3.0},
        'Short Trailer': {l:7.7,w:2.45,h:2.7}, '40ft Container': {l:12.03,w:2.35,h:2.39},
        '20ft Container': {l:5.9,w:2.35,h:2.39}, 'Swap Body': {l:7.45,w:2.45,h:2.7},
        'Sprinter Van': {l:4.3,w:1.8,h:1.9}
      };
      const dims = equipDims[equipment || 'Standard Trailer'] || {l:13.6,w:2.45,h:2.7};
      const floorA = Math.floor(dims.l / pL) * Math.floor(dims.w / pW);
      const floorB = Math.floor(dims.l / pW) * Math.floor(dims.w / pL);
      const floorPallets = Math.max(floorA, floorB);
      const maxStack = Math.min(stk, Math.floor(dims.h / pH));
      const dynamicCapacity = floorPallets * Math.max(1, maxStack);
      runSql(
        `INSERT OR IGNORE INTO shipments (shipment_number, shipment_date, delivery_date, supplier_id, supplier_name,
          origin_city, transport_mode, carrier_name, pallets_shipped, pallet_capacity,
          weight_kg, volume_m3, total_cost_eur, is_on_time, is_urgent, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [req_number, pickup_date, delivery_date || null,
          supplier_id || null, created?.supplier_name || origin_name || null,
          origin_city || created?.supplier_city || null, transport_mode || 'road',
          carrier || null, pallets, dynamicCapacity,
          weight_kg || 0, volume_m3 || 0, 0, 1,
          finalIsSpecial ? 1 : 0, finalStatus]
      );
    } catch { /* best-effort */ }

    // AUTO-ASSIGN: ONLY for compliant (non-deviation) transports with a route plan carrier
    if (!finalIsSpecial && matched_route_plan_id && carrier) {
      try {
        execSql(
          `UPDATE transport_requisitions SET assigned_forwarder = ?, status = 'assigned', updated_at = datetime('now') WHERE id = ?`,
          [carrier, id]
        );
        execSql(`UPDATE shipments SET carrier_name = ?, status = 'assigned' WHERE shipment_number = ?`, [carrier, req_number]);
      } catch { /* best-effort */ }
    }

    // Re-fetch to get latest status
    const final = queryOne(`
      SELECT r.*, s.company_name as supplier_name, s.city as supplier_city
      FROM transport_requisitions r LEFT JOIN suppliers s ON s.id = r.supplier_id WHERE r.id = ?
    `, [id]);

    res.status(201).json({ ...final, quotes: [], is_special_transport: !!final?.is_special_transport });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// UPDATE requisition status
// BUG 4 FIX: Enforce valid status transitions — block illegal jumps
router.put('/requisitions/:id/status', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const { status } = req.body;
    const valid = ['new', 'pending_approval', 'spot_requested', 'quotes_received', 'assigned', 'in_transit', 'delivered', 'cancelled'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }

    // Fetch current requisition to enforce transition rules
    const current = queryOne('SELECT status, is_special_transport, approval_status FROM transport_requisitions WHERE id = ?', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Requisition not found' });

    // Define allowed transitions
    const ALLOWED_TRANSITIONS: Record<string, string[]> = {
      'new': ['spot_requested', 'assigned', 'cancelled', 'pending_approval'],
      'pending_approval': ['new', 'cancelled'],  // only via approve/reject endpoint
      'spot_requested': ['quotes_received', 'assigned', 'cancelled'],
      'quotes_received': ['assigned', 'spot_requested', 'cancelled'],
      'assigned': ['in_transit'], // assignment is now locked from cancellation in UI
      'in_transit': ['delivered'], // in-transit cannot cancel here
      'delivered': [],
      'cancelled': ['new']  // allow reopen
    };

    const allowed = ALLOWED_TRANSITIONS[current.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot transition from "${current.status}" to "${status}". Allowed transitions: ${allowed.join(', ') || 'none'}`,
        current_status: current.status,
        requested_status: status
      });
    }

    // Block spot_requested if requisition needs approval first
    if (status === 'spot_requested' && current.is_special_transport && current.approval_status !== 'approved') {
      return res.status(400).json({
        error: 'This deviation transport requires approval before it can proceed to spot request. Use the approval workflow first.',
        requires_approval: true
      });
    }

    execSql(`UPDATE transport_requisitions SET status = ?, updated_at = datetime('now') WHERE id = ?`, [status, req.params.id]);

    // Sync shipment record
    try {
      const req_data = queryOne(`
        SELECT r.*, s.company_name as supplier_name, s.city as supplier_city
        FROM transport_requisitions r
        LEFT JOIN suppliers s ON s.id = r.supplier_id
        WHERE r.id = ?
      `, [req.params.id]);
      if (req_data) {
        const existingShipment = queryOne('SELECT id FROM shipments WHERE shipment_number = ?', [req_data.req_number]);
        if (existingShipment) {
          execSql(
            `UPDATE shipments SET status = ?, carrier_name = COALESCE(?, carrier_name),
              total_cost_eur = CASE WHEN ? > 0 THEN ? ELSE total_cost_eur END,
              delivery_date = COALESCE(?, delivery_date),
              is_on_time = CASE WHEN ? = 'delivered' THEN 1 ELSE is_on_time END
            WHERE shipment_number = ?`,
            [status, req_data.assigned_forwarder,
              req_data.assigned_price || 0, req_data.assigned_price || 0,
              req_data.delivery_date,
              status, req_data.req_number]
          );
        } else {
          runSql(
            `INSERT INTO shipments (shipment_number, shipment_date, delivery_date, supplier_id, supplier_name,
              origin_city, transport_mode, carrier_name, pallets_shipped, pallet_capacity,
              weight_kg, volume_m3, total_cost_eur, is_on_time, is_urgent, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req_data.req_number, req_data.pickup_date, req_data.delivery_date || null,
              req_data.supplier_id, req_data.supplier_name || req_data.origin_name || null,
              req_data.origin_city || req_data.supplier_city || null, req_data.transport_mode || 'road',
              req_data.assigned_forwarder || req_data.carrier || null, req_data.pallets || 0,
              // Dynamic capacity (fallback 33 for legacy records)
              Math.max(33, req_data.pallets || 33),
              req_data.weight_kg || 0, req_data.volume_m3 || 0,
              req_data.assigned_price || 0, status === 'delivered' ? 1 : 0,
              req_data.priority === 'urgent' ? 1 : 0, status]
          );
        }
      }
    } catch { /* shipment sync is best-effort */ }

    res.json({ message: 'Status updated' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ADD quote to requisition
router.post('/requisitions/:id/quotes', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const { forwarder_name, price, currency, transit_days, valid_until, notes } = req.body;

    if (!forwarder_name || price == null) {
      return res.status(400).json({ error: 'forwarder_name and price required' });
    }

    runSql(
      `INSERT INTO forwarder_quotes (requisition_id, forwarder_name, price, currency, transit_days, valid_until, notes) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [req.params.id, forwarder_name, price, currency || 'EUR', transit_days || null, valid_until || null, notes || null]
    );

    // Auto-update status to quotes_received if still spot_requested
    const requisition = queryOne('SELECT status FROM transport_requisitions WHERE id = ?', [req.params.id]);
    if (requisition?.status === 'spot_requested') {
      execSql(`UPDATE transport_requisitions SET status = 'quotes_received', updated_at = datetime('now') WHERE id = ?`, [req.params.id]);
    }

    res.status(201).json({ message: 'Quote added' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ASSIGN forwarder to requisition
router.put('/requisitions/:id/assign', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const { forwarder_name, price } = req.body;

    if (!forwarder_name) {
      return res.status(400).json({ error: 'forwarder_name required' });
    }

    execSql(
      `UPDATE transport_requisitions SET assigned_forwarder = ?, assigned_price = ?, status = 'assigned', updated_at = datetime('now') WHERE id = ?`,
      [forwarder_name, price || null, req.params.id]
    );

    // Sync carrier and cost to the linked shipment record
    try {
      const req_data = queryOne('SELECT req_number FROM transport_requisitions WHERE id = ?', [req.params.id]);
      if (req_data) {
        execSql(
          `UPDATE shipments SET carrier_name = ?, total_cost_eur = ?, status = 'assigned' WHERE shipment_number = ?`,
          [forwarder_name, price || 0, req_data.req_number]
        );
      }
    } catch { /* best-effort */ }

    res.json({ message: 'Forwarder assigned' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET approval board — all special/deviation transports (supervisor + admin only)
router.get('/approval-board', authenticate, requireInternal, (req: Request, res: Response) => {
  try {
    ensureBookingTables();

    // Normalise legacy approval_status values in-place (one-off migration)
    try {
      execSql(
        `UPDATE transport_requisitions
         SET approval_status = 'pending'
         WHERE approval_status = 'pending_approval'
           AND is_special_transport = 1`
      );
    } catch { /* best-effort */ }

    const items = queryAll(`
      SELECT r.*,
             s.company_name as supplier_name,
             s.city         as supplier_city,
             s.country      as supplier_country
      FROM transport_requisitions r
      LEFT JOIN suppliers s ON s.id = r.supplier_id
      WHERE  r.is_special_transport = 1
          OR r.status = 'pending_approval'
          OR r.approval_status IN ('pending', 'rejected', 'pending_approval')
      ORDER BY
        CASE r.status WHEN 'pending_approval' THEN 0 ELSE 1 END,
        CASE r.approval_status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
        r.created_at DESC
    `);

    const enriched = items.map((r: any) => {
      let deviations: string[] = [];
      try { deviations = r.deviations ? JSON.parse(r.deviations) : []; } catch { deviations = []; }
      return { ...r, is_special_transport: !!r.is_special_transport, deviations };
    });

    res.json(enriched);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// APPROVE/REJECT deviation transport — Supervisor / Admin only
router.put('/requisitions/:id/approve', authenticate, requireSupervisor, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const { action, approval_notes } = req.body; // action: 'approve' | 'reject'
    const reviewer = req.user?.username || 'unknown';
    const requisition = queryOne('SELECT * FROM transport_requisitions WHERE id = ?', [req.params.id]);
    if (!requisition) return res.status(404).json({ error: 'Requisition not found' });
    if (requisition.status !== 'pending_approval') {
      return res.status(400).json({ error: 'Requisition is not pending approval' });
    }

    if (action === 'approve') {
      execSql(
        `UPDATE transport_requisitions
         SET status = 'new', approval_status = 'approved',
             approved_by = ?, approval_timestamp = datetime('now'), approval_notes = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        [reviewer, approval_notes || null, req.params.id]
      );
      res.json({ message: 'Deviation approved. Requisition moved to New for processing.' });
    } else if (action === 'reject') {
      execSql(
        `UPDATE transport_requisitions
         SET status = 'cancelled', approval_status = 'rejected',
             approved_by = ?, approval_timestamp = datetime('now'), approval_notes = ?,
             updated_at = datetime('now')
         WHERE id = ?`,
        [reviewer, approval_notes || null, req.params.id]
      );
      res.json({ message: 'Deviation rejected. Requisition cancelled and returned to planner.' });
    } else {
      return res.status(400).json({ error: 'action must be "approve" or "reject"' });
    }
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Spot request - move multiple requisitions to spot_requested status
// BUG 3 FIX: Only allow spot requests for requisitions that are NOT pending approval
router.post('/spot-request', authenticate, requireAdmin, (req: Request, res: Response) => {
  try {
    ensureBookingTables();
    const { requisition_ids, forwarders } = req.body;

    if (!requisition_ids?.length) {
      return res.status(400).json({ error: 'requisition_ids required' });
    }

    const blocked: number[] = [];
    const processed: number[] = [];

    for (const id of requisition_ids) {
      const req_data = queryOne('SELECT id, status, is_special_transport, approval_status FROM transport_requisitions WHERE id = ?', [id]);
      if (!req_data) continue;

      // Block spot requests for requisitions pending approval
      if (req_data.status === 'pending_approval') {
        blocked.push(id);
        continue;
      }
      // Block if it's a deviation transport that hasn't been approved yet
      if (req_data.is_special_transport && req_data.approval_status !== 'approved') {
        blocked.push(id);
        continue;
      }
      // Only allow transition from 'new' status
      if (req_data.status !== 'new') {
        blocked.push(id);
        continue;
      }

      execSql(`UPDATE transport_requisitions SET status = 'spot_requested', updated_at = datetime('now') WHERE id = ?`, [id]);
      processed.push(id);
    }

    if (blocked.length > 0 && processed.length === 0) {
      return res.status(400).json({
        error: `Cannot send spot request: requisition(s) ${blocked.join(', ')} require approval before spot transport can be initiated.`,
        blocked_ids: blocked
      });
    }

    res.json({
      message: `Spot request sent for ${processed.length} requisition(s) to ${forwarders?.length || 0} forwarder(s)`,
      processed_ids: processed,
      blocked_ids: blocked,
      ...(blocked.length > 0 ? { warning: `${blocked.length} requisition(s) blocked — require approval first` } : {})
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
