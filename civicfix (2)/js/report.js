// Report Form Controller
let selectedCategory = 'Pothole & Roads';
let selectedFile = null;
let currentCoords = { lat: 28.6139, lng: 77.2090 };
let locationMap = null;
let locationMarker = null;

document.addEventListener('DOMContentLoaded', () => {
  initCategorySelector();
  initImageUploader();
  initLocationPicker();
  initFormSubmit();
});

// Category Cards Handler
function initCategorySelector() {
  const container = document.getElementById('category-grid');
  if (!container) return;

  container.innerHTML = '';
  CONFIG.CATEGORIES.forEach((cat, index) => {
    const card = document.createElement('div');
    card.className = `category-card-option ${index === 0 ? 'selected' : ''}`;
    card.dataset.category = cat.id;
    card.innerHTML = `
      <span class="cat-icon">${cat.icon}</span>
      <span class="cat-name">${cat.name}</span>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.category-card-option').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedCategory = cat.id;
      const hiddenInput = document.getElementById('selected-category-input');
      if (hiddenInput) hiddenInput.value = selectedCategory;
    });

    container.appendChild(card);
  });
}

// Image Dropzone & Preview Handler
function initImageUploader() {
  const dropzone = document.getElementById('image-dropzone');
  const fileInput = document.getElementById('complaint-image-input');
  const previewContainer = document.getElementById('image-preview-container');
  const previewImg = document.getElementById('image-preview');
  const removeBtn = document.getElementById('remove-image-btn');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => fileInput.click());

  ['dragenter', 'dragover'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(event => {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFile = null;
      fileInput.value = '';
      if (previewContainer) previewContainer.style.display = 'none';
      dropzone.style.display = 'block';
    });
  }

  function handleFileSelection(file) {
    if (!file.type.startsWith('image/')) {
      showToast('Please select a valid image file (JPG, PNG, WEBP).', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit.', 'warning');
      return;
    }
    selectedFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      if (previewImg) previewImg.src = e.target.result;
      if (previewContainer) previewContainer.style.display = 'inline-block';
      dropzone.style.display = 'none';
    };
    reader.readAsDataURL(file);
  }
}

// Leaflet Location Map Picker
function initLocationPicker() {
  const mapElement = document.getElementById('location-map');
  const detectBtn = document.getElementById('detect-gps-btn');
  const latBadge = document.getElementById('lat-badge');
  const lngBadge = document.getElementById('lng-badge');
  const locationInput = document.getElementById('location-text-input');

  if (typeof L !== 'undefined' && mapElement) {
    locationMap = L.map('location-map').setView([currentCoords.lat, currentCoords.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(locationMap);

    locationMarker = L.marker([currentCoords.lat, currentCoords.lng], { draggable: true }).addTo(locationMap);

    locationMarker.on('dragend', (e) => {
      const pos = e.target.getLatLng();
      updateCoordinates(pos.lat, pos.lng);
    });

    locationMap.on('click', (e) => {
      locationMarker.setLatLng(e.latlng);
      updateCoordinates(e.latlng.lat, e.latlng.lng);
    });
  }

  function updateCoordinates(lat, lng) {
    currentCoords = { lat, lng };
    if (latBadge) latBadge.textContent = lat.toFixed(5);
    if (lngBadge) lngBadge.textContent = lng.toFixed(5);
    const hiddenLat = document.getElementById('latitude-input');
    const hiddenLng = document.getElementById('longitude-input');
    if (hiddenLat) hiddenLat.value = lat;
    if (hiddenLng) hiddenLng.value = lng;

    // Optional reverse geocode attempt
    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.display_name && locationInput && !locationInput.value) {
          locationInput.value = data.display_name.split(',').slice(0, 3).join(', ');
        }
      })
      .catch(() => {});
  }

  if (detectBtn) {
    detectBtn.addEventListener('click', async () => {
      detectBtn.disabled = true;
      detectBtn.innerHTML = '<span class="spinner"></span> Locating...';
      try {
        const pos = await getCurrentLocation();
        updateCoordinates(pos.latitude, pos.longitude);
        if (locationMap) {
          locationMap.setView([pos.latitude, pos.longitude], 16);
          locationMarker.setLatLng([pos.latitude, pos.longitude]);
        }
        showToast('✓ GPS location detected accurately!', 'success');
      } catch (err) {
        showToast('Could not fetch GPS automatically. You can click on the map or type address.', 'warning');
      } finally {
        detectBtn.disabled = false;
        detectBtn.innerHTML = '📍 Use My GPS';
      }
    });
  }

  // Attempt initial GPS fetch quietly
  getCurrentLocation().then(pos => {
    updateCoordinates(pos.latitude, pos.longitude);
    if (locationMap) {
      locationMap.setView([pos.latitude, pos.longitude], 15);
      locationMarker.setLatLng([pos.latitude, pos.longitude]);
    }
  }).catch(() => {
    updateCoordinates(currentCoords.lat, currentCoords.lng);
  });
}

// Form Submission Handler
function initFormSubmit() {
  const form = document.getElementById('report-complaint-form');
  const submitBtn = document.getElementById('submit-complaint-btn');
  const formContainer = document.getElementById('form-card-container');
  const successCard = document.getElementById('report-success-card');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const descInput = document.getElementById('description-input');
    const locationInput = document.getElementById('location-text-input');

    if (!descInput.value.trim()) {
      showToast('Please provide a brief description of the issue.', 'warning');
      descInput.focus();
      return;
    }

    const formData = new FormData();
    formData.append('category', selectedCategory);
    formData.append('description', descInput.value.trim());
    formData.append('location', locationInput.value.trim() || 'Pinned on GPS Map');
    formData.append('latitude', currentCoords.lat);
    formData.append('longitude', currentCoords.lng);

    if (selectedFile) {
      formData.append('image', selectedFile);
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> Analyzing with AI & Registering...';

    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        let errMessage = `Server error (Status: ${response.status})`;
        try {
          const errData = await response.json();
          if (errData && errData.message) errMessage = errData.message;
        } catch (_) {
          if (response.status === 405 || response.status === 404) {
            errMessage = 'Backend server not responding. Please make sure you are running "node server.js" on port 3000 (not VS Code Live Server port 5500).';
          }
        }
        showToast(errMessage, 'error');
        return;
      }

      const result = await response.json();

      if (result.success) {
        // Show success state
        if (formContainer) formContainer.style.display = 'none';
        if (successCard) {
          successCard.style.display = 'block';
          successCard.classList.add('animate-fade-in');

          document.getElementById('success-complaint-id').textContent = result.complaintId;
          document.getElementById('success-category').textContent = result.data.category;
          document.getElementById('success-severity').textContent = result.data.severity;
          document.getElementById('success-severity').className = `badge ${CONFIG.SEVERITY_COLORS[result.data.severity] || 'badge-medium'}`;
          document.getElementById('success-department').textContent = result.data.assignedDepartment || result.data.department || 'Municipal Works';

          const dupBanner = document.getElementById('duplicate-warning-banner');
          const dupText = document.getElementById('duplicate-warning-text');
          if (result.duplicateWarning && result.duplicateWarning.isPossibleDuplicate && dupBanner && dupText) {
            dupBanner.style.display = 'block';
            dupText.textContent = `Related Complaint ID: ${result.duplicateWarning.duplicateOf}. Reason: ${result.duplicateWarning.reason}. Your report has been registered for authority inspection.`;
          } else if (dupBanner) {
            dupBanner.style.display = 'none';
          }

          if (result.aiAnalysis && result.aiAnalysis.aiAssessment) {
            document.getElementById('ai-summary-note').textContent = result.aiAnalysis.aiAssessment;
          }

          // Wire Copy ID Button
          const copyBtn = document.getElementById('copy-id-btn');
          if (copyBtn) {
            copyBtn.onclick = () => copyToClipboard(result.complaintId);
          }

          // Wire Track Button
          const trackLink = document.getElementById('track-this-btn');
          if (trackLink) {
            trackLink.href = `/pages/track.html?id=${result.complaintId}`;
          }
        }
        showToast('✓ Complaint registered successfully!', 'success');
      } else {
        showToast(result.message || 'Failed to submit complaint. Please try again.', 'error');
      }
    } catch (err) {
      console.error('Submission error:', err);
      showToast('Network error while connecting to CivicFix server.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '🚀 Submit Civic Report';
    }
  });

  // Wire "Submit Another" reset button
  const resetBtn = document.getElementById('submit-another-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      form.reset();
      selectedFile = null;
      const previewContainer = document.getElementById('image-preview-container');
      const dropzone = document.getElementById('image-dropzone');
      if (previewContainer) previewContainer.style.display = 'none';
      if (dropzone) dropzone.style.display = 'block';
      if (successCard) successCard.style.display = 'none';
      if (formContainer) formContainer.style.display = 'block';
    });
  }
}
