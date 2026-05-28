import { initializeDb, runSql, execSql, queryOne, saveDb } from '../src/db/schema';
import bcrypt from 'bcryptjs';

async function seed() {
  await initializeDb();

  const tables = ['route_suppliers', 'transport_routes', 'supplier_commodities', 'supplier_projects', 'contacts', 'suppliers', 'commodities', 'projects', 'users'];
  for (const t of tables) execSql(`DELETE FROM ${t}`);

  // Create company_settings table
  execSql(`CREATE TABLE IF NOT EXISTS company_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);
  execSql('DELETE FROM company_settings');

  // Company settings
  const settings: Record<string, string> = {
    company_name: 'RT',
    full_name: 'RT Automotive d.o.o.',
    industry: 'Automotive Tier 1 Supplier',
    hq_country: 'Croatia',
    hq_city: 'Zagreb',
    hq_address: 'Industrijska cesta 42, 10000 Zagreb',
    hq_latitude: '45.8150',
    hq_longitude: '15.9819',
    phone: '+385 1 234 5678',
    email: 'info@rt-automotive.hr',
    website: 'www.rt-automotive.hr',
    currency: 'EUR',
    default_port: 'Rijeka',
    default_airport: 'Zagreb Airport (ZAG)',
  };
  for (const [k, v] of Object.entries(settings)) {
    runSql('INSERT INTO company_settings (key, value) VALUES (?, ?)', [k, v]);
  }

  // Users
  const adminHash = bcrypt.hashSync('admin123', 10);
  const viewerHash = bcrypt.hashSync('viewer123', 10);
  runSql('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['admin', adminHash, 'admin']);
  runSql('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', ['viewer', viewerHash, 'viewer']);

  // Projects
  const projectNames = [
    'EV Powertrain 2026', 'Chassis Platform X', 'HVAC Next Gen', 'Interior Trim Refresh',
    'Brake System Upgrade', 'Electric Steering', 'Battery Housing', 'Exhaust Aftertreatment'
  ];
  for (const p of projectNames) runSql('INSERT INTO projects (name, description) VALUES (?, ?)', [p, `RT ${p} program`]);

  // Commodities
  const commodityNames = [
    'Stamped Parts', 'Die Castings', 'Plastic Injection', 'Electronics & PCB',
    'Fasteners & Hardware', 'Raw Steel', 'Aluminum Extrusions', 'Rubber & Seals',
    'Wiring Harness', 'Machined Components', 'Forgings', 'Glass & Glazing'
  ];
  for (const c of commodityNames) runSql('INSERT INTO commodities (name) VALUES (?)', [c]);

  // 55 Automotive suppliers across the globe
  const suppliers = [
    // Western Europe
    { company_name: 'Bosch Automotive GmbH', country: 'Germany', city: 'Stuttgart', address: 'Robert-Bosch-Platz 1', lat: 48.7758, lng: 9.1829, incoterm: 'EXW', status: 'active' },
    { company_name: 'Continental AG', country: 'Germany', city: 'Hannover', address: 'Vahrenwalder Str. 9', lat: 52.3996, lng: 9.7390, incoterm: 'EXW', status: 'active' },
    { company_name: 'ZF Friedrichshafen AG', country: 'Germany', city: 'Friedrichshafen', address: 'Löwentaler Str. 20', lat: 47.6543, lng: 9.4801, incoterm: 'CIF', status: 'active' },
    { company_name: 'Schaeffler Group', country: 'Germany', city: 'Herzogenaurach', address: 'Industriestr. 1-3', lat: 49.5688, lng: 10.8836, incoterm: 'DDP', status: 'active' },
    { company_name: 'MAHLE GmbH', country: 'Germany', city: 'Stuttgart', address: 'Pragstraße 26-46', lat: 48.8014, lng: 9.1938, incoterm: 'FCA', status: 'active' },
    { company_name: 'Hella GmbH & Co', country: 'Germany', city: 'Lippstadt', address: 'Rixbecker Str. 75', lat: 51.6738, lng: 8.3503, incoterm: 'EXW', status: 'active' },
    { company_name: 'Valeo SA', country: 'France', city: 'Paris', address: '43 Rue Bayen', lat: 48.8789, lng: 2.2918, incoterm: 'FCA', status: 'active' },
    { company_name: 'Faurecia SE', country: 'France', city: 'Nanterre', address: '23-27 Ave des Champs Pierreux', lat: 48.8924, lng: 2.2070, incoterm: 'DDP', status: 'active' },
    { company_name: 'Plastic Omnium', country: 'France', city: 'Levallois-Perret', address: '1 Allée Pierre Burelle', lat: 48.8946, lng: 2.2873, incoterm: 'CIF', status: 'active' },
    { company_name: 'Gestamp Automoción', country: 'Spain', city: 'Madrid', address: 'Pol. Industrial Abadiano', lat: 40.4531, lng: -3.6883, incoterm: 'CIF', status: 'active' },
    { company_name: 'CIE Automotive', country: 'Spain', city: 'Bilbao', address: 'Alameda Mazarredo 69', lat: 43.2630, lng: -2.9350, incoterm: 'FOB', status: 'active' },
    { company_name: 'Brembo SpA', country: 'Italy', city: 'Bergamo', address: 'Via Brembo 25', lat: 45.6983, lng: 9.6773, incoterm: 'EXW', status: 'active' },
    { company_name: 'Magneti Marelli', country: 'Italy', city: 'Bologna', address: 'Via Vizzani 79-81', lat: 44.5075, lng: 11.3568, incoterm: 'FCA', status: 'active' },
    // Central/Eastern Europe
    { company_name: 'Benteler International', country: 'Austria', city: 'Salzburg', address: 'Schillerstr. 25', lat: 47.8095, lng: 13.0550, incoterm: 'CIF', status: 'active' },
    { company_name: 'Miba AG', country: 'Austria', city: 'Laakirchen', address: 'Dr.-Mitterbauer-Str. 3', lat: 47.9810, lng: 13.8264, incoterm: 'EXW', status: 'active' },
    { company_name: 'Skoda Auto Parts', country: 'Czech Republic', city: 'Mladá Boleslav', address: 'Třída Václava Klementa 869', lat: 50.4127, lng: 14.9067, incoterm: 'FCA', status: 'active' },
    { company_name: 'Boryszew SA', country: 'Poland', city: 'Warsaw', address: 'ul. Jagiellońska 76', lat: 52.2633, lng: 21.0407, incoterm: 'DDP', status: 'active' },
    { company_name: 'Grupo Antolin', country: 'Poland', city: 'Wroclaw', address: 'ul. Kwiatkowskiego 4', lat: 51.1079, lng: 17.0385, incoterm: 'CIF', status: 'active' },
    { company_name: 'AD Plastik d.d.', country: 'Croatia', city: 'Solin', address: 'Matoševa 8', lat: 43.5389, lng: 16.4922, incoterm: 'EXW', status: 'active' },
    { company_name: 'Cimos d.d.', country: 'Slovenia', city: 'Koper', address: 'Sermin 8a', lat: 45.5481, lng: 13.7300, incoterm: 'FCA', status: 'active' },
    { company_name: 'Dräxlmaier Group', country: 'Romania', city: 'Timișoara', address: 'Calea Lugojului 8', lat: 45.7489, lng: 21.2087, incoterm: 'DDP', status: 'active' },
    { company_name: 'Aptiv Romania', country: 'Romania', city: 'Bucharest', address: 'Bulevardul Timișoara 26', lat: 44.4268, lng: 26.1025, incoterm: 'FOB', status: 'active' },
    { company_name: 'Kamax Hungary', country: 'Hungary', city: 'Győr', address: 'Ipari Park 12', lat: 47.6875, lng: 17.6504, incoterm: 'EXW', status: 'active' },
    { company_name: 'Matador Automotive', country: 'Slovakia', city: 'Dubnica nad Váhom', address: 'Kolkáreň 35', lat: 48.9427, lng: 18.1741, incoterm: 'CIF', status: 'active' },
    // Turkey
    { company_name: 'Tofas Oto Fabrikasi', country: 'Turkey', city: 'Bursa', address: 'Yeni Yalova Yolu', lat: 40.2299, lng: 28.9121, incoterm: 'FOB', status: 'active' },
    { company_name: 'Beycelik Gestamp', country: 'Turkey', city: 'Bursa', address: 'BOSB 1. Cad No:20', lat: 40.2165, lng: 28.9503, incoterm: 'CIF', status: 'active' },
    // UK & Nordics
    { company_name: 'GKN Automotive', country: 'United Kingdom', city: 'Birmingham', address: 'Erdington Hall Road', lat: 52.5244, lng: -1.8359, incoterm: 'DDP', status: 'active' },
    { company_name: 'SKF AB', country: 'Sweden', city: 'Gothenburg', address: 'Hornsgatan 1', lat: 57.7089, lng: 11.9746, incoterm: 'FOB', status: 'active' },
    // Japan
    { company_name: 'Denso Corporation', country: 'Japan', city: 'Kariya', address: '1-1 Showa-cho', lat: 34.9892, lng: 137.0022, incoterm: 'FOB', status: 'active' },
    { company_name: 'Aisin Corporation', country: 'Japan', city: 'Kariya', address: '2-1 Asahi-machi', lat: 34.9960, lng: 136.9927, incoterm: 'CIF', status: 'on-hold' },
    { company_name: 'Toyota Boshoku', country: 'Japan', city: 'Kariya', address: '1-1 Toyoda-cho', lat: 34.9945, lng: 137.0010, incoterm: 'FOB', status: 'active' },
    { company_name: 'Sumitomo Electric', country: 'Japan', city: 'Osaka', address: '4-5-33 Kitahama', lat: 34.6937, lng: 135.5023, incoterm: 'CIF', status: 'active' },
    { company_name: 'NTN Corporation', country: 'Japan', city: 'Osaka', address: '3-17 Kyomachibori', lat: 34.6863, lng: 135.4895, incoterm: 'EXW', status: 'active' },
    // South Korea
    { company_name: 'Hyundai Mobis', country: 'South Korea', city: 'Seoul', address: '203 Teheran-ro', lat: 37.5065, lng: 127.0536, incoterm: 'FOB', status: 'active' },
    { company_name: 'Mando Corporation', country: 'South Korea', city: 'Seongnam', address: '21 Pangyo-ro', lat: 37.3947, lng: 127.1119, incoterm: 'CIF', status: 'active' },
    { company_name: 'Hanon Systems', country: 'South Korea', city: 'Daejeon', address: '95 Mannyeon-dong', lat: 36.3504, lng: 127.3845, incoterm: 'FOB', status: 'active' },
    // China
    { company_name: 'Yanfeng Automotive', country: 'China', city: 'Shanghai', address: '1258 Minsheng Road', lat: 31.2345, lng: 121.5447, incoterm: 'FOB', status: 'active' },
    { company_name: 'CATL Battery', country: 'China', city: 'Ningde', address: 'Jiaocheng District', lat: 26.6592, lng: 119.5483, incoterm: 'CIF', status: 'active' },
    { company_name: 'Bethel Automotive', country: 'China', city: 'Wuhu', address: 'Economic Dev Zone', lat: 31.3525, lng: 118.3580, incoterm: 'FOB', status: 'active' },
    { company_name: 'Joyson Safety', country: 'China', city: 'Ningbo', address: 'No.28 Jingang Avenue', lat: 29.8683, lng: 121.5440, incoterm: 'DDP', status: 'active' },
    // India
    { company_name: 'Tata AutoComp Systems', country: 'India', city: 'Pune', address: 'Hinjewadi Phase 2', lat: 18.5912, lng: 73.7389, incoterm: 'EXW', status: 'active' },
    { company_name: 'Samvardhana Motherson', country: 'India', city: 'Noida', address: 'Plot A-1 Sector 126', lat: 28.5444, lng: 77.3230, incoterm: 'FCA', status: 'on-hold' },
    { company_name: 'Bharat Forge Ltd', country: 'India', city: 'Pune', address: 'Mundhwa', lat: 18.5300, lng: 73.9259, incoterm: 'FOB', status: 'active' },
    // North America
    { company_name: 'Magna International', country: 'Canada', city: 'Aurora', address: '337 Magna Drive', lat: 44.0065, lng: -79.4504, incoterm: 'DDP', status: 'active' },
    { company_name: 'Martinrea International', country: 'Canada', city: 'Vaughan', address: '3210 Langstaff Rd', lat: 43.8075, lng: -79.5384, incoterm: 'EXW', status: 'active' },
    { company_name: 'BorgWarner Inc', country: 'USA', city: 'Auburn Hills', address: '3850 Hamlin Rd', lat: 42.6723, lng: -83.2349, incoterm: 'FCA', status: 'active' },
    { company_name: 'Dana Incorporated', country: 'USA', city: 'Maumee', address: '3939 Technology Dr', lat: 41.5798, lng: -83.6694, incoterm: 'CIF', status: 'active' },
    { company_name: 'Lear Corporation', country: 'USA', city: 'Southfield', address: '21557 Telegraph Rd', lat: 42.4734, lng: -83.2892, incoterm: 'DDP', status: 'active' },
    { company_name: 'Aptiv PLC', country: 'USA', city: 'Troy', address: '5725 Delphi Dr', lat: 42.5803, lng: -83.1431, incoterm: 'FOB', status: 'active' },
    // Mexico
    { company_name: 'Nemak SA', country: 'Mexico', city: 'Monterrey', address: 'Libramiento Arco Vial km 3.8', lat: 25.6866, lng: -100.3161, incoterm: 'FCA', status: 'active' },
    { company_name: 'Metalsa SA', country: 'Mexico', city: 'Monterrey', address: 'Ave. Industrias 100', lat: 25.6714, lng: -100.2472, incoterm: 'DDP', status: 'active' },
    // Brazil
    { company_name: 'Marcopolo SA', country: 'Brazil', city: 'Caxias do Sul', address: 'Av. Rio Branco 4889', lat: -29.1681, lng: -51.1794, incoterm: 'FOB', status: 'active' },
    { company_name: 'Iochpe-Maxion SA', country: 'Brazil', city: 'Cruzeiro', address: 'Rua Dr. Eduardo Grunewald 600', lat: -22.5772, lng: -44.9636, incoterm: 'CIF', status: 'active' },
    // Morocco
    { company_name: 'Hands Corporation Morocco', country: 'Morocco', city: 'Tangier', address: 'Tanger Free Zone', lat: 35.7595, lng: -5.8330, incoterm: 'FCA', status: 'active' },
    { company_name: 'Yazaki Morocco', country: 'Morocco', city: 'Kenitra', address: 'Atlantic Free Zone', lat: 34.2610, lng: -6.5802, incoterm: 'FOB', status: 'active' },
  ];

  suppliers.forEach((s, i) => {
    runSql(
      `INSERT INTO suppliers (supplier_id, company_name, country, city, street_address, latitude, longitude, default_incoterm, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`SUP-${(i + 1).toString().padStart(4, '0')}`, s.company_name, s.country, s.city, s.address, s.lat, s.lng, s.incoterm, s.status,
       `${s.incoterm} supplier — ${s.city}, ${s.country}`]
    );
  });

  // Contacts
  const firstNames = ['Hans', 'Marie', 'Takeshi', 'Sarah', 'Klaus', 'Jin-Ho', 'Marco', 'Priya', 'Carlos', 'Elena', 'Wei', 'Liam', 'Raj', 'Ana', 'Fritz', 'Sofia', 'Dragan', 'Ivana', 'Tomislav', 'Marta'];
  const lastNames = ['Mueller', 'Dupont', 'Tanaka', 'Smith', 'Weber', 'Kim', 'Silva', 'Sharma', 'Garcia', 'Petrova', 'Chen', 'OBrien', 'Patel', 'Rodriguez', 'Bauer', 'Novak', 'Horvat', 'Kovac', 'Babic', 'Kriz'];

  for (let i = 1; i <= suppliers.length; i++) {
    const fi = (i - 1) % firstNames.length;
    const li = (i - 1) % lastNames.length;
    const fn2 = (i + 3) % firstNames.length;
    const ln2 = (i + 5) % lastNames.length;
    const s = suppliers[i - 1];

    runSql('INSERT INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [i, 'primary', null, `${firstNames[fi]} ${lastNames[li]}`, 'Sales Manager', `${firstNames[fi].toLowerCase()}.${lastNames[li].toLowerCase()}@${s.company_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}.com`, `+${i > 30 ? '86' : '49'}-${100 + i}-${1000 + i}`]);
    runSql('INSERT INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [i, 'secondary', null, `${firstNames[fn2]} ${lastNames[ln2]}`, 'Logistics Coordinator', `logistics@${s.company_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}.com`, `+${i > 30 ? '86' : '49'}-${200 + i}-${2000 + i}`]);
    if (i % 3 === 0) {
      runSql('INSERT INTO contacts (supplier_id, type, escalation_level, name, role_title, email, phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [i, 'escalation', 1, `Director ${lastNames[(i + 1) % lastNames.length]}`, 'VP Supply Chain', `vp@${s.company_name.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)}.com`, `+${i > 30 ? '86' : '49'}-${300 + i}-${3000 + i}`]);
    }
  }

  // Assign projects and commodities
  for (let i = 1; i <= suppliers.length; i++) {
    runSql('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [i, ((i - 1) % 8) + 1]);
    if (i % 3 === 0) runSql('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [i, ((i) % 8) + 1]);
    if (i % 5 === 0) runSql('INSERT OR IGNORE INTO supplier_projects (supplier_id, project_id) VALUES (?, ?)', [i, ((i + 3) % 8) + 1]);
    runSql('INSERT OR IGNORE INTO supplier_commodities (supplier_id, commodity_id) VALUES (?, ?)', [i, ((i - 1) % 12) + 1]);
    if (i % 2 === 0) runSql('INSERT OR IGNORE INTO supplier_commodities (supplier_id, commodity_id) VALUES (?, ?)', [i, ((i + 4) % 12) + 1]);
  }

  // 22 Transport Routes — all centered around RT HQ in Zagreb, Croatia
  const routesData = [
    // Inbound Sea routes
    {
      name: 'Germany-Croatia Sea (Hamburg-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'Maersk Line', days: 12,
      waypoints: [{ lat: 53.55, lng: 9.99, label: 'Hamburg Port' }, { lat: 43.32, lng: 16.44, label: 'Split Transit' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [1, 2, 5, 6] // Bosch, Continental, MAHLE, Hella
    },
    {
      name: 'Japan-Europe Sea (Osaka-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'NYK Line', days: 35,
      waypoints: [{ lat: 34.69, lng: 135.50, label: 'Osaka Port' }, { lat: 12.89, lng: 45.03, label: 'Aden Transit' }, { lat: 31.26, lng: 32.31, label: 'Suez Canal' }, { lat: 37.94, lng: 23.64, label: 'Piraeus' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [29, 30, 31, 32, 33] // Denso, Aisin, Toyota Boshoku, Sumitomo, NTN
    },
    {
      name: 'Korea-Europe Sea (Busan-Koper)', route_type: 'inbound', transport_mode: 'sea', carrier: 'HMM', days: 32,
      waypoints: [{ lat: 35.10, lng: 129.03, label: 'Busan Port' }, { lat: 12.89, lng: 45.03, label: 'Aden Transit' }, { lat: 31.26, lng: 32.31, label: 'Suez Canal' }, { lat: 45.55, lng: 13.73, label: 'Port of Koper' }],
      supplier_ids: [34, 35, 36] // Hyundai Mobis, Mando, Hanon
    },
    {
      name: 'China-Europe Sea (Shanghai-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'COSCO Shipping', days: 30,
      waypoints: [{ lat: 31.23, lng: 121.47, label: 'Shanghai Port' }, { lat: 1.26, lng: 103.84, label: 'Singapore' }, { lat: 31.26, lng: 32.31, label: 'Suez Canal' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [37, 38, 39, 40] // Yanfeng, CATL, Bethel, Joyson
    },
    {
      name: 'India-Croatia Sea (Mumbai-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'MSC', days: 20,
      waypoints: [{ lat: 18.94, lng: 72.84, label: 'Mumbai Port' }, { lat: 31.26, lng: 32.31, label: 'Suez Canal' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [41, 43] // Tata AutoComp, Bharat Forge
    },
    {
      name: 'Brazil-Croatia Sea (Santos-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'Hamburg Süd', days: 28,
      waypoints: [{ lat: -23.96, lng: -46.33, label: 'Santos Port' }, { lat: 36.14, lng: -5.35, label: 'Gibraltar Strait' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [52, 53] // Marcopolo, Iochpe-Maxion
    },
    {
      name: 'North America Sea (Newark-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'CMA CGM', days: 18,
      waypoints: [{ lat: 40.69, lng: -74.04, label: 'Newark Port' }, { lat: 36.14, lng: -5.35, label: 'Gibraltar Strait' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [44, 46, 47, 48, 49] // Magna, BorgWarner, Dana, Lear, Aptiv
    },
    {
      name: 'Morocco-Croatia Sea (Tangier-Rijeka)', route_type: 'inbound', transport_mode: 'sea', carrier: 'CMA CGM', days: 7,
      waypoints: [{ lat: 35.76, lng: -5.83, label: 'Tangier Med Port' }, { lat: 36.14, lng: -5.35, label: 'Gibraltar' }, { lat: 45.33, lng: 14.44, label: 'Port of Rijeka' }],
      supplier_ids: [54, 55] // Hands Corp Morocco, Yazaki Morocco
    },
    // Inbound Air routes
    {
      name: 'Shanghai Air Express', route_type: 'inbound', transport_mode: 'air', carrier: 'FedEx Express', days: 3,
      waypoints: [{ lat: 31.14, lng: 121.81, label: 'Shanghai Pudong (PVG)' }, { lat: 50.03, lng: 8.57, label: 'Frankfurt Hub (FRA)' }, { lat: 45.74, lng: 16.07, label: 'Zagreb Airport (ZAG)' }],
      supplier_ids: [37, 38] // Yanfeng, CATL
    },
    {
      name: 'Tokyo Air Express', route_type: 'inbound', transport_mode: 'air', carrier: 'DHL Express', days: 3,
      waypoints: [{ lat: 35.76, lng: 140.39, label: 'Tokyo Narita (NRT)' }, { lat: 50.03, lng: 8.57, label: 'Frankfurt Hub (FRA)' }, { lat: 45.74, lng: 16.07, label: 'Zagreb Airport (ZAG)' }],
      supplier_ids: [29, 31] // Denso, Toyota Boshoku
    },
    {
      name: 'Detroit Air Express', route_type: 'inbound', transport_mode: 'air', carrier: 'UPS Air Freight', days: 2,
      waypoints: [{ lat: 42.21, lng: -83.35, label: 'Detroit Metro (DTW)' }, { lat: 45.74, lng: 16.07, label: 'Zagreb Airport (ZAG)' }],
      supplier_ids: [46, 48] // BorgWarner, Lear
    },
    // Inbound Road routes
    {
      name: 'Germany Road (Stuttgart-Zagreb)', route_type: 'inbound', transport_mode: 'road', carrier: 'DB Schenker', days: 2,
      waypoints: [{ lat: 48.78, lng: 9.18, label: 'Stuttgart' }, { lat: 48.21, lng: 16.37, label: 'Vienna' }, { lat: 46.06, lng: 14.51, label: 'Ljubljana' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [1, 3, 4, 5] // Bosch, ZF, Schaeffler, MAHLE
    },
    {
      name: 'Austria Road (Salzburg-Zagreb)', route_type: 'inbound', transport_mode: 'road', carrier: 'Gebrüder Weiss', days: 1,
      waypoints: [{ lat: 47.81, lng: 13.06, label: 'Salzburg' }, { lat: 47.07, lng: 15.44, label: 'Graz' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [14, 15] // Benteler, Miba
    },
    {
      name: 'Slovenia Road (Koper-Zagreb)', route_type: 'inbound', transport_mode: 'road', carrier: 'Intereuropa', days: 1,
      waypoints: [{ lat: 45.55, lng: 13.73, label: 'Koper' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [20] // Cimos
    },
    {
      name: 'Hungary Road (Győr-Zagreb)', route_type: 'inbound', transport_mode: 'road', carrier: 'Waberers', days: 1,
      waypoints: [{ lat: 47.69, lng: 17.65, label: 'Győr' }, { lat: 46.31, lng: 16.34, label: 'Varaždin' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [23] // Kamax Hungary
    },
    {
      name: 'Romania Road (Timișoara-Zagreb)', route_type: 'inbound', transport_mode: 'road', carrier: 'Fan Courier', days: 2,
      waypoints: [{ lat: 45.75, lng: 21.21, label: 'Timișoara' }, { lat: 45.25, lng: 19.85, label: 'Novi Sad' }, { lat: 44.79, lng: 20.46, label: 'Belgrade' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [21, 22] // Dräxlmaier, Aptiv Romania
    },
    {
      name: 'Turkey Road-Sea (Bursa-Zagreb)', route_type: 'inbound', transport_mode: 'multimodal', carrier: 'Ekol Logistics', days: 5,
      waypoints: [{ lat: 40.23, lng: 28.91, label: 'Bursa' }, { lat: 41.01, lng: 28.98, label: 'Istanbul' }, { lat: 44.79, lng: 20.46, label: 'Belgrade' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [25, 26] // Tofas, Beycelik
    },
    // Inbound Rail
    {
      name: 'Czech Rail (Mladá Boleslav-Zagreb)', route_type: 'inbound', transport_mode: 'rail', carrier: 'ČD Cargo', days: 3,
      waypoints: [{ lat: 50.41, lng: 14.91, label: 'Mladá Boleslav' }, { lat: 48.21, lng: 16.37, label: 'Vienna Hub' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [16] // Skoda Auto Parts
    },
    {
      name: 'Poland Rail (Warsaw-Zagreb)', route_type: 'inbound', transport_mode: 'rail', carrier: 'PKP Cargo', days: 3,
      waypoints: [{ lat: 52.26, lng: 21.04, label: 'Warsaw' }, { lat: 50.08, lng: 14.44, label: 'Prague' }, { lat: 48.21, lng: 16.37, label: 'Vienna' }, { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }],
      supplier_ids: [17, 18] // Boryszew, Grupo Antolin
    },
    // Outbound routes
    {
      name: 'Zagreb-Munich Outbound', route_type: 'outbound', transport_mode: 'road', carrier: 'Kuehne+Nagel', days: 2, shipment_type: 'ftl',
      waypoints: [{ lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }, { lat: 47.81, lng: 13.06, label: 'Salzburg' }, { lat: 48.14, lng: 11.58, label: 'Munich OEM Plant' }],
      supplier_ids: []
    },
    {
      name: 'Zagreb-Wolfsburg Outbound', route_type: 'outbound', transport_mode: 'road', carrier: 'DB Schenker', days: 3, shipment_type: 'ftl',
      waypoints: [{ lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }, { lat: 48.21, lng: 16.37, label: 'Vienna' }, { lat: 50.08, lng: 14.44, label: 'Prague' }, { lat: 52.42, lng: 10.79, label: 'Wolfsburg VW Plant' }],
      supplier_ids: []
    },
    {
      name: 'Zagreb-Torino Outbound', route_type: 'outbound', transport_mode: 'road', carrier: 'XPO Logistics', days: 2, shipment_type: 'ftl',
      waypoints: [{ lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ' }, { lat: 46.06, lng: 14.51, label: 'Ljubljana' }, { lat: 45.44, lng: 12.32, label: 'Venice' }, { lat: 45.07, lng: 7.69, label: 'Torino Stellantis Plant' }],
      supplier_ids: []
    },

    // ── MILKRUN ROUTES ──
    // Milkrun 1: South Germany Milkrun — picks up from 4 German suppliers in a loop, ends at RT
    {
      name: 'South Germany Milkrun (Stuttgart-Friedrichshafen-Herzogenaurach-Lippstadt → RT)', route_type: 'inbound', transport_mode: 'road', carrier: 'DB Schenker', days: 3, shipment_type: 'milkrun',
      waypoints: [
        { lat: 51.67, lng: 8.35, label: 'Hella (Lippstadt)' },
        { lat: 49.57, lng: 10.88, label: 'Schaeffler (Herzogenaurach)' },
        { lat: 48.78, lng: 9.18, label: 'Bosch (Stuttgart)' },
        { lat: 47.65, lng: 9.48, label: 'ZF (Friedrichshafen)' },
        { lat: 47.81, lng: 13.06, label: 'Salzburg Transit' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      supplier_ids: [6, 4, 1, 3] // Hella, Schaeffler, Bosch, ZF — order matches milkrun chain
    },
    // Milkrun 2: France-Spain Milkrun — 3 French + 1 Spanish supplier, road to RT
    {
      name: 'France-Spain Milkrun (Madrid-Paris-Nanterre-Levallois → RT)', route_type: 'inbound', transport_mode: 'road', carrier: 'XPO Logistics', days: 4, shipment_type: 'milkrun',
      waypoints: [
        { lat: 40.45, lng: -3.69, label: 'Gestamp (Madrid)' },
        { lat: 48.89, lng: 2.29, label: 'Valeo (Paris)' },
        { lat: 48.89, lng: 2.21, label: 'Faurecia (Nanterre)' },
        { lat: 48.89, lng: 2.29, label: 'Plastic Omnium (Levallois)' },
        { lat: 47.38, lng: 8.54, label: 'Zürich Transit' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      supplier_ids: [10, 7, 8, 9] // Gestamp, Valeo, Faurecia, Plastic Omnium
    },
    // Milkrun 3: CEE Milkrun — picks up from nearby Central/Eastern European suppliers
    {
      name: 'CEE Regional Milkrun (Koper-Solin-Győr-Dubnica → RT)', route_type: 'inbound', transport_mode: 'road', carrier: 'Waberers', days: 2, shipment_type: 'milkrun',
      waypoints: [
        { lat: 43.54, lng: 16.49, label: 'AD Plastik (Solin)' },
        { lat: 45.55, lng: 13.73, label: 'Cimos (Koper)' },
        { lat: 47.69, lng: 17.65, label: 'Kamax (Győr)' },
        { lat: 48.94, lng: 18.17, label: 'Matador (Dubnica)' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      supplier_ids: [19, 20, 23, 24] // AD Plastik, Cimos, Kamax Hungary, Matador
    },
    // Milkrun 4: Italy Milkrun — Bergamo + Bologna pickup, road to RT
    {
      name: 'Italy Milkrun (Bergamo-Bologna → RT)', route_type: 'inbound', transport_mode: 'road', carrier: 'Gebrüder Weiss', days: 2, shipment_type: 'milkrun',
      waypoints: [
        { lat: 44.51, lng: 11.36, label: 'Magneti Marelli (Bologna)' },
        { lat: 45.70, lng: 9.68, label: 'Brembo (Bergamo)' },
        { lat: 45.44, lng: 12.32, label: 'Venice Transit' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      supplier_ids: [13, 12] // Magneti Marelli, Brembo
    },

    // ── LTL ROUTES (shared capacity) ──
    // LTL 1: North Germany LTL — shared truck for Continental + Hella
    {
      name: 'North Germany LTL (Hannover-Lippstadt → RT)', route_type: 'inbound', transport_mode: 'road', carrier: 'Kuehne+Nagel', days: 2, shipment_type: 'ltl',
      waypoints: [
        { lat: 52.40, lng: 9.74, label: 'Continental (Hannover)' },
        { lat: 51.67, lng: 8.35, label: 'Hella (Lippstadt)' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      supplier_ids: [2, 6] // Continental, Hella
    },
    // LTL 2: Romania LTL — shared truck for Dräxlmaier + Aptiv Romania
    {
      name: 'Romania LTL (Timișoara-Bucharest → RT)', route_type: 'inbound', transport_mode: 'road', carrier: 'Fan Courier', days: 3, shipment_type: 'ltl',
      waypoints: [
        { lat: 44.43, lng: 26.10, label: 'Aptiv Romania (Bucharest)' },
        { lat: 45.75, lng: 21.21, label: 'Dräxlmaier (Timișoara)' },
        { lat: 45.81, lng: 15.98, label: 'RT Zagreb HQ (Anchor)' },
      ],
      supplier_ids: [22, 21] // Aptiv Romania, Dräxlmaier
    },
  ];

  for (const r of routesData) {
    const { lastId: routeId } = runSql(
      'INSERT INTO transport_routes (name, route_type, transport_mode, carrier_name, transit_days, waypoints, shipment_type) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.name, r.route_type, r.transport_mode, r.carrier, r.days, JSON.stringify(r.waypoints), r.shipment_type || 'ftl']
    );
    for (const sid of r.supplier_ids) {
      runSql('INSERT OR IGNORE INTO route_suppliers (route_id, supplier_id) VALUES (?, ?)', [routeId, sid]);
    }
  }

  saveDb();

  console.log('RT Automotive database seeded successfully!');
  console.log(`  - 2 users (admin/admin123, viewer/viewer123)`);
  console.log(`  - ${projectNames.length} projects`);
  console.log(`  - ${commodityNames.length} commodities`);
  console.log(`  - ${suppliers.length} suppliers with contacts`);
  console.log(`  - ${routesData.length} transport routes`);
  console.log(`  - Company settings for RT Automotive (Zagreb, Croatia)`);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
