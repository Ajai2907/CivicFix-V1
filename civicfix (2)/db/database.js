import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

let dbInstance = null;
const DB_DIR = path.join(process.cwd(), 'db');
const DB_FILE = path.join(DB_DIR, 'civicfix.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

export async function getDb() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  let db;
  if (fs.existsSync(DB_FILE)) {
    try {
      const fileBuffer = fs.readFileSync(DB_FILE);
      db = new SQL.Database(fileBuffer);
    } catch (e) {
      console.warn('Could not read existing DB file, creating fresh DB:', e.message);
      db = new SQL.Database();
    }
  } else {
    db = new SQL.Database();
  }

  // Create table if not exists
  db.run(`
    CREATE TABLE IF NOT EXISTS complaints (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      location TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      image_path TEXT,
      severity TEXT DEFAULT 'Medium',
      priority TEXT DEFAULT 'Normal',
      status TEXT DEFAULT 'Pending',
      authority_notes TEXT DEFAULT '',
      department TEXT DEFAULT 'Municipal Public Works',
      ai_confidence REAL DEFAULT 0.92,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Check if empty and seed initial realistic complaints
  const countResult = db.exec("SELECT COUNT(*) as count FROM complaints");
  let count = 0;
  if (countResult.length > 0 && countResult[0].values.length > 0) {
    count = countResult[0].values[0][0];
  }

  if (count === 0) {
    console.log("Seeding initial civic complaints into SQLite database...");
    const sampleComplaints = [
      {
        id: "CMP-894210",
        category: "Pothole & Roads",
        description: "Dangerous large pothole near Main Street pedestrian crossing causing two-wheeler skids during rains.",
        location: "MG Road, Near Central Plaza, Sector 4",
        latitude: 28.6139,
        longitude: 77.2090,
        image_path: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop&q=80",
        severity: "Critical",
        priority: "Critical",
        status: "In Progress",
        authority_notes: "Assigned to Ward 4 Road Maintenance Unit. Asphalt patch crew dispatched.",
        department: "Roads & Highway Authority",
        ai_confidence: 0.96,
        created_at: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 6 * 3600 * 1000).toISOString()
      },
      {
        id: "CMP-773192",
        category: "Garbage & Sanitation",
        description: "Open community dump overflowing onto the public walkway for 4 days. Strong odor and pest infestation.",
        location: "Lakeview Avenue, Block B Market",
        latitude: 28.6190,
        longitude: 77.2180,
        image_path: "https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=600&auto=format&fit=crop&q=80",
        severity: "High",
        priority: "High",
        status: "Pending",
        authority_notes: "Scheduled for morning compactor truck clearance.",
        department: "Solid Waste Management",
        ai_confidence: 0.94,
        created_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 18 * 3600 * 1000).toISOString()
      },
      {
        id: "CMP-620481",
        category: "Water Leakage & Sewage",
        description: "Main drinking water pipeline fracture gushing clean potable water onto lane 3. Pressure drop in 20 households.",
        location: "Kaveri Layout, 5th Cross Road",
        latitude: 28.6080,
        longitude: 77.2250,
        image_path: "https://images.unsplash.com/photo-1584992236310-6edddc08acff?w=600&auto=format&fit=crop&q=80",
        severity: "Critical",
        priority: "Critical",
        status: "In Progress",
        authority_notes: "Valve isolated. Pipe replacement underway by Jal Board engineers.",
        department: "Water Supply & Sewerage Board",
        ai_confidence: 0.98,
        created_at: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      },
      {
        id: "CMP-519302",
        category: "Streetlight & Electrical",
        description: "Three consecutive LED street poles non-operational for over a week creating dark hazard zone at night.",
        location: "Green Glen Park Perimeter Road",
        latitude: 28.6220,
        longitude: 77.2010,
        image_path: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=80",
        severity: "Medium",
        priority: "Normal",
        status: "Resolved",
        authority_notes: "Faulty fuse replaced and LED luminaire calibrated. Verified working.",
        department: "Electrical & Streetlighting Dept",
        ai_confidence: 0.89,
        created_at: new Date(Date.now() - 96 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString()
      },
      {
        id: "CMP-409823",
        category: "Public Safety & Drainage",
        description: "Stormwater storm drain cover damaged with exposed iron rebar. Safety risk for school children.",
        location: "Railway Station Approach Road",
        latitude: 28.6290,
        longitude: 77.2140,
        image_path: "https://images.unsplash.com/photo-1541888946425-d0fbb18086f6?w=600&auto=format&fit=crop&q=80",
        severity: "High",
        priority: "High",
        status: "Pending",
        authority_notes: "Barricade placed temporarily. New RCC cover requested from store.",
        department: "Stormwater Drainage Dept",
        ai_confidence: 0.95,
        created_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
        updated_at: new Date(Date.now() - 12 * 3600 * 1000).toISOString()
      }
    ];

    const stmt = db.prepare(`
      INSERT INTO complaints (
        id, category, description, location, latitude, longitude,
        image_path, severity, priority, status, authority_notes,
        department, ai_confidence, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const c of sampleComplaints) {
      stmt.run([
        c.id, c.category, c.description, c.location, c.latitude, c.longitude,
        c.image_path, c.severity, c.priority, c.status, c.authority_notes,
        c.department, c.ai_confidence, c.created_at, c.updated_at
      ]);
    }
    stmt.free();

    // Persist to disk
    const data = db.export();
    fs.writeFileSync(DB_FILE, Buffer.from(data));
  }

  dbInstance = {
    all(sql, params = []) {
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
    get(sql, params = []) {
      const results = this.all(sql, params);
      return results.length > 0 ? results[0] : null;
    },
    run(sql, params = []) {
      db.run(sql, params);
      const data = db.export();
      fs.writeFileSync(DB_FILE, Buffer.from(data));
      return { success: true };
    },
    exec(sql) {
      const res = db.exec(sql);
      const data = db.export();
      fs.writeFileSync(DB_FILE, Buffer.from(data));
      return res;
    }
  };

  return dbInstance;
}
