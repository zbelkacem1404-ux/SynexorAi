import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'logistics.db');

let db: SqlJsDatabase | null = null;

export async function getDb(): Promise<SqlJsDatabase> {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run('PRAGMA foreign_keys = ON');
  return db;
}

export function getDbSync(): SqlJsDatabase {
  if (!db) throw new Error('DB not initialized. Call initializeDb() first.');
  return db;
}

export function saveDb() {
  if (!db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

export async function initializeDb() {
  const d = await getDb();

  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','supervisor','planner','operations','carrier','viewer')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS commodities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id TEXT UNIQUE NOT NULL,
      company_name TEXT NOT NULL,
      country TEXT NOT NULL,
      city TEXT NOT NULL,
      street_address TEXT,
      latitude REAL,
      longitude REAL,
      default_incoterm TEXT CHECK(default_incoterm IN ('EXW','FCA','FAS','FOB','CFR','CIF','CPT','CIP','DAP','DPU','DDP')),
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','on-hold')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('primary','secondary','escalation')),
      escalation_level INTEGER CHECK(escalation_level IN (1,2,3)),
      name TEXT NOT NULL,
      role_title TEXT,
      email TEXT,
      phone TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS supplier_projects (
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      PRIMARY KEY (supplier_id, project_id)
    )`,
    `CREATE TABLE IF NOT EXISTS supplier_commodities (
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      commodity_id INTEGER NOT NULL REFERENCES commodities(id) ON DELETE CASCADE,
      PRIMARY KEY (supplier_id, commodity_id)
    )`,
    `CREATE TABLE IF NOT EXISTS transport_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      route_type TEXT NOT NULL CHECK(route_type IN ('inbound','outbound')),
      transport_mode TEXT NOT NULL CHECK(transport_mode IN ('sea','air','rail','road','multimodal')),
      carrier_name TEXT,
      transit_days INTEGER,
      waypoints TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS route_suppliers (
      route_id INTEGER NOT NULL REFERENCES transport_routes(id) ON DELETE CASCADE,
      supplier_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      PRIMARY KEY (route_id, supplier_id)
    )`
  ];

  for (const sql of tables) {
    d.run(sql);
  }

  // Migrations: add columns if they don't exist
  const migrationColumns = [
    { col: 'shipment_type', sql: "ALTER TABLE transport_routes ADD COLUMN shipment_type TEXT DEFAULT 'ftl'" },
    { col: 'route_description', sql: "ALTER TABLE transport_routes ADD COLUMN route_description TEXT" },
    { col: 'tour_description', sql: "ALTER TABLE transport_routes ADD COLUMN tour_description TEXT" },
  ];
  for (const m of migrationColumns) {
    try { d.run(`SELECT ${m.col} FROM transport_routes LIMIT 1`); }
    catch { try { d.run(m.sql); } catch { /* already exists */ } }
  }

  // Auto-seed relationship data if contacts table is empty (means relationships never seeded)
  try {
    const contactCount = d.exec("SELECT COUNT(*) as cnt FROM contacts");
    const cnt = contactCount[0]?.values[0]?.[0] || 0;
    if (cnt === 0) {
      console.log('Auto-seeding supplier relationships (contacts, projects, commodities, routes)...');
      seedRelationships(d);
    }
  } catch { /* table might not exist yet */ }

  // Route Plans table — matches industry-standard route plan Excel format
  d.run(`CREATE TABLE IF NOT EXISTS route_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    route_description TEXT NOT NULL,
    tour_description TEXT,
    transport_mode TEXT NOT NULL CHECK(transport_mode IN ('FTL','LTL','MR','HUB')),
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
    pickup_date TEXT,
    pickup_time TEXT,
    delivery_date TEXT,
    arrival_time TEXT,
    carrier TEXT,
    equipment TEXT,
    transit_time_days REAL,
    customs TEXT,
    direction TEXT NOT NULL DEFAULT 'inbound' CHECK(direction IN ('inbound','outbound','hub')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  d.run(`CREATE TABLE IF NOT EXISTS forwarders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    contact TEXT,
    email TEXT,
    phone TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )`);

  // Auto-populate route_plans from transport_routes + suppliers if empty
  try {
    const rpCount = d.exec("SELECT COUNT(*) as cnt FROM route_plans");
    const rpCnt = rpCount[0]?.values[0]?.[0] || 0;
    if (rpCnt === 0) {
      console.log('Auto-populating route_plans from transport_routes + suppliers...');
      seedRoutePlans(d);
    }
  } catch { /* table might not exist yet */ }

  // Shipments table for real KPI data
  d.run(`CREATE TABLE IF NOT EXISTS shipments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_number TEXT UNIQUE NOT NULL,
    shipment_date TEXT NOT NULL,
    delivery_date TEXT,
    supplier_id INTEGER REFERENCES suppliers(id),
    supplier_name TEXT,
    route_id INTEGER REFERENCES transport_routes(id),
    route_name TEXT,
    origin_city TEXT,
    origin_country TEXT,
    transport_mode TEXT NOT NULL DEFAULT 'road',
    shipment_type TEXT NOT NULL DEFAULT 'ftl',
    carrier_name TEXT,
    pallets_shipped REAL NOT NULL DEFAULT 0,
    pallet_capacity REAL NOT NULL DEFAULT 33,
    weight_kg REAL DEFAULT 0,
    volume_m3 REAL DEFAULT 0,
    distance_km REAL DEFAULT 0,
    total_km REAL DEFAULT 0,
    empty_km REAL DEFAULT 0,
    total_cost_eur REAL DEFAULT 0,
    material_value_eur REAL DEFAULT 0,
    is_on_time INTEGER DEFAULT 1,
    is_urgent INTEGER DEFAULT 0,
    is_consolidated INTEGER DEFAULT 0,
    status TEXT DEFAULT 'delivered',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  saveDb();
}

// Helper: run a SELECT query and return all rows as objects
export function queryAll(sql: string, params: any[] = []): any[] {
  const d = getDbSync();
  const stmt = d.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

// Helper: run a SELECT and return first row
export function queryOne(sql: string, params: any[] = []): any | null {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Helper: run INSERT/UPDATE/DELETE, save to disk, return last insert id
export function runSql(sql: string, params: any[] = []): { lastId: number } {
  const d = getDbSync();
  d.run(sql, params);
  const row = queryOne('SELECT last_insert_rowid() as id');
  saveDb();
  return { lastId: row?.id || 0 };
}

// Helper: run statement without returning anything, save to disk
export function execSql(sql: string, params: any[] = []) {
  const d = getDbSync();
  if (params.length > 0) {
    d.run(sql, params);
  } else {
    d.run(sql);
  }
  saveDb();
}

// Auto-seed relationship data for suppliers
function seedRelationships(d: SqlJsDatabase) {
  // Get all suppliers ordered by id
  const stmt = d.prepare("SELECT id, company_name FROM suppliers ORDER BY id");
  const suppliers: { id: number; company_name: string }[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    suppliers.push({ id: row.id, company_name: row.company_name });
  }
  stmt.free();
  if (suppliers.length === 0) return;

  const firstNames = ['Hans', 'Marie', 'Takeshi', 'Sarah', 'Klaus', 'Jin-Ho', 'Marco', 'Priya', 'Carlos', 'Elena', 'Wei', 'Liam', 'Raj', 'Ana', 'Fritz', 'Sofia', 'Dragan', 'Ivana', 'Tomislav', 'Marta'];
  const lastNames = ['Mueller', 'Dupont', 'Tanaka', 'Smith', 'Weber', 'Kim', 'Silva', 'Sharma', 'Garcia', 'Petrova', 'Chen', 'OBrien', 'Patel', 'Rodriguez', 'Bauer', 'Novak', 'Horvat', 'Kovac', 'Babic', 'Kriz'];

  // Seed contacts for each supplier
  for (let i = 0; i < suppliers.length; i++) {
    const sid = suppliers[i].id;
    const fi = i % firstNames.length;
    const li = i % lastNames.length;
    const fn2 = (i + 4) % firstNames.length;
    const ln2 = (i + 6) % lastNames.length;
    const emailDomain = suppliers[i].company_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8);

    d.run('INSERT OR IGNORE INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sid, 'primary', null, `${firstNames[fi]} ${lastNames[li]}`, 'Sales Manager', `${firstNames[fi].toLowerCase()}.${lastNames[li].toLowerCase()}@${emailDomain}.com`, `+49-${100 + i}-${1000 + i}`]);
    d.run('INSERT OR IGNORE INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sid, 'secondary', null, `${firstNames[fn2]} ${lastNames[ln2]}`, 'Logistics Coordinator', `logistics@${emailDomain}.com`, `+49-${200 + i}-${2000 + i}`]);
    if ((i + 1) % 3 === 0) {
      d.run('INSERT OR IGNORE INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [sid, 'escalation', 1, `Director ${lastNames[(i + 2) % lastNames.length]}`, 'VP Supply Chain', `vp@${emailDomain}.com`, `+49-${300 + i}-${3000 + i}`]);
    }
  }

  // Seed supplier-project assignments
  for (let i = 0; i < suppliers.length; i++) {
    const sid = suppliers[i].id;
    d.run('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [sid, (i % 8) + 1]);
    if ((i + 1) % 3 === 0) d.run('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [sid, ((i + 1) % 8) + 1]);
    if ((i + 1) % 5 === 0) d.run('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [sid, ((i + 4) % 8) + 1]);
  }

  // Seed supplier-commodity assignments
  for (let i = 0; i < suppliers.length; i++) {
    const sid = suppliers[i].id;
    d.run('INSERT OR IGNORE INTO supplier_commodities (supplier_id, commodity_id) VALUES (?, ?)', [sid, (i % 12) + 1]);
    if ((i + 1) % 2 === 0) d.run('INSERT OR IGNORE INTO supplier_commodities (supplier_id, commodity_id) VALUES (?, ?)', [sid, ((i + 5) % 12) + 1]);
  }

  // Seed route-supplier assignments (map supplier company names to IDs)
  const nameToId: Record<string, number> = {};
  for (const s of suppliers) nameToId[s.company_name] = s.id;

  const routeSupplierMap: Record<string, string[]> = {
    'Germany-Croatia Sea': ['Bosch Automotive GmbH', 'Continental AG', 'MAHLE GmbH', 'Hella GmbH & Co'],
    'Japan-Europe Sea': ['Denso Corporation', 'Aisin Corporation', 'Toyota Boshoku', 'Sumitomo Electric', 'NTN Corporation'],
    'Korea-Europe Sea': ['Hyundai Mobis', 'Mando Corporation', 'Hanon Systems'],
    'China-Europe Sea': ['Yanfeng Automotive', 'CATL Battery', 'Bethel Automotive', 'Joyson Safety'],
    'India-Croatia Sea': ['Tata AutoComp Systems', 'Bharat Forge Ltd'],
    'Brazil-Croatia Sea': ['Marcopolo SA', 'Iochpe-Maxion SA'],
    'North America Sea': ['Magna International', 'BorgWarner Inc', 'Dana Incorporated', 'Lear Corporation', 'Aptiv PLC'],
    'Morocco-Croatia Sea': ['Hands Corporation Morocco', 'Yazaki Morocco'],
    'Shanghai Air': ['Yanfeng Automotive', 'CATL Battery'],
    'Tokyo Air': ['Denso Corporation', 'Toyota Boshoku'],
    'Detroit Air': ['BorgWarner Inc', 'Lear Corporation'],
    'Germany Road': ['Bosch Automotive GmbH', 'ZF Friedrichshafen AG', 'Schaeffler Group', 'MAHLE GmbH'],
    'Austria Road': ['Benteler International', 'Miba AG'],
    'Slovenia Road': ['Cimos d.d.'],
    'Hungary Road': ['Kamax Hungary'],
    'Romania Road': ['Dräxlmaier Group', 'Aptiv Romania'],
    'Turkey Road': ['Tofas Oto Fabrikasi', 'Beycelik Gestamp'],
    'Czech Rail': ['Skoda Auto Parts'],
    'Poland Rail': ['Boryszew SA', 'Grupo Antolin'],
  };

  // Get existing routes
  const routeStmt = d.prepare("SELECT id, name FROM transport_routes");
  const routes: { id: number; name: string }[] = [];
  while (routeStmt.step()) {
    const row = routeStmt.getAsObject() as any;
    routes.push({ id: row.id, name: row.name });
  }
  routeStmt.free();

  for (const route of routes) {
    for (const [pattern, supplierNames] of Object.entries(routeSupplierMap)) {
      if (route.name.includes(pattern)) {
        for (const sn of supplierNames) {
          const sid = nameToId[sn];
          if (sid) {
            try { d.run('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [route.id, sid]); } catch { /* skip */ }
          }
        }
      }
    }
  }

  console.log(`  Seeded contacts, projects, commodities, and route links for ${suppliers.length} suppliers`);
}

// Populate route_plans from transport_routes + linked suppliers
function seedRoutePlans(d: SqlJsDatabase) {
  // Get all routes with their data
  const routeStmt = d.prepare("SELECT * FROM transport_routes");
  const allRoutes: any[] = [];
  while (routeStmt.step()) allRoutes.push(routeStmt.getAsObject());
  routeStmt.free();

  if (allRoutes.length === 0) return;

  // RT HQ info
  const hq = { id: 'RT-HQ', name: 'RT Automotive d.o.o.', zip: '10000', city: 'Zagreb', country: 'HR Croatia' };

  // Day codes used in route plans: M=Mon, T=Tue, W=Wed, R=Thu, F=Fri, S=Sat, Z=Sun
  const pickupDays = ['M0', 'T0', 'W0', 'R0', 'F0'];
  const defaultTimes = ['06:00 - 12:00', '08:00 - 15:00', '12:00 - 17:00', '08:00 - 18:00'];

  // Map transport_mode to route plan mode
  const modeMap: Record<string, string> = { road: 'FTL', sea: 'FTL', air: 'FTL', rail: 'FTL', multimodal: 'HUB' };

  // Equipment based on mode
  const equipMap: Record<string, string> = { road: 'Standard Trailer', sea: '40ft Container', air: 'Air Freight ULD', rail: 'Wagon', multimodal: 'Swap Body' };

  let count = 0;
  for (const route of allRoutes) {
    const waypoints = JSON.parse(route.waypoints || '[]');
    if (waypoints.length < 2) continue;

    // Get linked suppliers
    const supStmt = d.prepare("SELECT s.* FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ?");
    supStmt.bind([route.id]);
    const routeSuppliers: any[] = [];
    while (supStmt.step()) routeSuppliers.push(supStmt.getAsObject());
    supStmt.free();

    const direction = route.route_type === 'outbound' ? 'outbound' : 'inbound';
    const shipmentType = (route.shipment_type || 'ftl').toUpperCase();
    const mode = shipmentType === 'LTL' ? 'LTL' : shipmentType === 'MILKRUN' ? 'MR' : modeMap[route.transport_mode] || 'FTL';
    const equip = equipMap[route.transport_mode] || 'Standard';
    const customs = route.transport_mode === 'road' && ['AT', 'DE', 'SI', 'HU', 'SK', 'CZ', 'PL', 'RO'].some((c: string) => (route.name || '').includes(c)) ? '' : 'Yes';

    if (routeSuppliers.length === 0) {
      // Outbound routes with no suppliers - use waypoints
      const origin = direction === 'outbound' ? hq : { id: '', name: waypoints[0]?.label || '', zip: '', city: waypoints[0]?.label || '', country: '' };
      const dest = direction === 'outbound'
        ? { id: '', name: waypoints[waypoints.length - 1]?.label || '', zip: '', city: waypoints[waypoints.length - 1]?.label || '', country: '' }
        : hq;

      const routeDesc = `${origin.name}_${dest.name}/${mode.charAt(0)}01`;
      const pi = count % pickupDays.length;
      const ti = count % defaultTimes.length;

      try {
        d.run(
          `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
            destination_id, destination_name, destination_zip, destination_city, destination_country,
            pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [routeDesc, '', mode, origin.id, origin.name, origin.zip || '', origin.city, origin.country,
            dest.id, dest.name, dest.zip || '', dest.city, dest.country,
            pickupDays[pi], defaultTimes[ti],
            route.transit_days ? pickupDays[(pi + Math.ceil(route.transit_days / 7)) % 5] + (route.transit_days > 5 ? '1' : '0').replace('00','0') : '',
            defaultTimes[(ti + 1) % defaultTimes.length],
            route.carrier_name || '', equip, route.transit_days || null, customs, direction]
        );
        count++;
      } catch { /* skip */ }
    } else {
      // For each supplier on this route, create a route plan entry
      for (let si = 0; si < routeSuppliers.length; si++) {
        const sup = routeSuppliers[si];
        const origin = direction === 'inbound'
          ? { id: sup.supplier_id, name: sup.company_name, zip: '', city: sup.city, country: sup.country }
          : hq;
        const dest = direction === 'inbound'
          ? hq
          : { id: sup.supplier_id, name: sup.company_name, zip: '', city: sup.city, country: sup.country };

        const routeDesc = `${sup.supplier_id}_${direction === 'inbound' ? 'RT-HQ' : sup.supplier_id}/${mode.charAt(0)}${String(si + 1).padStart(2, '0')}`;
        const pi = (count + si) % pickupDays.length;
        const ti = (count + si) % defaultTimes.length;

        // Delivery day code
        let deliveryDay = '';
        if (route.transit_days) {
          const dayOffset = Math.ceil(route.transit_days);
          const weekOffset = dayOffset > 5 ? '1' : '0';
          const dayCode = pickupDays[(pi + dayOffset) % pickupDays.length];
          deliveryDay = dayCode.charAt(0) + weekOffset;
        }

        try {
          d.run(
            `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
              destination_id, destination_name, destination_zip, destination_city, destination_country,
              pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [routeDesc, route.name, mode, origin.id, origin.name, '', origin.city, origin.country,
              dest.id, dest.name, hq.zip, dest.city, dest.country,
              pickupDays[pi], defaultTimes[ti], deliveryDay, defaultTimes[(ti + 1) % defaultTimes.length],
              route.carrier_name || '', equip, route.transit_days || null,
              customs, direction]
          );
          count++;
        } catch { /* skip */ }
      }
    }
  }
  console.log(`  Populated ${count} route plan entries from ${allRoutes.length} transport routes`);
}
