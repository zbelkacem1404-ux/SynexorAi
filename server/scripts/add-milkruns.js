// Quick script to add milkrun + LTL example routes to existing database
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'logistics.db');

async function main() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  // Helper to get supplier ID by name
  function getSupplierId(name) {
    const row = db.exec(`SELECT id FROM suppliers WHERE company_name = '${name}'`);
    return row.length > 0 && row[0].values.length > 0 ? row[0].values[0][0] : null;
  }

  // Ensure shipment_type column exists
  try { db.run("SELECT shipment_type FROM transport_routes LIMIT 1"); } catch {
    try { db.run("ALTER TABLE transport_routes ADD COLUMN shipment_type TEXT DEFAULT 'ftl'"); } catch {}
  }

  const milkrunRoutes = [
    {
      name: 'South Germany Milkrun (Lippstadt-Herzogenaurach-Stuttgart-Friedrichshafen → RT)',
      route_type: 'inbound', transport_mode: 'road', carrier: 'DB Schenker', days: 3, shipment_type: 'milkrun',
      waypoints: [
        { lat: 51.67, lng: 8.35, label: 'Hella (Lippstadt)' },
        { lat: 49.57, lng: 10.88, label: 'Schaeffler (Herzogenaurach)' },
        { lat: 48.78, lng: 9.18, label: 'Bosch (Stuttgart)' },
        { lat: 47.65, lng: 9.48, label: 'ZF (Friedrichshafen)' },
        { lat: 47.81, lng: 13.06, label: 'Salzburg Transit' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      suppliers: ['Hella GmbH & Co', 'Schaeffler Group', 'Bosch Automotive GmbH', 'ZF Friedrichshafen AG']
    },
    {
      name: 'France-Spain Milkrun (Madrid-Paris-Nanterre-Levallois → RT)',
      route_type: 'inbound', transport_mode: 'road', carrier: 'XPO Logistics', days: 4, shipment_type: 'milkrun',
      waypoints: [
        { lat: 40.45, lng: -3.69, label: 'Gestamp (Madrid)' },
        { lat: 48.89, lng: 2.29, label: 'Valeo (Paris)' },
        { lat: 48.89, lng: 2.21, label: 'Faurecia (Nanterre)' },
        { lat: 48.89, lng: 2.29, label: 'Plastic Omnium (Levallois)' },
        { lat: 47.38, lng: 8.54, label: 'Zürich Transit' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      suppliers: ['Gestamp Automoción', 'Valeo SA', 'Faurecia SE', 'Plastic Omnium']
    },
    {
      name: 'CEE Regional Milkrun (Solin-Koper-Győr-Dubnica → RT)',
      route_type: 'inbound', transport_mode: 'road', carrier: 'Waberers', days: 2, shipment_type: 'milkrun',
      waypoints: [
        { lat: 43.54, lng: 16.49, label: 'AD Plastik (Solin)' },
        { lat: 45.55, lng: 13.73, label: 'Cimos (Koper)' },
        { lat: 47.69, lng: 17.65, label: 'Kamax (Győr)' },
        { lat: 48.94, lng: 18.17, label: 'Matador (Dubnica)' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      suppliers: ['AD Plastik d.d.', 'Cimos d.d.', 'Kamax Hungary', 'Matador Automotive']
    },
    {
      name: 'Italy Milkrun (Bologna-Bergamo → RT)',
      route_type: 'inbound', transport_mode: 'road', carrier: 'Gebrüder Weiss', days: 2, shipment_type: 'milkrun',
      waypoints: [
        { lat: 44.51, lng: 11.36, label: 'Magneti Marelli (Bologna)' },
        { lat: 45.70, lng: 9.68, label: 'Brembo (Bergamo)' },
        { lat: 45.44, lng: 12.32, label: 'Venice Transit' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      suppliers: ['Magneti Marelli', 'Brembo SpA']
    },
    // LTL routes
    {
      name: 'North Germany LTL (Hannover-Lippstadt → RT)',
      route_type: 'inbound', transport_mode: 'road', carrier: 'Kuehne+Nagel', days: 2, shipment_type: 'ltl',
      waypoints: [
        { lat: 52.40, lng: 9.74, label: 'Continental (Hannover)' },
        { lat: 51.67, lng: 8.35, label: 'Hella (Lippstadt)' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      suppliers: ['Continental AG', 'Hella GmbH & Co']
    },
    {
      name: 'Romania LTL (Bucharest-Timișoara → RT)',
      route_type: 'inbound', transport_mode: 'road', carrier: 'Fan Courier', days: 3, shipment_type: 'ltl',
      waypoints: [
        { lat: 44.43, lng: 26.10, label: 'Aptiv Romania (Bucharest)' },
        { lat: 45.75, lng: 21.21, label: 'Dräxlmaier (Timișoara)' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      suppliers: ['Aptiv Romania', 'Dräxlmaier Group']
    },
  ];

  let inserted = 0;
  for (const r of milkrunRoutes) {
    // Check if a route with similar name already exists
    const existing = db.exec(`SELECT id FROM transport_routes WHERE name LIKE '%${r.name.substring(0, 30)}%'`);
    if (existing.length > 0 && existing[0].values.length > 0) {
      console.log(`  Skipping (exists): ${r.name}`);
      continue;
    }

    db.run(
      'INSERT INTO transport_routes (name, route_type, transport_mode, carrier_name, transit_days, waypoints, shipment_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.name, r.route_type, r.transport_mode, r.carrier, r.days, JSON.stringify(r.waypoints), r.shipment_type]
    );

    // Get the last inserted route ID
    const lastIdRow = db.exec('SELECT last_insert_rowid()');
    const routeId = lastIdRow[0].values[0][0];

    // Link suppliers
    for (const sName of r.suppliers) {
      const sid = getSupplierId(sName);
      if (sid) {
        try {
          db.run('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [routeId, sid]);
        } catch (e) { console.log(`  Warning linking ${sName}: ${e.message}`); }
      } else {
        console.log(`  Warning: supplier "${sName}" not found`);
      }
    }
    console.log(`  Added: ${r.name} (${r.shipment_type}) with ${r.suppliers.length} suppliers`);
    inserted++;
  }

  // Save back
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
  db.close();

  console.log(`\nDone! Inserted ${inserted} new routes (${milkrunRoutes.length - inserted} skipped as existing).`);
  console.log('Restart the server to see changes, or the app will pick them up on next API call.');
}

main().catch(e => { console.error(e); process.exit(1); });
