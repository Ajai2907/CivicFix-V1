// Complaint Tracking Controller
let trackMiniMap = null;
let trackMarker = null;

document.addEventListener('DOMContentLoaded', () => {
  initTrackPage();
});

function initTrackPage() {
  const form = document.getElementById('track-search-form');
  const input = document.getElementById('track-id-input');

  // Check URL parameters for auto-search
  const urlParams = new URLSearchParams(window.location.search);
  const idFromUrl = urlParams.get('id') || urlParams.get('complaintId');
  if (idFromUrl) {
    input.value = idFromUrl.trim();
    fetchAndDisplayComplaint(idFromUrl.trim());
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const id = input.value.trim();
      if (!id) {
        showToast('Please enter a valid Complaint ID (e.g., CMP-782104).', 'warning');
        input.focus();
        return;
      }
      fetchAndDisplayComplaint(id);
    });
  }

  // Sample ID chips
  document.querySelectorAll('.sample-id-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.id;
      if (id) {
        input.value = id;
        fetchAndDisplayComplaint(id);
      }
    });
  });
}

async function fetchAndDisplayComplaint(complaintId) {
  const searchBtn = document.getElementById('track-search-btn');
  const resultCard = document.getElementById('track-result-container');
  const errorCard = document.getElementById('track-error-container');
  const notFoundId = document.getElementById('not-found-id');

  if (searchBtn) {
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<span class="spinner"></span> Searching Firestore...';
  }

  if (resultCard) resultCard.style.display = 'none';
  if (errorCard) errorCard.style.display = 'none';

  try {
    const response = await fetch(`/api/complaints/track?complaintId=${encodeURIComponent(complaintId)}`);
    const data = await response.json();

    if (response.ok && data.success && data.complaint) {
      renderComplaintDetails(data.complaint);
      if (resultCard) {
        resultCard.style.display = 'block';
        resultCard.classList.add('animate-fade-in');
        resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      if (notFoundId) notFoundId.textContent = complaintId;
      if (errorCard) {
        errorCard.style.display = 'block';
        errorCard.classList.add('animate-fade-in');
      }
      showToast(data.message || `No record found for ID ${complaintId}`, 'error');
    }
  } catch (err) {
    console.error('Error fetching complaint from Firestore:', err);
    showToast('Failed to connect to tracking service.', 'error');
  } finally {
    if (searchBtn) {
      searchBtn.disabled = false;
      searchBtn.innerHTML = '🔍 Track Status';
    }
  }
}

function renderComplaintDetails(c) {
  // 1. Complaint Header & Badges
  document.getElementById('ticket-id-display').textContent = c.id;
  
  // Status Badge
  const statusBadge = document.getElementById('ticket-status-badge');
  const statusText = c.status || 'Submitted';
  statusBadge.textContent = statusText;
  if (statusText === 'Resolved') {
    statusBadge.className = 'badge badge-resolved';
  } else if (statusText === 'In Progress') {
    statusBadge.className = 'badge badge-progress';
  } else if (statusText === 'Assigned') {
    statusBadge.className = 'badge badge-assigned';
    statusBadge.style.background = '#e0e7ff';
    statusBadge.style.color = '#3730a3';
  } else if (statusText === 'Under Review') {
    statusBadge.className = 'badge badge-review';
    statusBadge.style.background = '#fef3c7';
    statusBadge.style.color = '#92400e';
  } else {
    statusBadge.className = 'badge badge-pending';
  }

  // Priority Pill & Severity Pill
  const priorityPill = document.getElementById('ticket-priority-pill');
  if (priorityPill) {
    const p = c.priority || 'Normal';
    priorityPill.textContent = `${p} Priority`;
    if (p === 'Critical') {
      priorityPill.className = 'badge badge-critical';
    } else if (p === 'High') {
      priorityPill.className = 'badge badge-high';
    } else {
      priorityPill.className = 'badge badge-medium';
    }
  }

  const sevPill = document.getElementById('ticket-severity-pill');
  if (sevPill) {
    const s = c.severity || 'Medium';
    sevPill.textContent = `Severity: ${s}`;
    sevPill.className = `badge ${CONFIG.SEVERITY_COLORS[s] || 'badge-medium'}`;
  }

  // Duplicate Warning Alert
  const dupAlert = document.getElementById('track-duplicate-alert');
  const dupText = document.getElementById('track-duplicate-text');
  if (c.isPossibleDuplicate && dupAlert && dupText) {
    dupAlert.style.display = 'block';
    dupText.textContent = `This issue has been flagged as a possible duplicate of ${c.duplicateOf || 'an existing report'}. ${c.duplicateReason || ''}`;
  } else if (dupAlert) {
    dupAlert.style.display = 'none';
  }

  // Category & Metadata
  document.getElementById('ticket-category').textContent = c.category;
  document.getElementById('ticket-department').textContent = c.assignedDepartment || c.department || 'Municipal Works';
  document.getElementById('ticket-created-at').textContent = formatDate(c.createdAt || c.created_at);
  document.getElementById('ticket-location').textContent = c.location;
  document.getElementById('ticket-description').textContent = c.description;

  // Render 5-Stage Timeline
  updateTimeline(statusText);

  // Render Status History Log
  const historyContainer = document.getElementById('ticket-history-container');
  if (historyContainer) {
    const historyList = Array.isArray(c.statusHistory) && c.statusHistory.length > 0
      ? c.statusHistory
      : [
          {
            status: c.status || 'Submitted',
            timestamp: c.createdAt || c.created_at,
            updatedBy: 'Citizen',
            notes: c.authorityNotes || c.authority_notes || 'Initial complaint filed with evidence.'
          }
        ];

    historyContainer.innerHTML = historyList.map((item, idx) => `
      <div style="display: flex; gap: 12px; padding: 10px 0; border-bottom: ${idx < historyList.length - 1 ? '1px solid var(--border-color)' : 'none'}; align-items: flex-start;">
        <div style="width: 24px; height: 24px; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700; flex-shrink: 0;">
          ${idx + 1}
        </div>
        <div style="flex: 1;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;">
            <strong style="font-size: 0.92rem; color: var(--text-main);">${item.status}</strong>
            <span style="font-size: 0.78rem; color: var(--text-light);">${formatDate(item.timestamp)}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--text-light); margin-top: 2px;">
            Updated by: <span style="font-weight: 600; color: var(--primary);">${item.updatedBy || 'Authority'}</span>
          </div>
          ${item.notes ? `<div style="font-size: 0.86rem; color: var(--text-muted); margin-top: 4px; background: #f8fafc; padding: 6px 10px; border-radius: 4px; border-left: 3px solid var(--primary);">${item.notes}</div>` : ''}
        </div>
      </div>
    `).join('');
  }

  // Photo
  const photoContainer = document.getElementById('ticket-photo-container');
  const photoImg = document.getElementById('ticket-photo-img');
  const imgUrl = c.imageUrl || c.image_path;
  if (imgUrl) {
    photoImg.src = imgUrl;
    photoContainer.style.display = 'block';
  } else {
    photoContainer.style.display = 'none';
  }

  // Leaflet Mini Map Pin
  renderTrackMap(c.latitude, c.longitude, c.location);
}

function updateTimeline(status) {
  const step1 = document.getElementById('step-submitted');
  const step2 = document.getElementById('step-under-review');
  const step3 = document.getElementById('step-assigned');
  const step4 = document.getElementById('step-progress');
  const step5 = document.getElementById('step-resolved');

  [step1, step2, step3, step4, step5].forEach(s => {
    if (s) s.classList.remove('active', 'completed');
  });

  const norm = (status || '').toLowerCase();

  // 1. Submitted
  step1?.classList.add('completed');

  if (norm === 'submitted' || norm === 'pending') {
    step1?.classList.add('active');
  } else if (norm === 'under review' || norm === 'under_review') {
    step1?.classList.add('completed');
    step2?.classList.add('active', 'completed');
  } else if (norm === 'assigned') {
    step1?.classList.add('completed');
    step2?.classList.add('completed');
    step3?.classList.add('active', 'completed');
  } else if (norm === 'in progress' || norm === 'in_progress') {
    step1?.classList.add('completed');
    step2?.classList.add('completed');
    step3?.classList.add('completed');
    step4?.classList.add('active', 'completed');
  } else if (norm === 'resolved') {
    step1?.classList.add('completed');
    step2?.classList.add('completed');
    step3?.classList.add('completed');
    step4?.classList.add('completed');
    step5?.classList.add('active', 'completed');
  }
}

function renderTrackMap(lat, lng, locationName) {
  const mapEl = document.getElementById('track-mini-map');
  if (!mapEl || typeof L === 'undefined') return;

  const validLat = lat || CONFIG.DEFAULT_COORDS.lat;
  const validLng = lng || CONFIG.DEFAULT_COORDS.lng;

  if (!trackMiniMap) {
    trackMiniMap = L.map('track-mini-map').setView([validLat, validLng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap'
    }).addTo(trackMiniMap);
    trackMarker = L.marker([validLat, validLng]).addTo(trackMiniMap);
  } else {
    trackMiniMap.setView([validLat, validLng], 15);
    trackMarker.setLatLng([validLat, validLng]);
  }

  trackMarker.bindPopup(`<b>${escapeHtml(locationName || 'Complaint Location')}</b><br>Lat: ${validLat.toFixed(4)}, Lng: ${validLng.toFixed(4)}`).openPopup();
}
