// CivicFix Configuration & Constants
const CONFIG = {
  API_BASE: '/api',
  ENDPOINTS: {
    HEALTH: '/api/health',
    COMPLAINTS: '/api/complaints',
    TRACK: '/api/complaints/track',
    AUTHORITY_STATUS: '/api/authority/complaints',
    AUTHORITY_SUMMARY: '/api/authority/summary'
  },
  DEFAULT_COORDS: {
    lat: 28.6139,
    lng: 77.2090
  },
  CATEGORIES: [
    { id: 'Pothole & Roads', name: 'Pothole & Roads', icon: '🛣️', desc: 'Crater, road caving, surface damage' },
    { id: 'Garbage & Sanitation', name: 'Garbage & Sanitation', icon: '🗑️', desc: 'Overflowing dump, uncollected waste' },
    { id: 'Water Leakage & Sewage', name: 'Water Leakage & Sewage', icon: '💧', desc: 'Burst pipeline, contaminated water' },
    { id: 'Streetlight & Electrical', name: 'Streetlight & Electrical', icon: '💡', desc: 'Dark street, exposed wires' },
    { id: 'Public Safety & Drainage', name: 'Public Safety & Drainage', icon: '⚠️', desc: 'Open manhole, waterlogging' },
    { id: 'Other', name: 'Other Issue', icon: '📋', desc: 'Miscellaneous municipal matter' }
  ],
  STATUS_COLORS: {
    'Pending': { bg: 'badge-pending', label: 'Pending Review' },
    'In Progress': { bg: 'badge-progress', label: 'In Progress' },
    'Resolved': { bg: 'badge-resolved', label: 'Resolved' }
  },
  SEVERITY_COLORS: {
    'Critical': 'badge-critical',
    'High': 'badge-high',
    'Medium': 'badge-medium',
    'Low': 'badge-low'
  }
};
