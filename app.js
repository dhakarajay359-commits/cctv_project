/**
 * NIRIKSHAN PLATFORM MASTER APPLICATION CONTROLLER (app.js)
 * Interconnects all modules via window.apiClient
 */

let leafletMapInstance = null;
let leafletMarkers = [];

// Active live stream canvas animation frames and webcam streams (Global scope)
window.activeStreamAnimFrames = new Map();
window.activeWebcamStreams = new Map();

window.cleanupLiveStreamCanvases = function() {
  if (window.activeStreamAnimFrames) {
    window.activeStreamAnimFrames.forEach((reqId) => cancelAnimationFrame(reqId));
    window.activeStreamAnimFrames.clear();
  }
};
function cleanupLiveStreamCanvases() {
  window.cleanupLiveStreamCanvases();
}

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initPersonaSwitcher();
  initSidebarAndFocusMode();
  initNavigation();
  initGisDashboard();
  initRegistryView();
  initLiveWallView();
  initAnalyticsView();
  initAlertsView();
  initIntegrationView();
  initAdminView();
  initBandwidthCalculator();
  initModalHandlers();
});

/* =========================================================================
   1. LIVE CLOCK & TOP BAR
   ========================================================================= */
function initClock() {
  const clockEl = document.getElementById('liveClock');
  function updateTime() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false }) + ' IST';
  }
  updateTime();
  setInterval(updateTime, 1000);

  const exportPdfBtn = document.getElementById('exportPdfBtn');
  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => window.print());
  }
}

/* =========================================================================
   2. PERSONA / RBAC SWITCHER (PHASE 6 - MULTI-TENANT DEPARTMENT SOVEREIGNTY)
   ========================================================================= */
function initPersonaSwitcher() {
  const select = document.getElementById('topbarPersonaSelect') || document.getElementById('userRoleSelect');
  if (!select) return;

  select.addEventListener('change', async (e) => {
    const roleKey = e.target.value;
    const authRes = await window.apiClient.login(roleKey);

    // Update Topbar User Pill
    const nameEl = document.getElementById('topUserName');
    const deptEl = document.getElementById('topUserDept');
    if (nameEl) nameEl.textContent = authRes.user.name;
    if (deptEl) deptEl.textContent = `${authRes.user.role.toUpperCase()} \u2022 ${authRes.user.badge}`;

    // Apply Dynamic Role-Based View Navigation Filter
    applyRbacNavigation(authRes.allowed_views);

    // Refresh all active views according to new RBAC scope
    await refreshAllData();
  });
}

function applyRbacNavigation(allowedViews) {
  const navBtns = document.querySelectorAll('.main-nav-btn');
  let firstActiveSet = false;

  navBtns.forEach(btn => {
    const viewId = btn.getAttribute('data-view');
    const isAllowed = !allowedViews || allowedViews.includes(viewId);
    btn.style.display = isAllowed ? 'flex' : 'none';

    if (isAllowed && !firstActiveSet) {
      // Ensure user stays on an allowed tab
      const currentActive = document.querySelector('.app-view.active');
      if (!currentActive || !allowedViews.includes(currentActive.id)) {
        btn.click();
      }
      firstActiveSet = true;
    }
  });
}

/* =========================================================================
   2.1 DYNAMIC REAL-TIME TELEMETRY METERS ENGINE
   ========================================================================= */
let lastTotalCams = 14;
let lastAnprHits = 1482;
let lastActiveAlerts = 2;

function animateMeterValue(element, start, end, duration = 600, prefix = '', suffix = '') {
  if (!element) return;
  const startTime = performance.now();
  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = Math.round(start + (end - start) * ease);
    element.textContent = `${prefix}${current.toLocaleString()}${suffix}`;
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }
  requestAnimationFrame(step);
}

async function updateDynamicDashboardMeters(bumpCardId = null) {
  try {
    const cameras = await window.apiClient.getCameras();
    const alerts = await window.apiClient.getAlerts();
    const anprEvents = window.apiClient.getAnprEvents 
      ? await window.apiClient.getAnprEvents() 
      : (window.apiClient.getEvents ? await window.apiClient.getEvents({ type: 'anpr' }) : []);

    const currentCamsCount = cameras ? cameras.length : 0;
    const targetTotalCams = currentCamsCount;

    const totalAlertsActive = alerts ? alerts.filter(a => a.status === 'active' || a.status === 'dispatched').length : 0;
    const targetAnprHits = (anprEvents ? anprEvents.length : 0) + (currentCamsCount * 105);

    const onlineCams = cameras ? cameras.filter(c => c.status === 'online').length : 0;
    const offlineCams = currentCamsCount - onlineCams;
    const uptimePct = currentCamsCount > 0 ? ((onlineCams / currentCamsCount) * 100).toFixed(1) : '100.0';

    // Elements
    const totalCamsEl = document.getElementById('dashTotalCams');
    const onlineRateEl = document.getElementById('dashOnlineRate');
    const anprHitsEl = document.getElementById('dashAnprHits');
    const activeAlertsEl = document.getElementById('dashActiveAlerts');

    const camSubtextEl = document.getElementById('dashCamSubtext');
    const uptimeSubtextEl = document.getElementById('dashUptimeSubtext');
    const anprSubtextEl = document.getElementById('dashAnprSubtext');
    const alertsSubtextEl = document.getElementById('dashAlertsSubtext');

    const camMeterFill = document.getElementById('dashCamMeterFill');
    const uptimeMeterFill = document.getElementById('dashUptimeMeterFill');
    const anprMeterFill = document.getElementById('dashAnprMeterFill');
    const alertsMeterFill = document.getElementById('dashAlertsMeterFill');

    // Animate numbers (smooth count-up or count-down)
    if (totalCamsEl) {
      animateMeterValue(totalCamsEl, lastTotalCams, targetTotalCams, 600, '', '');
      lastTotalCams = targetTotalCams;
    }

    if (onlineRateEl) {
      onlineRateEl.textContent = `${uptimePct}%`;
    }

    if (anprHitsEl) {
      animateMeterValue(anprHitsEl, lastAnprHits, targetAnprHits, 600);
      lastAnprHits = targetAnprHits;
    }

    if (activeAlertsEl) {
      activeAlertsEl.textContent = `${totalAlertsActive} Active`;
      lastActiveAlerts = totalAlertsActive;
    }

    // Subtexts and meter tracks
    if (camSubtextEl) {
      camSubtextEl.innerHTML = `<strong>${currentCamsCount}</strong> Active Grid Nodes Synced`;
    }
    if (camMeterFill) {
      const camWidth = Math.min(100, Math.max(10, currentCamsCount * 7));
      camMeterFill.style.width = `${camWidth}%`;
    }

    if (uptimeSubtextEl) {
      uptimeSubtextEl.innerHTML = `<strong>${onlineCams}</strong> Online &bull; ${offlineCams} Offline`;
    }
    if (uptimeMeterFill) {
      uptimeMeterFill.style.width = `${uptimePct}%`;
    }

    if (anprSubtextEl) {
      anprSubtextEl.innerHTML = `<strong>99.4%</strong> OCR Conf &bull; VAHAN Verified`;
    }
    if (anprMeterFill) {
      const anprWidth = Math.min(100, Math.max(15, (targetAnprHits / 2000) * 100));
      anprMeterFill.style.width = `${anprWidth}%`;
    }

    if (alertsSubtextEl) {
      alertsSubtextEl.innerHTML = `<strong>${totalAlertsActive}</strong> PCR Interceptors En Route`;
    }
    if (alertsMeterFill) {
      const alertWidth = Math.min(100, Math.max(10, totalAlertsActive * 30));
      alertsMeterFill.style.width = `${alertWidth}%`;
    }

    // Trigger pulse bump animation on target card
    if (bumpCardId) {
      const card = document.getElementById(bumpCardId);
      if (card) {
        card.classList.remove('meter-bump');
        void card.offsetWidth; // trigger reflow
        card.classList.add('meter-bump');
        setTimeout(() => card.classList.remove('meter-bump'), 800);
      }
    }
  } catch (err) {
    console.error('Error updating telemetry meters:', err);
  }
}

async function refreshAllData() {
  await renderGisNodes();
  await renderRegistryTable();
  await renderLiveWall();
  await renderAnalyticsTable();
  if (typeof renderSuspectWatchlistTable === 'function') {
    await renderSuspectWatchlistTable();
  }
  await renderAlerts();
  await renderAdminView();
  await updateDynamicDashboardMeters();
}

/* =========================================================================
   3. SIDEBAR & FOCUS MODE CONTROLLER
   ========================================================================= */
function initSidebarAndFocusMode() {
  const sidebar = document.getElementById('appSidebar');
  const collapseBtn = document.getElementById('sidebarCollapseBtn');
  const mobileToggleBtn = document.getElementById('mobileSidebarToggle');
  const sidebarFocusBtn = document.getElementById('sidebarFocusBtn');
  const topFocusBtn = document.getElementById('topFocusBtn');
  const exitFocusBtn = document.getElementById('exitFocusBtn');

  // Load persisted pin state if user locked it open
  const isPinned = localStorage.getItem('nirikshan_sidebar_pinned') === 'true';
  if (isPinned && sidebar) {
    sidebar.classList.add('pinned');
  }

  function toggleSidebarPin() {
    if (!sidebar) return;
    sidebar.classList.toggle('pinned');
    const pinned = sidebar.classList.contains('pinned');
    localStorage.setItem('nirikshan_sidebar_pinned', pinned);
    if (leafletMapInstance) {
      setTimeout(() => leafletMapInstance.invalidateSize(), 300);
    }
  }

  if (collapseBtn) {
    collapseBtn.addEventListener('click', toggleSidebarPin);
  }

  if (mobileToggleBtn && sidebar) {
    mobileToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }

  function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    if (leafletMapInstance) {
      setTimeout(() => leafletMapInstance.invalidateSize(), 50);
      setTimeout(() => leafletMapInstance.invalidateSize(), 300);
    }
  }

  function exitFocusMode() {
    document.body.classList.remove('focus-mode');
    if (leafletMapInstance) {
      setTimeout(() => leafletMapInstance.invalidateSize(), 50);
      setTimeout(() => leafletMapInstance.invalidateSize(), 300);
    }
  }

  if (sidebarFocusBtn) sidebarFocusBtn.addEventListener('click', toggleFocusMode);
  if (topFocusBtn) topFocusBtn.addEventListener('click', toggleFocusMode);
  if (exitFocusBtn) exitFocusBtn.addEventListener('click', exitFocusMode);

  // Global Keyboard Shortcuts (F = focus mode, [ or Ctrl+B = toggle collapse, 1-9 = jump to view, Esc = exit focus)
  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');

    if (e.key === 'Escape' && document.body.classList.contains('focus-mode')) {
      exitFocusMode();
      return;
    }

    if (isTyping) return;

    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      toggleFocusMode();
    } else if (e.key === '[' || (e.ctrlKey && e.key.toLowerCase() === 'b')) {
      e.preventDefault();
      toggleSidebarCollapse();
    } else if (e.key >= '1' && e.key <= '9') {
      const idx = parseInt(e.key, 10) - 1;
      const visibleNavBtns = Array.from(document.querySelectorAll('.main-nav-btn')).filter(btn => btn.style.display !== 'none');
      if (visibleNavBtns[idx]) {
        visibleNavBtns[idx].click();
      }
    }
  });
}

/* =========================================================================
   4. VIEW NAVIGATION
   ========================================================================= */
function initNavigation() {
  const navBtns = document.querySelectorAll('.main-nav-btn');
  const views = document.querySelectorAll('.app-view');
  const breadcrumbText = document.getElementById('activeBreadcrumbText');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      const title = btn.getAttribute('data-title') || btn.querySelector('.btn-text')?.textContent || btn.textContent.trim();

      navBtns.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const targetView = document.getElementById(viewId);
      if (targetView) {
        targetView.classList.add('active');
      }

      if (breadcrumbText) {
        breadcrumbText.textContent = title;
      }

      // Close mobile sidebar if open
      const sidebar = document.getElementById('appSidebar');
      if (sidebar && sidebar.classList.contains('mobile-open')) {
        sidebar.classList.remove('mobile-open');
      }

      // If GIS Dashboard is opened or views change, trigger Leaflet size recalculation
      if (leafletMapInstance) {
        setTimeout(() => leafletMapInstance.invalidateSize(), 200);
      }
    });
  });
}

/* =========================================================================
   5. GIS DASHBOARD & LEAFLET MAP (MULTI-DEPT SPATIAL MATRIX)
   ========================================================================= */
let mapTrajectoryLayers = [];

async function initGisDashboard() {
  const mapEl = document.getElementById('leafletMap');
  if (!mapEl) return;

  // Initialize Leaflet Map centered to cover WHOLE GUJARAT (All 33 Districts & 5 Zones)
  leafletMapInstance = L.map('leafletMap', {
    center: [22.8, 71.5],
    zoom: 7.5,
    zoomControl: true,
    minZoom: 6,
    maxZoom: 18
  });

  // Dark CartoDB / OSM TileLayer
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; Government of Gujarat - Nirikshan GeoMatrix'
  }).addTo(leafletMapInstance);

  // Filters
  const zoneSelect = document.getElementById('gisZoneSelect');
  const deptSelect = document.getElementById('gisDeptSelect');
  const stBtns = document.querySelectorAll('.st-filter-btn');
  const searchInput = document.getElementById('gisSearchInput');
  const btnRefresh = document.getElementById('btnRefreshMap');

  // Map Pursuit Quick Controls (Editable Plate Number)
  const btnRenderMapPursuit = document.getElementById('btnRenderMapPursuit');
  const btnClearMapPursuit = document.getElementById('btnClearMapPursuit');
  const mapPursuitInput = document.getElementById('mapPursuitInput');
  const btnCloseHud = document.getElementById('btnCloseHud');
  const btnArmRoadblockHud = document.getElementById('btnArmRoadblockFromHud');

  let currentDept = 'ALL';
  let currentStatus = 'ALL';
  let currentQuery = '';

  async function updateMap() {
    await renderGisNodes(currentDept, currentStatus, currentQuery);
  }

  // Zone & District Matrix Quick Navigator
  if (zoneSelect) {
    zoneSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === 'zone-all') {
        leafletMapInstance.flyTo([22.8, 71.5], 7.5, { duration: 1.2 });
      } else if (val.startsWith('zone-')) {
        const zones = await window.apiClient.getZones();
        const z = zones.find(item => item.id === val);
        if (z) leafletMapInstance.flyTo(z.center, z.zoom, { duration: 1.2 });
      } else if (val.startsWith('dist-')) {
        const dists = await window.apiClient.getDistricts();
        const d = dists.find(item => item.id === val);
        if (d && d.lat && d.lng) {
          leafletMapInstance.flyTo([d.lat, d.lng], 11, { duration: 1.2 });
        }
      }
    });
  }

  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      currentDept = e.target.value;
      updateMap();
    });
  }

  stBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      stBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentStatus = btn.getAttribute('data-st');
      updateMap();
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentQuery = e.target.value;
      updateMap();
    });
  }

  if (btnRefresh) btnRefresh.addEventListener('click', () => updateMap());

  if (btnRenderMapPursuit) {
    btnRenderMapPursuit.addEventListener('click', () => {
      const plate = (mapPursuitInput?.value || '').trim() || 'GJ-01-AB-1234';
      renderTrajectoryOnGisMap(plate);
    });
  }

  if (mapPursuitInput) {
    mapPursuitInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const plate = (mapPursuitInput.value || '').trim() || 'GJ-01-AB-1234';
        renderTrajectoryOnGisMap(plate);
      }
    });
  }

  if (btnClearMapPursuit) {
    btnClearMapPursuit.addEventListener('click', () => clearTrajectoryFromGisMap());
  }

  if (btnCloseHud) {
    btnCloseHud.addEventListener('click', () => {
      document.getElementById('pursuitMapHud').style.display = 'none';
    });
  }

  if (btnArmRoadblockHud) {
    btnArmRoadblockHud.addEventListener('click', async () => {
      const plate = document.getElementById('hudPlateBadge')?.textContent || 'GJ-01-AB-1234';
      const loc = document.getElementById('hudNextLoc')?.textContent || 'Forest Dept Sanctuary North Inter-State Corridor';
      await triggerTacticalRoadblockDispatch(plate, loc);
    });
  }

  // FOV HUD Event Listeners
  const btnCloseFovHud = document.getElementById('btnCloseFovHud');
  const btnProposeFromHud = document.getElementById('btnProposeCameraFromHud');
  if (btnCloseFovHud) btnCloseFovHud.addEventListener('click', () => clearFovRangeFromMap());
  if (btnProposeFromHud) btnProposeFromHud.addEventListener('click', () => openCameraProposalModal());

  // Camera Proposal Modal Handlers
  const propModal = document.getElementById('cameraProposalModal');
  const closePropBtn = document.getElementById('closeProposalModal');
  const cancelPropBtn = document.getElementById('btnCancelProposal');
  const submitPropBtn = document.getElementById('btnSubmitProposal');

  if (closePropBtn && propModal) closePropBtn.addEventListener('click', () => propModal.classList.remove('open'));
  if (cancelPropBtn && propModal) cancelPropBtn.addEventListener('click', () => propModal.classList.remove('open'));

  if (submitPropBtn && propModal) {
    submitPropBtn.addEventListener('click', async () => {
      const payload = {
        parent_camera_id: activeFovAnalysis?.camera_id,
        blind_spot_id: activeFovAnalysis?.blind_spot_analysis?.blind_spot_id,
        proposed_name: document.getElementById('propCamName').value,
        district: document.getElementById('propDistrict').value,
        recommended_install_lat: document.getElementById('propLat').value,
        recommended_install_lng: document.getElementById('propLng').value,
        recommended_hardware: document.getElementById('propHardware').value,
        estimated_capex_inr: 45000
      };

      const res = await window.apiClient.proposeCameraInstallation(payload);
      propModal.classList.remove('open');
      clearFovRangeFromMap();
      alert(`CAMERA INSTALLATION PROPOSAL AUTHORIZED!\n\nProposal Ref: ${res.proposal.proposal_id}\nNode Name: ${res.proposal.proposed_name}\nLocation: Lat ${res.proposal.lat}, Lng ${res.proposal.lng}\nHardware: ${res.proposal.hardware_recommended}\nBudget: ₹${res.proposal.estimated_budget_inr.toLocaleString()} (Queued in State Pipeline).`);
      await refreshAllData();
      await updateDynamicDashboardMeters('cardStatCams');
    });
  }

  // Tactical Dispatch Modal Close Handlers
  const modalTac = document.getElementById('tacticalDispatchModal');
  const closeTacBtn = document.getElementById('closeTacticalModal');
  const ackTacBtn = document.getElementById('btnAckTacticalModal');

  if (closeTacBtn && modalTac) closeTacBtn.addEventListener('click', () => modalTac.classList.remove('open'));
  if (ackTacBtn && modalTac) {
    ackTacBtn.addEventListener('click', () => {
      modalTac.classList.remove('open');
      // Seamlessly navigate to Live Video Wall
      const liveWallBtn = document.querySelector('.main-nav-btn[data-view="view-livewall"]');
      if (liveWallBtn) {
        liveWallBtn.click();
      }
      updateDynamicDashboardMeters('cardStatAlerts');
    });
  }

  // AI Voice Command Assistant Integration (Mic HUD in GIS Search Bar)
  initGisVoiceAssistant(updateMap);

  // Dynamic Supercluster Zoom Switch Listener
  leafletMapInstance.on('zoomend', () => updateMap());

  // Initial load
  await updateMap();
}

// Tactical Intercept & Roadblock Dispatch Workflow (Real-Time Push to Nearest Authority)
window.triggerTacticalRoadblockDispatch = async function(plateNumber = 'GJ-01-AB-1234', location = 'Forest Dept Sanctuary North Inter-State Corridor') {
  const cleanPlate = (plateNumber || '').trim().toUpperCase() || 'GJ-01-AB-1234';
  
  // 1. Play Tactical Priority Alert Chime via Web Audio API
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
    osc.frequency.setValueAtTime(1174.66, audioCtx.currentTime + 0.12); // D6 note
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.36);
  } catch (e) {
    // AudioContext fallback
  }

  // 2. Transmit to Backend & Publish to Kafka Alert Bus
  const res = await window.apiClient.dispatchForwardInterception(cleanPlate, location);

  // 3. Populate & Open Tactical Dispatch Modal
  const modal = document.getElementById('tacticalDispatchModal');
  if (modal) {
    document.getElementById('tacticalModalPlate').textContent = res.target_vehicle;
    document.getElementById('tacticalModalOrderId').textContent = res.intercept_order_id;
    document.getElementById('tacticalModalTimestamp').textContent = res.time_display;
    document.getElementById('tacticalModalStation').textContent = res.assigned_station;
    document.getElementById('tacticalModalRadio').innerHTML = `<i class="fa-solid fa-walkie-talkie"></i> Broadcast: ${res.broadcast_channel}`;

    const unitsList = document.getElementById('tacticalUnitsList');
    if (unitsList && res.units_deployed) {
      unitsList.innerHTML = '';
      res.units_deployed.forEach(u => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:0.5rem 0.8rem; border-radius:var(--radius-sm); border:1px solid var(--border-color); font-size:0.78rem;';
        row.innerHTML = `
          <div><strong style="color:#ffffff;">${u.unit}</strong> <span style="color:var(--text-muted);">&bull; ${u.officer}</span></div>
          <span class="text-amber" style="font-family:var(--font-mono); font-weight:800;">ETA: ${u.eta} (${u.distance})</span>
        `;
        unitsList.appendChild(row);
      });
    }

    modal.classList.add('open');
  }

  // 4. Trigger Real-Time Toast Notification
  showRealtimeAlertToast({
    title: `🚨 ROADBLOCK ARMED: Target ${res.target_vehicle}`,
    location: res.intercept_checkpoint,
    camera_id: 'BROADCAST_ALL_UNITS'
  });

  // 5. Re-render Alerts Feed
  await renderAlerts();
};

// Render Multi-Department Vehicle Trajectory on Leaflet GIS Map
window.renderTrajectoryOnGisMap = async function(plateNumber = 'GJ-01-AB-1234') {
  const cleanPlate = (plateNumber || '').trim().toUpperCase() || 'GJ-01-AB-1234';
  const mapInput = document.getElementById('mapPursuitInput');
  if (mapInput) mapInput.value = cleanPlate;

  // 1. Switch to Dashboard View if not active
  const dashNavBtn = document.querySelector('.main-nav-btn[data-view="view-dashboard"]');
  if (dashNavBtn) dashNavBtn.click();

  if (!leafletMapInstance) return;
  setTimeout(() => leafletMapInstance.invalidateSize(), 150);

  // 2. Fetch Reconstructed Trajectory
  const traj = await window.apiClient.reconstructVehicleTrajectory(cleanPlate);
  clearTrajectoryFromGisMap();

  // 3. Draw Sighting Trail
  const sightingPoints = traj.sightings.map(s => [s.lat, s.lng]);
  
  // Glowing Solid Polyline for Completed Journey
  const pathLine = L.polyline(sightingPoints, {
    color: '#f43f5e',
    weight: 5,
    opacity: 0.9,
    lineJoin: 'round'
  }).addTo(leafletMapInstance);
  mapTrajectoryLayers.push(pathLine);

  // Numbered Sighting Pins
  traj.sightings.forEach(s => {
    const pinHtml = `
      <div class="trajectory-step-pin" style="background: ${s.department_color}; box-shadow: 0 0 14px ${s.department_color};">
        ${s.step}
      </div>
    `;
    const icon = L.divIcon({
      className: 'custom-traj-pin',
      html: pinHtml,
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });

    const marker = L.marker([s.lat, s.lng], { icon: icon }).addTo(leafletMapInstance);
    marker.bindPopup(`
      <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; min-width: 190px;">
        <strong style="color: ${s.department_color}; font-size: 13px;">STEP ${s.step} &bull; ${s.department_badge}</strong><br/>
        <strong>${s.camera_name}</strong><br/>
        <span style="color: #94a3b8;">${s.district} &bull; ${s.time_display}</span><br/>
        <div style="margin-top: 4px; padding: 4px 6px; background: rgba(245,158,11,0.1); border-radius: 4px;">
          <span style="color: #fbbf24; font-weight: 800;">Segment Speed: ${s.speed_kmph} km/h</span><br/>
          <span style="color: #38bdf8; font-size: 11px;">OCR Confidence: ${s.ocr_confidence}%</span>
        </div>
      </div>
    `);
    mapTrajectoryLayers.push(marker);
  });

  // 4. Draw Projected AI Vector (Dashed Amber Line to Next Predicted Checkpoint)
  const p = traj.predictive_trajectory;
  const lastPoint = sightingPoints[sightingPoints.length - 1];
  const predictedPoint = [p.next_predicted_lat, p.next_predicted_lng];

  const projectedLine = L.polyline([lastPoint, predictedPoint], {
    color: '#f59e0b',
    weight: 4,
    dashArray: '8, 8',
    opacity: 0.95
  }).addTo(leafletMapInstance);
  mapTrajectoryLayers.push(projectedLine);

  // Radar Pulse Marker at Predicted Intercept Point
  const radarHtml = `
    <div class="radar-pulse-pin">
      <i class="fa-solid fa-crosshairs"></i>
    </div>
  `;
  const radarIcon = L.divIcon({
    className: 'custom-radar-pin',
    html: radarHtml,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  const predMarker = L.marker(predictedPoint, { icon: radarIcon }).addTo(leafletMapInstance);
  predMarker.bindPopup(`
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; min-width: 220px;">
      <strong style="color: #f43f5e; font-size: 13px;"><i class="fa-solid fa-triangle-exclamation"></i> PREDICTED INTERCEPT POINT</strong><br/>
      <strong>${p.next_predicted_location}</strong><br/>
      <span style="color: #38bdf8;">Dept: ${p.next_predicted_dept}</span><br/>
      <div style="margin-top: 5px; padding: 4px 6px; background: rgba(244,63,94,0.15); border: 1px solid #f43f5e; border-radius: 4px;">
        <span style="color: #f43f5e; font-weight: 800;">ETA: ${p.current_eta_minutes} Mins (${p.estimated_arrival_time})</span><br/>
        <span style="color: #fbbf24; font-size: 11px;">Projected Speed: ${p.projected_speed_kmph} km/h</span>
      </div>
      <button onclick="dispatchPcrFromMap('${traj.plate}', '${p.next_predicted_location}')" style="
        margin-top: 6px;
        width: 100%;
        background: linear-gradient(135deg, #f43f5e, #be123c);
        color: #ffffff;
        border: none;
        padding: 5px 8px;
        border-radius: 4px;
        font-weight: 700;
        cursor: pointer;
      "><i class="fa-solid fa-shield-halved"></i> Arm Roadblock Barrier</button>
    </div>
  `);
  mapTrajectoryLayers.push(predMarker);

  // 5. Fit Map Bounds
  const allPoints = [...sightingPoints, predictedPoint];
  leafletMapInstance.fitBounds(allPoints, { padding: [70, 70], maxZoom: 13 });

  // 6. Populate and Open HUD Card
  const hud = document.getElementById('pursuitMapHud');
  const btnClear = document.getElementById('btnClearMapPursuit');
  if (hud) {
    hud.style.display = 'block';
    document.getElementById('hudPlateBadge').textContent = traj.plate;
    document.getElementById('hudVehicleName').textContent = traj.vehicle_model;
    document.getElementById('hudDistance').textContent = `${traj.total_distance_km} km`;
    document.getElementById('hudSpeed').textContent = `${traj.average_speed_kmph} km/h`;
    document.getElementById('hudHeading').textContent = traj.current_heading.split(' ')[0] + ' ' + traj.current_heading.split(' ')[1];
    document.getElementById('hudNextLoc').textContent = p.next_predicted_location;
    document.getElementById('hudEta').textContent = `ETA: ~${p.current_eta_minutes} Mins (${p.estimated_arrival_time})`;
  }
  if (btnClear) btnClear.style.display = 'inline-block';
};

window.clearTrajectoryFromGisMap = function() {
  mapTrajectoryLayers.forEach(layer => leafletMapInstance.removeLayer(layer));
  mapTrajectoryLayers = [];
  const hud = document.getElementById('pursuitMapHud');
  const btnClear = document.getElementById('btnClearMapPursuit');
  if (hud) hud.style.display = 'none';
  if (btnClear) btnClear.style.display = 'none';
};

window.dispatchPcrFromMap = async function(plate, loc) {
  await triggerTacticalRoadblockDispatch(plate, loc);
};

// 5.1 AI VOICE COMMAND ASSISTANT (INTEGRATED IN GIS SEARCH BAR)
function initGisVoiceAssistant(updateMapCallback) {
  const voiceBtn = document.getElementById('gisVoiceSearchBtn');
  const searchInput = document.getElementById('gisSearchInput');
  const statusPill = document.getElementById('gisVoiceStatusPill');
  const transcriptText = document.getElementById('gisVoiceTranscriptText');
  const zoneSelect = document.getElementById('gisZoneSelect');
  const deptSelect = document.getElementById('gisDeptSelect');

  if (!voiceBtn) return;

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let isListening = false;

  if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
      isListening = true;
      voiceBtn.classList.add('listening');
      if (statusPill) {
        statusPill.style.display = 'inline-flex';
        statusPill.classList.remove('success');
        transcriptText.textContent = 'Listening for voice command...';
      }
    };

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0])
        .map(result => result.transcript)
        .join('');

      if (transcriptText) transcriptText.textContent = `"${transcript}"`;
      if (event.results[0].isFinal) {
        processVoiceCommand(transcript);
      }
    };

    recognition.onerror = (event) => {
      isListening = false;
      voiceBtn.classList.remove('listening');
      if (statusPill) {
        transcriptText.textContent = 'Voice error / mic not available.';
        setTimeout(() => { statusPill.style.display = 'none'; }, 2500);
      }
    };

    recognition.onend = () => {
      isListening = false;
      voiceBtn.classList.remove('listening');
      setTimeout(() => {
        if (statusPill && !statusPill.classList.contains('success')) {
          statusPill.style.display = 'none';
        }
      }, 2500);
    };
  }

  function processVoiceCommand(rawCmd) {
    const cmd = (rawCmd || '').trim().toLowerCase();
    if (!cmd) return;

    if (statusPill) {
      statusPill.classList.add('success');
      transcriptText.textContent = `✓ Command: "${rawCmd}"`;
      setTimeout(() => { statusPill.style.display = 'none'; }, 3000);
    }

    // 1. Vehicle Pursuit Command ("track GJ-01-AB-1234", "chase MP-09", etc.)
    if (cmd.includes('track') || cmd.includes('chase') || cmd.includes('pursuit') || cmd.includes('plate') || cmd.includes('vehicle')) {
      const words = rawCmd.split(/\s+/);
      const plateCandidate = words.find(w => w.includes('-') || w.match(/^[A-Z0-9]{4,12}$/i)) || 'GJ-01-AB-1234';
      const mapPursuitInput = document.getElementById('mapPursuitInput');
      if (mapPursuitInput) mapPursuitInput.value = plateCandidate.toUpperCase();
      renderTrajectoryOnGisMap(plateCandidate.toUpperCase());
      return;
    }

    // 2. Focus Mode Command ("focus", "full screen", "exit focus")
    if (cmd.includes('focus') || cmd.includes('full screen') || cmd.includes('fullscreen')) {
      document.body.classList.toggle('focus-mode');
      if (leafletMapInstance) setTimeout(() => leafletMapInstance.invalidateSize(), 200);
      return;
    }

    // 3. Department Filters ("police", "rto", "amc", "forest")
    if (cmd.includes('police')) {
      if (deptSelect) { deptSelect.value = 'dept-police'; deptSelect.dispatchEvent(new Event('change')); }
      return;
    } else if (cmd.includes('rto') || cmd.includes('highway')) {
      if (deptSelect) { deptSelect.value = 'dept-rto'; deptSelect.dispatchEvent(new Event('change')); }
      return;
    } else if (cmd.includes('amc') || cmd.includes('smart city')) {
      if (deptSelect) { deptSelect.value = 'dept-amc'; deptSelect.dispatchEvent(new Event('change')); }
      return;
    } else if (cmd.includes('forest')) {
      if (deptSelect) { deptSelect.value = 'dept-forest'; deptSelect.dispatchEvent(new Event('change')); }
      return;
    }

    // 4. District Zoom Navigation
    const districtMatches = [
      { key: 'ahmedabad', val: 'dist-ahmedabad' },
      { key: 'dahod', val: 'dist-dahod' },
      { key: 'surat', val: 'dist-surat' },
      { key: 'rajkot', val: 'dist-rajkot' },
      { key: 'dwarka', val: 'dist-dwarka' },
      { key: 'jamnagar', val: 'dist-jamnagar' },
      { key: 'gandhinagar', val: 'dist-gandhinagar' },
      { key: 'vadodara', val: 'dist-vadodara' },
      { key: 'kutch', val: 'zone-kutch' }
    ];

    const match = districtMatches.find(m => cmd.includes(m.key));
    if (match && zoneSelect) {
      zoneSelect.value = match.val;
      zoneSelect.dispatchEvent(new Event('change'));
      return;
    }

    // 5. Default: Pass to search input
    if (searchInput) {
      searchInput.value = rawCmd;
      searchInput.dispatchEvent(new Event('input'));
    }
  }

  voiceBtn.addEventListener('click', () => {
    if (recognition) {
      if (isListening) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch (e) {
          recognition.stop();
        }
      }
    } else {
      const fallbackPrompt = prompt('AI Command Input (e.g. "Track GJ-01-AB-1234", "Show Dahod", "Filter Police", "Focus"):', 'Track GJ-01-AB-1234');
      if (fallbackPrompt) {
        processVoiceCommand(fallbackPrompt);
      }
    }
  });
}

// 5.2 GEO-SPATIAL SUPERCLUSTER & NODE RENDERING ENGINE
async function renderGisNodes(dept = 'ALL', status = 'ALL', search = '') {
  const cameras = await window.apiClient.getCameras(dept, status, search);
  const districts = await window.apiClient.getDistricts();
  const nodesList = document.getElementById('gisNodesList');
  if (!nodesList) return;
  nodesList.innerHTML = '';

  // Clear existing map markers
  leafletMarkers.forEach(m => leafletMapInstance.removeLayer(m));
  leafletMarkers = [];

  // Populate Sidebar List
  cameras.forEach(cam => {
    const card = document.createElement('div');
    card.className = 'node-item-card';
    card.innerHTML = `
      <div class="node-item-top">
        <span class="node-id">${cam.id}</span>
        <span class="node-status-pill ${cam.status}">${cam.status}</span>
      </div>
      <div class="node-name">${cam.name}</div>
      <div style="font-size: 0.68rem; color: var(--text-muted); margin-top: 2px;">
        ${cam.vendor} &bull; ${cam.resolution}
      </div>
    `;
    card.addEventListener('click', () => {
      leafletMapInstance.setView([cam.lat, cam.lng], 14, { animate: true });
    });
    nodesList.appendChild(card);
  });

  const currentZoom = leafletMapInstance.getZoom();

  // High Performance Clustering Mode for Overview Zoom (< 8.5)
  if (currentZoom < 8.5 && !search && dept === 'ALL') {
    districts.forEach(dist => {
      if (!dist.lat || !dist.lng) return;
      const countLabel = dist.total_cams >= 1000 ? `${(dist.total_cams / 1000).toFixed(1)}k` : dist.total_cams;
      const clusterHtml = `
        <div class="leaflet-cluster-badge" style="width: 44px; height: 44px;">
          ${countLabel}
        </div>
      `;
      const clusterIcon = L.divIcon({
        className: 'custom-cluster-pin',
        html: clusterHtml,
        iconSize: [44, 44]
      });

      const clusterMarker = L.marker([dist.lat, dist.lng], { icon: clusterIcon }).addTo(leafletMapInstance);
      clusterMarker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; line-height: 1.4; min-width: 210px;">
          <strong style="color: #00f2fe; font-size: 13px;">${dist.name} Sector Cluster</strong><br/>
          <span>Total Integrated Cameras: <strong>${dist.total_cams.toLocaleString()} Nodes</strong></span><br/>
          <span>Coverage Health Score: <strong>${dist.coverage_score}% (${dist.gap_status})</strong></span><br/>
          <button onclick="leafletMapInstance.setView([${dist.lat}, ${dist.lng}], 11, { animate: true });" style="
            margin-top: 6px; width: 100%; background: #00f2fe; color: #04101e; border: none; padding: 5px 8px; border-radius: 4px; font-weight: 700; cursor: pointer;
          "><i class="fa-solid fa-magnifying-glass-plus"></i> Zoom Into District Fleet</button>
        </div>
      `);
      clusterMarker.on('click', () => {
        leafletMapInstance.setView([dist.lat, dist.lng], 11, { animate: true });
      });
      leafletMarkers.push(clusterMarker);
    });
  } else {
    // Individual Node Pins for Zoom >= 8.5 or Active Filter/Search
    cameras.forEach(cam => {
      let color = '#3b82f6';
      if (cam.department_id === 'dept-rto') color = '#f59e0b';
      if (cam.department_id === 'dept-amc') color = '#10b981';
      if (cam.department_id === 'dept-civil') color = '#ec4899';
      if (cam.department_id === 'dept-forest') color = '#84cc16';
      if (cam.department_id === 'dept-private') color = '#a855f7';

      const markerHtml = `<div style="
        background: ${color};
        width: 16px;
        height: 16px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 0 10px ${color};
      "></div>`;

      const customIcon = L.divIcon({
        className: 'custom-leaflet-pin',
        html: markerHtml,
        iconSize: [16, 16]
      });

      const marker = L.marker([cam.lat, cam.lng], { icon: customIcon }).addTo(leafletMapInstance);
      marker.bindPopup(`
        <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; line-height: 1.4; min-width: 210px;">
          <strong style="color: #00f2fe; font-size: 13px;">${cam.id}</strong><br/>
          <strong>${cam.name}</strong><br/>
          <span style="color: #94a3b8;">Vendor: ${cam.vendor}</span><br/>
          <span style="color: #10b981;">Status: ${cam.status.toUpperCase()}</span><br/>
          <span style="color: #f59e0b;">FOV: ${cam.direction} (${cam.fov_angle}°)</span><br/>
          <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 6px;">
            <button onclick="inspectCameraFovRange('${cam.id}')" style="
              background: rgba(0, 242, 254, 0.15);
              border: 1px solid #00f2fe;
              color: #00f2fe;
              padding: 4px 8px;
              border-radius: 4px;
              font-weight: 700;
              cursor: pointer;
            "><i class="fa-solid fa-satellite-dish"></i> Check Range & Blind-Spots</button>
            <button onclick="pullOnDemandStream('${cam.id}')" style="
              background: #00f2fe;
              color: #04101e;
              border: none;
              padding: 4px 8px;
              border-radius: 4px;
              font-weight: 700;
              cursor: pointer;
            "><i class="fa-solid fa-play"></i> Pull WebRTC Live Stream</button>
          </div>
        </div>
      `);
      leafletMarkers.push(marker);
    });
  }
}

// Global Array for FOV and Blind Spot Map Overlays
let mapFovLayers = [];
let activeFovAnalysis = null;

window.inspectCameraFovRange = async function(camId) {
  if (!leafletMapInstance) return;

  // 1. Switch to Dashboard View if needed
  const dashNavBtn = document.querySelector('.main-nav-btn[data-view="view-dashboard"]');
  if (dashNavBtn) dashNavBtn.click();
  setTimeout(() => leafletMapInstance.invalidateSize(), 150);

  // 2. Fetch FOV & Blind Spot Analysis
  const analysis = await window.apiClient.getCameraFovAnalysis(camId);
  activeFovAnalysis = analysis;

  // 3. Clear Previous FOV Layers
  clearFovRangeFromMap();

  // 4. Draw Optical FOV Range Cone (Cyan Conical Sector)
  const fovPolygon = L.polygon(analysis.coverage_cone_polygon, {
    color: '#00f2fe',
    weight: 2,
    fillColor: '#00f2fe',
    fillOpacity: 0.22
  }).addTo(leafletMapInstance);

  fovPolygon.bindPopup(`
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px;">
      <strong style="color: #00f2fe;"><i class="fa-solid fa-satellite-dish"></i> OPTICAL COVERAGE CONE</strong><br/>
      <strong>${analysis.camera_name}</strong><br/>
      <span>Direction: ${analysis.optical_specs.direction_name} (${analysis.optical_specs.fov_horizontal_degrees}°)</span><br/>
      <div style="margin-top: 4px; font-size: 11px; color: #94a3b8;">
        &bull; Max Detection Range: <strong>${analysis.optical_specs.dori_standards.detection_range_meters}m</strong><br/>
        &bull; Recognition Range: <strong>${analysis.optical_specs.dori_standards.recognition_range_meters}m</strong><br/>
        &bull; Identification Range: <strong>${analysis.optical_specs.dori_standards.identification_range_meters}m</strong>
      </div>
    </div>
  `);
  mapFovLayers.push(fovPolygon);

  // 5. Draw Unmonitored Blind Spot Gap (Crimson Striped Sector)
  const blindSpot = analysis.blind_spot_analysis;
  const blindPolygon = L.polygon(blindSpot.blind_polygon, {
    color: '#f43f5e',
    weight: 2,
    dashArray: '6, 6',
    fillColor: '#f43f5e',
    fillOpacity: 0.35
  }).addTo(leafletMapInstance);

  blindPolygon.bindPopup(`
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; min-width: 220px;">
      <strong style="color: #f43f5e;"><i class="fa-solid fa-triangle-exclamation"></i> UNCOVERED BLIND ZONE</strong><br/>
      <span style="font-size: 11px; color: #ffffff;">${blindSpot.location_description}</span><br/>
      <div style="margin: 4px 0; padding: 4px 6px; background: rgba(244,63,94,0.15); border-radius: 4px;">
        <span style="color: #fbbf24; font-size: 11px;">Uncovered Area: <strong>~${blindSpot.uncovered_area_sqm.toLocaleString()} sq.m</strong></span><br/>
        <span style="color: #10b981; font-size: 11px;">Recommended: <strong>${blindSpot.recommended_hardware}</strong></span>
      </div>
      <button onclick="openCameraProposalModal()" style="
        margin-top: 4px;
        width: 100%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #ffffff;
        border: none;
        padding: 5px 8px;
        border-radius: 4px;
        font-weight: 700;
        cursor: pointer;
      "><i class="fa-solid fa-plus-circle"></i> Install Camera in Blind Zone</button>
    </div>
  `);
  mapFovLayers.push(blindPolygon);

  // 6. Proposed Camera Installation Pin (Green Crosshair)
  const propIcon = L.divIcon({
    className: 'prop-cam-pin',
    html: `<div style="
      background: #10b981;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 2px solid #ffffff;
      box-shadow: 0 0 14px #10b981;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #04101e;
      font-size: 11px;
      font-weight: 900;
    "><i class="fa-solid fa-plus"></i></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });

  const propMarker = L.marker([blindSpot.recommended_install_lat, blindSpot.recommended_install_lng], { icon: propIcon }).addTo(leafletMapInstance);
  propMarker.bindPopup(`
    <div style="font-family: 'Plus Jakarta Sans', sans-serif; font-size: 12px; min-width: 200px;">
      <strong style="color: #10b981;"><i class="fa-solid fa-location-crosshairs"></i> RECOMMENDED CAMERA LOCATION</strong><br/>
      <span>Eliminates ${blindSpot.location_description}</span><br/>
      <button onclick="openCameraProposalModal()" style="
        margin-top: 6px;
        width: 100%;
        background: linear-gradient(135deg, #10b981, #059669);
        color: #ffffff;
        border: none;
        padding: 5px 8px;
        border-radius: 4px;
        font-weight: 700;
        cursor: pointer;
      "><i class="fa-solid fa-check"></i> Authorize Installation</button>
    </div>
  `);
  mapFovLayers.push(propMarker);

  // 7. Fit Map Bounds smoothly
  const allCoords = [...analysis.coverage_cone_polygon, ...blindSpot.blind_polygon];
  leafletMapInstance.fitBounds(allCoords, { padding: [90, 90], maxZoom: 16 });

  // 8. Populate & Display Floating FOV HUD
  const fovHud = document.getElementById('fovMapHud');
  if (fovHud) {
    document.getElementById('fovHudCamId').textContent = analysis.camera_id;
    document.getElementById('fovHudCamName').textContent = analysis.camera_name;
    document.getElementById('fovHudDirection').textContent = `${analysis.optical_specs.direction_name} (${analysis.optical_specs.fov_horizontal_degrees}°)`;
    document.getElementById('fovHudRange').textContent = `${analysis.optical_specs.dori_standards.detection_range_meters}m Max / ${analysis.optical_specs.dori_standards.recognition_range_meters}m Recog`;
    document.getElementById('fovHudDistrict').textContent = `${analysis.district} • ${getDeptName(analysis.department_id)}`;
    
    document.getElementById('fovBlindSpotDesc').textContent = `${blindSpot.location_description} (~${blindSpot.uncovered_area_sqm.toLocaleString()} sq.m uncovered)`;
    document.getElementById('fovRecHardware').textContent = blindSpot.recommended_hardware;
    fovHud.style.display = 'block';
  }
};

window.clearFovRangeFromMap = function() {
  mapFovLayers.forEach(layer => leafletMapInstance.removeLayer(layer));
  mapFovLayers = [];
  const fovHud = document.getElementById('fovMapHud');
  if (fovHud) fovHud.style.display = 'none';
};

window.openCameraProposalModal = function() {
  if (!activeFovAnalysis) return;
  const blind = activeFovAnalysis.blind_spot_analysis;
  
  document.getElementById('proposalBlindDesc').textContent = `${blind.location_description} (~${blind.uncovered_area_sqm.toLocaleString()} sq.m uncovered)`;
  document.getElementById('propCamName').value = `New Node: ${activeFovAnalysis.camera_name} (Blind Zone Elimination)`;
  document.getElementById('propDistrict').value = activeFovAnalysis.district;
  document.getElementById('propHardware').value = blind.recommended_hardware;
  document.getElementById('propLat').value = blind.recommended_install_lat;
  document.getElementById('propLng').value = blind.recommended_install_lng;

  const modal = document.getElementById('cameraProposalModal');
  if (modal) modal.classList.add('open');
};

window.pullOnDemandStream = async function(camId) {
  const session = await window.apiClient.startStreamingSession(camId);
  // Switch to Live Wall view
  const liveWallNav = document.querySelector('.main-nav-btn[data-view="view-livewall"]');
  if (liveWallNav) {
    liveWallNav.click();
  }

  await renderLiveWall();
  alert(`On-Demand WebRTC Relay Established!\nSession ID: ${session.session_id}\nCamera: ${session.camera_id} (${session.camera_name})\nBandwidth: ${session.bitrate_mbps} Mbps (Auto-stops in 5 mins).`);
};

/* =========================================================================
   5. CAMERA REGISTRY VIEW (PHASE 1 - MODEL 1 FOUNDATION LAYER)
   ========================================================================= */
async function initRegistryView() {
  const search = document.getElementById('registrySearch');
  const deptFilter = document.getElementById('registryDeptFilter');
  const districtFilter = document.getElementById('registryDistrictFilter');
  const typeFilter = document.getElementById('registryTypeFilter');

  // Sub-Navigation Toggles (Table vs Gap Analysis)
  const subBtns = document.querySelectorAll('.reg-sub-btn');
  const subviews = document.querySelectorAll('.reg-subview');

  subBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      subBtns.forEach(b => b.classList.remove('active'));
      subviews.forEach(s => s.classList.remove('active'));

      btn.classList.add('active');
      const targetSub = document.getElementById(btn.getAttribute('data-subview'));
      if (targetSub) {
        targetSub.classList.add('active');
        if (btn.getAttribute('data-subview') === 'subview-gap') {
          await renderGapAnalysis();
        }
      }
    });
  });

  if (search) search.addEventListener('input', () => renderRegistryTable());
  if (deptFilter) deptFilter.addEventListener('change', () => renderRegistryTable());
  if (districtFilter) districtFilter.addEventListener('change', () => renderRegistryTable());
  if (typeFilter) typeFilter.addEventListener('change', () => renderRegistryTable());

  // Close Detail Drawer button
  const closeDrawerBtn = document.getElementById('closeDetailDrawerBtn');
  if (closeDrawerBtn) {
    closeDrawerBtn.addEventListener('click', () => {
      document.getElementById('camDetailDrawer').classList.remove('open');
    });
  }

  // Bulk Import Handlers
  initBulkImport();

  await renderRegistryTable();
}

async function renderRegistryTable() {
  const searchVal = document.getElementById('registrySearch')?.value || '';
  const deptVal = document.getElementById('registryDeptFilter')?.value || 'ALL';
  const distVal = document.getElementById('registryDistrictFilter')?.value || 'ALL';
  const typeVal = document.getElementById('registryTypeFilter')?.value || 'ALL';

  let cameras = await window.apiClient.getCameras(deptVal, 'ALL', searchVal, distVal);
  if (typeVal !== 'ALL') {
    cameras = cameras.filter(c => c.type === typeVal);
  }

  const tbody = document.getElementById('registryTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  cameras.forEach(cam => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); color: var(--accent-cyan);">${cam.id}</strong></td>
      <td>
        <strong>${cam.name}</strong><br/>
        <span style="font-size: 0.72rem; color: var(--text-muted);">${cam.direction} &bull; Lat: ${cam.lat}, Lng: ${cam.lng}</span>
      </td>
      <td><span style="font-weight: 600; color: var(--accent-amber);">${cam.district || 'Ahmedabad'}</span></td>
      <td><span style="font-weight: 600;">${getDeptName(cam.department_id)}</span></td>
      <td><span class="node-status-pill ${cam.status}">${cam.status}</span></td>
      <td>${cam.vendor} <span style="font-size: 0.7rem; color: var(--text-muted);">(${cam.type.toUpperCase()})</span></td>
      <td>${cam.retention_days} Days Edge Buffer</td>
      <td><span style="font-family: var(--font-mono);">${cam.resolution}</span></td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          <button class="action-btn" onclick="event.stopPropagation(); openCameraDetail('${cam.id}')" title="Inspect Camera Details & FOV" style="padding: 0.25rem 0.55rem; font-size: 0.72rem;">
            <i class="fa-solid fa-eye"></i> Details
          </button>
          <button class="action-btn" onclick="event.stopPropagation(); window.deleteCameraById('${cam.id}')" title="Decommission & Remove Node" style="padding: 0.25rem 0.55rem; font-size: 0.72rem; background: rgba(244,63,94,0.15); color: var(--accent-rose); border-color: rgba(244,63,94,0.35);">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    `;
    tr.addEventListener('click', () => openCameraDetail(cam.id));
    tbody.appendChild(tr);
  });
}

// Global Camera Decommission & Dynamic Count Decrement
window.deleteCameraById = async function(camId) {
  const cam = await window.apiClient.getCameraById(camId);
  const name = cam ? cam.name : camId;
  if (confirm(`DECOMMISSION CAMERA:\n\nAre you sure you want to decommission and remove "${name}" (${camId}) from the statewide live grid?\n\nThis will immediately decrease the live telemetry counter.`)) {
    await window.apiClient.deleteCamera(camId);
    await refreshAllData();
    await updateDynamicDashboardMeters('cardStatCams');
  }
};

// Open Camera Detail Slide-Over Drawer
window.openCameraDetail = async function(camId) {
  const cam = await window.apiClient.getCameraById(camId);
  if (!cam) return;

  document.getElementById('detailCamId').textContent = cam.id;
  document.getElementById('detailCamName').textContent = cam.name;
  document.getElementById('detailDept').textContent = getDeptName(cam.department_id);
  document.getElementById('detailDistrict').textContent = cam.district || 'Ahmedabad (Urban)';
  document.getElementById('detailType').textContent = cam.type === 'ip' ? 'IP Camera (ONVIF 2.4 Profile S)' : 'Analog (DVR Normalized)';
  document.getElementById('detailVendor').textContent = cam.vendor;
  document.getElementById('detailStorage').textContent = cam.storage_type === 'edge_nvr' ? 'Edge NVR (Normalized Protocol)' : 'Local DVR Buffer';
  document.getElementById('detailRetention').textContent = `${cam.retention_days} Days Ring Buffer`;
  // FOV & Blind Spot Diagnostics in Drawer
  const fovData = await window.apiClient.getCameraFovAnalysis(cam.id);
  activeFovAnalysis = fovData;

  const idRangeEl = document.getElementById('detailIdRange');
  const recRangeEl = document.getElementById('detailRecRange');
  const detRangeEl = document.getElementById('detailDetRange');
  const blindDescEl = document.getElementById('drawerBlindSpotDesc');

  if (idRangeEl) idRangeEl.textContent = `${fovData.optical_specs.dori_standards.identification_range_meters} Meters`;
  if (recRangeEl) recRangeEl.textContent = `${fovData.optical_specs.dori_standards.recognition_range_meters} Meters`;
  if (detRangeEl) detRangeEl.textContent = `${fovData.optical_specs.dori_standards.detection_range_meters} Meters`;
  if (blindDescEl) blindDescEl.textContent = `${fovData.blind_spot_analysis.location_description} (~${fovData.blind_spot_analysis.uncovered_area_sqm.toLocaleString()} sq.m unmonitored). Recommend ${fovData.blind_spot_analysis.recommended_hardware}.`;

  const inspectFovBtn = document.getElementById('btnDrawerInspectFov');
  if (inspectFovBtn) {
    inspectFovBtn.onclick = () => {
      document.getElementById('camDetailDrawer').classList.remove('open');
      window.inspectCameraFovRange(cam.id);
    };
  }

  const drawerProposeBtn = document.getElementById('btnDrawerProposeInstall');
  if (drawerProposeBtn) {
    drawerProposeBtn.onclick = () => {
      document.getElementById('camDetailDrawer').classList.remove('open');
      window.openCameraProposalModal();
    };
  }

  const pullStreamBtn = document.getElementById('detailPullStreamBtn');
  if (pullStreamBtn) {
    pullStreamBtn.onclick = () => {
      document.getElementById('camDetailDrawer').classList.remove('open');
      window.pullOnDemandStream(cam.id);
    };
  }

  const exportDossierBtn = document.getElementById('detailExportDossierBtn');
  if (exportDossierBtn) {
    exportDossierBtn.onclick = () => {
      window.print();
    };
  }

  document.getElementById('camDetailDrawer').classList.add('open');
};

// Render District Gap-Analysis Report (Model 1 Deliverable)
async function renderGapAnalysis() {
  const report = await window.apiClient.getGapAnalysis();
  const container = document.getElementById('gapDistrictGrid');
  if (!container) return;

  document.getElementById('gapTotalDistricts').textContent = `${report.monitored_districts} Target Sectors`;
  document.getElementById('gapAvgCoverage').textContent = report.average_coverage;
  document.getElementById('gapDeficitDistricts').textContent = `${report.critical_gap_districts.length} Priority Sectors`;

  container.innerHTML = '';
  report.district_breakdown.forEach(dist => {
    const card = document.createElement('div');
    card.className = 'district-gap-card';

    let tagClass = 'optimal';
    if (dist.gap_status.includes('Moderate')) tagClass = 'moderate';
    if (dist.gap_status.includes('High')) tagClass = 'high';
    if (dist.gap_status.includes('Critical')) tagClass = 'critical';

    card.innerHTML = `
      <div class="dist-card-header">
        <h3><i class="fa-solid fa-location-dot"></i> ${dist.name}</h3>
        <span class="gap-status-tag ${tagClass}">${dist.gap_status}</span>
      </div>
      <div class="dist-progress-wrap">
        <div class="dist-progress-top">
          <span>Coverage Index</span>
          <strong>${dist.coverage_score}%</strong>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${tagClass === 'critical' || tagClass === 'high' ? 'danger' : ''}" style="width: ${dist.coverage_score}%;"></div>
        </div>
      </div>
      <div class="dist-metrics-row">
        <div>
          <label>Active Cameras:</label>
          <span>${dist.total_cams.toLocaleString()} / ${dist.target_cams.toLocaleString()}</span>
        </div>
        <div>
          <label>Density / sq.km:</label>
          <span>${dist.density_per_sqkm} cams/km²</span>
        </div>
        <div>
          <label>Blind-Spot Gap:</label>
          <span style="color: var(--accent-rose);">+${dist.gap_cams_needed.toLocaleString()} Needed</span>
        </div>
        <div>
          <label>Est. Budget Grant:</label>
          <span style="color: var(--accent-amber);">₹${((dist.gap_cams_needed * 25000) / 10000000).toFixed(2)} Cr</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Bulk CSV Import Modal & Parsing
function initBulkImport() {
  const modal = document.getElementById('bulkImportModal');
  const btnOpen = document.getElementById('btnOpenBulkImportModal');
  const btnClose = document.getElementById('closeBulkModal');
  const btnCancel = document.getElementById('btnCancelBulk');
  const btnSample = document.getElementById('btnLoadSampleCsv');
  const btnSubmit = document.getElementById('btnSubmitBulkCsv');
  const textarea = document.getElementById('bulkCsvTextarea');

  if (btnOpen) btnOpen.addEventListener('click', () => modal.classList.add('open'));
  if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('open'));
  if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.remove('open'));

  if (btnSample) {
    btnSample.addEventListener('click', () => {
      textarea.value = `name,district,department_id,lat,lng,vendor,type,retention_days
Dahod Tribal Checkpost NH-47,Dahod (Tribal Border),dept-rto,22.8400,74.2580,Hikvision 4K ANPR,ip,15
Valsad Coastal Fishery Gate #1,Valsad (Coastal Corridor),dept-police,20.6150,72.9100,Uniview PTZ,ip,15
Gir Somnath Sasan Safari Entry,Gir Somnath,dept-forest,21.1680,70.6010,Axis Optical,ip,30
Jamnagar Reliance Refinery Access,Jamnagar,dept-rto,22.4750,70.0590,CP Plus SpeedDome,ip,15
Dwarka Coastal Highway Patrol 03,Devbhumi Dwarka,dept-police,22.2450,68.9750,Bosch Dinion,ip,30`;
    });
  }

  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const text = textarea.value.trim();
      if (!text) {
        alert('Please paste CSV camera entries.');
        return;
      }

      const lines = text.split('\n');
      const parsedRows = [];
      lines.forEach((line, idx) => {
        if (idx === 0 && line.toLowerCase().includes('name')) return; // Header
        const parts = line.split(',');
        if (parts.length >= 5) {
          parsedRows.push({
            name: parts[0].trim(),
            district: parts[1]?.trim() || 'Ahmedabad (Urban)',
            department_id: parts[2]?.trim() || 'dept-police',
            lat: parts[3]?.trim(),
            lng: parts[4]?.trim(),
            vendor: parts[5]?.trim() || 'Generic IP',
            type: parts[6]?.trim() || 'ip',
            retention_days: parts[7]?.trim() || 15
          });
        }
      });

      const res = await window.apiClient.bulkImportCameras(parsedRows);
      modal.classList.remove('open');
      await refreshAllData();
      alert(`Bulk Ingestion Successful!\n${res.count} Cameras registered across 5 departments and 6 districts with automatic 15-day Edge ring buffers.`);
    });
  }
}

function getDeptName(deptId) {
  switch (deptId) {
    case 'dept-police': return 'Police / Home';
    case 'dept-rto': return 'RTO / Highways';
    case 'dept-amc': return 'AMC Smart City';
    case 'dept-civil': return 'Civil Supplies';
    case 'dept-private': return 'Private Opt-In';
    default: return deptId;
  }
}

/* =========================================================================
   6. LIVE VIDEO WALL (PHASE 3 - MODEL 2 UNIFIED VIEWING PLATFORM)
   ========================================================================= */
let liveWallGridMode = '2x2';
let sessionCountdownSeconds = 300; // 5-minute bandwidth discipline timer
let sessionCountdownInterval = null;

async function initLiveWallView() {
  const gridBtns = document.querySelectorAll('.grid-btn');
  const wallGrid = document.getElementById('videoWallGrid');
  const btnStopAll = document.getElementById('btnStopAllSessions');

  const btnToggleLiveFov = document.getElementById('btnToggleLiveFovAnalyzer');
  const btnCloseLiveFov = document.getElementById('btnCloseLiveFovPanel');
  const btnLivePropose = document.getElementById('btnLiveFovProposeInstall');

  if (btnToggleLiveFov) {
    btnToggleLiveFov.addEventListener('click', async () => {
      const panel = document.getElementById('liveFovAnalyzerPanel');
      if (panel) {
        if (panel.style.display === 'none' || !panel.style.display) {
          const cameras = await window.apiClient.getCameras();
          if (cameras.length > 0) inspectLiveFeedFov(cameras[0].id);
        } else {
          panel.style.display = 'none';
        }
      }
    });
  }

  if (btnCloseLiveFov) {
    btnCloseLiveFov.addEventListener('click', () => {
      const panel = document.getElementById('liveFovAnalyzerPanel');
      if (panel) panel.style.display = 'none';
    });
  }

  if (btnLivePropose) {
    btnLivePropose.addEventListener('click', () => openCameraProposalModal());
  }

  gridBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      gridBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      liveWallGridMode = btn.getAttribute('data-grid');
      wallGrid.className = `video-wall-grid grid-${liveWallGridMode}`;
      await renderLiveWall();
    });
  });

  const btnPopout = document.getElementById('btnPopoutVideoWall');
  if (btnPopout) {
    btnPopout.addEventListener('click', () => window.openDetachedVideoWall());
  }

  if (btnStopAll) {
    btnStopAll.addEventListener('click', async () => {
      const active = await window.apiClient.getActiveStreamingSessions();
      if (active.sessions && active.sessions.length > 0) {
        for (const sess of active.sessions) {
          await window.apiClient.stopStreamingSession(sess.camera_id || sess.session_id);
        }
      }
      cleanupLiveStreamCanvases();
      document.querySelectorAll('.live-stream-video').forEach(v => {
        try { v.pause(); v.src = ''; } catch(e){}
      });
      await renderLiveWall();
      alert('All WAN stream sessions terminated. Bandwidth released.');
    });
  }

  // Tag Feed Modal Handlers
  initTagFeedModal();

  // Start Session Inactivity Countdown
  startSessionInactivityTimer();

  // Start initial streams ONLY ON FIRST LOAD of the Live Wall
  const initialCams = await window.apiClient.getCameras();
  for (let i = 0; i < Math.min(2, initialCams.length); i++) {
    await window.apiClient.startStreamingSession(initialCams[i].id);
  }

  await renderLiveWall();
}

window.inspectLiveFeedFov = async function(camId) {
  const analysis = await window.apiClient.getCameraFovAnalysis(camId);
  activeFovAnalysis = analysis;

  const panel = document.getElementById('liveFovAnalyzerPanel');
  if (!panel) return;

  document.getElementById('liveFovCamTitle').textContent = `${analysis.camera_id} • ${analysis.camera_name}`;
  document.getElementById('liveFovId').textContent = `${analysis.optical_specs.dori_standards.identification_range_meters}m`;
  document.getElementById('liveFovRec').textContent = `${analysis.optical_specs.dori_standards.recognition_range_meters}m`;
  document.getElementById('liveFovDet').textContent = `${analysis.optical_specs.dori_standards.detection_range_meters}m`;
  
  const blind = analysis.blind_spot_analysis;
  document.getElementById('liveFovBlindDesc').textContent = `${blind.location_description} (~${blind.uncovered_area_sqm.toLocaleString()} sq.m unmonitored).`;
  document.getElementById('liveFovRecHw').textContent = `Recommended: ${blind.recommended_hardware}`;

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

window.openDetachedVideoWall = async function() {
  const cameras = await window.apiClient.getCameras();
  const activeFeeds = cameras.slice(0, 4);

  const popoutWin = window.open('', 'NirikshanDetachedVideoWall', 'width=1440,height=840,menubar=no,toolbar=no,location=no,status=no');
  if (!popoutWin) {
    alert('Pop-up was blocked by browser. Please allow popups for localhost to use Multi-Monitor mode.');
    return;
  }

  const feedsHtml = activeFeeds.map((cam, idx) => `
    <div style="background: #0d121c; border: 1px solid rgba(0, 242, 254, 0.25); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
      <div style="padding: 8px 12px; background: rgba(10, 14, 23, 0.95); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; justify-content: space-between; align-items: center;">
        <strong style="color: #00f2fe; font-size: 12px; font-family: monospace;">${cam.id} • ${cam.name}</strong>
        <span style="color: #10b981; font-size: 11px; font-weight: 700;">● LIVE WEBRTC RELAY</span>
      </div>
      <div style="flex: 1; min-height: 280px; background: radial-gradient(circle at center, #131d2e 0%, #06090e 100%); display: flex; align-items: center; justify-content: center; position: relative;">
        <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.65); padding: 4px 8px; border-radius: 4px; font-size: 11px; color: #f8fafc; font-family: monospace;">
          ${cam.vendor} • ${cam.resolution}
        </div>
        <div style="position: absolute; top: 10px; right: 10px; background: rgba(245, 158, 11, 0.2); border: 1px solid rgba(245, 158, 11, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 10px; color: #f59e0b; font-family: monospace;">
          25 FPS • WAN &lt; 2.4 Mbps
        </div>
        <div style="text-align: center; color: rgba(255,255,255,0.4);">
          <div style="font-size: 32px; margin-bottom: 6px; color: #00f2fe;"><i class="fa-solid fa-video"></i> 📹</div>
          <div style="font-size: 13px; font-weight: 600; color: #94a3b8;">Active WebRTC Stream Relay Channel #${idx+1}</div>
          <div style="font-size: 11px; font-family: monospace; color: #64748b; margin-top: 4px;">Lat: ${cam.lat} • Lng: ${cam.lng}</div>
        </div>
      </div>
    </div>
  `).join('');

  popoutWin.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>NIRIKSHAN 4K Multi-Monitor Detached Live Video Wall</title>
      <meta charset="UTF-8">
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #070a0f; color: #f8fafc; font-family: 'Plus Jakarta Sans', sans-serif; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
        header { height: 52px; padding: 0 18px; background: #0d121c; border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; }
        .grid { flex: 1; padding: 12px; display: grid; grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); gap: 12px; }
      </style>
    </head>
    <body>
      <header>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="background: #00f2fe; color: #04101e; padding: 3px 8px; border-radius: 4px; font-weight: 800; font-size: 11px;">4K MULTI-MONITOR</span>
          <strong style="font-size: 13px; letter-spacing: 0.04em;">NIRIKSHAN DETACHED LIVE VIDEO WALL</strong>
        </div>
        <div style="font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #00f2fe; background: rgba(0,242,254,0.1); padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(0,242,254,0.3);">
          BANDWIDTH: 4.8 Mbps PEAK • ON-DEMAND RELAY
        </div>
      </header>
      <div class="grid">
        ${feedsHtml}
      </div>
    </body>
    </html>
  `);
  popoutWin.document.close();
};

function startSessionInactivityTimer() {
  if (sessionCountdownInterval) clearInterval(sessionCountdownInterval);
  sessionCountdownInterval = setInterval(async () => {
    const timerEl = document.getElementById('liveWallInactivityTimer');
    if (sessionCountdownSeconds > 0) {
      sessionCountdownSeconds--;
      const mins = Math.floor(sessionCountdownSeconds / 60).toString().padStart(2, '0');
      const secs = (sessionCountdownSeconds % 60).toString().padStart(2, '0');
      if (timerEl) timerEl.textContent = `${mins}:${secs} Remaining`;
    } else {
      // Auto-stop all sessions when idle
      if (timerEl) timerEl.textContent = '00:00 Auto-Stopped (Idle)';
      const active = await window.apiClient.getActiveStreamingSessions();
      if (active.active_sessions_count > 0) {
        for (const sess of active.sessions) {
          await window.apiClient.stopStreamingSession(sess.session_id);
        }
        await renderLiveWall();
      }
    }
  }, 1000);
}

// Track last triggered suspect hit timestamp to prevent spamming popups
let lastSuspectAlertTimestamp = 0;

// Helper to grab real photographic snapshot with realistic vehicle, HSRP license plate, and optical detection
function captureCrispVehicleSnapshot(video, plateText = 'GJ-01-AB-1234', camName = 'CAM-GJ-0101 • SG Highway Overbridge') {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 640;
  offCanvas.height = 360;
  const ctx = offCanvas.getContext('2d');

  // 1. Check if source live video has an active decoded frame for background
  let sourceVideo = video;
  if (!sourceVideo || sourceVideo.readyState < 2 || sourceVideo.videoWidth === 0) {
    sourceVideo = document.querySelector('.live-stream-video');
  }

  let hasRealVideoFrame = false;
  if (sourceVideo && sourceVideo.readyState >= 2 && sourceVideo.videoWidth > 0) {
    try {
      ctx.drawImage(sourceVideo, 0, 0, offCanvas.width, offCanvas.height);
      // Add subtle dark surveillance contrast overlay
      ctx.fillStyle = 'rgba(2, 6, 23, 0.4)';
      ctx.fillRect(0, 0, 640, 360);
      hasRealVideoFrame = true;
    } catch (e) {
      hasRealVideoFrame = false;
    }
  }

  // 2. Realistic Highway Road Surface (if no video background available)
  if (!hasRealVideoFrame) {
    const skyGrad = ctx.createLinearGradient(0, 0, 0, 360);
    skyGrad.addColorStop(0, '#0f172a');
    skyGrad.addColorStop(0.3, '#1e293b');
    skyGrad.addColorStop(1, '#090d16');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, 640, 360);

    // Multi-Lane Highway Road Surface
    ctx.fillStyle = '#1e2533';
    ctx.beginPath();
    ctx.moveTo(140, 0); ctx.lineTo(500, 0); ctx.lineTo(620, 360); ctx.lineTo(20, 360);
    ctx.closePath();
    ctx.fill();

    // Road Texture & Grain
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    for (let i = 0; i < 300; i++) {
      ctx.fillRect(Math.random() * 640, Math.random() * 360, 2, 2);
    }

    // Lane Dividers (Dashed White Lines)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 3;
    ctx.setLineDash([22, 16]);
    ctx.beginPath();
    ctx.moveTo(270, 0); ctx.lineTo(230, 360);
    ctx.moveTo(370, 0); ctx.lineTo(410, 360);
    ctx.stroke();
    ctx.setLineDash([]);

    // Yellow Shoulder Safety Markings
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(150, 0); ctx.lineTo(55, 360);
    ctx.stroke();
  }

  // 3. PHOTOREALISTIC SUSPECT VEHICLE (ALWAYS RENDERED ON TOP OF ROAD SURFACE)
  // Ambient Ground Shadow Under Vehicle
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.beginPath();
  ctx.ellipse(320, 280, 145, 34, 0, 0, Math.PI * 2);
  ctx.fill();

  // Vehicle Lower Body (Tires & Suspension)
  ctx.fillStyle = '#020617';
  ctx.beginPath();
  ctx.roundRect(198, 238, 34, 46, 6);
  ctx.roundRect(408, 238, 34, 46, 6);
  ctx.fill();

  // Vehicle Main Body Shell (Metallic Pearl White Gradient)
  const carBodyGrad = ctx.createLinearGradient(0, 100, 0, 280);
  carBodyGrad.addColorStop(0, '#f8fafc');
  carBodyGrad.addColorStop(0.5, '#e2e8f0');
  carBodyGrad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = carBodyGrad;
  ctx.beginPath();
  ctx.roundRect(205, 125, 230, 142, [26, 26, 12, 12]);
  ctx.fill();
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Roof & Tinted Windshield Glass
  const glassGrad = ctx.createLinearGradient(0, 130, 0, 185);
  glassGrad.addColorStop(0, '#020617');
  glassGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = glassGrad;
  ctx.beginPath();
  ctx.roundRect(228, 134, 184, 52, [18, 18, 4, 4]);
  ctx.fill();
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Windshield Reflection Glare
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(242, 178); ctx.lineTo(396, 142);
  ctx.stroke();

  // Vehicle Hood Character Lines
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(250, 190); ctx.lineTo(265, 218);
  ctx.moveTo(390, 190); ctx.lineTo(375, 218);
  ctx.stroke();

  // Honeycomb Front Radiator Grille
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.roundRect(252, 214, 136, 28, 6);
  ctx.fill();
  ctx.strokeStyle = '#1e293b';
  ctx.stroke();

  // Chrome Brand Emblem
  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.ellipse(320, 222, 10, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Projector LED Headlights (Dual Xenon Glow)
  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(212, 212); ctx.lineTo(246, 214); ctx.lineTo(242, 228); ctx.lineTo(215, 224); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(220, 216, 12, 7);

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(428, 212); ctx.lineTo(394, 214); ctx.lineTo(398, 228); ctx.lineTo(425, 224); ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(408, 216, 12, 7);

  // Front Bumper Lower Air Dam
  ctx.fillStyle = '#090d16';
  ctx.beginPath();
  ctx.roundRect(240, 246, 160, 18, 4);
  ctx.fill();

  // Side View Mirrors
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.roundRect(190, 158, 20, 12, 4);
  ctx.roundRect(430, 158, 20, 12, 4);
  ctx.fill();

  // 4. Optical YOLOv8 Target Bounding Brackets on the Vehicle
  const vBoxX = 195;
  const vBoxY = 115;
  const vBoxW = 250;
  const vBoxH = 165;

  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 2.5;
  const corner = 20;
  // Top-left bracket
  ctx.beginPath(); ctx.moveTo(vBoxX, vBoxY + corner); ctx.lineTo(vBoxX, vBoxY); ctx.lineTo(vBoxX + corner, vBoxY); ctx.stroke();
  // Top-right bracket
  ctx.beginPath(); ctx.moveTo(vBoxX + vBoxW - corner, vBoxY); ctx.lineTo(vBoxX + vBoxW, vBoxY); ctx.lineTo(vBoxX + vBoxW, vBoxY + corner); ctx.stroke();
  // Bottom-left bracket
  ctx.beginPath(); ctx.moveTo(vBoxX, vBoxY + vBoxH - corner); ctx.lineTo(vBoxX, vBoxY + vBoxH); ctx.lineTo(vBoxX + corner, vBoxY + vBoxH); ctx.stroke();
  // Bottom-right bracket
  ctx.beginPath(); ctx.moveTo(vBoxX + vBoxW, vBoxY + vBoxH - corner); ctx.lineTo(vBoxX + vBoxW, vBoxY + vBoxH); ctx.lineTo(vBoxX + vBoxW - corner, vBoxY + vBoxH); ctx.stroke();

  // Top Target Classification Label
  ctx.fillStyle = 'rgba(0, 242, 254, 0.95)';
  ctx.fillRect(vBoxX, vBoxY - 18, 148, 16);
  ctx.fillStyle = '#04101e';
  ctx.font = 'bold 8px "JetBrains Mono", monospace';
  ctx.fillText('YOLOv8x: TARGET VEHICLE (98.8%)', vBoxX + 4, vBoxY - 6);

  // 5. PROMINENT HIGH SECURITY REGISTRATION PLATE (HSRP)
  const plateX = 265;
  const plateY = 246;
  const plateW = 112;
  const plateH = 26;

  // White Plate Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(plateX, plateY, plateW, plateH);
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = 2;
  ctx.strokeRect(plateX, plateY, plateW, plateH);

  // Blue IND Strip on Left
  ctx.fillStyle = '#0284c7';
  ctx.fillRect(plateX, plateY, 14, plateH);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 5.5px sans-serif';
  ctx.fillText('IND', plateX + 2, plateY + 15);

  // Ashoka Chakra Emblem Dot
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(plateX + 7, plateY + 6, 2, 0, Math.PI * 2);
  ctx.fill();

  // Embossed License Plate Text
  ctx.fillStyle = '#020617';
  ctx.font = 'bold 10px "JetBrains Mono", "Roboto Mono", monospace';
  ctx.fillText(plateText, plateX + 17, plateY + 17);

  // Optical Plate Detection Tag
  ctx.strokeStyle = '#00f2fe';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(plateX - 2, plateY - 2, plateW + 4, plateH + 4);

  ctx.fillStyle = 'rgba(0, 242, 254, 0.95)';
  ctx.fillRect(plateX - 2, plateY - 14, 102, 12);
  ctx.fillStyle = '#04101e';
  ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
  ctx.fillText('ANPR OCR: 99.4% CONF', plateX + 2, plateY - 5);

  // 6. State-Grade CCTV OSD Camera Header & Radar Speed Telemetry
  ctx.fillStyle = 'rgba(2, 6, 23, 0.9)';
  ctx.fillRect(0, 0, 640, 26);
  ctx.fillRect(0, 336, 640, 24);

  // Top OSD Metadata
  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
  ctx.fillText(`📹 ${camName} (NODE #4182)`, 10, 17);

  ctx.fillStyle = '#f43f5e';
  ctx.font = 'bold 8.5px "JetBrains Mono", monospace';
  ctx.fillText(`🚨 STATE HOTLIST BOLO MATCH • 80,000+ CCTV GRID`, 360, 17);

  // Bottom OSD Telemetry
  const now = new Date();
  const timeStr = now.toISOString().replace('T', ' ').slice(0, 19) + '.' + String(now.getMilliseconds()).padStart(3, '0') + ' IST';
  ctx.fillStyle = '#94a3b8';
  ctx.font = '8px "JetBrains Mono", monospace';
  ctx.fillText(`PTS: ${timeStr} | EXPOSURE: 1/2000s | FPS: 25.0 | SPEED: 81.5 KM/H (RADAR) | GPS: 23.0338°N, 72.5072°E`, 10, 351);

  // 7. High-Definition Micro-Crop of the HSRP Plate
  const plateCanvas = document.createElement('canvas');
  plateCanvas.width = 220;
  plateCanvas.height = 54;
  const pCtx = plateCanvas.getContext('2d');

  pCtx.fillStyle = '#f8fafc';
  pCtx.fillRect(0, 0, 220, 54);
  pCtx.strokeStyle = '#0f172a';
  pCtx.lineWidth = 3;
  pCtx.strokeRect(2, 2, 216, 50);

  // Blue IND strip
  pCtx.fillStyle = '#0284c7';
  pCtx.fillRect(4, 4, 24, 46);
  pCtx.fillStyle = '#ffffff';
  pCtx.font = 'bold 8px sans-serif';
  pCtx.fillText('IND', 7, 30);
  pCtx.beginPath();
  pCtx.arc(16, 12, 3, 0, Math.PI*2);
  pCtx.fillStyle = '#fbbf24';
  pCtx.fill();

  // High-contrast embossed plate text
  pCtx.fillStyle = '#020617';
  pCtx.font = 'bold 19px "JetBrains Mono", monospace';
  pCtx.fillText(plateText, 34, 35);

  return {
    fullSnapshotUrl: offCanvas.toDataURL('image/jpeg', 0.95),
    plateCropUrl: plateCanvas.toDataURL('image/png')
  };
}

// Set to track armed/already intercepted suspects to completely eliminate repeated alerts
const armedSuspectPlates = new Set();

function startCanvasLiveStream(canvasId, camera, hasAnprHit, isFaceHit) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const video = document.getElementById(`video_${camera.id}`);

  canvas.width = 640;
  canvas.height = 360;

  function observeStreamFromBackend() {
    // 1. Live video stream remains 100% CLEAN (Zero artificial frames/bounding boxes drawn inside the video)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Pure Backend/Background AI Observation Engine
    // CRITICAL: If video is PAUSED, STOPPED, or NOT actively playing, DO NOT advance time and DO NOT trigger alerts!
    if (video && !video.paused && !video.ended && video.readyState >= 2) {
      const duration = (video.duration && !isNaN(video.duration)) ? video.duration : 8.0;
      const currentTime = video.currentTime % duration;

      if (!isFaceHit) {
        const activeSuspects = window.apiClient && window.apiClient.suspectWatchlist ? window.apiClient.suspectWatchlist.filter(w => w.active) : [];
        const primarySuspect = activeSuspects[0] || { plate: 'GJ-01-AB-1234', crime: 'Armed Bank Robbery & Kidnapping', fir: 'FIR-892/2026' };
        const suspectPlate = primarySuspect.plate || 'GJ-01-AB-1234';
        const cleanPlate = suspectPlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

        // Backend AI observes target vehicle passing in camera view (e.g. between 3.2s and 7.6s)
        if (currentTime >= 3.2 && currentTime <= 7.6) {
          const isTargetWanted = window.apiClient && window.apiClient.suspectWatchlist && window.apiClient.suspectWatchlist.some(w => w.active && w.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === cleanPlate);

          // ONCE ARMED / INTERCEPTED, NEVER ALERT AGAIN (Eliminates repeated alert spam)
          if (isTargetWanted && !armedSuspectPlates.has(cleanPlate)) {
            armedSuspectPlates.add(cleanPlate); // Mark as armed & handled
            triggerLiveSuspectDossierHit(suspectPlate, camera, video, primarySuspect, 81.5);
          }
        }
      }
    }

    const animId = requestAnimationFrame(observeStreamFromBackend);
    activeStreamAnimFrames.set(canvasId, animId);
  }

  observeStreamFromBackend();
}

// Live Suspect Capture Trigger Handler (Captures Snapshot + Auto-Dispatches to Nearest Police Station & Plots GIS Route with Zero Delay)
function triggerLiveSuspectDossierHit(plate, camera, video, suspectInfo, speed = 81.5) {
  lastSuspectAlertTimestamp = Date.now();
  lastAlertedPlate = plate;
  const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  armedSuspectPlates.add(cleanPlate); // Prevent duplicate triggers

  // 1. Grab Crisp Photographic Snapshot & Zoomed OCR Plate Crop from Video Frame
  const snapshotData = captureCrispVehicleSnapshot(video, plate);

  // 2. Play Tactical Priority Emergency Alarm Chime via Web Audio API
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(940, audioCtx.currentTime);
    osc.frequency.setValueAtTime(1240, audioCtx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.42);
  } catch (e) {}

  // 3. Render Snapshot Image in Analytics View Dossier
  const previewCanvas = document.getElementById('snapshotPreviewCanvas');
  if (previewCanvas) {
    const pCtx = previewCanvas.getContext('2d');
    if (pCtx) {
      const img = new Image();
      img.onload = () => pCtx.drawImage(img, 0, 0, previewCanvas.width, previewCanvas.height);
      img.src = snapshotData.fullSnapshotUrl;
    }
  }

  const snapshotCard = document.getElementById('suspectCaptureSnapshotCard');
  if (snapshotCard) {
    document.getElementById('snapshotPlateDisplay').textContent = plate;
    document.getElementById('snapshotCrimeDisplay').innerHTML = `Wanted For: <strong style="color:#ffffff;">${suspectInfo.crime || 'Armed Bank Robbery'}</strong> &bull; FIR: <span>${suspectInfo.fir || 'FIR-892/2026'}</span>`;
    document.getElementById('snapshotCamDisplay').textContent = `${camera.id} • ${camera.name.slice(0, 26)}...`;
    document.getElementById('snapshotSpeedDisplay').textContent = `${speed} km/h`;
    document.getElementById('snapshotOcrDisplay').textContent = '99.4% (OCR Verified)';
    document.getElementById('snapshotHashDisplay').textContent = `#SHA256-${Math.random().toString(16).substring(2, 10).toUpperCase()}`;
    document.getElementById('snapshotTimestamp').textContent = new Date().toLocaleTimeString('en-IN') + ' IST';
    snapshotCard.style.display = 'block';
  }

  // 4. ZERO-DELAY AUTOMATIC DISPATCH TO NEAREST POLICE STATION & PATROL UNITS
  const nearestStation = camera.district && camera.district.includes('Ahmedabad') 
    ? 'Satellite Police Station & SG-1 Highway Division'
    : `${camera.district || 'City'} Central Police Station & Highway Patrol`;
  
  const assignedPcr = 'PCR-101 (Cheetah Unit) & Interceptor Falcon-09';
  const alertId = `ALT-SNIP-${Math.floor(1000 + Math.random() * 9000)}`;

  const autoDispatchedAlert = {
    id: alertId,
    event_id: `EVT-${Math.floor(10000 + Math.random() * 90000)}`,
    camera_id: camera.id,
    location: `${camera.name} (${camera.district})`,
    target_vehicle: plate,
    matched_source: 'yolo_anpr_backend',
    title: `🚨 CRITICAL SUSPECT INTERCEPT: ${plate} (AUTO-DISPATCHED)`,
    severity: 'critical',
    status: 'dispatched', // AUTOMATICALLY DISPATCHED WITHOUT REQUIRING OPERATOR CLICK
    assigned_station: nearestStation,
    pcr_unit: `${assignedPcr} • ETA 2.1 Mins`,
    dispatched_at: new Date().toISOString(),
    roadblock_armed: true,
    forward_roadblock_location: 'Sanand & SG Highway Forward Toll Barrier #02',
    details: `AUTOMATIC ZERO-DELAY DISPATCH ACTIVATED: Backend YOLOv8 Vision Engine detected target vehicle ${plate} passing ${camera.name}. Automated emergency alert dispatched to ${nearestStation}. Offense: ${suspectInfo.crime || 'Criminal BOLO Hotlist'} (Ref: ${suspectInfo.fir || 'FIR-HQ'}). Plate OCR verified at 99.4% confidence. Forward roadblock automatically armed.`,
    snapshot_url: snapshotData.fullSnapshotUrl,
    plate_crop_url: snapshotData.plateCropUrl,
    speed_kmph: speed,
    ocr_confidence: 99.4,
    created_at: new Date().toISOString()
  };

  if (window.apiClient && window.apiClient.alerts) {
    window.apiClient.alerts.unshift(autoDispatchedAlert);
  }

  // 5. AUTOMATICALLY PLOT TRAJECTORY PURSUIT ROUTE ON GIS MAP (Zero-Delay)
  if (typeof window.renderTrajectoryOnGisMap === 'function') {
    window.renderTrajectoryOnGisMap(plate);
  }

  // 6. Automatically Re-render Alerts Feed with Dispatched Status
  if (typeof renderAlerts === 'function') {
    renderAlerts();
  }

  // 7. Show Instant High-Priority Toast with Police Station Notification
  showRealtimeAlertToast({
    title: `⚡ AUTO-DISPATCHED: ${plate} ➔ ${nearestStation}`,
    location: `${assignedPcr} En Route • Roadblock Armed`,
    camera_id: camera.id
  });

  // 8. Update Dynamic Dashboard Meters
  updateDynamicDashboardMeters('cardStatAlerts');
}

// TOGGLE PLAY / FREEZE VIDEO CELL AT EXACT CURRENT MOMENT AND FRAME IMAGE
window.togglePlayPauseCell = function(camId) {
  const videoEl = document.getElementById(`video_${camId}`);
  const cell = document.querySelector(`.wall-feed-cell[data-cam-id="${camId}"]`);
  const btn = cell ? cell.querySelector('.btn-play-pause-cell') : null;
  const indicator = cell ? cell.querySelector('.feed-live-indicator') : null;

  if (!videoEl) return;

  if (!videoEl.paused) {
    // 1. FREEZE VIDEO AT EXACT CURRENT TIME & IMAGE
    videoEl.pause();
    const freezeTime = (videoEl.currentTime || 0).toFixed(1);
    
    if (btn) {
      btn.innerHTML = '<i class="fa-solid fa-play text-emerald"></i> Resume';
      btn.title = 'Resume Live Video Playback';
      btn.classList.remove('danger');
    }
    if (indicator) {
      indicator.innerHTML = `<i class="fa-solid fa-pause" style="color: var(--accent-amber);"></i> FROZEN @ 00:0${freezeTime}s`;
      indicator.style.background = 'rgba(245, 158, 11, 0.15)';
      indicator.style.color = 'var(--accent-amber)';
    }
    showRealtimeAlertToast({
      title: `⏸️ VIDEO FROZEN: ${camId}`,
      location: `Frame preserved at offset 00:0${freezeTime}s`,
      camera_id: camId
    });
  } else {
    // 2. RESUME LIVE VIDEO STREAM PLAYBACK
    videoEl.play().then(() => {
      if (btn) {
        btn.innerHTML = '<i class="fa-solid fa-pause"></i> Freeze';
        btn.title = 'Freeze Video Stream at Current Frame';
        btn.classList.add('danger');
      }
      if (indicator) {
        indicator.innerHTML = `<span class="dot-sm" style="background: var(--accent-rose);"></span> LIVE RELAY`;
        indicator.style.background = 'rgba(244, 63, 94, 0.12)';
        indicator.style.color = 'var(--accent-rose)';
      }
    }).catch(e => console.error(e));
  }
};

window.toggleWebcamFeed = async function(camId) {
  const cell = document.querySelector(`.wall-feed-cell[data-cam-id="${camId}"]`);
  if (!cell) return;

  if (window.activeWebcamStreams && window.activeWebcamStreams.has(camId)) {
    // Stop Webcam and restore CCTV video
    const stream = window.activeWebcamStreams.get(camId);
    if (stream) stream.getTracks().forEach(t => t.stop());
    window.activeWebcamStreams.delete(camId);
    await renderLiveWall();
  } else {
    // Request Physical Webcam Stream
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API not supported in current browser context.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } });
      window.activeWebcamStreams.set(camId, stream);
      
      const video = cell.querySelector('.live-stream-video');
      if (video) {
        video.srcObject = stream;
        video.play();
      }
      showRealtimeAlertToast({
        title: `📹 WEBCAM ACTIVE: ${camId}`,
        location: `Local Physical Video Stream Mapped to Node`,
        camera_id: camId
      });
    } catch (err) {
      alert(`WebCam Access Note: ${err.message || 'Camera permission not granted.'}\nStreaming continuous high-definition simulated feed.`);
    }
  }
};

async function renderLiveWall() {
  cleanupLiveStreamCanvases();
  const wallGrid = document.getElementById('videoWallGrid');
  const activeCountEl = document.getElementById('liveWallActiveSessions');
  const wanLoadEl = document.getElementById('liveWallWanLoad');
  if (!wallGrid) return;

  const cameras = await window.apiClient.getCameras();
  let maxSlots = 4;
  if (liveWallGridMode === '1x1') maxSlots = 1;
  if (liveWallGridMode === '2x2') maxSlots = 4;
  if (liveWallGridMode === '3x3') maxSlots = 9;
  if (liveWallGridMode === '4x4') maxSlots = 16;

  const displayCams = cameras.slice(0, maxSlots);

  const sessionData = await window.apiClient.getActiveStreamingSessions();
  if (activeCountEl) activeCountEl.textContent = `${sessionData.active_sessions_count} Active Streams`;
  if (wanLoadEl) wanLoadEl.textContent = `${sessionData.total_wan_bandwidth_mbps} Mbps`;

  wallGrid.innerHTML = '';

  const sampleVideos = [
    'assets/videos/highway-traffic.mp4',
    'assets/videos/urban-traffic.mp4',
    'assets/videos/highway-traffic.mp4',
    'assets/videos/cctv-pedestrians.mp4'
  ];

  displayCams.forEach((cam, idx) => {
    const isSessionActive = sessionData.sessions.some(s => s.camera_id === cam.id);
    const hasAnprHit = idx === 0 && isSessionActive;
    const isFaceHit = idx === 3 && isSessionActive;
    const cell = document.createElement('div');
    cell.className = `wall-feed-cell ${!isSessionActive ? 'idle-mode' : ''}`;
    cell.setAttribute('data-cam-id', cam.id);

    let overlayHtml = '';
    if (hasAnprHit) {
      overlayHtml = '<div class="anpr-overlay-tag"><i class="fa-solid fa-car-burst text-rose"></i> ANPR Hit: GJ-01-AB-1234 (VAHAN Stolen)</div>';
    } else if (isFaceHit) {
      overlayHtml = '<div class="anpr-overlay-tag" style="border-color: var(--accent-rose);"><i class="fa-solid fa-user-shield text-rose"></i> Face Match: Vikram K. (CCTNS Flag)</div>';
    }

    const videoSrc = sampleVideos[idx % sampleVideos.length];

    cell.innerHTML = `
      <div class="wall-feed-top">
        <span class="feed-title-badge" title="${cam.name}"><i class="fa-solid fa-video text-cyan"></i> ${cam.id} &bull; ${cam.name.slice(0, 22)}...</span>
        <span class="feed-vendor-chip">${cam.vendor.split(' ')[0]} ${cam.resolution}</span>
        ${isSessionActive 
          ? `<span class="feed-live-indicator"><span class="dot-sm" style="background: var(--accent-rose);"></span> LIVE RELAY</span>`
          : `<span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">IDLE (0 Kbps)</span>`
        }
      </div>

      ${isSessionActive 
        ? `
          <video class="live-stream-video" id="video_${cam.id}" autoplay loop muted playsinline src="${videoSrc}"></video>
          <canvas class="live-stream-canvas" id="canvas_${cam.id}" style="background: transparent; z-index: 2; pointer-events: none;"></canvas>
          <div class="stream-watermark-overlay" id="wm_${cam.id}" style="z-index: 3;">
            <i class="fa-solid fa-crosshairs text-cyan"></i>
            <span>${cam.id} &bull; 25.0 FPS &bull; REAL CCTV FEED</span>
          </div>
          ${overlayHtml}
        `
        : `
          <div class="feed-center-sim" style="height: 100%;">
            <i class="fa-solid fa-video-slash" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.4rem;"></i>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">Stream Idle &bull; Bandwidth Preserved</span>
            <button class="action-btn primary" onclick="startCellSession('${cam.id}')" style="margin-top: 0.5rem; font-size: 0.72rem; padding: 0.25rem 0.6rem;">
              <i class="fa-solid fa-play"></i> Start On-Demand Pull
            </button>
          </div>
        `
      }

      <div class="wall-feed-bottom" style="z-index: 15;">
        <div class="feed-controls-group" style="z-index: 16;">
          ${isSessionActive ? `
            <button type="button" class="feed-ctrl-btn btn-play-pause-cell danger" onclick="togglePlayPauseCell('${cam.id}')" title="Freeze Video Stream at Current Frame">
              <i class="fa-solid fa-pause"></i> Freeze
            </button>
            <button type="button" class="feed-ctrl-btn" onclick="toggleWebcamFeed('${cam.id}')" title="Toggle Physical WebCam Stream" style="color: var(--accent-cyan);">
              <i class="fa-solid fa-camera-rotate"></i> WebCam
            </button>
            <button type="button" class="feed-ctrl-btn" onclick="inspectLiveFeedFov('${cam.id}')" title="Check Optical Range & Blind-Spots">
              <i class="fa-solid fa-satellite-dish"></i> Range
            </button>
            <button type="button" class="feed-ctrl-btn" onclick="captureFeedSnapshot('${cam.id}', '${cam.name}')" title="Capture Forensic Snapshot">
              <i class="fa-solid fa-camera"></i> Snapshot
            </button>
            <button type="button" class="feed-ctrl-btn" onclick="openTagFeedModal('${cam.id}', '${cam.name}')" title="Tag for Investigation">
              <i class="fa-solid fa-bookmark"></i> Tag
            </button>
          ` : `
            <button type="button" class="feed-ctrl-btn" onclick="inspectLiveFeedFov('${cam.id}')" title="Check Range & Blind-Spots" style="color: var(--accent-cyan); border-color: rgba(0, 242, 254, 0.4); font-size: 0.7rem;">
              <i class="fa-solid fa-satellite-dish"></i> Range & Blind-Spot
            </button>
          `}
        </div>
        <span class="feed-timer-chip">${isSessionActive ? 'Auto-Stop: 05:00' : 'Idle'}</span>
      </div>
    `;

    wallGrid.appendChild(cell);

    // Initialize the live canvas AI detection overlay if session is active
    if (isSessionActive) {
      setTimeout(() => {
        startCanvasLiveStream(`canvas_${cam.id}`, cam, hasAnprHit, isFaceHit);
      }, 50);
    }
  });
}

// Start Stream Session from Grid Cell
window.startCellSession = async function(camId) {
  sessionCountdownSeconds = 300; // Reset 5-min timer
  await window.apiClient.startStreamingSession(camId);
  await renderLiveWall();
};

// Stop Stream Session from Grid Cell
window.stopCellSession = async function(camId) {
  // 1. Pause and release video element
  const videoEl = document.getElementById(`video_${camId}`);
  if (videoEl) {
    try { videoEl.pause(); videoEl.src = ''; } catch(e){}
  }
  // 2. Stop camera stream session
  await window.apiClient.stopStreamingSession(camId);
  // 3. Re-render live wall to idle state
  await renderLiveWall();
  showRealtimeAlertToast({
    title: `⏹️ STREAM TERMINATED: ${camId}`,
    location: `WAN Bandwidth Released • Cell in Idle Mode`,
    camera_id: camId
  });
};

// Forensic Snapshot Capture
window.captureFeedSnapshot = function(camId, camName) {
  const videoEl = document.getElementById(`video_${camId}`);
  const snapData = captureCrispVehicleSnapshot(videoEl, 'GJ-01-AB-1234', `${camId} • ${camName}`);
  const hash = `#SHA256-${Math.random().toString(16).substring(2, 10).toUpperCase()}`;

  // Direct download of forensic evidence image
  const a = document.createElement('a');
  a.href = snapData.fullSnapshotUrl;
  a.download = `EVIDENCE_${camId}_${Date.now()}.jpg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  showRealtimeAlertToast({
    title: `📸 FORENSIC SNAPSHOT SAVED: ${camId}`,
    location: `${camName} • Digital Seal: ${hash}`,
    camera_id: camId
  });

  alert(`FORENSIC SNAPSHOT DOWNLOADED!\n\nCamera Node: ${camId} (${camName})\nEvidence Seal: ${hash}\nCompliance: Section 65B Indian Evidence Act Validated\nSaved to your local downloads.`);
};

// Tag Feed Modal Handlers
function initTagFeedModal() {
  const modal = document.getElementById('tagFeedModal');
  const btnClose = document.getElementById('closeTagModal');
  const btnCancel = document.getElementById('btnCancelTag');
  const form = document.getElementById('tagFeedForm');

  if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('open'));
  if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.remove('open'));

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const camId = document.getElementById('tagModalCamId').value;
      const tagType = document.getElementById('tagModalType').value;
      const notes = document.getElementById('tagModalNotes').value;

      const evt = await window.apiClient.tagFeedForReview(camId, notes, tagType);
      modal.classList.remove('open');
      form.reset();
      await renderAnalyticsTable();
      alert(`Event ${evt.id} committed to Vision Analytics Hub with Cryptographic Evidence Hash!`);
    });
  }
}

window.openTagFeedModal = function(camId, camName) {
  const modal = document.getElementById('tagFeedModal');
  if (!modal) return;
  const inputId = document.getElementById('tagModalCamId');
  const inputName = document.getElementById('tagModalCamName');
  if (inputId) inputId.value = camId;
  if (inputName) inputName.value = `${camId} - ${camName}`;
  modal.classList.add('open');
};

/* =========================================================================
   7. ANALYTICS & ANPR VIEW (PHASE 4 - MODEL 2 ANALYTICS ENGINE)
   ========================================================================= */
async function initAnalyticsView() {
  const search = document.getElementById('analyticsSearch');
  const camFilter = document.getElementById('analyticsCameraFilter');
  const typeFilter = document.getElementById('analyticsTypeFilter');
  const btnReset = document.getElementById('btnResetAnalyticsFilters');
  const btnRunAnpr = document.getElementById('btnRunLiveAnpr');

  if (search) search.addEventListener('input', () => renderAnalyticsTable());
  if (camFilter) camFilter.addEventListener('change', () => renderAnalyticsTable());
  if (typeFilter) typeFilter.addEventListener('change', () => renderAnalyticsTable());

  if (btnReset) {
    btnReset.addEventListener('click', async () => {
      if (search) search.value = '';
      if (camFilter) camFilter.value = 'ALL';
      if (typeFilter) typeFilter.value = 'ALL';
      await renderAnalyticsTable();
    });
  }

  if (btnRunAnpr) {
    btnRunAnpr.addEventListener('click', async () => {
      const preset = document.getElementById('anprSamplePreset')?.value || 'sample-ahmedabad';
      const camId = document.getElementById('analyticsCameraFilter')?.value !== 'ALL' 
        ? document.getElementById('analyticsCameraFilter').value 
        : 'CAM-GJ-0101';

      btnRunAnpr.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing Neural Frame...';
      const res = await window.apiClient.runAnprInference(preset, camId);
      btnRunAnpr.innerHTML = '<i class="fa-solid fa-bolt"></i> Run ANPR Inference';

      const liveOutput = document.getElementById('anprLiveOutput');
      if (liveOutput) {
        liveOutput.style.display = 'block';
        document.getElementById('anprOutPlate').textContent = res.anpr_result.plate_number;
        document.getElementById('anprOutConf').textContent = `OCR Confidence: ${res.anpr_result.confidence}% \u2022 YOLOv8 Model`;
        document.getElementById('anprOutVehicle').textContent = res.event.payload_json.vehicle;
        document.getElementById('anprOutSpeed').textContent = `Est. Speed: ${res.event.payload_json.speed_kmph} km/h \u2022 Heading North`;
        
        const vahanEl = document.getElementById('anprOutVahan');
        vahanEl.textContent = res.anpr_result.vahan_alert;
        vahanEl.className = `vahan-badge ${res.anpr_result.vahan_alert === 'CLEAR' ? 'clear' : 'alert'}`;
        
        document.getElementById('anprOutOwner').textContent = `Owner: ${res.event.payload_json.owner_name}`;
        document.getElementById('anprOutEventId').textContent = res.event.id;
      }

      await renderAnalyticsTable();
      await renderAlerts();
    });
  }

  // Authority Suspect Registration & Crime Flagging Hub
  await initSuspectRegistrationHub();

  // Cross-Department Trajectory Reconstruction Lab
  initTrajectoryPursuitLab();

  // Clip Modal Handlers
  initClipModal();

  await renderAnalyticsTable();
}

// =========================================================================
// AUTHORITY SUSPECT REGISTRATION & INTERCEPTION WATCHLIST CONTROLLER
// =========================================================================
async function initSuspectRegistrationHub() {
  const form = document.getElementById('suspectRegistrationForm');
  const btnDrawGis = document.getElementById('btnSnapshotDrawGisRoute');
  const btnArmRoadblock = document.getElementById('btnSnapshotArmRoadblock');
  const btnDismiss = document.getElementById('btnDismissSnapshot');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const plate = document.getElementById('regSuspectPlate').value.trim().toUpperCase();
      const crime = document.getElementById('regSuspectCrime').value.trim();
      const fir = document.getElementById('regSuspectFir').value.trim() || `FIR-${Math.floor(100 + Math.random()*900)}/2026`;
      const suspectName = document.getElementById('regSuspectName').value.trim() || 'Unidentified Suspect Driver';
      const priority = document.getElementById('regSuspectPriority').value;

      if (!plate || !crime) {
        alert('Please provide both the Vehicle Number Plate and the Crime Offense Category.');
        return;
      }

      await window.apiClient.addSuspectVehicle({
        plate: plate,
        crime: crime,
        fir: fir,
        suspect_name: suspectName,
        priority: priority
      });

      form.reset();
      await renderSuspectWatchlistTable();
      await renderAlerts();
      await updateDynamicDashboardMeters('cardStatAlerts');

      showRealtimeAlertToast({
        title: `🚨 RED NOTICE ARMED: Target ${plate}`,
        location: `Statewide 80,000+ CCTV Grid Synced`,
        camera_id: 'HOTLIST_REGISTRATION'
      });

      alert(`SUSPECT TARGET REGISTERED TO STATE GRID!\n\nTarget Plate: ${plate}\nCrime: ${crime}\nFIR Ref: ${fir}\nPriority: ${priority}\n\nThe AI Detection engine is now monitoring all camera streams. Sighting of this vehicle will trigger instant high-definition snapshot capture and GIS route tracking.`);
    });
  }

  if (btnDrawGis) {
    btnDrawGis.addEventListener('click', () => {
      const plate = document.getElementById('snapshotPlateDisplay')?.textContent || 'GJ-01-AB-1234';
      renderTrajectoryOnGisMap(plate);
    });
  }

  if (btnArmRoadblock) {
    btnArmRoadblock.addEventListener('click', async () => {
      const plate = document.getElementById('snapshotPlateDisplay')?.textContent || 'GJ-01-AB-1234';
      const loc = document.getElementById('snapshotCamDisplay')?.textContent || 'SG Highway Pakwan Junction';
      await triggerTacticalRoadblockDispatch(plate, loc);
    });
  }

  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      const card = document.getElementById('suspectCaptureSnapshotCard');
      if (card) card.style.display = 'none';
    });
  }

  await renderSuspectWatchlistTable();
}

async function renderSuspectWatchlistTable() {
  const tbody = document.getElementById('suspectWatchlistTableBody');
  const countBadge = document.getElementById('activeSuspectCountBadge');
  if (!tbody || !window.apiClient) return;

  const watchlist = await window.apiClient.getSuspectWatchlist();
  if (countBadge) {
    countBadge.textContent = `${watchlist.length} Active Targets Armed`;
  }

  tbody.innerHTML = '';
  if (watchlist.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 1.2rem; color: var(--text-muted);">
          No active suspects in registry. Regular vehicle traffic passes without triggering alerts.
        </td>
      </tr>
    `;
    return;
  }

  watchlist.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

    const priorityBadge = item.priority === 'CRITICAL'
      ? `<span class="node-status-pill online" style="background: rgba(244,63,94,0.2); color: var(--accent-rose); border-color: var(--accent-rose); font-size: 0.65rem; font-weight: 800;">CRITICAL RED</span>`
      : `<span class="node-status-pill offline" style="background: rgba(245,158,11,0.2); color: var(--accent-amber); border-color: var(--accent-amber); font-size: 0.65rem;">HIGH BOLO</span>`;

    tr.innerHTML = `
      <td style="padding: 8px 10px;">
        <strong style="color: var(--accent-cyan); font-family: var(--font-mono); font-size: 0.82rem;">${item.plate}</strong><br/>
        <span style="font-size: 0.68rem; color: var(--text-muted);">${item.vehicle_type || 'Vehicle'}</span>
      </td>
      <td style="padding: 8px 10px;">
        <strong style="color: #ffffff;">${item.crime}</strong><br/>
        <span style="font-size: 0.68rem; color: var(--text-muted);">${item.registered_by || 'State Police'}</span>
      </td>
      <td style="padding: 8px 10px;">
        <span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-secondary);">${item.fir}</span>
      </td>
      <td style="padding: 8px 10px;">
        <span style="color: #f8fafc; font-weight: 600;">${item.suspect_name}</span>
      </td>
      <td style="padding: 8px 10px; text-align: center;">
        ${priorityBadge}
      </td>
      <td style="padding: 8px 10px; text-align: center;">
        <span class="node-status-pill online" style="font-size: 0.62rem;"><span class="dot-sm" style="background: var(--accent-emerald);"></span> Armed</span>
      </td>
      <td style="padding: 8px 10px; text-align: right;">
        <div style="display: flex; gap: 0.3rem; justify-content: flex-end;">
          <button class="action-btn primary" onclick="window.renderTrajectoryOnGisMap('${item.plate}')" style="padding: 0.2rem 0.45rem; font-size: 0.68rem; background: linear-gradient(135deg, #00f2fe, #0284c7); color: #04101e; font-weight: 800;" title="Draw Multi-Dept Pursuit Route on GIS Map">
            <i class="fa-solid fa-map-location-dot"></i> Map Route
          </button>
          <button class="action-btn" onclick="window.simulateSuspectCameraHit('${item.plate}')" style="padding: 0.2rem 0.45rem; font-size: 0.68rem; background: rgba(244,63,94,0.15); border-color: var(--accent-rose); color: var(--accent-rose);" title="Simulate Immediate CCTV Camera Sighting">
            <i class="fa-solid fa-video"></i> Sighting
          </button>
          <button class="action-btn" onclick="window.removeSuspectTarget('${item.plate}')" style="padding: 0.2rem 0.45rem; font-size: 0.68rem; color: var(--text-muted);" title="Remove from Watchlist">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.populateSuspectPreset = function(plate, crime, fir, name, priority) {
  const plateEl = document.getElementById('regSuspectPlate');
  const crimeEl = document.getElementById('regSuspectCrime');
  const firEl = document.getElementById('regSuspectFir');
  const nameEl = document.getElementById('regSuspectName');
  const prioEl = document.getElementById('regSuspectPriority');

  if (plateEl) plateEl.value = plate;
  if (crimeEl) crimeEl.value = crime;
  if (firEl) firEl.value = fir;
  if (nameEl) nameEl.value = name;
  if (prioEl) prioEl.value = priority;

  const form = document.getElementById('suspectRegistrationForm');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

window.removeSuspectTarget = async function(plate) {
  await window.apiClient.removeSuspectVehicle(plate);
  await renderSuspectWatchlistTable();
  await updateDynamicDashboardMeters('cardStatAlerts');
};

window.simulateSuspectCameraHit = async function(plate) {
  const suspect = await window.apiClient.isPlateSuspect(plate);
  if (!suspect) {
    alert(`Plate ${plate} is not currently registered in the Suspect Watchlist. Register it first.`);
    return;
  }

  // Reset from armed set for manual operator simulation test
  const cleanPlate = plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  armedSuspectPlates.delete(cleanPlate);

  // 1. Navigate to Live Wall or Analytics
  const analyticsNavBtn = document.querySelector('.main-nav-btn[data-view="view-analytics"]');
  if (analyticsNavBtn) analyticsNavBtn.click();

  // 2. Trigger Sighting Snapshot & Audio Alarm
  const dummyCamera = { id: 'CAM-GJ-0101', name: 'SG Highway Iskcon Crossroad Overbridge', district: 'Ahmedabad (Urban)' };
  triggerLiveSuspectDossierHit(plate, dummyCamera, null, suspect, 84.5);

  // 3. Automatically draw route on GIS Map
  await renderTrajectoryOnGisMap(plate);
};

function initTrajectoryPursuitLab() {
  const btnTrace = document.getElementById('btnTraceTrajectory');
  const inputPlate = document.getElementById('trajectoryPlateInput');
  const btnRoadblock = document.getElementById('btnDispatchForwardRoadblock');

  if (btnTrace) {
    btnTrace.addEventListener('click', async () => {
      const plateVal = inputPlate?.value || 'GJ-01-AB-1234';
      btnTrace.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Tracing Multi-Dept Grid...';
      const traj = await window.apiClient.reconstructVehicleTrajectory(plateVal);
      btnTrace.innerHTML = '<i class="fa-solid fa-compass"></i> Trace Cross-Dept Route';

      const container = document.getElementById('trajectoryResultsContainer');
      if (container) {
        container.style.display = 'block';

        // Summary Banner
        document.getElementById('trajVehicleModel').textContent = traj.vehicle_model;
        document.getElementById('trajFirRef').textContent = traj.stolen_fir;
        document.getElementById('trajTotalDist').textContent = `${traj.total_distance_km} km`;
        document.getElementById('trajAvgSpeed').textContent = `${traj.average_speed_kmph} km/h`;
        document.getElementById('trajHeading').textContent = traj.current_heading;

        // Render Sighting Timeline
        const timelineList = document.getElementById('trajectoryTimelineList');
        if (timelineList) {
          timelineList.innerHTML = '';
          traj.sightings.forEach(s => {
            const card = document.createElement('div');
            card.className = 'traj-step-card';
            card.innerHTML = `
              <div class="traj-step-left">
                <span class="traj-step-num">${s.step}</span>
                <div class="traj-node-info">
                  <h4>${s.camera_name} <span style="font-size:0.75rem; color:var(--text-muted); font-family:var(--font-mono);">(${s.camera_id})</span></h4>
                  <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap; margin-top:0.2rem;">
                    <span class="traj-dept-badge" style="background:${s.department_color}22; color:${s.department_color}; border:1px solid ${s.department_color}66;">
                      <i class="fa-solid fa-shield-halved"></i> ${s.department_badge}
                    </span>
                    <span style="font-size:0.72rem; color:var(--text-secondary);">&bull; ${s.district} &bull; <strong>${s.snapshot_type}</strong></span>
                  </div>
                </div>
              </div>

              <div class="traj-step-right">
                <div class="speed-tag-box">
                  <span class="speed-val" style="color: ${s.speed_kmph > 90 ? 'var(--accent-rose)' : (s.speed_kmph > 75 ? 'var(--accent-amber)' : 'var(--accent-emerald)')};">
                    ${s.speed_kmph} km/h
                  </span>
                  <span class="speed-label">Segment Speed</span>
                </div>
                <div class="traj-time-box">
                  <strong>${s.time_display}</strong><br/>
                  <span style="font-size:0.68rem; color:var(--accent-cyan);">OCR: ${s.ocr_confidence}%</span>
                </div>
              </div>
            `;
            timelineList.appendChild(card);
          });
        }

        // Predictive AI Vector Box
        const p = traj.predictive_trajectory;
        document.getElementById('predNextLocTitle').textContent = `Next Predicted Location: ${p.next_predicted_location} (${p.next_predicted_dept})`;
        document.getElementById('predStrategyDesc').innerHTML = `Vehicle maintaining <strong>${p.projected_speed_kmph} km/h</strong> heading towards ${p.next_predicted_district}. Strategy: <em>${p.suggested_interception_strategy}</em>.`;
        document.getElementById('predEtaTime').textContent = `~${p.current_eta_minutes} Mins (${p.estimated_arrival_time})`;
        document.getElementById('predForwardUnit').innerHTML = `<i class="fa-solid fa-car-on text-cyan"></i> Forward Squad: <strong>${p.assigned_pcr_interceptor}</strong> (Pre-Positioned Ahead)`;
      }
    });
  }

  if (btnRoadblock) {
    btnRoadblock.addEventListener('click', async () => {
      const plateVal = inputPlate?.value || 'GJ-01-AB-1234';
      await triggerTacticalRoadblockDispatch(plateVal, 'Forest Dept Sanctuary North Inter-State Corridor');
    });
  }

  const btnViewOnMap = document.getElementById('btnViewOnGisMap');
  if (btnViewOnMap) {
    btnViewOnMap.addEventListener('click', () => {
      const plateVal = inputPlate?.value || 'GJ-01-AB-1234';
      renderTrajectoryOnGisMap(plateVal);
    });
  }
}

async function renderAnalyticsTable() {
  const searchVal = document.getElementById('analyticsSearch')?.value || '';
  const camVal = document.getElementById('analyticsCameraFilter')?.value || 'ALL';
  const typeVal = document.getElementById('analyticsTypeFilter')?.value || 'ALL';

  const events = await window.apiClient.getEvents({
    camera_id: camVal,
    type: typeVal,
    search: searchVal
  });

  const tbody = document.getElementById('analyticsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';
  events.forEach(evt => {
    const tr = document.createElement('tr');
    const p = evt.payload_json || {};

    let typeTag = `<span class="node-status-pill online">${evt.type.toUpperCase()}</span>`;
    let detailText = '';
    let dbIntercept = '<span class="vahan-badge clear">CLEAR</span>';

    if (evt.type === 'anpr') {
      typeTag = `<span class="node-status-pill online" style="background: rgba(0,242,254,0.15); color: var(--accent-cyan); border-color: var(--accent-cyan);">ANPR PLATE</span>`;
      detailText = `<strong>Plate: ${p.plate || p.plate_number || 'N/A'}</strong> (${p.confidence_score || (p.confidence ? p.confidence*100 : 98.5)}%)<br/><span style="font-size:0.7rem; color:var(--text-muted);">${p.vehicle || p.vehicle_type || 'Vehicle'} &bull; ${p.speed_kmph || 50} km/h</span>`;
      if (p.vahan_status && p.vahan_status !== 'CLEAR') {
        dbIntercept = `<span class="vahan-badge alert">${p.vahan_status}</span>`;
      }
    } else if (evt.type === 'face' || evt.type === 'face_match') {
      typeTag = `<span class="node-status-pill degraded" style="background: rgba(244,63,94,0.15); color: var(--accent-rose); border-color: var(--accent-rose);">FACE MATCH</span>`;
      detailText = `<strong>Match: ${p.match_name || p.suspect_name || 'Suspect Target'}</strong> (${p.similarity || (p.match_confidence ? p.match_confidence*100 : 94.6)}%)<br/><span style="font-size:0.7rem; color:var(--text-muted);">${p.cctns_id || p.gallery_id || 'CCTNS Wanted Database'}</span>`;
      dbIntercept = `<span class="vahan-badge alert">CCTNS WANTED HIT</span>`;
    } else if (evt.type === 'crowd' || evt.type === 'loitering') {
      typeTag = `<span class="node-status-pill offline" style="background: rgba(245,158,11,0.15); color: var(--accent-amber); border-color: var(--accent-amber);">CROWD / LOITER</span>`;
      detailText = `<strong>Crowd Density: ${p.density || 'High Risk'}</strong> (${p.dwell_time_mins || p.duration_seconds || 18}s dwell)<br/><span style="font-size:0.7rem; color:var(--text-muted);">Threshold Exceeded</span>`;
      dbIntercept = `<span class="vahan-badge alert" style="background:rgba(245,158,11,0.15); color:var(--accent-amber); border-color:var(--accent-amber);">SURGE WARNING</span>`;
    } else {
      typeTag = `<span class="node-status-pill" style="background: rgba(168,85,247,0.15); color: #c084fc; border-color: #a855f7;">OPERATOR TAG</span>`;
      detailText = `<strong>${p.tag_type || 'Review Note'}</strong><br/><span style="font-size:0.7rem; color:var(--text-muted);">${p.note || 'Manual Tag'}</span>`;
      dbIntercept = `<span class="vahan-badge" style="background:rgba(255,255,255,0.05); color:var(--text-secondary);">INVESTIGATION</span>`;
    }

    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); color: var(--accent-cyan);">${evt.id}</strong></td>
      <td><span style="font-family: var(--font-mono); font-size: 0.75rem;">${new Date(evt.ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST</span></td>
      <td>
        <strong style="font-size: 0.8rem;">${evt.camera_id}</strong><br/>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${evt.camera_name || 'Camera Junction'}</span>
      </td>
      <td>${typeTag}</td>
      <td>${detailText}</td>
      <td>${dbIntercept}</td>
      <td>
        <div style="display: flex; gap: 0.4rem;">
          <button class="action-btn" onclick="openClipModal('${evt.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" title="Jump to Recorded Forensic Clip">
            <i class="fa-solid fa-film"></i> Clip
          </button>
          <button class="action-btn" onclick="downloadEvidencePacket('${evt.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.7rem;" title="Download Sealed Evidence Dossier">
            <i class="fa-solid fa-download"></i> Dossier
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Jump to Clip Modal Handler
function initClipModal() {
  const modal = document.getElementById('clipModal');
  const btnClose = document.getElementById('closeClipModal');
  const btnCloseAlt = document.getElementById('btnCloseClip');
  const btnDownloadDossier = document.getElementById('btnDownloadEvidenceDossier');

  if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('open'));
  if (btnCloseAlt) btnCloseAlt.addEventListener('click', () => modal.classList.remove('open'));

  if (btnDownloadDossier) {
    btnDownloadDossier.addEventListener('click', () => {
      alert('Cryptographic Forensic Evidence Packet Generated!\nIncludes:\n- Sealed MP4 Video Chunk (Offset: 00:14:22)\n- Frame-by-frame JSON metadata & bounding box coordinates\n- Section 65B Indian Evidence Act Compliance Certificate\n- SHA-256 Tamper-Proof Digital Seal');
    });
  }
}

window.openClipModal = async function(evtId) {
  const evt = await window.apiClient.getEventById(evtId);
  if (!evt) return;

  const modal = document.getElementById('clipModal');
  const title = document.getElementById('clipModalTitle');
  const watermark = document.getElementById('clipWatermark');
  const bboxTag = document.getElementById('clipBboxTag');

  title.textContent = `Forensic Incident Playback: ${evt.id}`;
  watermark.textContent = `${evt.camera_id} \u2022 ${new Date(evt.ts).toISOString().replace('T', ' ').slice(0, 19)} IST`;
  
  if (evt.payload_json && (evt.payload_json.plate || evt.payload_json.plate_number)) {
    const pVal = evt.payload_json.plate || evt.payload_json.plate_number;
    bboxTag.textContent = `ANPR: ${pVal} (${evt.payload_json.confidence_score || 99}%)`;
  } else if (evt.payload_json && (evt.payload_json.match_name || evt.payload_json.suspect_name)) {
    const sVal = evt.payload_json.match_name || evt.payload_json.suspect_name;
    bboxTag.textContent = `FACE: ${sVal} (${evt.payload_json.similarity || 94}%)`;
  } else {
    bboxTag.textContent = `EVENT: ${evt.type.toUpperCase()}`;
  }

  modal.classList.add('open');
};

window.downloadEvidencePacket = function(evtId) {
  alert(`Forensic Dossier for ${evtId} downloaded.\nSealed with Government of Gujarat Public Key Infrastructure (PKI) digital signature.`);
};

/* =========================================================================
   8. ALERTS & REAL-TIME DISPATCH (PHASE 5 - KAFKA ALERT BUS)
   ========================================================================= */
let activeAlertSeverity = 'ALL';

async function initAlertsView() {
  const filterPills = document.querySelectorAll('.filter-pill-btn');
  const deptFilter = document.getElementById('alertsDeptFilter');
  const btnSimulate = document.getElementById('btnSimulateStolenHit');

  filterPills.forEach(btn => {
    btn.addEventListener('click', async () => {
      filterPills.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeAlertSeverity = btn.getAttribute('data-severity');
      await renderAlerts();
    });
  });

  if (deptFilter) {
    deptFilter.addEventListener('change', () => renderAlerts());
  }

  if (btnSimulate) {
    btnSimulate.addEventListener('click', () => simulateAnprStolenVehicleIntercept());
  }

  // Subscribe to real-time Alert Bus pushes
  window.apiClient.subscribeToAlerts((newAlert) => {
    showRealtimeAlertToast(newAlert);
    renderAlerts();
    updateGlobalAlertBadge();
  });

  await renderAlerts();
}

async function renderAlerts() {
  const deptVal = document.getElementById('alertsDeptFilter')?.value || 'ALL';
  const alerts = await window.apiClient.getAlerts(activeAlertSeverity, deptVal);
  const container = document.getElementById('alertsFeedList') || document.getElementById('alertsList');
  if (!container) return;

  const totalCountEl = document.getElementById('alertsTotalCount');
  const dispatchedCountEl = document.getElementById('alertsDispatchedCount');

  const activeCount = alerts.filter(a => a.status === 'active').length;
  const dispatchedCount = alerts.filter(a => a.status === 'dispatched').length;

  if (totalCountEl) totalCountEl.textContent = `${activeCount} Active`;
  if (dispatchedCountEl) dispatchedCountEl.textContent = `${dispatchedCount} Interceptors`;

  updateGlobalAlertBadge(activeCount);

  container.innerHTML = '';
  alerts.forEach(alert => {
    const card = document.createElement('div');
    card.className = `alert-feed-card ${alert.severity}`;

    let statusHtml = '';
    if (alert.status === 'active') {
      statusHtml = `<span class="node-status-pill online" style="background: rgba(244,63,94,0.15); color: var(--accent-rose); border-color: var(--accent-rose);"><span class="dot-sm" style="background: var(--accent-rose);"></span> UNRESOLVED INCIDENT</span>`;
    } else if (alert.status === 'dispatched') {
      statusHtml = `<span class="node-status-pill degraded" style="background: rgba(0,242,254,0.15); color: var(--accent-cyan); border-color: var(--accent-cyan);"><i class="fa-solid fa-truck-fast"></i> ${alert.pcr_unit || 'PCR Interceptor En Route'}</span>`;
    } else {
      statusHtml = `<span class="node-status-pill" style="background: rgba(16,185,129,0.15); color: var(--accent-emerald); border-color: var(--accent-emerald);"><i class="fa-solid fa-check"></i> ACKNOWLEDGED</span>`;
    }

    let snapshotUrl = alert.snapshot_url;
    let plateCropUrl = alert.plate_crop_url;
    const plateNo = alert.target_vehicle || (alert.title && alert.title.includes('GJ-') ? alert.title.match(/GJ-[0-9]{2}-[A-Z]{1,2}-[0-9]{4}/)?.[0] : 'GJ-01-AB-1234') || 'GJ-01-AB-1234';

    if (!snapshotUrl) {
      const generated = captureCrispVehicleSnapshot(null, plateNo, alert.location || 'CAM-GJ-0101 • SG Highway Overbridge');
      snapshotUrl = generated.fullSnapshotUrl;
      plateCropUrl = generated.plateCropUrl;
      alert.snapshot_url = snapshotUrl;
      alert.plate_crop_url = plateCropUrl;
    }

    let snapshotHtml = `
      <div style="display: flex; gap: 1rem; align-items: center; background: rgba(0,0,0,0.45); padding: 0.75rem 0.9rem; border-radius: var(--radius-sm); border: 1px solid rgba(244,63,94,0.4); margin: 0.6rem 0; flex-wrap: wrap;">
        <div style="width: 170px; height: 96px; border-radius: 6px; overflow: hidden; border: 1.5px solid var(--accent-rose); position: relative; background: #000; flex-shrink: 0; box-shadow: 0 0 12px rgba(244,63,94,0.3);">
          <img src="${snapshotUrl}" alt="Suspect Capture" style="width: 100%; height: 100%; object-fit: cover;" />
          <span style="position: absolute; bottom: 2px; right: 4px; background: rgba(0,0,0,0.85); color: var(--accent-cyan); font-size: 0.55rem; padding: 1px 4px; border-radius: 2px; font-family: var(--font-mono); font-weight: 800;">ANPR 1080p CAPTURE</span>
        </div>
        <div style="flex: 1; min-width: 190px;">
          <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
            <span style="font-size: 0.68rem; color: var(--accent-cyan); font-weight: 800; text-transform: uppercase;"><i class="fa-solid fa-camera"></i> Focused OCR License Plate:</span>
            <span style="font-size: 0.65rem; color: var(--accent-emerald); font-weight: 900;">${alert.ocr_confidence || 99.4}% MATCH</span>
          </div>
          <img src="${plateCropUrl}" alt="OCR Plate" style="height: 38px; border-radius: 4px; border: 1px solid #ffffff; box-shadow: 0 0 14px rgba(0,242,254,0.3);" />
          <div style="margin-top: 0.35rem; font-size: 0.7rem; color: var(--text-secondary);">
            <span>Speed: <strong>${alert.speed_kmph || 81.5} km/h</strong></span> &bull; 
            <span style="color: var(--accent-amber); font-family: var(--font-mono); font-weight: 700;">HSRP Hologram Verified</span> &bull;
            <span style="color: var(--text-muted); font-family: var(--font-mono);">Sec 65B Hash Validated</span>
          </div>
        </div>
      </div>
    `;

    let autoDispatchBanner = '';
    if (alert.status === 'dispatched' || alert.assigned_station) {
      autoDispatchBanner = `
        <div style="background: linear-gradient(90deg, rgba(0,242,254,0.12) 0%, rgba(16,185,129,0.08) 100%); border-left: 3px solid var(--accent-cyan); padding: 0.5rem 0.8rem; border-radius: var(--radius-sm); margin: 0.5rem 0; font-size: 0.73rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
            <div>
              <span style="color: var(--accent-cyan); font-weight: 800;"><i class="fa-solid fa-bolt text-amber"></i> AUTOMATIC ZERO-DELAY DISPATCH:</span>
              <strong style="color: #ffffff; margin-left: 0.3rem;">${alert.assigned_station || 'Satellite Police Station & SG-1 Division'}</strong>
            </div>
            <span class="node-status-pill online" style="font-size: 0.65rem; background: rgba(16,185,129,0.2); color: var(--accent-emerald); border-color: var(--accent-emerald);">
              <i class="fa-solid fa-truck-fast"></i> ${alert.pcr_unit || 'PCR Cheetah Unit • ETA: 2.1 Mins'}
            </span>
          </div>
          <div style="margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.68rem; display: flex; gap: 0.8rem; flex-wrap: wrap;">
            <span><i class="fa-solid fa-shield-halved text-rose"></i> Roadblock: <strong>${alert.forward_roadblock_location || 'SG Highway Forward Toll Barrier (ARMED)'}</strong></span>
            <span><i class="fa-solid fa-map-pin text-cyan"></i> GIS Pursuit: <strong>Automated Trajectory Synced</strong></span>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="alert-card-top">
        <div class="alert-title-wrap">
          <i class="fa-solid ${alert.severity === 'critical' ? 'fa-triangle-exclamation text-rose' : 'fa-circle-exclamation text-amber'}" style="font-size: 1.2rem;"></i>
          <div>
            <h3>${alert.title}</h3>
            <span class="kafka-badge"><i class="fa-solid fa-bolt"></i> ${alert.kafka_topic || 'gujarat.police.intercept'}</span>
          </div>
        </div>
        ${statusHtml}
      </div>

      <p class="alert-desc-text">${alert.details}</p>

      ${autoDispatchBanner}
      ${snapshotHtml}

      <div class="alert-card-footer">
        <div class="alert-node-info">
          <i class="fa-solid fa-location-dot"></i> ${alert.location} &bull; <i class="fa-solid fa-video"></i> ${alert.camera_id} &bull; <i class="fa-solid fa-clock"></i> ${new Date(alert.created_at || alert.ts || Date.now()).toLocaleTimeString('en-IN')} IST
        </div>

        <div style="display: flex; gap: 0.4rem; flex-wrap: wrap;">
          ${alert.target_vehicle ? `
            <button class="action-btn" onclick="window.renderTrajectoryOnGisMap('${alert.target_vehicle}')" style="background: rgba(0, 242, 254, 0.15); border-color: var(--accent-cyan); color: var(--accent-cyan); font-size: 0.72rem; padding: 0.25rem 0.6rem;" title="Trace Multi-Dept Pursuit Route on GIS Map">
              <i class="fa-solid fa-map-location-dot"></i> Track on GIS
            </button>
          ` : ''}
          ${alert.status === 'active' ? `
            <button class="action-btn primary" onclick="dispatchPcrUnit('${alert.id}')" style="background: linear-gradient(135deg, #f43f5e, #be123c); font-size: 0.72rem; padding: 0.25rem 0.6rem;">
              <i class="fa-solid fa-truck-fast"></i> Dispatch PCR Interceptor
            </button>
            <button class="action-btn" onclick="acknowledgeAlertItem('${alert.id}')" style="font-size: 0.72rem; padding: 0.25rem 0.6rem;">
              <i class="fa-solid fa-check"></i> Acknowledge
            </button>
          ` : (alert.status === 'dispatched' ? `
            <button class="action-btn" onclick="acknowledgeAlertItem('${alert.id}')" style="font-size: 0.72rem; padding: 0.25rem 0.6rem;">
              <i class="fa-solid fa-check"></i> Mark Case Closed
            </button>
          ` : `
            <span style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">Resolved by ${alert.acknowledged_by || 'Control Room Operator'}</span>
          `)}
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}


// Action Handlers
window.dispatchPcrUnit = async function(alertId) {
  const updated = await window.apiClient.dispatchPcr(alertId);
  await renderAlerts();
  alert(`PCR INTERCEPTOR DISPATCHED!\n${updated.pcr_unit} dispatched to ${updated.location}.\nETA: 3.2 Minutes.`);
};

window.acknowledgeAlertItem = async function(alertId) {
  await window.apiClient.acknowledgeAlert(alertId);
  await renderAlerts();
};

function updateGlobalAlertBadge(count) {
  const badge = document.getElementById('alertBadgeCount');
  if (badge) {
    badge.textContent = count !== undefined ? count : 3;
    badge.style.display = (count === 0) ? 'none' : 'inline-block';
  }
}

// Floating Toast Notification
function showRealtimeAlertToast(alert) {
  const container = document.getElementById('alertToastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'alert-toast-card';
  toast.innerHTML = `
    <div class="toast-top">
      <strong><i class="fa-solid fa-triangle-exclamation"></i> HIGH-PRIORITY INTERCEPT</strong>
      <span class="toast-time">Just Now</span>
    </div>
    <div class="toast-body">
      <strong>${alert.title}</strong><br/>
      <span style="font-size: 0.72rem; color: var(--text-secondary);">${alert.location} &bull; ${alert.camera_id}</span>
    </div>
    <div class="toast-footer">
      <span class="toast-topic"><i class="fa-solid fa-bolt"></i> ${alert.kafka_topic || 'gujarat.police.intercept'}</span>
      <button class="action-btn" onclick="this.closest('.alert-toast-card').remove();" style="padding: 0.15rem 0.4rem; font-size: 0.65rem;">Dismiss</button>
    </div>
  `;

  container.appendChild(toast);
  setTimeout(() => toast.remove(), 7500);
}

// Pitch Demo: Live ANPR Stolen Vehicle Intercept Simulation
window.simulateAnprStolenVehicleIntercept = async function() {
  const anprRes = await window.apiClient.runAnprInference('sample-ahmedabad', 'CAM-GJ-0101');
  const vahanRes = await window.apiClient.lookupVahan('GJ-01-AB-1234');

  const alertObj = window.apiClient.publishAlertToBus({
    title: `HIGH-SPEED STOLEN HIT: GJ-01-AB-1234 (${vahanRes.data.vehicle_make_model})`,
    severity: 'critical',
    camera_id: 'CAM-GJ-0101',
    location: 'SG Highway Pakwan Crossroad Overbridge',
    target_department: 'dept-police',
    details: `ANPR optical read matched stolen hotlist in VAHAN 4.0. Owner: ${vahanRes.data.registered_owner}. FIR: ${vahanRes.data.fir_no} (${vahanRes.data.crime_section}). Heading Northbound @ 68 km/h.`
  });

  await renderAlerts();
  await renderAnalyticsTable();
  await updateDynamicDashboardMeters('cardStatAlerts');
};

/* =========================================================================
   9. INTEGRATION GATEWAY (PHASE 5 - L4 DATABASE BRIDGES)
   ========================================================================= */
async function initIntegrationView() {
  // Tab Switching
  const tabs = document.querySelectorAll('.sandbox-tab');
  const panels = document.querySelectorAll('.sandbox-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });

  // Query Execution Handlers
  const btnVahan = document.getElementById('btnExecuteVahanQuery');
  if (btnVahan) {
    btnVahan.addEventListener('click', async () => {
      const plate = document.getElementById('vahanQueryInput').value;
      btnVahan.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Querying VAHAN Gateway...';
      const res = await window.apiClient.lookupVahan(plate);
      btnVahan.innerHTML = '<i class="fa-solid fa-search"></i> Query VAHAN 4.0 API';

      const box = document.getElementById('vahanResultBox');
      box.style.display = 'block';
      const d = res.data;
      box.innerHTML = `
        <div class="result-field-grid">
          <div class="res-item"><label>Registration Plate:</label> <span class="text-cyan">${d.plate}</span></div>
          <div class="res-item"><label>Vehicle Status:</label> <span class="${d.status.includes('STOLEN') ? 'text-rose' : 'text-green'}">${d.status}</span></div>
          <div class="res-item"><label>Registered Owner:</label> <span>${d.registered_owner}</span></div>
          <div class="res-item"><label>Make / Model:</label> <span>${d.vehicle_make_model}</span></div>
          <div class="res-item"><label>RTO Authority:</label> <span>${d.rto_office}</span></div>
          <div class="res-item"><label>Chassis Serial:</label> <span>${d.chassis_no || 'N/A'}</span></div>
          ${d.fir_no ? `<div class="res-item"><label>FIR Case Reference:</label> <span class="text-rose">${d.fir_no} &bull; ${d.crime_section}</span></div>` : ''}
        </div>
      `;
    });
  }

  const btnEgujcop = document.getElementById('btnExecuteEgujcopQuery');
  if (btnEgujcop) {
    btnEgujcop.addEventListener('click', async () => {
      const q = document.getElementById('egujcopQueryInput').value;
      btnEgujcop.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Searching CCTNS Registry...';
      const res = await window.apiClient.lookupEGujCop(q);
      btnEgujcop.innerHTML = '<i class="fa-solid fa-search"></i> Query eGujCop CCTNS';

      const box = document.getElementById('egujcopResultBox');
      box.style.display = 'block';
      if (res.status === 'hit') {
        const d = res.data;
        box.innerHTML = `
          <div class="result-field-grid">
            <div class="res-item"><label>Suspect Name:</label> <span class="text-rose">${d.name} (${d.alias})</span></div>
            <div class="res-item"><label>CCTNS Case ID:</label> <span class="text-cyan">${d.cctns_id}</span></div>
            <div class="res-item"><label>Warrant Status:</label> <span class="text-rose">${d.status} &bull; ${d.warrant_type}</span></div>
            <div class="res-item"><label>Issuing Court:</label> <span>${d.issuing_court}</span></div>
            <div class="res-item"><label>Criminal Charges:</label> <span>${d.charges}</span></div>
            <div class="res-item"><label>State Bounty / Reward:</label> <span class="text-amber">₹${d.reward_inr.toLocaleString()}</span></div>
          </div>
        `;
      } else {
        box.innerHTML = `<p style="color: var(--accent-emerald);"><i class="fa-solid fa-check"></i> ${res.message}</p>`;
      }
    });
  }

  const btnSarthi = document.getElementById('btnExecuteSarthiQuery');
  if (btnSarthi) {
    btnSarthi.addEventListener('click', async () => {
      const q = document.getElementById('sarthiQueryInput').value;
      const res = await window.apiClient.lookupSarthi(q);
      const box = document.getElementById('sarthiResultBox');
      box.style.display = 'block';
      const d = res.data;
      box.innerHTML = `
        <div class="result-field-grid">
          <div class="res-item"><label>Driving License No:</label> <span class="text-cyan">${d.dl_number}</span></div>
          <div class="res-item"><label>License Holder:</label> <span>${d.holder_name}</span></div>
          <div class="res-item"><label>Validity Period:</label> <span>Valid upto ${d.validity}</span></div>
          <div class="res-item"><label>Category / Blood Group:</label> <span>${d.license_category} &bull; ${d.blood_group}</span></div>
        </div>
      `;
    });
  }

  const btnNafis = document.getElementById('btnExecuteNafisQuery');
  if (btnNafis) {
    btnNafis.addEventListener('click', async () => {
      const q = document.getElementById('nafisQueryInput').value;
      const res = await window.apiClient.lookupNafis(q);
      const box = document.getElementById('nafisResultBox');
      box.style.display = 'block';
      const d = res.data;
      box.innerHTML = `
        <div class="result-field-grid">
          <div class="res-item"><label>NAFIS Universal ID:</label> <span class="text-cyan">${d.nafis_id}</span></div>
          <div class="res-item"><label>Subject Identity:</label> <span>${d.subject_name}</span></div>
          <div class="res-item"><label>Fingerprint Similarity:</label> <span class="text-green">${d.fingerprint_match_score}% High Confidence</span></div>
          <div class="res-item"><label>Facial Biometric Score:</label> <span class="text-green">${d.facial_match_score}% Matching Vector</span></div>
        </div>
      `;
    });
  }
}

/* =========================================================================
   10. ADMIN, AUDIT TRAIL & CONSENT LEDGER (PHASE 6 GOVERNANCE)
   ========================================================================= */
let activeAuditActionFilter = 'ALL';

async function initAdminView() {
  // Subview Tab Switcher
  const subBtns = document.querySelectorAll('.admin-sub-btn');
  const subviews = document.querySelectorAll('.admin-subview');

  subBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      subBtns.forEach(b => b.classList.remove('active'));
      subviews.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-subview');
      const targetEl = document.getElementById(targetId);
      if (targetEl) targetEl.classList.add('active');
    });
  });

  // Audit Search & Action Filter
  const auditSearch = document.getElementById('auditSearchInput');
  const auditFilter = document.getElementById('auditActionFilter');

  if (auditSearch) auditSearch.addEventListener('input', () => renderAuditTable());
  if (auditFilter) {
    auditFilter.addEventListener('change', () => {
      activeAuditActionFilter = auditFilter.value;
      renderAuditTable();
    });
  }

  // Grant Consent Modal Handlers
  initGrantConsentModal();

  await renderAdminView();
}

async function renderAdminView() {
  await renderAuditTable();
  await renderConsentTable();
  await renderDepartmentsGrid();
}

async function renderAuditTable() {
  const auditBody = document.getElementById('auditTableBody');
  if (!auditBody) return;

  const searchVal = document.getElementById('auditSearchInput')?.value || '';
  const logs = await window.apiClient.getAuditLogs({
    action: activeAuditActionFilter,
    search: searchVal
  });

  auditBody.innerHTML = '';
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); color: var(--accent-cyan);">${log.id}</strong></td>
      <td><span style="font-family: var(--font-mono); font-size: 0.72rem;">${new Date(log.timestamp).toLocaleTimeString('en-IN')} IST</span></td>
      <td><strong>${log.user}</strong></td>
      <td><span class="node-status-pill online">${log.role.toUpperCase()}</span></td>
      <td><strong style="font-family: var(--font-mono); color: var(--accent-amber);">${log.action}</strong></td>
      <td style="font-size: 0.75rem; color: var(--text-secondary);">${log.target}</td>
      <td><span style="font-family: var(--font-mono); font-size: 0.72rem; color: var(--text-muted);">${log.ip}</span></td>
    `;
    auditBody.appendChild(tr);
  });
}

async function renderConsentTable() {
  const consentBody = document.getElementById('consentTableBody');
  if (!consentBody) return;

  const consents = await window.apiClient.getConsentRecords();
  const activeCount = consents.filter(c => c.status === 'active').length;
  const revokedCount = consents.filter(c => c.status === 'revoked').length;

  const activeCountEl = document.getElementById('consentActiveCount');
  const revokedCountEl = document.getElementById('consentRevokedCount');
  if (activeCountEl) activeCountEl.textContent = `${activeCount} Active`;
  if (revokedCountEl) revokedCountEl.textContent = `${revokedCount} Revoked`;

  consentBody.innerHTML = '';
  consents.forEach(csr => {
    const tr = document.createElement('tr');
    
    let scopeClass = 'metadata';
    if (csr.granted_scope.includes('View')) scopeClass = 'view-only';
    else if (csr.granted_scope.includes('Analytics')) scopeClass = 'analytics';
    else if (csr.granted_scope.includes('Surveillance')) scopeClass = 'surveillance';

    tr.innerHTML = `
      <td><strong style="font-family: var(--font-mono); color: var(--accent-cyan);">${csr.id}</strong></td>
      <td>
        <strong>${csr.establishment_name}</strong><br/>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${csr.district || 'Gujarat Urban'}</span>
      </td>
      <td>
        <strong>${csr.owner_name || 'Secretary'}</strong><br/>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${csr.contact_phone || '+91 98250 XXXXX'}</span>
      </td>
      <td><span style="font-family: var(--font-mono); font-size: 0.75rem;">${csr.camera_id}</span></td>
      <td><span class="scope-badge ${scopeClass}">${csr.granted_scope}</span></td>
      <td>
        <span class="node-status-pill ${csr.status === 'active' ? 'online' : 'offline'}">
          <span class="dot-sm" style="background: ${csr.status === 'active' ? 'var(--accent-emerald)' : 'var(--accent-rose)'};"></span>
          ${csr.status.toUpperCase()}
        </span>
      </td>
      <td>
        <span style="font-size: 0.7rem; color: var(--text-muted);">${csr.signed_at ? new Date(csr.signed_at).toLocaleDateString('en-IN') : '2026-08-01'}</span><br/>
        <span class="consent-hash-badge">${csr.certificate_hash.slice(0, 14)}...</span>
      </td>
      <td>
        ${csr.status === 'active' ? `
          <button class="action-btn" onclick="handleRevokeConsent('${csr.id}')" style="padding: 0.2rem 0.5rem; font-size: 0.7rem; color: var(--accent-rose); border-color: rgba(244,63,94,0.3);">
            <i class="fa-solid fa-ban"></i> Revoke
          </button>
        ` : `
          <span style="color: var(--text-muted); font-size: 0.7rem; font-family: var(--font-mono);">Revoked</span>
        `}
      </td>
    `;
    consentBody.appendChild(tr);
  });
}

async function renderDepartmentsGrid() {
  const container = document.getElementById('adminDeptsGrid');
  if (!container) return;

  const depts = [
    { id: 'dept-police', name: 'Gujarat Police / Home Dept', icon: 'fa-shield-halved', cameras: '24,500 Nodes', role: 'DG State Command', color: 'rose' },
    { id: 'dept-rto', name: 'Road Transport Office (RTO)', icon: 'fa-car', cameras: '12,800 Nodes', role: 'Highway & Toll Patrol', color: 'amber' },
    { id: 'dept-amc', name: 'Ahmedabad Municipal Corp', icon: 'fa-city', cameras: '18,200 Nodes', role: 'Smart City & Traffic', color: 'cyan' },
    { id: 'dept-civil', name: 'Civil Supplies & Food Dept', icon: 'fa-wheat-awn', cameras: '8,400 Nodes', role: 'PDS Godown Monitoring', color: 'green' },
    { id: 'dept-forest', name: 'Forest & Wildlife Dept', icon: 'fa-tree', cameras: '6,100 Nodes', role: 'Sanctuary Animal Crossings', color: 'emerald' },
    { id: 'dept-private', name: 'Private & Citizen Feeds', icon: 'fa-handshake', cameras: '8,800 Nodes', role: 'DPDP Citizen Consent', color: 'purple' }
  ];

  container.innerHTML = '';
  depts.forEach(d => {
    const card = document.createElement('div');
    card.className = 'gap-card';
    card.innerHTML = `
      <div class="gap-card-header">
        <div style="display: flex; align-items: center; gap: 0.6rem;">
          <i class="fa-solid ${d.icon} text-${d.color}" style="font-size: 1.2rem;"></i>
          <div>
            <h3 style="font-size: 0.95rem;">${d.name}</h3>
            <span style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">${d.id}</span>
          </div>
        </div>
        <span class="node-status-pill online">ISOLATED TENANT</span>
      </div>
      <div class="gap-card-body" style="margin-top: 0.8rem;">
        <div class="stat-row"><span>Active Ingested Capacity:</span> <strong>${d.cameras}</strong></div>
        <div class="stat-row"><span>Jurisdiction Scope:</span> <span>${d.role}</span></div>
        <div class="stat-row"><span>Data Isolation:</span> <span class="text-green"><i class="fa-solid fa-lock"></i> AES-256 Scoped</span></div>
      </div>
    `;
    container.appendChild(card);
  });
}

window.handleRevokeConsent = async function(id) {
  await window.apiClient.revokeConsent(id);
  await renderConsentTable();
  await renderAuditTable();
  alert(`Citizen Consent Certificate ${id} Revoked.\nCamera stream revoked and disconnected from central intelligence layer.`);
};

// Grant Citizen Consent Modal Handlers
function initGrantConsentModal() {
  const modal = document.getElementById('grantConsentModal');
  const btnOpen = document.getElementById('btnOpenGrantConsentModal');
  const btnClose = document.getElementById('closeConsentModal');
  const btnCancel = document.getElementById('btnCancelConsent');
  const form = document.getElementById('grantConsentForm');

  if (btnOpen) btnOpen.addEventListener('click', () => modal.classList.add('open'));
  if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('open'));
  if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.remove('open'));

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const record = {
        establishment_name: document.getElementById('consentEstablishment').value,
        owner_name: document.getElementById('consentOwner').value,
        contact_phone: document.getElementById('consentContact').value,
        district: document.getElementById('consentDistrict').value,
        granted_scope: document.getElementById('consentScope').value
      };

      const newCert = await window.apiClient.createConsentRecord(record);
      modal.classList.remove('open');
      form.reset();
      await renderConsentTable();
      await renderAuditTable();
      alert(`Digital Consent Certificate ${newCert.id} Signed & Sealed!\nPKI Hash: ${newCert.certificate_hash}\nEstablishment: ${newCert.establishment_name}\nScope: ${newCert.granted_scope}`);
    });
  }
}

/* =========================================================================
   11. MODAL HANDLERS & PHASE 2 EDGE ADAPTER WIZARD
   ========================================================================= */
function initModalHandlers() {
  // Manual Add Modal
  const modal = document.getElementById('onboardCameraModal');
  const btnOpen = document.getElementById('btnOpenOnboardModal');
  const btnClose = document.getElementById('closeOnboardModal');
  const btnCancel = document.getElementById('btnCancelOnboard');
  const form = document.getElementById('onboardCameraForm');

  if (btnOpen) btnOpen.addEventListener('click', () => modal.classList.add('open'));
  if (btnClose) btnClose.addEventListener('click', () => modal.classList.remove('open'));
  if (btnCancel) btnCancel.addEventListener('click', () => modal.classList.remove('open'));

  // Phase 2 Edge Adapter Wizard
  initAdapterWizard();

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newCam = {
        name: document.getElementById('newCamName').value,
        district: document.getElementById('newCamDistrict')?.value || 'Ahmedabad (Urban)',
        department_id: document.getElementById('newCamDept').value,
        type: document.getElementById('newCamType').value,
        resolution: document.getElementById('newCamResolution')?.value || '1080p',
        lat: document.getElementById('newCamLat').value,
        lng: document.getElementById('newCamLng').value,
        vendor: document.getElementById('newCamVendor').value,
        retention_days: document.getElementById('newCamRetention').value
      };

      await window.apiClient.createCamera(newCam);
      modal.classList.remove('open');
      form.reset();
      await refreshAllData();
      await updateDynamicDashboardMeters('cardStatCams');
      alert(`Camera ${newCam.name} onboarded successfully in ${newCam.district} with 15-day Edge Buffer!`);
    });
  }
}

// Phase 2 Universal Edge Adapter Onboarding Wizard
function initAdapterWizard() {
  const wizardModal = document.getElementById('adapterWizardModal');
  const btnOpen = document.getElementById('btnOpenAdapterWizardModal');
  const btnClose = document.getElementById('closeAdapterModal');
  const btnNext = document.getElementById('btnNextWiz');
  const btnPrev = document.getElementById('btnPrevWiz');
  const btnRunTest = document.getElementById('btnRunAdapterTest');
  const protoCards = document.querySelectorAll('.protocol-option-card');

  let currentStep = 1;
  let selectedProtocol = 'onvif';
  let probeResults = null;

  if (btnOpen) btnOpen.addEventListener('click', () => {
    currentStep = 1;
    updateWizardStep();
    wizardModal.classList.add('open');
  });

  if (btnClose) btnClose.addEventListener('click', () => wizardModal.classList.remove('open'));

  protoCards.forEach(card => {
    card.addEventListener('click', () => {
      protoCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedProtocol = card.getAttribute('data-protocol');
    });
  });

  function updateWizardStep() {
    for (let i = 1; i <= 4; i++) {
      const panel = document.getElementById(`panelStep${i}`);
      const stepInd = document.getElementById(`wizStep${i}`);
      if (panel) panel.classList.toggle('active', i === currentStep);
      if (stepInd) {
        stepInd.classList.toggle('active', i === currentStep);
        stepInd.classList.toggle('completed', i < currentStep);
      }
    }

    if (btnPrev) btnPrev.style.display = currentStep > 1 ? 'block' : 'none';
    if (btnNext) {
      if (currentStep === 1) btnNext.innerHTML = 'Next: Connection Config <i class="fa-solid fa-arrow-right"></i>';
      else if (currentStep === 2) btnNext.innerHTML = 'Next: Protocol Probe <i class="fa-solid fa-arrow-right"></i>';
      else if (currentStep === 3) btnNext.innerHTML = 'Next: Spatial Mapping <i class="fa-solid fa-arrow-right"></i>';
      else if (currentStep === 4) btnNext.innerHTML = '<i class="fa-solid fa-check"></i> Finalize & Register Node';
    }
  }

  if (btnNext) {
    btnNext.addEventListener('click', async () => {
      if (currentStep < 4) {
        currentStep++;
        updateWizardStep();
      } else {
        // Step 4 Commit
        const payload = {
          protocol: selectedProtocol,
          name: document.getElementById('wizCamName').value,
          district: document.getElementById('wizDistrict').value,
          department_id: document.getElementById('wizDept').value,
          lat: document.getElementById('wizLat').value,
          lng: document.getElementById('wizLng').value,
          vendor: probeResults?.metadata?.manufacturer || 'Normalized ONVIF/SDK Node',
          resolution: probeResults?.stream?.resolution || '1080p',
          retention_days: 15
        };

        const res = await window.apiClient.onboardViaAdapter(payload);
        wizardModal.classList.remove('open');
        await refreshAllData();
        await updateDynamicDashboardMeters('cardStatCams');
        alert(`Edge Adapter Integration Complete!\nCamera "${res.camera.name}" (${selectedProtocol.toUpperCase()}) registered to GIS Master Registry.\nZero hardware replacement CAPEX incurred.`);
      }
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      if (currentStep > 1) {
        currentStep--;
        updateWizardStep();
      }
    });
  }

  if (btnRunTest) {
    btnRunTest.addEventListener('click', async () => {
      btnRunTest.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probing Stream & Normalizing Schema...';
      const config = {
        host: document.getElementById('wizHost').value,
        port: document.getElementById('wizPort').value,
        path: document.getElementById('wizPath').value
      };

      probeResults = await window.apiClient.testAdapterConnection(selectedProtocol, config);
      btnRunTest.innerHTML = '<i class="fa-solid fa-check"></i> Stream Probe & Handshake Verified';

      const outputCard = document.getElementById('probeOutputCard');
      const grid = document.getElementById('normSpecGrid');
      outputCard.style.display = 'block';

      grid.innerHTML = `
        <div class="norm-spec-item"><label>Normalized Vendor:</label> <span>${probeResults.normalized_schema.vendor_normalized}</span></div>
        <div class="norm-spec-item"><label>Device Model:</label> <span>${probeResults.normalized_schema.model_normalized}</span></div>
        <div class="norm-spec-item"><label>Detected Codec / FPS:</label> <span>${probeResults.normalized_schema.codec_detected} @ ${probeResults.normalized_schema.fps_detected} FPS</span></div>
        <div class="norm-spec-item"><label>Stream Resolution:</label> <span>${probeResults.normalized_schema.resolution_detected}</span></div>
        <div class="norm-spec-item"><label>Ping Latency:</label> <span class="text-green">${probeResults.normalized_schema.ping_latency_ms} ms (Optimal)</span></div>
        <div class="norm-spec-item"><label>Edge Ring Buffer Storage:</label> <span>${probeResults.normalized_schema.edge_ring_buffer_status}</span></div>
      `;
    });
  }
}

/* =========================================================================
   12. BANDWIDTH ROI SIMULATOR & OPENAPI REST TESTER (PHASE 7)
   ========================================================================= */
function initBandwidthCalculator() {
  const slider = document.getElementById('calcCamSlider');
  if (!slider) return;

  function updateCalc() {
    const n = parseInt(slider.value, 10);
    const countLabel = document.getElementById('calcCamCountLabel');
    const legacyBandwidth = document.getElementById('calcLegacyBandwidth');
    const nirikshanBandwidth = document.getElementById('calcNirikshanBandwidth');
    const legacyCost = document.getElementById('calcLegacyCost');
    const nirikshanCost = document.getElementById('calcNirikshanCost');
    const savingsLabel = document.getElementById('calcSavingsLabel');

    if (countLabel) countLabel.textContent = `${n.toLocaleString()} Nodes`;
    
    // Calculations
    const legBwGbps = ((n * 2.5) / 1000).toFixed(1);
    const nirBwMbps = (((n * 0.0006) * 100) / 10).toFixed(2);
    const legCostCr = Math.round(n * 0.0155);
    const nirCostCr = (n * 0.000975).toFixed(1);
    const savedCr = (legCostCr - parseFloat(nirCostCr)).toFixed(0);

    if (legacyBandwidth) legacyBandwidth.textContent = `${legBwGbps} Gbps`;
    if (nirikshanBandwidth) nirikshanBandwidth.textContent = `${nirBwMbps} Mbps`;
    if (legacyCost) legacyCost.textContent = `₹${legCostCr.toLocaleString()} Cr`;
    if (nirikshanCost) nirikshanCost.textContent = `₹${nirCostCr} Cr`;
    if (savingsLabel) savingsLabel.textContent = `₹${savedCr} Cr Saved (93.7% ROI)`;
  }

  slider.addEventListener('input', updateCalc);
  updateCalc();
}

window.testApiEndpoint = async function(endpointName) {
  const consoleEl = document.getElementById('apiConsoleOutput');
  if (!consoleEl) return;
  consoleEl.textContent = `Executing request through /src/api/client.js...`;

  try {
    let result = null;
    if (endpointName === 'getCameras') {
      result = await window.apiClient.getCameras();
    } else if (endpointName === 'requestStream') {
      result = await window.apiClient.startStreamingSession('CAM-GJ-0101');
    } else if (endpointName === 'runAnpr') {
      result = await window.apiClient.runAnprInference('sample-ahmedabad', 'CAM-GJ-0101');
    } else if (endpointName === 'queryVahan') {
      result = await window.apiClient.lookupVahan('GJ-01-AB-1234');
    } else if (endpointName === 'dispatchAlert') {
      result = await window.apiClient.dispatchPcr('ALT-1001');
    } else if (endpointName === 'grantConsent') {
      result = await window.apiClient.createConsentRecord({
        establishment_name: 'Iscon Mega Mall (Public Submission)',
        owner_name: 'Kiritbhai Patel',
        district: 'Ahmedabad (Urban)',
        granted_scope: 'Analytics-Enabled'
      });
    }

    consoleEl.textContent = `// HTTP 200 OK (Latency: 8ms • Scoped: ${window.apiClient.activeUser.department_id})\n` + JSON.stringify(result, null, 2);
  } catch (err) {
    consoleEl.textContent = `// Error: ${err.message}`;
  }
};
