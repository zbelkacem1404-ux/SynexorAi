// Sync route_plans table: add entries for transport_routes that are missing from route_plans
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'logistics.db');

async function main() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  // RT HQ info
  const hq = { id: 'RT-HQ', name: 'RT Automotive d.o.o.', zip: '10000', city: 'Zagreb', country: 'HR Croatia' };

  const pickupDays = ['M0', 'T0', 'W0', 'R0', 'F0'];
  const defaultTimes = ['06:00 - 12:00', '08:00 - 15:00', '12:00 - 17:00', '08:00 - 18:00'];
  const equipMap = { road: 'Standard Trailer', sea: '40ft Container', air: 'Air Freight ULD', rail: 'Wagon', multimodal: 'Swap Body' };

  // Get all transport routes
  const routes = db.exec("SELECT * FROM transport_routes ORDER BY id");
  if (!routes.length || !routes[0].values.length) {
    console.log('No transport routes found.');
    db.close();
    return;
  }

  const cols = routes[0].columns;
  const allRoutes = routes[0].values.map(row => {
    const obj = {};
    cols.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });

  // Get existing route plan descriptions to avoid duplicates
  const existingPlans = db.exec("SELECT route_description, tour_description FROM route_plans");
  const existingSet = new Set();
  if (existingPlans.length > 0) {
    existingPlans[0].values.forEach(row => {
      existingSet.add(`${row[0]}||${row[1]}`);
    });
  }

  let count = 0;
  let skipped = 0;

  for (const route of allRoutes) {
    const waypoints = JSON.parse(route.waypoints || '[]');
    if (waypoints.length < 2) continue;

    // Get linked suppliers
    const supResult = db.exec(
      `SELECT s.* FROM suppliers s JOIN route_suppliers rs ON rs.supplier_id = s.id WHERE rs.route_id = ${route.id}`
    );
    const supCols = supResult.length > 0 ? supResult[0].columns : [];
    const routeSuppliers = supResult.length > 0 ? supResult[0].values.map(row => {
      const obj = {};
      supCols.forEach((c, i) => obj[c] = row[i]);
      return obj;
    }) : [];

    const direction = route.route_type === 'outbound' ? 'outbound' : 'inbound';
    const shipmentType = (route.shipment_type || 'ftl').toUpperCase();
    const mode = shipmentType === 'LTL' ? 'LTL' : shipmentType === 'MILKRUN' ? 'MR' : (route.transport_mode === 'multimodal' ? 'HUB' : 'FTL');
    const equip = equipMap[route.transport_mode] || 'Standard';
    const customs = route.transport_mode === 'road' ? '' : 'Yes';

    if (routeSuppliers.length === 0) {
      // Outbound routes with no suppliers
      const origin = direction === 'outbound' ? hq : { id: '', name: waypoints[0]?.label || '', zip: '', city: waypoints[0]?.label || '', country: '' };
      const dest = direction === 'outbound'
        ? { id: '', name: waypoints[waypoints.length - 1]?.label || '', zip: '', city: waypoints[waypoints.length - 1]?.label || '', country: '' }
        : hq;

      const routeDesc = `${origin.name}_${dest.name}/${mode.charAt(0)}01`;
      const key = `${routeDesc}||${route.name}`;
      if (existingSet.has(key)) { skipped++; continue; }

      const pi = count % pickupDays.length;
      const ti = count % defaultTimes.length;
      let deliveryDay = '';
      if (route.transit_days) {
        deliveryDay = pickupDays[(pi + Math.ceil(route.transit_days)) % pickupDays.length].charAt(0) + (route.transit_days > 5 ? '1' : '0');
      }

      try {
        db.run(
          `INSERT INTO route_plans (route_description, tour_description, transport_mode, origin_id, origin_name, origin_zip, origin_city, origin_country,
            destination_id, destination_name, destination_zip, destination_city, destination_country,
            pickup_date, pickup_time, delivery_date, arrival_time, carrier, equipment, transit_time_days, customs, direction)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [routeDesc, route.name, mode, origin.id, origin.name, origin.zip || '', origin.city, origin.country,
            dest.id, dest.name, dest.zip || '', dest.city, dest.country,
            pickupDays[pi], defaultTimes[ti], deliveryDay, defaultTimes[(ti + 1) % defaultTimes.length],
            route.carrier_name || '', equip, route.transit_days || null, customs, direction]
        );
        existingSet.add(key);
        count++;
        console.log(`  + ${routeDesc} [${mode}] (${direction})`);
      } catch (e) { console.log(`  ! Error: ${e.message}`); }
    } else {
      // For each supplier on this route
      for (let si = 0; si < routeSuppliers.length; si++) {
        const sup = routeSuppliers[si];
        const origin = direction === 'inbound'
          ? { id: sup.supplier_id, name: sup.company_name, zip: '', city: sup.city, country: sup.country }
          : hq;
        const dest = direction === 'inbound'
          ? hq
          : { id: sup.supplier_id, name: sup.company_name, zip: '', city: sup.city, country: sup.country };

        const routeDesc = `${sup.supplier_id}_${direction === 'inbound' ? 'RT-HQ' : sup.supplier_id}/${mode.charAt(0)}${String(si + 1).padStart(2, '0')}`;
        const key = `${routeDesc}||${route.name}`;
        if (existingSet.has(key)) { skipped++; continue; }

        const pi = (count + si) % pickupDays.length;
        const ti = (count + si) % defaultTimes.length;
        let deliveryDay = '';
        if (route.transit_days) {
          const dayOffset = Math.ceil(route.transit_days);
          deliveryDay = pickupDays[(pi + dayOffset) % pickupDays.length].charAt(0) + (dayOffset > 5 ? '1' : '0');
        }

        try {
          db.run(
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
          existingSet.add(key);
          count++;
          console.log(`  + ${routeDesc} [${mode}] ${sup.company_name} (${direction})`);
        } catch (e) { console.log(`  ! Error for ${sup.company_name}: ${e.message}`); }
      }
    }
  }

  // Save
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`\nDone! Added ${count} new route plan entries (${skipped} already existed).`);
  console.log('Restart the server to see changes.');
}

main().catch(e => { console.error(e); process.exit(1); });
