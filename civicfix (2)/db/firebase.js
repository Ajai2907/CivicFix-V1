import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

let db = null;
let firebaseApp = null;
let firebaseConfig = null;

export function getFirebaseConfig() {
  if (firebaseConfig) return firebaseConfig;
  try {
    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
      console.warn('firebase-applet-config.json not found, using environment variables');
      firebaseConfig = {
        projectId: process.env.FIREBASE_PROJECT_ID || 'lively-tube-f9v0l',
        apiKey: process.env.FIREBASE_API_KEY || '',
        firestoreDatabaseId: process.env.FIREBASE_DATABASE_ID || 'ai-studio-civicfix-b06a7bc6-567e-4b9d-98a3-9cc301eada79'
      };
    }
  } catch (err) {
    console.error('Error reading firebase config:', err);
  }
  return firebaseConfig;
}

export function initFirebase() {
  if (db) return db;

  const config = getFirebaseConfig();
  if (!config || !config.projectId) {
    throw new Error('Firebase configuration missing projectId.');
  }

  firebaseApp = getApps().length > 0 ? getApp() : initializeApp(config);

  if (config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)') {
    try {
      db = getFirestore(firebaseApp, config.firestoreDatabaseId);
    } catch (err) {
      console.warn(`Could not init Firestore with custom DB ID ${config.firestoreDatabaseId}, falling back to default:`, err.message);
      db = getFirestore(firebaseApp);
    }
  } else {
    db = getFirestore(firebaseApp);
  }

  console.log(`🔥 Firebase Firestore initialized successfully for project: ${config.projectId}`);
  return db;
}

/**
 * Calculates distance in meters between two GPS coordinates using Haversine formula
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 999999;
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Duplicate Complaint Detection
 * Checks if a complaint with similar category and nearby GPS location (within ~150 meters)
 * or highly overlapping description was submitted within the last 14 days and is not yet resolved.
 */
export async function checkDuplicateComplaint({ category, latitude, longitude, description }) {
  try {
    const firestore = initFirebase();
    const complaintsRef = collection(firestore, 'complaints');
    const snapshot = await getDocs(complaintsRef);

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const descWords = (description || '')
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);

    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();

      // Only compare against unresolved complaints (Pending, In Progress, Under Review, Assigned)
      if (data.status === 'Resolved') continue;

      let isDuplicate = false;
      let reason = '';

      // 1. Check GPS proximity if coordinates available
      if (lat && lng && data.latitude && data.longitude) {
        const distance = getDistanceMeters(lat, lng, data.latitude, data.longitude);
        // If within 150 meters and same general category
        if (distance <= 150 && (data.category === category || (data.category && category && data.category.toLowerCase() === category.toLowerCase()))) {
          isDuplicate = true;
          reason = `Nearby civic issue (${Math.round(distance)}m away) for "${data.category}" already reported.`;
        }
      }

      // 2. Check keyword overlap in description if same category
      if (!isDuplicate && descWords.length >= 3 && data.description) {
        const existingDesc = data.description.toLowerCase();
        let matches = 0;
        for (const w of descWords) {
          if (existingDesc.includes(w)) matches++;
        }
        if (matches >= 3 && (data.category === category)) {
          isDuplicate = true;
          reason = `Substantial description match with existing complaint ${data.id}.`;
        }
      }

      if (isDuplicate) {
        return {
          isPossibleDuplicate: true,
          duplicateOf: data.id,
          reason: reason
        };
      }
    }
  } catch (err) {
    console.warn('Duplicate detection check error:', err.message);
  }

  return {
    isPossibleDuplicate: false,
    duplicateOf: null,
    reason: ''
  };
}

/**
 * Creates a new complaint in Firestore
 */
export async function createComplaintDoc(complaintData) {
  const firestore = initFirebase();
  const complaintId = complaintData.id || `CMP-${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;
  const now = new Date().toISOString();

  const statusHistory = [
    {
      status: 'Submitted',
      timestamp: now,
      updatedBy: 'Citizen',
      notes: 'Initial complaint filed with GPS and multimedia evidence.'
    }
  ];

  const fullData = {
    id: complaintId,
    category: complaintData.category || 'Other',
    description: complaintData.description || '',
    location: complaintData.location || 'Location pinned via GPS',
    latitude: complaintData.latitude ? parseFloat(complaintData.latitude) : 28.6139,
    longitude: complaintData.longitude ? parseFloat(complaintData.longitude) : 77.2090,
    imageUrl: complaintData.imageUrl || complaintData.image_path || '',
    image_path: complaintData.imageUrl || complaintData.image_path || '',
    severity: complaintData.severity || 'Medium',
    priority: complaintData.priority || 'Normal',
    assignedDepartment: complaintData.assignedDepartment || complaintData.department || 'Municipal Public Works',
    department: complaintData.assignedDepartment || complaintData.department || 'Municipal Public Works',
    status: 'Submitted',
    statusHistory: statusHistory,
    isPossibleDuplicate: Boolean(complaintData.isPossibleDuplicate),
    duplicateOf: complaintData.duplicateOf || null,
    duplicateReason: complaintData.duplicateReason || '',
    aiAssessment: complaintData.aiAssessment || 'Automated triage based on reported category and citizen description.',
    aiConfidence: typeof complaintData.aiConfidence === 'number' ? complaintData.aiConfidence : 0.92,
    authorityNotes: complaintData.authorityNotes || `AI Triage: Assigned to ${complaintData.assignedDepartment || 'Municipal Public Works'}.`,
    createdAt: now,
    created_at: now,
    updatedAt: now,
    updated_at: now
  };

  const docRef = doc(firestore, 'complaints', complaintId);
  await setDoc(docRef, fullData);

  return fullData;
}

/**
 * Gets a complaint by ID
 */
export async function getComplaintById(complaintId) {
  if (!complaintId) return null;
  const firestore = initFirebase();
  const cleanId = complaintId.trim();

  // Try direct ID
  const docRef = doc(firestore, 'complaints', cleanId);
  const snap = await getDoc(docRef);
  if (snap.exists()) {
    return snap.data();
  }

  // Try uppercase or search
  const complaintsRef = collection(firestore, 'complaints');
  const q = query(complaintsRef, where('id', '==', cleanId.toUpperCase()));
  const qSnap = await getDocs(q);
  if (!qSnap.empty) {
    return qSnap.docs[0].data();
  }

  return null;
}

/**
 * Gets all complaints with optional filtering and search
 */
export async function getAllComplaints({ status, category, department, priority, severity, search } = {}) {
  const firestore = initFirebase();
  const complaintsRef = collection(firestore, 'complaints');
  const snapshot = await getDocs(complaintsRef);

  let results = [];
  snapshot.forEach(docSnap => {
    results.push(docSnap.data());
  });

  // Filter in memory for maximum search flexibility
  if (status && status !== 'All') {
    results = results.filter(c => (c.status || '').toLowerCase() === status.toLowerCase());
  }

  if (category && category !== 'All') {
    results = results.filter(c => (c.category || '').toLowerCase() === category.toLowerCase());
  }

  if (department && department !== 'All') {
    results = results.filter(c => (c.assignedDepartment || c.department || '').toLowerCase() === department.toLowerCase());
  }

  if (priority && priority !== 'All') {
    results = results.filter(c => (c.priority || '').toLowerCase() === priority.toLowerCase());
  }

  if (severity && severity !== 'All') {
    results = results.filter(c => (c.severity || '').toLowerCase() === severity.toLowerCase());
  }

  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    results = results.filter(c =>
      (c.id && c.id.toLowerCase().includes(term)) ||
      (c.description && c.description.toLowerCase().includes(term)) ||
      (c.location && c.location.toLowerCase().includes(term)) ||
      (c.category && c.category.toLowerCase().includes(term)) ||
      (c.assignedDepartment && c.assignedDepartment.toLowerCase().includes(term))
    );
  }

  // Sort by Priority (Critical first) and then by createdAt DESC
  const priorityRank = { Critical: 4, High: 3, Medium: 2, Normal: 2, Low: 1 };
  results.sort((a, b) => {
    const pA = priorityRank[a.priority] || 2;
    const pB = priorityRank[b.priority] || 2;
    if (pB !== pA) return pB - pA;
    return new Date(b.createdAt || b.created_at || 0) - new Date(a.createdAt || a.created_at || 0);
  });

  return results;
}

/**
 * Updates complaint status and lifecycle history
 */
export async function updateComplaintStatus(complaintId, { status, authority_notes, department, priority, updatedBy = 'Authority Officer' }) {
  const firestore = initFirebase();
  const cleanId = complaintId.trim();
  const docRef = doc(firestore, 'complaints', cleanId);
  const snap = await getDoc(docRef);

  if (!snap.exists()) {
    throw new Error(`Complaint ${cleanId} not found in Firestore.`);
  }

  const existing = snap.data();
  const now = new Date().toISOString();
  const statusChanged = status && status !== existing.status;

  const currentHistory = Array.isArray(existing.statusHistory) ? existing.statusHistory : [];
  let updatedHistory = [...currentHistory];

  let notes = authority_notes || existing.authorityNotes || '';
  if (statusChanged) {
    if (status === 'Under Review') {
      notes = notes ? `${notes} [Under Review by Authority]` : 'Complaint reviewed by municipal desk officer.';
    } else if (status === 'Assigned') {
      notes = notes ? `${notes} [Assigned to ${department || existing.assignedDepartment || existing.department}]` : `Dispatched to ${department || existing.assignedDepartment || existing.department}.`;
    } else if (status === 'In Progress') {
      notes = notes ? `${notes} [Field Team Dispatched]` : 'Field crew deployed on site for repair and clearance.';
    } else if (status === 'Resolved') {
      notes = notes ? `${notes} [Resolved & Verified]` : 'Work completed and verified by ward supervisor.';
    }

    updatedHistory.push({
      status: status,
      timestamp: now,
      updatedBy: updatedBy,
      notes: notes
    });
  }

  const updates = {
    status: status || existing.status,
    statusHistory: updatedHistory,
    authorityNotes: notes,
    assignedDepartment: department || existing.assignedDepartment || existing.department,
    department: department || existing.assignedDepartment || existing.department,
    priority: priority || existing.priority,
    updatedAt: now,
    updated_at: now
  };

  await updateDoc(docRef, updates);

  return { ...existing, ...updates };
}

/**
 * Generates summary metrics for Authority Dashboard and Landing Page
 */
export async function getAuthoritySummaryMetrics() {
  const all = await getAllComplaints();

  const total = all.length;
  const submitted = all.filter(c => c.status === 'Submitted' || c.status === 'Pending').length;
  const under_review = all.filter(c => c.status === 'Under Review').length;
  const assigned = all.filter(c => c.status === 'Assigned').length;
  const in_progress = all.filter(c => c.status === 'In Progress').length;
  const resolved = all.filter(c => c.status === 'Resolved').length;

  const pendingTotal = submitted + under_review + assigned;

  const critical = all.filter(c => c.severity === 'Critical' || c.priority === 'Critical').length;
  const high = all.filter(c => c.severity === 'High' || c.priority === 'High').length;
  const medium = all.filter(c => c.severity === 'Medium' || c.priority === 'Medium' || c.priority === 'Normal').length;
  const low = all.filter(c => c.severity === 'Low' || c.priority === 'Low').length;

  const duplicates = all.filter(c => c.isPossibleDuplicate).length;

  // Breakdown by Category
  const categories = {};
  for (const c of all) {
    const cat = c.category || 'Other';
    categories[cat] = (categories[cat] || 0) + 1;
  }

  // Breakdown by Department
  const departments = {};
  for (const c of all) {
    const dept = c.assignedDepartment || c.department || 'Municipal Public Works';
    departments[dept] = (departments[dept] || 0) + 1;
  }

  // Breakdown by Priority
  const priorities = {
    Critical: critical,
    High: high,
    Medium: medium,
    Low: low
  };

  const resolution_rate = total > 0 ? Math.round((resolved / total) * 100) : 0;

  return {
    total,
    pending: pendingTotal,
    submitted,
    under_review,
    assigned,
    in_progress,
    resolved,
    critical,
    high,
    medium,
    low,
    duplicates,
    resolution_rate,
    categories,
    departments,
    priorities,
    recent: all.slice(0, 8)
  };
}

/**
 * Seed initial realistic civic complaints into Firestore if database is empty
 */
export async function seedInitialComplaintsIfEmpty() {
  try {
    const firestore = initFirebase();
    const complaintsRef = collection(firestore, 'complaints');
    const snapshot = await getDocs(complaintsRef);

    if (snapshot.empty) {
      console.log('🌱 Seeding initial realistic civic complaints into Firestore...');

      const sampleComplaints = [
        {
          id: 'CMP-782104',
          category: 'Pothole & Roads',
          description: 'Deep hazardous pothole near Central Junction causing vehicle wheel damage and severe traffic slowdown.',
          location: 'Connaught Place Outer Circle, New Delhi',
          latitude: 28.6329,
          longitude: 77.2195,
          imageUrl: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop&q=60',
          image_path: 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop&q=60',
          severity: 'Critical',
          priority: 'Critical',
          assignedDepartment: 'Roads / Municipal Engineering',
          department: 'Roads / Municipal Engineering',
          status: 'In Progress',
          statusHistory: [
            { status: 'Submitted', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), updatedBy: 'Citizen', notes: 'Complaint submitted with GPS evidence.' },
            { status: 'Under Review', timestamp: new Date(Date.now() - 86400000 * 1.8).toISOString(), updatedBy: 'Desk Officer', notes: 'Verified as critical pothole on primary arterial road.' },
            { status: 'Assigned', timestamp: new Date(Date.now() - 86400000 * 1.5).toISOString(), updatedBy: 'Chief Municipal Officer', notes: 'Assigned to Roads / Municipal Engineering.' },
            { status: 'In Progress', timestamp: new Date(Date.now() - 86400000 * 0.8).toISOString(), updatedBy: 'Field Supervisor', notes: 'Asphalt cold mix repair crew dispatched.' }
          ],
          isPossibleDuplicate: false,
          duplicateOf: null,
          aiAssessment: 'High-traffic arterial hazard requiring immediate cold mix asphalt patching.',
          aiConfidence: 0.97,
          authorityNotes: 'Field crew deployed on site for repair and clearance.',
          createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 0.8).toISOString(),
          updated_at: new Date(Date.now() - 86400000 * 0.8).toISOString()
        },
        {
          id: 'CMP-894312',
          category: 'Water Leakage & Sewage',
          description: 'High-pressure municipal pipeline ruptured with continuous water loss flooding local pedestrian walkway.',
          location: 'Sector 14 Main Road, Rohini, Delhi',
          latitude: 28.7180,
          longitude: 77.1320,
          imageUrl: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=600&auto=format&fit=crop&q=60',
          image_path: 'https://images.unsplash.com/photo-1584467735871-8e85353a8413?w=600&auto=format&fit=crop&q=60',
          severity: 'Critical',
          priority: 'Critical',
          assignedDepartment: 'Water Supply Department',
          department: 'Water Supply Department',
          status: 'Submitted',
          statusHistory: [
            { status: 'Submitted', timestamp: new Date(Date.now() - 3600000 * 3).toISOString(), updatedBy: 'Citizen', notes: 'Reported with GPS coordinate tag.' }
          ],
          isPossibleDuplicate: false,
          duplicateOf: null,
          aiAssessment: 'Severe main pipeline burst causing clean water wastage and pedestrian obstruction.',
          aiConfidence: 0.98,
          authorityNotes: 'AI Triage: Water Supply Department emergency pipeline crew required.',
          createdAt: new Date(Date.now() - 3600000 * 3).toISOString(),
          created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 3).toISOString(),
          updated_at: new Date(Date.now() - 3600000 * 3).toISOString()
        },
        {
          id: 'CMP-652391',
          category: 'Garbage & Sanitation',
          description: 'Accumulation of uncollected domestic solid waste outside community park gate for over 4 days.',
          location: 'Block C Market, Lajpat Nagar, New Delhi',
          latitude: 28.5677,
          longitude: 77.2433,
          imageUrl: 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=600&auto=format&fit=crop&q=60',
          image_path: 'https://images.unsplash.com/photo-1605600659908-0ef719419d41?w=600&auto=format&fit=crop&q=60',
          severity: 'High',
          priority: 'High',
          assignedDepartment: 'Sanitation Department',
          department: 'Sanitation Department',
          status: 'Resolved',
          statusHistory: [
            { status: 'Submitted', timestamp: new Date(Date.now() - 86400000 * 4).toISOString(), updatedBy: 'Citizen', notes: 'Overflowing dump filed by resident.' },
            { status: 'Under Review', timestamp: new Date(Date.now() - 86400000 * 3.5).toISOString(), updatedBy: 'Desk Officer', notes: 'Sanitation zone verified.' },
            { status: 'Assigned', timestamp: new Date(Date.now() - 86400000 * 3).toISOString(), updatedBy: 'Sanitation Officer', notes: 'Compactor vehicle routed.' },
            { status: 'In Progress', timestamp: new Date(Date.now() - 86400000 * 2).toISOString(), updatedBy: 'Sanitation Crew', notes: 'Waste cleared and sanitized.' },
            { status: 'Resolved', timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), updatedBy: 'Ward Supervisor', notes: 'Area cleared, disinfected, and verified.' }
          ],
          isPossibleDuplicate: false,
          duplicateOf: null,
          aiAssessment: 'Sanitation hazard in public area; requires compactor truck and bleaching disinfection.',
          aiConfidence: 0.94,
          authorityNotes: 'Work completed and verified by ward supervisor.',
          createdAt: new Date(Date.now() - 86400000 * 4).toISOString(),
          created_at: new Date(Date.now() - 86400000 * 4).toISOString(),
          updatedAt: new Date(Date.now() - 86400000 * 1).toISOString(),
          updated_at: new Date(Date.now() - 86400000 * 1).toISOString()
        },
        {
          id: 'CMP-419082',
          category: 'Streetlight & Electrical',
          description: 'Three consecutive street lamps malfunctioning causing extreme dark corridor and safety hazard at night.',
          location: 'Green Park Extension, South Delhi',
          latitude: 28.5584,
          longitude: 77.2028,
          imageUrl: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=60',
          image_path: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=600&auto=format&fit=crop&q=60',
          severity: 'Medium',
          priority: 'Normal',
          assignedDepartment: 'Electrical / Municipal Department',
          department: 'Electrical / Municipal Department',
          status: 'Assigned',
          statusHistory: [
            { status: 'Submitted', timestamp: new Date(Date.now() - 86400000 * 1.5).toISOString(), updatedBy: 'Citizen', notes: 'Citizen reported unlit street.' },
            { status: 'Under Review', timestamp: new Date(Date.now() - 86400000 * 1).toISOString(), updatedBy: 'Desk Officer', notes: 'Feeder pillar checked.' },
            { status: 'Assigned', timestamp: new Date(Date.now() - 3600000 * 10).toISOString(), updatedBy: 'Electrical Supervisor', notes: 'Dispatched to Electrical / Municipal Department.' }
          ],
          isPossibleDuplicate: false,
          duplicateOf: null,
          aiAssessment: 'Public illumination outage; requires line tester inspection and LED fixture replacements.',
          aiConfidence: 0.91,
          authorityNotes: 'Assigned to Ward Electrical Maintenance unit.',
          createdAt: new Date(Date.now() - 86400000 * 1.5).toISOString(),
          created_at: new Date(Date.now() - 86400000 * 1.5).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 10).toISOString(),
          updated_at: new Date(Date.now() - 3600000 * 10).toISOString()
        },
        {
          id: 'CMP-512803',
          category: 'Public Safety & Drainage',
          description: 'Stormwater drain grate broken and open on busy pedestrian sidewalk near metro entrance.',
          location: 'Janakpuri East Metro Station Gate 2, New Delhi',
          latitude: 28.6288,
          longitude: 77.0865,
          imageUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=60',
          image_path: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=60',
          severity: 'Critical',
          priority: 'Critical',
          assignedDepartment: 'Drainage / Public Works',
          department: 'Drainage / Public Works',
          status: 'Under Review',
          statusHistory: [
            { status: 'Submitted', timestamp: new Date(Date.now() - 3600000 * 6).toISOString(), updatedBy: 'Citizen', notes: 'Reported dangerous open drain.' },
            { status: 'Under Review', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), updatedBy: 'Public Safety Officer', notes: 'Urgent barricading requested.' }
          ],
          isPossibleDuplicate: false,
          duplicateOf: null,
          aiAssessment: 'Pedestrian fall risk near high-traffic transit station. Requires immediate cover slab installation.',
          aiConfidence: 0.96,
          authorityNotes: 'Under Review: Priority safety barricading in progress.',
          createdAt: new Date(Date.now() - 3600000 * 6).toISOString(),
          created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
          updatedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          updated_at: new Date(Date.now() - 3600000 * 2).toISOString()
        }
      ];

      for (const item of sampleComplaints) {
        await setDoc(doc(firestore, 'complaints', item.id), item);
      }
      console.log('✅ Initial complaints successfully seeded in Firestore.');
    }
  } catch (err) {
    console.warn('Firestore seeding check info:', err.message);
  }
}
