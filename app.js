/**
 * NIRIKSHAN PLATFORM MASTER APPLICATION CONTROLLER (app.js)
 * Interconnects all modules via window.apiClient
 */

let leafletMapInstance = null;
let leafletMarkers = [];

document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initPersonaSwitcher();
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

async function refreshAllData() {
  await renderGisNodes();
  await renderRegistryTable();
  await renderLiveWall();
  await renderAnalyticsTable();
  await renderAlerts();
  await renderAdminView();
}

/* =========================================================================
   3. VIEW NAVIGATION
   ========================================================================= */
function initNavigation() {
  const navBtns = document.querySelectorAll('.main-nav-btn');
  const views = document.querySelectorAll('.app-view');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const viewId = btn.getAttribute('data-view');
      navBtns.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      const targetView = document.getElementById(viewId);
      if (targetView) {
        targetView.classList.add('active');
        
        // If GIS Dashboard is opened, trigger Leaflet size recalculation
        if (viewId === 'view-dashboard' && leafletMapInstance) {
          setTimeout(() => leafletMapInstance.invalidateSize(), 150);
        }
      }
    });
  });
}

/*/* =========================================================================
   4. GIS DASHBOARD & LEAFLET MAP (MULTI-DEPT SPATIAL MATRIX)
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
      await renderGisNodes();
      await renderRegistryTable();
    });
  }

  // Tactical Dispatch Modal Close Handlers
  const modalTac = document.getElementById('tacticalDispatchModal');
  const closeTacBtn = document.getElementById('closeTacticalModal');
  const ackTacBtn = document.getElementById('btnAckTacticalModal');

  if (closeTacBtn && modalTac) closeTacBtn.addEventListener('click', () => modalTac.classList.remove('open'));
  if (ackTacBtn && modalTac) ackTacBtn.addEventListener('click', () => modalTac.classList.remove('open'));

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

async function renderGisNodes(dept = 'ALL', status = 'ALL', search = '') {
  const cameras = await window.apiClient.getCameras(dept, status, search);
  const nodesList = document.getElementById('gisNodesList');
  if (!nodesList) return;
  nodesList.innerHTML = '';

  // Clear existing map markers
  leafletMarkers.forEach(m => leafletMapInstance.removeLayer(m));
  leafletMarkers = [];

  cameras.forEach(cam => {
    // 1. Sidebar Card
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

    // 2. Leaflet Marker
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
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));

  const liveWallNav = document.querySelector('[data-view="view-livewall"]');
  const liveWallView = document.getElementById('view-livewall');
  if (liveWallNav) liveWallNav.classList.add('active');
  if (liveWallView) liveWallView.classList.add('active');

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
        <button class="action-btn" onclick="event.stopPropagation(); openCameraDetail('${cam.id}')" style="padding: 0.25rem 0.6rem; font-size: 0.72rem;">
          <i class="fa-solid fa-eye"></i> Details
        </button>
      </td>
    `;
    tr.addEventListener('click', () => openCameraDetail(cam.id));
    tbody.appendChild(tr);
  });
}

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

  gridBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
      gridBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      liveWallGridMode = btn.getAttribute('data-grid');
      wallGrid.className = `video-wall-grid grid-${liveWallGridMode}`;
      await renderLiveWall();
    });
  });

  if (btnStopAll) {
    btnStopAll.addEventListener('click', async () => {
      const active = await window.apiClient.getActiveStreamingSessions();
      for (const sess of active.sessions) {
        await window.apiClient.stopStreamingSession(sess.session_id);
      }
      await renderLiveWall();
      alert('All WAN stream sessions terminated. Bandwidth released.');
    });
  }

  // Tag Feed Modal Handlers
  initTagFeedModal();

  // Start Session Inactivity Countdown
  startSessionInactivityTimer();

  await renderLiveWall();
}

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

async function renderLiveWall() {
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
  
  // Ensure sessions started for initial display cameras
  for (let i = 0; i < Math.min(2, displayCams.length); i++) {
    await window.apiClient.startStreamingSession(displayCams[i].id);
  }

  const sessionData = await window.apiClient.getActiveStreamingSessions();
  if (activeCountEl) activeCountEl.textContent = `${sessionData.active_sessions_count} Active Streams`;
  if (wanLoadEl) wanLoadEl.textContent = `${sessionData.total_wan_bandwidth_mbps} Mbps`;

  wallGrid.innerHTML = '';

  displayCams.forEach((cam, idx) => {
    const isSessionActive = sessionData.sessions.some(s => s.camera_id === cam.id);
    const cell = document.createElement('div');
    cell.className = `wall-feed-cell ${!isSessionActive ? 'idle-mode' : ''}`;

    let overlayHtml = '';
    if (idx === 0 && isSessionActive) {
      overlayHtml = '<div class="anpr-overlay-tag">ANPR Hit: GJ-01-AB-1234 (VAHAN Alert)</div>';
    } else if (idx === 1 && isSessionActive) {
      overlayHtml = '<div class="anpr-overlay-tag" style="border-color: var(--accent-rose);">Face Match: Vikram K. (eGujCop Alert)</div>';
    }

    cell.innerHTML = `
      <div class="wall-feed-top">
        <span class="feed-title-badge" title="${cam.name}">${cam.id} &bull; ${cam.name.slice(0, 22)}...</span>
        <span class="feed-vendor-chip">${cam.vendor.split(' ')[0]} ${cam.resolution}</span>
        ${isSessionActive 
          ? `<span class="feed-live-indicator"><span class="dot-sm" style="background: var(--accent-rose);"></span> LIVE RELAY</span>`
          : `<span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">IDLE (0 Kbps)</span>`
        }
      </div>

      <div class="feed-center-sim">
        ${isSessionActive 
          ? `
            <i class="fa-solid fa-satellite-dish feed-stream-icon"></i>
            <span class="feed-stream-text">Active On-Demand WebRTC Relay</span>
            <span class="feed-stream-sub">${cam.vendor} &bull; 25 FPS &bull; ${cam.resolution}</span>
            ${overlayHtml}
          `
          : `
            <i class="fa-solid fa-video-slash" style="font-size: 2rem; color: var(--text-muted); margin-bottom: 0.4rem;"></i>
            <span style="font-size: 0.8rem; color: var(--text-secondary);">Stream Idle &bull; Bandwidth Preserved</span>
            <button class="action-btn primary" onclick="startCellSession('${cam.id}')" style="margin-top: 0.5rem; font-size: 0.72rem; padding: 0.25rem 0.6rem;">
              <i class="fa-solid fa-play"></i> Start On-Demand Pull
            </button>
          `
        }
      </div>

      <div class="wall-feed-bottom">
        <div class="feed-controls-group">
          ${isSessionActive ? `
            <button class="feed-ctrl-btn" onclick="captureFeedSnapshot('${cam.id}', '${cam.name}')" title="Capture Forensic Snapshot">
              <i class="fa-solid fa-camera"></i> Snapshot
            </button>
            <button class="feed-ctrl-btn" onclick="openTagFeedModal('${cam.id}', '${cam.name}')" title="Tag for Investigation">
              <i class="fa-solid fa-bookmark"></i> Tag
            </button>
            <button class="feed-ctrl-btn danger" onclick="stopCellSession('${cam.id}')" title="Terminate Session (Free Bandwidth)">
              <i class="fa-solid fa-stop"></i> Stop
            </button>
          ` : `
            <span style="font-size: 0.68rem; color: var(--text-muted); font-family: var(--font-mono);">Edge Buffer Ready (15 Days)</span>
          `}
        </div>
        <span class="feed-timer-chip">${isSessionActive ? 'Auto-Stop: 05:00' : 'Idle'}</span>
      </div>
    `;
    wallGrid.appendChild(cell);
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
  await window.apiClient.stopStreamingSession(camId);
  await renderLiveWall();
};

// Forensic Snapshot Capture
window.captureFeedSnapshot = function(camId, camName) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  alert(`Forensic Snapshot Captured!\nCamera: ${camId} (${camName})\nTimestamp: ${timestamp}\nHash: #SHA256-${Math.random().toString(16).substring(2, 12)}\nSaved to Local Investigation Cache.`);
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
  document.getElementById('tagModalCamId').value = camId;
  document.getElementById('tagModalCamName').value = `${camId} - ${camName}`;
  document.getElementById('tagFeedModal').classList.add('open');
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

  // Cross-Department Trajectory Reconstruction Lab
  initTrajectoryPursuitLab();

  // Clip Modal Handlers
  initClipModal();

  await renderAnalyticsTable();
}

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

      <div class="alert-card-footer">
        <div class="alert-node-info">
          <i class="fa-solid fa-location-dot"></i> ${alert.location} &bull; <i class="fa-solid fa-video"></i> ${alert.camera_id} &bull; <i class="fa-solid fa-clock"></i> ${new Date(alert.created_at || alert.ts || Date.now()).toLocaleTimeString('en-IN')} IST
        </div>

        <div style="display: flex; gap: 0.5rem;">
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
