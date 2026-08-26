// Authority Dashboard Controller - Firebase Firestore Engine
let allComplaints = [];
let categoryChart = null;
let deptChart = null;
let statusChart = null;
let dashboardMap = null;
let markersLayer = null;

document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  initDashboard();
});

// Authentication Guard
function checkAuth() {
  const user = localStorage.getItem('civicfix_authority_user');
  if (!user) {
    window.location.href = '/pages/login.html';
    return;
  }
  try {
    const parsed = JSON.parse(user);
    const userDisplay = document.getElementById('authority-user-name');
    if (userDisplay) {
      userDisplay.textContent = parsed.name || parsed.username || 'Municipal Officer';
    }
  } catch (e) {}
}

async function initDashboard() {
  // Wire Logout Button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('civicfix_authority_user');
      showToast('Logged out successfully.', 'info');
      setTimeout(() => {
        window.location.href = '/index.html';
      }, 400);
    });
  }

  // Wire Refresh Button
  const refreshBtn = document.getElementById('refresh-data-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadDashboardData();
      showToast('✓ Firestore metrics refreshed', 'info');
    });
  }

  // Wire Filter Controls
  const statusFilter = document.getElementById('filter-status');
  const departmentFilter = document.getElementById('filter-department');
  const priorityFilter = document.getElementById('filter-priority');
  const categoryFilter = document.getElementById('filter-category');
  const searchInput = document.getElementById('search-complaints-input');

  [statusFilter, departmentFilter, priorityFilter, categoryFilter].forEach(el => {
    if (el) el.addEventListener('change', () => applyFilters());
  });

  if (searchInput) {
    searchInput.addEventListener('input', () => applyFilters());
  }

  // Initial Data Fetch
  await loadDashboardData();
}

async function loadDashboardData() {
  await Promise.all([fetchSummary(), fetchComplaints()]);
}

// 1. Fetch Real Summary Data from Firestore
async function fetchSummary() {
  try {
    const res = await fetch('/api/authority/summary');
    const json = await res.json();
    if (res.ok && json.success && json.data) {
      const d = json.data;
      document.getElementById('stat-total-count').textContent = d.total || 0;
      document.getElementById('stat-pending-count').textContent = (d.submitted || 0) + (d.under_review || 0);
      
      const assignedEl = document.getElementById('stat-assigned-count');
      if (assignedEl) assignedEl.textContent = d.assigned || 0;

      document.getElementById('stat-progress-count').textContent = d.in_progress || 0;
      document.getElementById('stat-resolved-count').textContent = d.resolved || 0;
      document.getElementById('stat-critical-count').textContent = d.critical || 0;

      // Render Charts with Chart.js
      renderAnalyticsCharts(d);
    }
  } catch (err) {
    console.error('Error fetching summary from Firestore:', err);
  }
}

// 2. Fetch All Complaints from Firestore
async function fetchComplaints() {
  const container = document.getElementById('complaints-grid');
  if (container) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 48px;">
        <span class="spinner spinner-primary" style="width: 32px; height: 32px;"></span>
        <p style="margin-top: 12px; color: var(--text-muted);">Loading complaints from Firebase Firestore...</p>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/complaints');
    const json = await res.json();
    if (res.ok && json.success && Array.isArray(json.complaints)) {
      allComplaints = json.complaints;
      applyFilters();
      initDashboardMap(allComplaints);
    }
  } catch (err) {
    console.error('Error fetching complaints from Firestore:', err);
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px; color: #ef4444;">
          <p>Failed to load complaints from Firestore server.</p>
        </div>
      `;
    }
  }
}

// Apply Filter & Search logic
function applyFilters() {
  const statusVal = document.getElementById('filter-status')?.value || 'All';
  const deptVal = document.getElementById('filter-department')?.value || 'All';
  const priorityVal = document.getElementById('filter-priority')?.value || 'All';
  const categoryVal = document.getElementById('filter-category')?.value || 'All';
  const searchVal = document.getElementById('search-complaints-input')?.value.toLowerCase().trim() || '';

  const filtered = allComplaints.filter(c => {
    if (statusVal !== 'All' && (c.status || '').toLowerCase() !== statusVal.toLowerCase()) return false;
    if (deptVal !== 'All' && (c.assignedDepartment || c.department || '').toLowerCase() !== deptVal.toLowerCase()) return false;
    if (priorityVal !== 'All' && (c.priority || '').toLowerCase() !== priorityVal.toLowerCase()) return false;
    if (categoryVal !== 'All' && (c.category || '').toLowerCase() !== categoryVal.toLowerCase()) return false;

    if (searchVal) {
      const matchId = (c.id || '').toLowerCase().includes(searchVal);
      const matchDesc = (c.description || '').toLowerCase().includes(searchVal);
      const matchLoc = (c.location || '').toLowerCase().includes(searchVal);
      const matchDept = (c.assignedDepartment || c.department || '').toLowerCase().includes(searchVal);
      const matchCat = (c.category || '').toLowerCase().includes(searchVal);
      if (!matchId && !matchDesc && !matchLoc && !matchDept && !matchCat) return false;
    }
    return true;
  });

  renderComplaintCards(filtered);
  updateMapMarkers(filtered);
}

// Render Cards in Authority Grid
function renderComplaintCards(complaints) {
  const container = document.getElementById('complaints-grid');
  const countBadge = document.getElementById('filtered-count-badge');
  if (countBadge) countBadge.textContent = `${complaints.length} shown`;

  if (!container) return;

  if (complaints.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; background: #fff; border-radius: var(--radius-lg); border: 1px solid var(--border-color);">
        <span style="font-size: 3rem;">🔍</span>
        <h3 style="margin-top: 12px;">No matching complaints found</h3>
        <p style="color: var(--text-muted); margin-top: 6px;">Try adjusting your department, status, or priority filter.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  complaints.forEach(c => {
    const card = document.createElement('div');
    card.className = 'card complaint-dashboard-card animate-fade-in';
    card.id = `card-${c.id}`;

    let statusStyle = 'background: #f1f5f9; color: #475569;';
    if (c.status === 'Resolved') statusStyle = 'background: #dcfce7; color: #15803d; font-weight: 700;';
    else if (c.status === 'In Progress') statusStyle = 'background: #e0f2fe; color: #0369a1; font-weight: 700;';
    else if (c.status === 'Assigned') statusStyle = 'background: #e0e7ff; color: #3730a3; font-weight: 700;';
    else if (c.status === 'Under Review') statusStyle = 'background: #fef3c7; color: #92400e; font-weight: 700;';

    const p = c.priority || 'Normal';
    let priorityBadge = '<span class="badge badge-medium">Medium Priority</span>';
    if (p === 'Critical') {
      priorityBadge = '<span class="badge badge-critical" style="background: #fee2e2; color: #991b1b; font-weight: 800;">🚨 CRITICAL PRIORITY</span>';
    } else if (p === 'High') {
      priorityBadge = '<span class="badge badge-high" style="background: #ffedd5; color: #9a3412; font-weight: 700;">⚡ HIGH PRIORITY</span>';
    } else if (p === 'Low') {
      priorityBadge = '<span class="badge badge-low">Low Priority</span>';
    }

    const imgUrl = c.imageUrl || c.image_path;
    const dept = c.assignedDepartment || c.department || 'Municipal Public Works';

    card.innerHTML = `
      <!-- Top header with ID, Priority & Status -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap;">
        <div>
          <span style="font-family: monospace; font-weight: 800; color: var(--primary); font-size: 1.05rem;">${escapeHtml(c.id)}</span>
          <span style="font-size: 0.78rem; color: var(--text-light); margin-left: 6px;">${formatTimeAgo(c.createdAt || c.created_at)}</span>
        </div>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          ${priorityBadge}
          <span class="badge" style="${statusStyle}">${escapeHtml(c.status || 'Submitted')}</span>
        </div>
      </div>

      <!-- Duplicate Alert Banner if detected -->
      ${c.isPossibleDuplicate ? `
        <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: var(--radius-sm); padding: 8px 12px; margin-bottom: 12px; font-size: 0.82rem; color: #92400e; display: flex; align-items: center; justify-content: space-between;">
          <span>⚠️ <strong>Possible Duplicate of:</strong> <a href="/pages/track.html?id=${escapeHtml(c.duplicateOf || '')}" target="_blank" style="color: #b45309; text-decoration: underline; font-weight: 700;">${escapeHtml(c.duplicateOf || 'Existing Report')}</a></span>
          <span style="font-size: 0.75rem; background: #fbbf24; color: #78350f; padding: 2px 6px; border-radius: 4px; font-weight: 700;">DUPLICATE FLAG</span>
        </div>
      ` : ''}

      <!-- Media + Content Details -->
      <div style="display: flex; gap: 14px; margin-bottom: 14px;">
        ${imgUrl ? `
          <div style="width: 86px; height: 86px; flex-shrink: 0; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border-color); cursor: pointer;" onclick="window.open('${imgUrl}', '_blank')" title="Click to expand evidence photo">
            <img src="${imgUrl}" alt="Issue evidence photo" style="width: 100%; height: 100%; object-fit: cover;" />
          </div>
        ` : `
          <div style="width: 86px; height: 86px; flex-shrink: 0; border-radius: var(--radius-md); background: var(--bg-muted); display: flex; align-items: center; justify-content: center; font-size: 1.8rem; border: 1px solid var(--border-color);" title="No photo uploaded">
            📷
          </div>
        `}
        <div style="flex: 1; min-width: 0;">
          <h4 style="font-size: 1.02rem; margin-bottom: 4px; color: var(--text-main); font-weight: 700;">${escapeHtml(c.category)}</h4>
          <p style="font-size: 0.88rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(c.description)}</p>
        </div>
      </div>

      <!-- Metadata Box -->
      <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 10px 12px; font-size: 0.82rem; color: var(--text-light); margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span>📍 <strong>Location:</strong> ${escapeHtml(c.location)}</span>
          <a href="https://www.google.com/maps?q=${c.latitude},${c.longitude}" target="_blank" style="color: var(--primary); font-weight: 600; font-size: 0.78rem;">Open Map ↗</a>
        </div>
        <div>
          🏢 <strong>Assigned Department:</strong> <span style="font-weight: 700; color: var(--primary);">${escapeHtml(dept)}</span>
        </div>
        ${c.aiAssessment ? `
          <div style="border-top: 1px solid #e2e8f0; padding-top: 4px; margin-top: 2px; color: #334155;">
            <strong>🤖 AI Triage:</strong> ${escapeHtml(c.aiAssessment)}
          </div>
        ` : ''}
      </div>

      <!-- Lifecycle Action Controls -->
      <div style="border-top: 1px solid var(--border-color); padding-top: 14px; margin-top: auto; display: flex; flex-direction: column; gap: 10px;">
        
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap;">
          <span style="font-size: 0.78rem; font-weight: 700; color: var(--text-light); text-transform: uppercase;">Lifecycle Action:</span>
          
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            <button class="btn btn-sm ${c.status === 'Under Review' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 0.78rem; padding: 4px 8px;" onclick="window.updateComplaintStatus('${c.id}', 'Under Review')">
              Under Review
            </button>
            <button class="btn btn-sm ${c.status === 'Assigned' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 0.78rem; padding: 4px 8px;" onclick="window.updateComplaintStatus('${c.id}', 'Assigned')">
              Assigned
            </button>
            <button class="btn btn-sm ${c.status === 'In Progress' ? 'btn-primary' : 'btn-secondary'}" style="font-size: 0.78rem; padding: 4px 8px;" onclick="window.updateComplaintStatus('${c.id}', 'In Progress')">
              In Progress
            </button>
            <button class="btn btn-sm ${c.status === 'Resolved' ? 'btn-success' : 'btn-secondary'}" style="font-size: 0.78rem; padding: 4px 8px; font-weight: 700;" onclick="window.updateComplaintStatus('${c.id}', 'Resolved')">
              ✓ Resolved
            </button>
          </div>
        </div>

      </div>
    `;

    container.appendChild(card);
  });
}

// 3. Status Update Trigger via API (Firestore)
window.updateComplaintStatus = async function(id, newStatus) {
  try {
    const card = document.getElementById(`card-${id}`);
    if (card) card.style.opacity = '0.7';

    const response = await fetch(`/api/authority/complaints/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: newStatus,
        updatedBy: 'Chief Municipal Officer'
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      showToast(`✓ Ticket ${id} moved to "${newStatus}" in Firestore`, 'success');
      
      // Update local memory & re-render
      const index = allComplaints.findIndex(c => c.id === id);
      if (index !== -1) {
        allComplaints[index].status = newStatus;
        allComplaints[index].updatedAt = new Date().toISOString();
        if (result.complaint) {
          allComplaints[index] = result.complaint;
        }
      }

      // Re-fetch summary counters & re-apply filters
      fetchSummary();
      applyFilters();
    } else {
      showToast(result.message || 'Failed to update status in Firestore.', 'error');
    }
  } catch (err) {
    console.error('Error updating status in Firestore:', err);
    showToast('Network error while updating status.', 'error');
  } finally {
    const card = document.getElementById(`card-${id}`);
    if (card) card.style.opacity = '1';
  }
};

// 4. Chart.js Analytics (Category, Department, Priority)
function renderAnalyticsCharts(summaryData) {
  if (typeof Chart === 'undefined') return;

  // 1. Category Doughnut Chart
  const catCanvas = document.getElementById('categoryChartCanvas');
  if (catCanvas && summaryData.categories) {
    const labels = Object.keys(summaryData.categories);
    const data = Object.values(summaryData.categories);

    if (categoryChart) categoryChart.destroy();

    categoryChart = new Chart(catCanvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: ['#4f46e5', '#0ea5e9', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, padding: 8, font: { family: 'Inter', size: 10 } }
          }
        }
      }
    });
  }

  // 2. Department-wise Bar Chart
  const deptCanvas = document.getElementById('deptChartCanvas');
  if (deptCanvas && summaryData.departments) {
    const deptLabels = Object.keys(summaryData.departments).map(d => d.replace(' Department', '').replace(' / Municipal Engineering', ''));
    const deptData = Object.values(summaryData.departments);

    if (deptChart) deptChart.destroy();

    deptChart = new Chart(deptCanvas, {
      type: 'bar',
      data: {
        labels: deptLabels,
        datasets: [{
          label: 'Assigned',
          data: deptData,
          backgroundColor: '#4338ca',
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } },
          x: { ticks: { font: { size: 9 }, maxRotation: 45, minRotation: 20 } }
        }
      }
    });
  }

  // 3. Priority Levels Bar Chart
  const statusCanvas = document.getElementById('statusChartCanvas');
  if (statusCanvas && summaryData.priorities) {
    if (statusChart) statusChart.destroy();

    statusChart = new Chart(statusCanvas, {
      type: 'bar',
      data: {
        labels: ['Critical', 'High', 'Medium', 'Low'],
        datasets: [{
          label: 'Complaints',
          data: [
            summaryData.priorities.Critical || 0,
            summaryData.priorities.High || 0,
            summaryData.priorities.Medium || 0,
            summaryData.priorities.Low || 0
          ],
          backgroundColor: ['#dc2626', '#f97316', '#3b82f6', '#10b981'],
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        }
      }
    });
  }
}

// 5. Leaflet GIS Map with Color-Coded Markers
function initDashboardMap(complaints) {
  const mapEl = document.getElementById('authority-gis-map');
  if (!mapEl || typeof L === 'undefined') return;

  if (!dashboardMap) {
    dashboardMap = L.map('authority-gis-map').setView([CONFIG.DEFAULT_COORDS.lat, CONFIG.DEFAULT_COORDS.lng], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(dashboardMap);
    markersLayer = L.layerGroup().addTo(dashboardMap);
  }

  updateMapMarkers(complaints);
}

function updateMapMarkers(complaints) {
  if (!markersLayer || typeof L === 'undefined') return;

  markersLayer.clearLayers();

  complaints.forEach(c => {
    const lat = c.latitude || CONFIG.DEFAULT_COORDS.lat;
    const lng = c.longitude || CONFIG.DEFAULT_COORDS.lng;

    let markerColor = '#f59e0b';
    if (c.priority === 'Critical' || c.severity === 'Critical') markerColor = '#ef4444';
    else if (c.status === 'Resolved') markerColor = '#10b981';
    else if (c.status === 'In Progress') markerColor = '#0ea5e9';
    else if (c.status === 'Assigned') markerColor = '#4f46e5';

    const customIcon = L.divIcon({
      className: 'custom-map-pin',
      html: `<div style="background-color: ${markerColor}; width: 18px; height: 18px; border-radius: 50%; border: 2.5px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });

    const marker = L.marker([lat, lng], { icon: customIcon });

    const popupHtml = `
      <div style="font-family: inherit; min-width: 200px;">
        <div style="font-size: 0.75rem; font-weight: 800; color: var(--primary);">${escapeHtml(c.id)}</div>
        <div style="font-weight: 700; font-size: 0.92rem; margin: 2px 0;">${escapeHtml(c.category)}</div>
        <div style="font-size: 0.8rem; color: #475569; margin-bottom: 6px;">📍 ${escapeHtml(c.location)}</div>
        <div style="font-size: 0.78rem; color: #3730a3; margin-bottom: 6px;">🏢 ${escapeHtml(c.assignedDepartment || c.department || 'Municipal Works')}</div>
        <div style="display: flex; gap: 4px; margin-bottom: 8px; flex-wrap: wrap;">
          <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: #e2e8f0;">${escapeHtml(c.status)}</span>
          <span style="font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; background: #fee2e2; color: #b91c1c;">${escapeHtml(c.priority || c.severity || 'Medium')}</span>
        </div>
        <button class="btn btn-sm btn-primary" style="width: 100%; font-size: 0.75rem; padding: 4px 8px;" onclick="window.updateComplaintStatus('${c.id}', '${c.status === 'Resolved' ? 'In Progress' : 'Resolved'}')">
          ${c.status === 'Resolved' ? 'Re-open' : 'Mark Resolved'}
        </button>
      </div>
    `;

    marker.bindPopup(popupHtml);
    markersLayer.addLayer(marker);
  });
}
