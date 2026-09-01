/**
 * NIRIKSHAN UNIFIED API CLIENT (/src/api/client.js)
 * API-First Central Client for NIRIKSHAN Platform.
 * All frontend components call through this client.
 * Swapping from in-memory mock data to a live REST backend (e.g. FastAPI / NestJS)
 * requires modifying ONLY this file.
 */

// =========================================================================
// PHASE 2 — EDGE ADAPTER ABSTRACTION LAYER (L0)
// Universal protocol normalization per protocol (ONVIF, RTSP, Vendor SDK)
// =========================================================================

class BaseEdgeAdapter {
  constructor(protocol, config) {
    this.protocol = protocol;
    this.config = config;
  }
  async connect() { throw new Error('connect() not implemented'); }
  async getStreamUrl() { throw new Error('getStreamUrl() not implemented'); }
  async getHealth() { throw new Error('getHealth() not implemented'); }
  async getMetadata() { throw new Error('getMetadata() not implemented'); }
}

class MockONVIFAdapter extends BaseEdgeAdapter {
  async connect() {
    await new Promise(r => setTimeout(r, 450));
    return {
      status: 'connected',
      handshake: 'WS-Security UsernameToken OK',
      device_service: `http://${this.config.host || '192.168.1.100'}:${this.config.port || 80}/onvif/device_service`,
      profiles: ['Profile S (Streaming)', 'Profile G (Edge Storage)', 'Profile T (Analytics)']
    };
  }

  async getStreamUrl() {
    return {
      protocol: 'RTSP-over-HTTP',
      stream_url: `rtsp://${this.config.host || '192.168.1.100'}:554/onvif/media/h264/profile1`,
      webrtc_relay_url: `webrtc://edge-adapter.nirikshan.gov.in/live/${this.config.host || 'cam01'}`,
      resolution: '1920x1080',
      fps: 25,
      codec: 'H.264/AVC'
    };
  }

  async getHealth() {
    return {
      ping_ms: 18,
      packet_loss_pct: 0.0,
      uptime_hours: 384,
      ring_buffer_used_gb: 142.8,
      ring_buffer_total_gb: 512.0
    };
  }

  async getMetadata() {
    return {
      manufacturer: this.config.vendor || 'Hikvision Digital Technology',
      model: 'DS-2CD4A26FWD-IZS',
      firmware_version: 'V5.6.80_250815',
      mac_address: '44:19:B6:' + Math.floor(10 + Math.random()*89) + ':' + Math.floor(10 + Math.random()*89) + ':1A',
      fov_horizontal: 92,
      audio_channels: 1,
      anpr_capable: true
    };
  }
}

class MockRTSPAdapter extends BaseEdgeAdapter {
  async connect() {
    await new Promise(r => setTimeout(r, 350));
    return {
      status: 'connected',
      handshake: 'RTSP 1.0 200 OK (DESCRIBE / SETUP / PLAY)',
      rtp_transport: 'RTP/AVP/TCP (Interleaved)',
      active_channels: 1
    };
  }

  async getStreamUrl() {
    return {
      protocol: 'Native RTSP',
      stream_url: this.config.rtsp_url || 'rtsp://192.168.1.120:554/live/ch0',
      webrtc_relay_url: `webrtc://edge-adapter.nirikshan.gov.in/live/rtsp-${Math.floor(100 + Math.random()*900)}`,
      resolution: '1920x1080',
      fps: 30,
      codec: 'H.265/HEVC'
    };
  }

  async getHealth() {
    return {
      ping_ms: 22,
      packet_loss_pct: 0.1,
      uptime_hours: 192,
      ring_buffer_used_gb: 98.4,
      ring_buffer_total_gb: 256.0
    };
  }

  async getMetadata() {
    return {
      manufacturer: 'Generic RTSP IP Stream',
      model: 'Universal RTSP H.264/H.265 Node',
      firmware_version: 'RTSP-Relay-v2.4',
      mac_address: '00:1A:79:' + Math.floor(10 + Math.random()*89) + ':' + Math.floor(10 + Math.random()*89) + ':2B',
      fov_horizontal: 85,
      anpr_capable: false
    };
  }
}

class MockVendorSdkAdapter extends BaseEdgeAdapter {
  async connect() {
    await new Promise(r => setTimeout(r, 550));
    return {
      status: 'connected',
      handshake: 'Vendor NetSDK / ISAPI Session Established',
      dvr_nvr_channels: 16,
      storage_matrix: 'RAID-5 (16 TB Local Edge Array)'
    };
  }

  async getStreamUrl() {
    return {
      protocol: 'SDK Private Relay &rarr; WebRTC',
      stream_url: `sdk-stream://${this.config.host || '192.168.2.50'}:8000/ch1/main`,
      webrtc_relay_url: `webrtc://edge-adapter.nirikshan.gov.in/live/sdk-${Math.floor(100 + Math.random()*900)}`,
      resolution: '3840x2160 (4K UHD)',
      fps: 25,
      codec: 'H.265+'
    };
  }

  async getHealth() {
    return {
      ping_ms: 15,
      packet_loss_pct: 0.0,
      uptime_hours: 720,
      ring_buffer_used_gb: 3420.0,
      ring_buffer_total_gb: 8000.0
    };
  }

  async getMetadata() {
    return {
      manufacturer: 'Dahua Technology / NetSDK',
      model: 'DH-NVR5432-4KS2 Pro AI',
      firmware_version: 'V4.001.0000000.1.R',
      mac_address: 'E0:50:8B:' + Math.floor(10 + Math.random()*89) + ':' + Math.floor(10 + Math.random()*89) + ':3C',
      fov_horizontal: 110,
      anpr_capable: true
    };
  }
}

class NirikshanApiClient {
  constructor() {
    this.baseUrl = window.location.origin + '/api/v1';
    this.activeUser = {
      id: 'usr-001',
      name: 'Inspector V. R. Jadeja',
      department_id: 'dept-police',
      department_name: 'Gujarat State Police (Home Dept)',
      role: 'superadmin', // 'viewer' | 'operator' | 'admin' | 'superadmin'
      badge: 'GJ-POL-884'
    };

    this.initDatabase();
  }

  // --- MOCK DATABASE INITIALIZATION ---
  initDatabase() {
    // 1. Departments
    this.departments = [
      { id: 'dept-police', name: 'Gujarat State Police (Home Dept)', type: 'Law Enforcement', contact: 'controlroom@gujaratpolice.gov.in', camera_count: 28400, color: '#3b82f6' },
      { id: 'dept-rto', name: 'Road Transport Office (RTO)', type: 'Transport & Highways', contact: 'rto-enforcement@gujarat.gov.in', camera_count: 14200, color: '#f59e0b' },
      { id: 'dept-amc', name: 'Ahmedabad Municipal Corp (AMC)', type: 'Smart City / Urban Local Body', contact: 'smartcity@ahmedabadcity.gov.in', camera_count: 22500, color: '#10b981' },
      { id: 'dept-civil', name: 'Food & Civil Supplies Dept', type: 'Civil Warehousing', contact: 'fcs-director@gujarat.gov.in', camera_count: 6100, color: '#ec4899' },
      { id: 'dept-forest', name: 'State Forest & Wildlife Dept', type: 'Wildlife & Sanctuaries', contact: 'wildlife-grid@gujarat.gov.in', camera_count: 3800, color: '#84cc16' },
      { id: 'dept-private', name: 'Private & Commercial Opt-In Grid', type: 'Public-Private Partnership', contact: 'citizen-cctv-cell@gujarat.gov.in', camera_count: 8800, color: '#a855f7' }
    ];    // 2. All 33 Districts of Gujarat across 5 Administrative Zones (80,000+ Total Nodes Fleet)
    this.zones = [
      { id: 'zone-all', name: 'All Gujarat (33 Districts)', center: [22.8, 71.5], zoom: 7 },
      { id: 'zone-central', name: 'Central Gujarat (9 Districts)', center: [22.9, 73.0], zoom: 9 },
      { id: 'zone-north', name: 'North Gujarat (5 Districts)', center: [24.0, 72.4], zoom: 9 },
      { id: 'zone-saurashtra', name: 'Saurashtra (11 Districts)', center: [21.8, 70.8], zoom: 8 },
      { id: 'zone-south', name: 'South Gujarat (7 Districts)', center: [21.2, 73.2], zoom: 9 },
      { id: 'zone-kutch', name: 'Kutch & Border Zone (1 District)', center: [23.5, 70.0], zoom: 8 }
    ];

    this.districts = [
      // Central Gujarat (9 Districts)
      { id: 'dist-ahmedabad', name: 'Ahmedabad (Urban)', zone: 'Central Gujarat', total_cams: 22400, target_cams: 24000, density_per_sqkm: 68.4, coverage_score: 93.3, gap_status: 'Optimal', gap_cams_needed: 1600, lat: 23.0225, lng: 72.5714 },
      { id: 'dist-gandhinagar', name: 'Gandhinagar (Capital)', zone: 'Central Gujarat', total_cams: 6200, target_cams: 6500, density_per_sqkm: 42.1, coverage_score: 95.3, gap_status: 'Optimal', gap_cams_needed: 300, lat: 23.2156, lng: 72.6369 },
      { id: 'dist-vadodara', name: 'Vadodara', zone: 'Central Gujarat', total_cams: 8400, target_cams: 10000, density_per_sqkm: 35.8, coverage_score: 84.0, gap_status: 'Low Gap', gap_cams_needed: 1600, lat: 22.3072, lng: 73.1812 },
      { id: 'dist-anand', name: 'Anand (Milk City)', zone: 'Central Gujarat', total_cams: 3100, target_cams: 4200, density_per_sqkm: 18.2, coverage_score: 73.8, gap_status: 'Moderate Gap', gap_cams_needed: 1100, lat: 22.5645, lng: 72.9289 },
      { id: 'dist-kheda', name: 'Kheda (Nadiad)', zone: 'Central Gujarat', total_cams: 2800, target_cams: 3900, density_per_sqkm: 15.6, coverage_score: 71.7, gap_status: 'Moderate Gap', gap_cams_needed: 1100, lat: 22.6939, lng: 72.8615 },
      { id: 'dist-panchmahal', name: 'Panchmahal (Godhra)', zone: 'Central Gujarat', total_cams: 2400, target_cams: 3800, density_per_sqkm: 12.4, coverage_score: 63.1, gap_status: 'Moderate Gap', gap_cams_needed: 1400, lat: 22.7758, lng: 73.6149 },
      { id: 'dist-dahod', name: 'Dahod (Tribal Border)', zone: 'Central Gujarat', total_cams: 2900, target_cams: 9200, density_per_sqkm: 6.2, coverage_score: 31.5, gap_status: 'Critical Gap', gap_cams_needed: 6300, lat: 22.8360, lng: 74.2540 },
      { id: 'dist-mahisagar', name: 'Mahisagar (Lunawada)', zone: 'Central Gujarat', total_cams: 1600, target_cams: 3100, density_per_sqkm: 8.1, coverage_score: 51.6, gap_status: 'High Gap', gap_cams_needed: 1500, lat: 23.1311, lng: 73.6133 },
      { id: 'dist-chhotaupedur', name: 'Chhota Udepur', zone: 'Central Gujarat', total_cams: 1400, target_cams: 2900, density_per_sqkm: 7.2, coverage_score: 48.2, gap_status: 'High Gap', gap_cams_needed: 1500, lat: 22.3108, lng: 74.0116 },

      // North Gujarat (5 Districts)
      { id: 'dist-mehsana', name: 'Mehsana', zone: 'North Gujarat', total_cams: 4200, target_cams: 5500, density_per_sqkm: 21.0, coverage_score: 76.3, gap_status: 'Moderate Gap', gap_cams_needed: 1300, lat: 23.5880, lng: 72.3693 },
      { id: 'dist-patan', name: 'Patan (Heritage)', zone: 'North Gujarat', total_cams: 2100, target_cams: 3400, density_per_sqkm: 11.2, coverage_score: 61.7, gap_status: 'Moderate Gap', gap_cams_needed: 1300, lat: 23.8507, lng: 72.1266 },
      { id: 'dist-banaskantha', name: 'Banaskantha (Palanpur & Border)', zone: 'North Gujarat', total_cams: 3200, target_cams: 6800, density_per_sqkm: 9.4, coverage_score: 47.0, gap_status: 'High Gap', gap_cams_needed: 3600, lat: 24.1724, lng: 72.4346 },
      { id: 'dist-sabarkantha', name: 'Sabarkantha (Himmatnagar)', zone: 'North Gujarat', total_cams: 2300, target_cams: 3900, density_per_sqkm: 12.8, coverage_score: 58.9, gap_status: 'High Gap', gap_cams_needed: 1600, lat: 23.6000, lng: 72.9667 },
      { id: 'dist-aravalli', name: 'Aravalli (Modasa)', zone: 'North Gujarat', total_cams: 1500, target_cams: 2800, density_per_sqkm: 8.6, coverage_score: 53.5, gap_status: 'High Gap', gap_cams_needed: 1300, lat: 23.4627, lng: 73.3034 },

      // Saurashtra (11 Districts)
      { id: 'dist-rajkot', name: 'Rajkot (Hub)', zone: 'Saurashtra', total_cams: 7800, target_cams: 9200, density_per_sqkm: 38.4, coverage_score: 84.7, gap_status: 'Low Gap', gap_cams_needed: 1400, lat: 22.3039, lng: 70.8022 },
      { id: 'dist-jamnagar', name: 'Jamnagar (Refinery & Port)', zone: 'Saurashtra', total_cams: 4800, target_cams: 7500, density_per_sqkm: 18.2, coverage_score: 64.0, gap_status: 'Moderate Gap', gap_cams_needed: 2700, lat: 22.4707, lng: 70.0577 },
      { id: 'dist-dwarka', name: 'Devbhumi Dwarka', zone: 'Saurashtra', total_cams: 2400, target_cams: 5200, density_per_sqkm: 8.5, coverage_score: 46.1, gap_status: 'High Gap', gap_cams_needed: 2800, lat: 22.2376, lng: 68.9678 },
      { id: 'dist-junagadh', name: 'Junagadh (Girnar)', zone: 'Saurashtra', total_cams: 3600, target_cams: 5100, density_per_sqkm: 16.4, coverage_score: 70.5, gap_status: 'Moderate Gap', gap_cams_needed: 1500, lat: 21.5222, lng: 70.4579 },
      { id: 'dist-somnath', name: 'Gir Somnath (Temple & Coast)', zone: 'Saurashtra', total_cams: 2600, target_cams: 5400, density_per_sqkm: 11.0, coverage_score: 48.1, gap_status: 'High Gap', gap_cams_needed: 2800, lat: 20.9000, lng: 70.4000 },
      { id: 'dist-bhavnagar', name: 'Bhavnagar (Ports)', zone: 'Saurashtra', total_cams: 4400, target_cams: 6200, density_per_sqkm: 22.8, coverage_score: 70.9, gap_status: 'Moderate Gap', gap_cams_needed: 1800, lat: 21.7645, lng: 72.1519 },
      { id: 'dist-amreli', name: 'Amreli', zone: 'Saurashtra', total_cams: 2200, target_cams: 3900, density_per_sqkm: 10.4, coverage_score: 56.4, gap_status: 'High Gap', gap_cams_needed: 1700, lat: 21.6032, lng: 71.2221 },
      { id: 'dist-porbandar', name: 'Porbandar (Coast)', zone: 'Saurashtra', total_cams: 1900, target_cams: 3200, density_per_sqkm: 12.6, coverage_score: 59.3, gap_status: 'High Gap', gap_cams_needed: 1300, lat: 21.6417, lng: 69.6293 },
      { id: 'dist-surendranagar', name: 'Surendranagar (Gate of Saurashtra)', zone: 'Saurashtra', total_cams: 2900, target_cams: 4500, density_per_sqkm: 14.2, coverage_score: 64.4, gap_status: 'Moderate Gap', gap_cams_needed: 1600, lat: 22.7278, lng: 71.6372 },
      { id: 'dist-morbi', name: 'Morbi (Ceramic Hub)', zone: 'Saurashtra', total_cams: 3800, target_cams: 5200, density_per_sqkm: 26.5, coverage_score: 73.0, gap_status: 'Moderate Gap', gap_cams_needed: 1400, lat: 22.8120, lng: 70.8378 },
      { id: 'dist-botad', name: 'Botad (Gadhada & Salangpur)', zone: 'Saurashtra', total_cams: 1800, target_cams: 2900, density_per_sqkm: 11.5, coverage_score: 62.0, gap_status: 'Moderate Gap', gap_cams_needed: 1100, lat: 22.1704, lng: 71.6667 },

      // South Gujarat (7 Districts)
      { id: 'dist-surat', name: 'Surat (Diamond & Textile Metro)', zone: 'South Gujarat', total_cams: 14600, target_cams: 16000, density_per_sqkm: 62.1, coverage_score: 91.2, gap_status: 'Optimal', gap_cams_needed: 1400, lat: 21.1702, lng: 72.8311 },
      { id: 'dist-bharuch', name: 'Bharuch (Chemical & Port)', zone: 'South Gujarat', total_cams: 3800, target_cams: 5100, density_per_sqkm: 20.4, coverage_score: 74.5, gap_status: 'Moderate Gap', gap_cams_needed: 1300, lat: 21.7051, lng: 72.9959 },
      { id: 'dist-navsari', name: 'Navsari (Dandi)', zone: 'South Gujarat', total_cams: 2600, target_cams: 3700, density_per_sqkm: 18.0, coverage_score: 70.2, gap_status: 'Moderate Gap', gap_cams_needed: 1100, lat: 20.9500, lng: 72.9333 },
      { id: 'dist-valsad', name: 'Valsad (Border Corridor)', zone: 'South Gujarat', total_cams: 3800, target_cams: 6500, density_per_sqkm: 17.3, coverage_score: 58.4, gap_status: 'High Gap', gap_cams_needed: 2700, lat: 20.6100, lng: 72.9300 },
      { id: 'dist-tapi', name: 'Tapi (Vyara)', zone: 'South Gujarat', total_cams: 1600, target_cams: 2800, density_per_sqkm: 9.8, coverage_score: 57.1, gap_status: 'High Gap', gap_cams_needed: 1200, lat: 21.1118, lng: 73.3904 },
      { id: 'dist-narmada', name: 'Narmada (Statue of Unity)', zone: 'South Gujarat', total_cams: 2800, target_cams: 3500, density_per_sqkm: 22.4, coverage_score: 80.0, gap_status: 'Low Gap', gap_cams_needed: 700, lat: 21.8380, lng: 73.7191 },
      { id: 'dist-dang', name: 'Dang (Ahwa - Forest)', zone: 'South Gujarat', total_cams: 900, target_cams: 2200, density_per_sqkm: 4.8, coverage_score: 40.9, gap_status: 'Critical Gap', gap_cams_needed: 1300, lat: 20.7533, lng: 73.6871 },

      // Kutch Zone (1 District)
    ];

    // 3. Statewide Camera Inventory (Clean default - Zero old/dummy CCTV records)
    this.cameras = [];
    if (typeof localStorage !== 'undefined') {
      try { localStorage.removeItem('nirikshan_camera_inventory'); } catch(e) {}
    }

    // 4. Real-time Events (Clean queue)
    this.events = [];

    // 5. Real-time Critical Alerts (Clean queue)
    this.alerts = [];

    // 6. Consent Records (Clean queue)
    this.consentRecords = [];

    // 7. System Audit Trail (Clean log)
    this.auditLogs = [];

    // 9. CCTNS/NAFIS BIOMETRIC FACIAL WATCHLIST (Clean default)
    try {
      const savedFaces = (typeof localStorage !== 'undefined') ? localStorage.getItem('nirikshan_facial_watchlist') : null;
      if (savedFaces !== null) {
        this.facialWatchlist = JSON.parse(savedFaces);
      } else {
        this.facialWatchlist = [];
      }
    } catch (e) {
      this.facialWatchlist = [];
    }
  }

  // --- USER AUTH & RBAC SCOPING ---
  setUserRole(role, department_id = 'dept-police') {
    const dept = this.departments.find(d => d.id === department_id) || this.departments[0];
    this.activeUser = {
      id: `usr-${role}`,
      name: role === 'superadmin' ? 'State Command Director' : `${dept.name.split(' ')[0]} Operator`,
      department_id: dept.id,
      department_name: dept.name,
      role: role,
      badge: `GJ-${role.toUpperCase().slice(0, 3)}-991`
    };
    return this.activeUser;
  }

  getActiveUser() {
    return this.activeUser;
  }

  // Check if active user has permission to access department resource
  checkDepartmentAccess(targetDepartmentId) {
    if (this.activeUser.role === 'superadmin') return true;
    return this.activeUser.department_id === targetDepartmentId;
  }

  // Log an action to immutable audit trail
  logAudit(action, target) {
    const log = {
      id: `AUD-${Math.floor(1000 + Math.random() * 9000)}`,
      user: this.activeUser.name,
      role: this.activeUser.role,
      action: action,
      target: target,
      timestamp: new Date().toISOString(),
      ip: '10.24.' + Math.floor(10 + Math.random() * 90) + '.' + Math.floor(10 + Math.random() * 90)
    };
    this.auditLogs.unshift(log);
    return log;
  }

  // --- REGISTRY CRUD &  // --- PHASE 2 BACKEND CONTRACTS ---
  async testAdapterConnection(protocol, config) {
    this.logAudit('ADAPTER_TEST_CONNECTION', `${protocol.toUpperCase()}:${config.host || config.rtsp_url || 'node'}`);
    
    let adapter;
    if (protocol === 'onvif') adapter = new MockONVIFAdapter('onvif', config);
    else if (protocol === 'rtsp') adapter = new MockRTSPAdapter('rtsp', config);
    else adapter = new MockVendorSdkAdapter('sdk', config);

    const connection = await adapter.connect();
    const stream = await adapter.getStreamUrl();
    const health = await adapter.getHealth();
    const metadata = await adapter.getMetadata();

    return {
      status: 'success',
      protocol: protocol,
      connection,
      stream,
      health,
      metadata,
      normalized_schema: {
        vendor_normalized: metadata.manufacturer,
        model_normalized: metadata.model,
        resolution: stream.resolution,
        fps: stream.fps,
        codec: stream.codec,
        ping_latency_ms: health.ping_ms,
        edge_ring_buffer_status: `${health.ring_buffer_used_gb} GB / ${health.ring_buffer_total_gb} GB`
      }
    };
  }

  async onboardViaAdapter(payload) {
    const newCam = {
      id: payload.id || `CAM-GJ-${Math.floor(1000 + Math.random() * 9000)}`,
      district: payload.district || 'Ahmedabad (Urban)',
      department_id: payload.department_id || 'dept-police',
      name: payload.name,
      lat: parseFloat(payload.lat),
      lng: parseFloat(payload.lng),
      type: payload.protocol === 'rtsp' ? 'ip' : (payload.protocol === 'sdk' ? 'analog' : 'ip'),
      vendor: payload.vendor || 'Normalized Edge Adapter Node',
      status: 'online',
      storage_type: 'edge_nvr',
      retention_days: parseInt(payload.retention_days || 15, 10),
      onboarded_at: new Date().toISOString(),
      stream_url: payload.stream_url || `webrtc://edge-adapter.nirikshan.gov.in/live/${payload.id || 'live'}`,
      fov_angle: parseInt(payload.fov_angle || 90, 10),
      direction: payload.direction || 'Road View',
      resolution: payload.resolution || '1080p',
      health_history: [
        { time: '12:00', ping_ms: 18, status: 'online' }
      ]
    };

    this.cameras.push(newCam);
    try { localStorage.setItem('nirikshan_camera_inventory', JSON.stringify(this.cameras)); } catch(e){}
    this.logAudit('CAMERA_ONBOARD_VIA_ADAPTER', `${newCam.id} (${payload.protocol.toUpperCase()})`);
    return {
      status: 'registered',
      camera: newCam,
      gis_node: {
        id: newCam.id,
        lat: newCam.lat,
        lng: newCam.lng,
        status: newCam.status,
        district: newCam.district
      }
    };
  }

  // --- CONSENT & ADMIN ---
  async getConsentRecords() {
    return [...this.consentRecords];
  }

  async getDepartments() {
    return [...this.departments];
  }

  async getDistricts(zoneFilter = 'ALL') {
    const list = this.districts.map(d => {
      const dKeyword = d.name.split(' ')[0].toLowerCase().replace(/[^a-z]/g, '');
      const actualCount = this.cameras ? this.cameras.filter(c => {
        if (!c.district) return false;
        return c.district.toLowerCase().includes(dKeyword);
      }).length : 0;

      return {
        ...d,
        total_cams: actualCount,
        gap_cams_needed: Math.max(0, d.target_cams - actualCount),
        coverage_score: d.target_cams > 0 ? Number(((actualCount / d.target_cams) * 100).toFixed(1)) : 0,
        gap_status: actualCount >= d.target_cams ? 'Full Coverage' : (actualCount > 0 ? 'Partial Feeds' : 'Zero Feeds')
      };
    });

    if (zoneFilter === 'ALL') return list;
    return list.filter(d => d.zone === zoneFilter || d.id === zoneFilter);
  }

  async getGapAnalysis() {
    this.logAudit('GAP_ANALYSIS_REPORT_ACCESSED', 'Statewide 33 Districts Coverage Matrix');
    const dynamicDistricts = await this.getDistricts('ALL');
    const totalCams = dynamicDistricts.reduce((acc, d) => acc + d.total_cams, 0);
    const targetCams = dynamicDistricts.reduce((acc, d) => acc + d.target_cams, 0);
    return {
      total_state_cameras: totalCams,
      monitored_districts: dynamicDistricts.filter(d => d.total_cams > 0).length,
      average_coverage: targetCams > 0 ? ((totalCams / targetCams) * 100).toFixed(1) + '%' : '0%',
      critical_gap_districts: dynamicDistricts.filter(d => d.total_cams === 0),
      district_breakdown: dynamicDistricts,
      zones: this.zones
    };
  }

  // Retrieve Dynamic Specific Blind-Spot Locations & Required Camera Quantities
  async getDistrictBlindSpots(districtIdOrName) {
    const dist = this.districts.find(d => d.id === districtIdOrName || d.name.toLowerCase() === districtIdOrName.toLowerCase() || d.name.toLowerCase().includes(districtIdOrName.toLowerCase()));
    if (!dist) return [];

    if (!this.districtBlindSpots) {
      this.districtBlindSpots = {};
    }

    if (!this.districtBlindSpots[dist.id]) {
      // Initialize district specific blind spots based on real infrastructure & current gap
      this.districtBlindSpots[dist.id] = this._generateDistrictBlindSpots(dist);
    }

    // Ensure camera counts and remaining gaps stay dynamically aligned with dist.gap_cams_needed
    return this.districtBlindSpots[dist.id];
  }

  _generateDistrictBlindSpots(dist) {
    const dName = dist.name.split(' (')[0];
    const totalGap = dist.gap_cams_needed;
    
    // District-specific presets for Gujarat key districts
    const presets = {
      'dist-ahmedabad': [
        { id: 'spot-amd-1', name: 'SG Highway & SP Ring Road Interchange (Gota - Vaishnodevi Blind Curve)', category: 'Highway Interchange', share: 0.26, lat: 23.1147, lng: 72.5372, hardware: '4K ANPR + Dual Optical PTZ', radius: '850m Unmonitored', priority: 'CRITICAL' },
        { id: 'spot-amd-2', name: 'Narol - Vatva GIDC Industrial Chemical Corridor Chokepoint', category: 'Industrial Freight', share: 0.23, lat: 22.9734, lng: 72.5931, hardware: 'Thermal Infrared + Night-Dome', radius: '1.2 km Corridor', priority: 'HIGH' },
        { id: 'spot-amd-3', name: 'Sabarmati Riverfront Promenade Phase-2 (Subhash Bridge to Camp)', category: 'Waterfront / Dark Zone', share: 0.18, lat: 23.0588, lng: 72.5830, hardware: 'Panoramic 360° Optical Dome', radius: '600m Promenade', priority: 'HIGH' },
        { id: 'spot-amd-4', name: 'Kalupur Central Railway Station & Sarangpur Gateway Bus Arterial', category: 'Transit Hub', share: 0.20, lat: 23.0232, lng: 72.5995, hardware: 'High-Density Facial Recognition', radius: '450m Chokepoint', priority: 'CRITICAL' },
        { id: 'spot-amd-5', name: 'S.P. Ring Road Nikol - Odhav Cargo Bypass Exit', category: 'Bypass Arterial', share: 0.13, lat: 23.0385, lng: 72.6710, hardware: 'Multi-Lane ANPR Radar Sensor', radius: '900m Highway Entry', priority: 'MEDIUM' }
      ],
      'dist-surat': [
        { id: 'spot-srt-1', name: 'Varachha Diamond Bourse & Mini-Bazaar Underpass Intersection', category: 'Commercial Hub', share: 0.32, lat: 21.2185, lng: 72.8540, hardware: '4K Multi-Sensor Optical', radius: '550m Chokepoint', priority: 'CRITICAL' },
        { id: 'spot-srt-2', name: 'Hazira Industrial Port Expressway & Heavy Cargo Checkpost', category: 'Port & Highway', share: 0.28, lat: 21.1210, lng: 72.6750, hardware: 'Heavy Vehicle ANPR + Thermal', radius: '1.5 km Port Lane', priority: 'HIGH' },
        { id: 'spot-srt-3', name: 'Ring Road Millennium Textile Market Gate #4 Arterial', category: 'Transit & Commercial', share: 0.24, lat: 21.1890, lng: 72.8420, hardware: 'Facial Recognition Dome', radius: '400m Street', priority: 'HIGH' },
        { id: 'spot-srt-4', name: 'Dumas Coastal Road & Airport Blind Turn Junction', category: 'Coastal Corridor', share: 0.16, lat: 21.1340, lng: 72.7480, hardware: '360° PTZ SpeedDome', radius: '800m Dark Curve', priority: 'MEDIUM' }
      ],
      'dist-dahod': [
        { id: 'spot-dhd-1', name: 'NH-47 Interstate Border Toll Checkpost (MP-Gujarat Entry)', category: 'Interstate Border', share: 0.30, lat: 22.8400, lng: 74.2580, hardware: 'ANPR Bullet + Vehicle Scanner', radius: '2.0 km Checkpost', priority: 'CRITICAL' },
        { id: 'spot-dhd-2', name: 'Jhalod Tribal Forest Transit Bypass (Unmonitored Highway)', category: 'Forest Dark Corridor', share: 0.28, lat: 23.0900, lng: 74.1500, hardware: 'Solar-Powered Night Vision PTZ', radius: '3.5 km Forest Stretch', priority: 'CRITICAL' },
        { id: 'spot-dhd-3', name: 'Garbada - MP Border Secondary Infiltration Corridor', category: 'Border Arterial', share: 0.24, lat: 22.7100, lng: 74.3200, hardware: 'Wireless Optical Sentry', radius: '1.8 km Rural Pass', priority: 'HIGH' },
        { id: 'spot-dhd-4', name: 'Dahod Railway Junction Goods Yard & North Exit', category: 'Railway Freight', share: 0.18, lat: 22.8350, lng: 74.2480, hardware: 'Multi-Sensor Dome', radius: '650m Freight Yard', priority: 'HIGH' }
      ],
      'dist-banaskantha': [
        { id: 'spot-bk-1', name: 'Tharad - Rajasthan Interstate Border Corridor', category: 'Interstate Border', share: 0.35, lat: 24.3900, lng: 71.6200, hardware: 'Heavy Radar ANPR', radius: '2.5 km Border Line', priority: 'CRITICAL' },
        { id: 'spot-bk-2', name: 'Ambaji Pilgrimage Temple Hill Road & Ghat Corridor', category: 'Pilgrimage Transit', share: 0.26, lat: 24.3300, lng: 72.8500, hardware: 'Crowd Density Panoramic Dome', radius: '1.2 km Hill Pass', priority: 'HIGH' },
        { id: 'spot-bk-3', name: 'Palanpur Highway Bypass & Deesa Crossroad Chokepoint', category: 'Highway Intersection', share: 0.23, lat: 24.1700, lng: 72.4300, hardware: '4K SpeedDome PTZ', radius: '800m Intersection', priority: 'HIGH' },
        { id: 'spot-bk-4', name: 'Dantiwada Dam Reservoir Perimeter Dark Zone', category: 'Critical Infrastructure', share: 0.16, lat: 24.3200, lng: 72.3300, hardware: 'Thermal Perimeter Sensor', radius: '1.4 km Perimeter', priority: 'MEDIUM' }
      ],
      'dist-vadodara': [
        { id: 'spot-brd-1', name: 'Sayajigunj Station Circle & Alkapuri Underpass Chokepoint', category: 'Transit Hub', share: 0.32, lat: 22.3100, lng: 73.1800, hardware: 'Facial Recognition Optical', radius: '500m Hub', priority: 'HIGH' },
        { id: 'spot-brd-2', name: 'Makarpura GIDC Industrial Freight Checkpost', category: 'Industrial Freight', share: 0.28, lat: 22.2500, lng: 73.1900, hardware: 'ANPR Traffic Bullet', radius: '950m Estate', priority: 'HIGH' },
        { id: 'spot-brd-3', name: 'National Highway 48 Golden Chokdi Interchange', category: 'Highway Interchange', share: 0.25, lat: 22.3600, lng: 73.2300, hardware: '4K Dual Optical PTZ', radius: '1.1 km Interchange', priority: 'CRITICAL' },
        { id: 'spot-brd-4', name: 'Ajwa Road Outer Ring Road Blind Intersection', category: 'Urban Outskirts', share: 0.15, lat: 22.3050, lng: 73.2500, hardware: 'Wide-Angle Night Dome', radius: '650m Turn', priority: 'MEDIUM' }
      ],
      'dist-rajkot': [
        { id: 'spot-rjt-1', name: '150 Feet Ring Road Madhapar Crossroad', category: 'Highway Intersection', share: 0.34, lat: 22.3200, lng: 70.7800, hardware: 'ANPR Multi-Lane Radar', radius: '900m Circle', priority: 'CRITICAL' },
        { id: 'spot-rjt-2', name: 'Aji GIDC Industrial Goods Freight Exit', category: 'Industrial Freight', share: 0.28, lat: 22.2700, lng: 70.8300, hardware: 'Thermal + Bullet Optical', radius: '1.1 km GIDC Lane', priority: 'HIGH' },
        { id: 'spot-rjt-3', name: 'Kuvadva Road AIIMS Hospital Highway Corridor', category: 'Institutional Transit', share: 0.22, lat: 22.3400, lng: 70.8600, hardware: 'High-Res Optical PTZ', radius: '800m Highway', priority: 'HIGH' },
        { id: 'spot-rjt-4', name: 'Gondal Road City Gateway & Bypass', category: 'City Gateway', share: 0.16, lat: 22.2600, lng: 70.7900, hardware: '360° Dome Sensor', radius: '600m Chokepoint', priority: 'MEDIUM' }
      ]
    };

    const spotTemplates = presets[dist.id] || [
      { id: `spot-${dist.id}-1`, name: `${dName} National/State Highway Junction & Bypass`, category: 'Highway Intersection', share: 0.35, lat: (dist.lat || 22.5) + 0.025, lng: (dist.lng || 71.5) + 0.020, hardware: '4K ANPR + Dual Optical PTZ', radius: '1.1 km Highway', priority: 'CRITICAL' },
      { id: `spot-${dist.id}-2`, name: `${dName} Central Market & Transit Chokepoint`, category: 'Commercial & Transit', share: 0.28, lat: (dist.lat || 22.5) - 0.015, lng: (dist.lng || 71.5) - 0.015, hardware: 'Facial Recognition Optical Dome', radius: '550m Market', priority: 'HIGH' },
      { id: `spot-${dist.id}-3`, name: `${dName} Industrial GIDC / Freight Corridor`, category: 'Industrial Freight', share: 0.22, lat: (dist.lat || 22.5) + 0.035, lng: (dist.lng || 71.5) - 0.030, hardware: 'Thermal Long-Range Bullet', radius: '1.4 km GIDC', priority: 'HIGH' },
      { id: `spot-${dist.id}-4`, name: `${dName} Outer Perimeter Dark Zone & Entry Point`, category: 'Perimeter Checkpost', share: 0.15, lat: (dist.lat || 22.5) - 0.030, lng: (dist.lng || 71.5) + 0.035, hardware: '360° SpeedDome PTZ', radius: '850m Outskirts', priority: 'MEDIUM' }
    ];

    let allocated = 0;
    return spotTemplates.map((template, idx) => {
      let camsNeeded = Math.round(totalGap * template.share);
      if (idx === spotTemplates.length - 1) {
        camsNeeded = Math.max(0, totalGap - allocated);
      } else {
        allocated += camsNeeded;
      }
      return {
        ...template,
        district_id: dist.id,
        district_name: dist.name,
        target_cams: camsNeeded,
        installed_cams: 0,
        cams_needed: camsNeeded,
        est_cost_lakhs: parseFloat(((camsNeeded * 25000) / 100000).toFixed(1)),
        status: camsNeeded > 0 ? 'Pending Deployment' : 'Fully Covered'
      };
    });
  }

  // Fast-Track Deploy Cameras to a Specific Blind Spot Location
  async deployCamerasToBlindSpot(districtId, spotId, count = 100) {
    const dist = this.districts.find(d => d.id === districtId);
    if (!dist) return { status: 'error', message: 'District not found' };

    const spots = await this.getDistrictBlindSpots(districtId);
    const spot = spots.find(s => s.id === spotId);
    if (!spot) return { status: 'error', message: 'Blind spot location not found' };

    const actualDeploy = Math.min(count, spot.cams_needed);
    spot.installed_cams += actualDeploy;
    spot.cams_needed = Math.max(0, spot.target_cams - spot.installed_cams);
    spot.est_cost_lakhs = parseFloat(((spot.cams_needed * 25000) / 100000).toFixed(1));
    spot.status = spot.cams_needed === 0 ? 'Fully Covered' : 'Partially Installed';

    // Update District Totals Live
    dist.total_cams = Math.min(dist.target_cams, dist.total_cams + actualDeploy);
    dist.gap_cams_needed = Math.max(0, dist.target_cams - dist.total_cams);
    dist.coverage_score = Math.min(100, parseFloat(((dist.total_cams / dist.target_cams) * 100).toFixed(1)));
    dist.gap_status = dist.coverage_score >= 90 ? 'Optimal' : (dist.coverage_score >= 70 ? 'Moderate Gap' : (dist.coverage_score >= 50 ? 'High Gap' : 'Critical Gap'));

    // Register a sample master node into live registry
    const newCam = await this.createCamera({
      district: dist.name,
      department_id: this.activeUser.department_id,
      name: `${spot.name} - Node #01`,
      lat: spot.lat,
      lng: spot.lng,
      type: 'ip',
      vendor: spot.hardware,
      fov_angle: 120,
      direction: 'Intersection Panoramic'
    });

    this.logAudit('BLIND_SPOT_CAMERAS_DEPLOYED', `Deployed ${actualDeploy} cameras to ${spot.name} in ${dist.name}. Remaining gap: ${dist.gap_cams_needed}`);

    return {
      status: 'success',
      deployed_count: actualDeploy,
      spot,
      district: dist,
      new_camera: newCam
    };
  }

  // Add Custom User-Identified Blind Spot Location Dynamically
  async addCustomBlindSpot(districtId, spotData) {
    const dist = this.districts.find(d => d.id === districtId);
    if (!dist) return { status: 'error', message: 'District not found' };

    const spots = await this.getDistrictBlindSpots(districtId);
    const camsReq = parseInt(spotData.cams_needed || 100, 10);
    const newSpot = {
      id: `spot-custom-${Date.now()}`,
      district_id: dist.id,
      district_name: dist.name,
      name: spotData.name,
      category: spotData.category || 'Identified Blind Spot',
      lat: parseFloat(spotData.lat || dist.lat || 22.8),
      lng: parseFloat(spotData.lng || dist.lng || 71.5),
      hardware: spotData.hardware || '4K Optical ANPR + PTZ',
      radius: spotData.radius || '750m Unmonitored',
      priority: spotData.priority || 'HIGH',
      target_cams: camsReq,
      installed_cams: 0,
      cams_needed: camsReq,
      est_cost_lakhs: parseFloat(((camsReq * 25000) / 100000).toFixed(1)),
      status: 'Pending Deployment'
    };

    spots.push(newSpot);
    dist.target_cams += camsReq;
    dist.gap_cams_needed = Math.max(0, dist.target_cams - dist.total_cams);
    dist.coverage_score = Math.min(100, parseFloat(((dist.total_cams / dist.target_cams) * 100).toFixed(1)));
    dist.gap_status = dist.coverage_score >= 90 ? 'Optimal' : (dist.coverage_score >= 70 ? 'Moderate Gap' : (dist.coverage_score >= 50 ? 'High Gap' : 'Critical Gap'));

    this.logAudit('CUSTOM_BLIND_SPOT_REGISTERED', `${newSpot.name} (+${camsReq} cams) added to ${dist.name}`);
    return { status: 'success', spot: newSpot, district: dist };
  }

  async syncCamerasFromBackend() {
    try {
      const resp = await fetch('/api/cameras');
      if (resp.ok) {
        const data = await resp.json();
        if (data && Array.isArray(data.cameras)) {
          this.cameras = data.cameras;
          return this.cameras;
        }
      }
    } catch (e) {}
    return this.cameras;
  }

  async getCameras(filterDept = 'ALL', filterStatus = 'ALL', searchQuery = '', filterDistrict = 'ALL') {
    if (!this.cameras || this.cameras.length < 30) {
      await this.syncCamerasFromBackend();
    }
    let result = this.cameras;

    // RBAC scoping
    if (this.activeUser.role !== 'superadmin') {
      result = result.filter(c => c.department_id === this.activeUser.department_id);
    } else if (filterDept !== 'ALL') {
      result = result.filter(c => c.department_id === filterDept);
    }

    if (filterStatus !== 'ALL') {
      result = result.filter(c => c.status.toLowerCase() === filterStatus.toLowerCase());
    }

    if (filterDistrict !== 'ALL') {
      result = result.filter(c => c.district === filterDistrict);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(q) || 
        c.id.toLowerCase().includes(q) || 
        c.vendor.toLowerCase().includes(q) ||
        (c.district && c.district.toLowerCase().includes(q))
      );
    }

    return result;
  }

  async getCameraById(id) {
    const cam = this.cameras.find(c => c.id === id);
    if (cam) {
      this.logAudit('CAMERA_METADATA_READ', id);
    }
    return cam;
  }

  // =========================================================================
  // OPTICAL FOV RANGE & BLIND-SPOT GAP ANALYSIS ENGINE
  // =========================================================================
  async getCameraFovAnalysis(cameraId) {
    const cam = await this.getCameraById(cameraId) || (this.cameras && this.cameras.length > 0 ? this.cameras[0] : null);
    if (!cam) {
      return {
        camera_id: cameraId || 'N/A',
        camera_name: 'No Camera Selected',
        district: 'None',
        department_id: 'dept-police',
        lat: 23.0225,
        lng: 72.5714,
        optical_specs: {
          vendor_model: 'N/A',
          resolution: '1080p',
          fov_horizontal_degrees: 90,
          azimuth_heading_degrees: 0,
          direction_name: 'N/A',
          cardinal_heading: 'North',
          coverage_area_sqm: 0,
          dori_standards: { optical_range_meters: 0, recognition_range_meters: 0, identification_range_meters: 0 }
        },
        coverage_cone_polygon: [],
        blind_spot_analysis: {
          blind_spot_id: 'NONE',
          location_description: 'No active camera selected for blind spot diagnostics',
          uncovered_azimuth: '0°',
          uncovered_area_sqm: 0,
          risk_level: 'LOW',
          recommended_install_lat: 23.0225,
          recommended_install_lng: 72.5714,
          recommended_hardware: 'N/A',
          estimated_capex_inr: 0,
          blind_polygon: [],
          deficit_direction_cardinal: 'North',
          deficit_azimuth_degrees: 0
        },
        proposed_camera_specs: {
          install_lat: 23.0225,
          install_lng: 72.5714,
          heading_azimuth_degrees: 0,
          heading_direction_cardinal: 'North',
          fov_degrees: 90,
          range_meters: 0,
          coverage_cone_polygon: [],
          coverage_area_sqm: 0,
          solves_blind_spot: false
        }
      };
    }
    const lat = cam.lat;
    const lng = cam.lng;
    const fov = cam.fov_angle || 90;
    
    // Calculate heading azimuth based on camera direction
    let azimuth = 0; // 0 = North
    const dir = (cam.direction || '').toLowerCase();
    if (dir.includes('north')) azimuth = 0;
    else if (dir.includes('east')) azimuth = 90;
    else if (dir.includes('south')) azimuth = 180;
    else if (dir.includes('west')) azimuth = 270;
    else if (dir.includes('central') || dir.includes('junction')) azimuth = 45;
    else azimuth = (Math.abs(cam.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) * 37) % 360;

    const maxRangeMeters = cam.resolution === '4K' ? 280 : 180;
    const recognitionRangeMeters = Math.round(maxRangeMeters * 0.5);
    const identificationRangeMeters = Math.round(maxRangeMeters * 0.25);

    // Generate FOV Sector Polygon coordinates (Conical optical fan)
    const fovPoints = [[lat, lng]];
    const startAngle = azimuth - (fov / 2);
    const endAngle = azimuth + (fov / 2);
    const steps = 12;

    // Convert meters to approximate lat/lng delta (1 deg lat ~ 111,000m)
    const metersToDegLat = 1 / 111000;
    const metersToDegLng = 1 / (111000 * Math.cos(lat * (Math.PI / 180)));

    for (let i = 0; i <= steps; i++) {
      const angleDeg = startAngle + (i / steps) * (endAngle - startAngle);
      const angleRad = (angleDeg - 90) * (Math.PI / 180); // 0 deg is North
      const pLat = lat + Math.cos(angleRad) * maxRangeMeters * metersToDegLat;
      const pLng = lng + Math.sin(angleRad) * maxRangeMeters * metersToDegLng;
      fovPoints.push([pLat, pLng]);
    }
    fovPoints.push([lat, lng]);

    // Calculate Uncovered Blind Spot (Opposite / complementary sector)
    const blindAzimuth = (azimuth + 180) % 360;
    const blindDistanceMeters = maxRangeMeters * 0.9;
    const blindAngleRad = (blindAzimuth - 90) * (Math.PI / 180);
    const blindLat = lat + Math.cos(blindAngleRad) * blindDistanceMeters * metersToDegLat;
    const blindLng = lng + Math.sin(blindAngleRad) * blindDistanceMeters * metersToDegLng;

    const blindPoints = [[lat, lng]];
    const bStartAngle = blindAzimuth - 45;
    const bEndAngle = blindAzimuth + 45;
    for (let i = 0; i <= steps; i++) {
      const angleDeg = bStartAngle + (i / steps) * (bEndAngle - bStartAngle);
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const pLat = lat + Math.cos(angleRad) * blindDistanceMeters * metersToDegLat;
      const pLng = lng + Math.sin(angleRad) * blindDistanceMeters * metersToDegLng;
      blindPoints.push([pLat, pLng]);
    }
    blindPoints.push([lat, lng]);

    // Generate Proposed Camera FOV Sector Cone (Green Sector from new camera into blind area)
    const proposedConePoints = [[blindLat, blindLng]];
    const propFov = 90;
    const propStartAngle = blindAzimuth - (propFov / 2);
    const propEndAngle = blindAzimuth + (propFov / 2);
    const propRangeMeters = 110;
    for (let i = 0; i <= steps; i++) {
      const angleDeg = propStartAngle + (i / steps) * (propEndAngle - propStartAngle);
      const angleRad = (angleDeg - 90) * (Math.PI / 180);
      const pLat = blindLat + Math.cos(angleRad) * propRangeMeters * metersToDegLat;
      const pLng = blindLng + Math.sin(angleRad) * propRangeMeters * metersToDegLng;
      proposedConePoints.push([pLat, pLng]);
    }
    proposedConePoints.push([blindLat, blindLng]);

    function getHeadingCardinal(deg) {
      const d = (deg % 360 + 360) % 360;
      if (d >= 337.5 || d < 22.5) return 'North';
      if (d >= 22.5 && d < 67.5) return 'North-East';
      if (d >= 67.5 && d < 112.5) return 'East';
      if (d >= 112.5 && d < 157.5) return 'South-East';
      if (d >= 157.5 && d < 202.5) return 'South';
      if (d >= 202.5 && d < 247.5) return 'South-West';
      if (d >= 247.5 && d < 292.5) return 'West';
      return 'North-West';
    }

    const presentCardinal = getHeadingCardinal(azimuth);
    const blindCardinal = getHeadingCardinal(blindAzimuth);
    const presentCoveredArea = Math.round((Math.PI * Math.pow(maxRangeMeters, 2) * (fov / 360)));

    const blindSpotInfo = {
      blind_spot_id: `BLIND-GAP-${cam.id.replace('CAM-', '')}-01`,
      location_description: `Unmonitored Blind Zone: ${(cam.direction || 'Northbound').includes('North') ? 'South Approach Service Ingress' : 'Secondary Ingress & Underpass Corridor'}`,
      uncovered_azimuth: `${Math.round(bStartAngle)}° - ${Math.round(bEndAngle)}° (${blindCardinal})`,
      uncovered_area_sqm: Math.round((Math.PI * Math.pow(blindDistanceMeters, 2) * (90 / 360))),
      risk_level: 'HIGH_RISK_DEFICIT',
      recommended_install_lat: parseFloat(blindLat.toFixed(6)),
      recommended_install_lng: parseFloat(blindLng.toFixed(6)),
      recommended_hardware: cam.type === 'ip' ? '4K Ultra-Starlight ANPR + PTZ' : 'Hikvision DeepinView Bullet (IP)',
      estimated_capex_inr: 45000,
      blind_polygon: blindPoints,
      deficit_direction_cardinal: blindCardinal,
      deficit_azimuth_degrees: blindAzimuth
    };

    return {
      camera_id: cam.id,
      camera_name: cam.name,
      district: cam.district,
      department_id: cam.department_id,
      lat: cam.lat,
      lng: cam.lng,
      optical_specs: {
        vendor_model: cam.vendor,
        resolution: cam.resolution,
        fov_horizontal_degrees: fov,
        azimuth_heading_degrees: azimuth,
        direction_name: cam.direction || 'Road Optical Axis',
        cardinal_heading: presentCardinal,
        coverage_area_sqm: presentCoveredArea,
        dori_standards: {
          optical_range_meters: maxRangeMeters,
          recognition_range_meters: recognitionRangeMeters,
          identification_range_meters: identificationRangeMeters
        }
      },
      coverage_cone_polygon: fovPoints,
      blind_spot_analysis: blindSpotInfo,
      proposed_camera_specs: {
        install_lat: parseFloat(blindLat.toFixed(6)),
        install_lng: parseFloat(blindLng.toFixed(6)),
        heading_azimuth_degrees: blindAzimuth,
        heading_direction_cardinal: blindCardinal,
        fov_degrees: propFov,
        range_meters: propRangeMeters,
        coverage_cone_polygon: proposedConePoints,
        coverage_area_sqm: blindSpotInfo.uncovered_area_sqm,
        solves_blind_spot: true
      }
    };
  }

  async proposeCameraInstallation(proposalData) {
    const proposal = {
      proposal_id: `PROP-CCTV-${Math.floor(1000 + Math.random() * 9000)}`,
      parent_camera_id: proposalData.parent_camera_id || 'CAM-GJ-0101',
      blind_spot_id: proposalData.blind_spot_id,
      proposed_name: proposalData.proposed_name || `New Node: ${proposalData.location_description}`,
      district: proposalData.district || 'Ahmedabad (Urban)',
      department_id: proposalData.department_id || this.activeUser.department_id,
      lat: parseFloat(proposalData.recommended_install_lat),
      lng: parseFloat(proposalData.recommended_install_lng),
      hardware_recommended: proposalData.recommended_hardware,
      estimated_budget_inr: proposalData.estimated_capex_inr || 45000,
      priority: 'CRITICAL_BLIND_SPOT_ELIMINATION',
      status: 'APPROVED_AND_QUEUED',
      timestamp: new Date().toISOString()
    };

    // Auto-register proposed camera as an active planned node
    await this.createCamera({
      id: `CAM-PROP-${Math.floor(100 + Math.random() * 900)}`,
      district: proposal.district,
      department_id: proposal.department_id,
      name: proposal.proposed_name,
      lat: proposal.lat,
      lng: proposal.lng,
      type: 'ip',
      vendor: proposal.hardware_recommended,
      direction: 'Blind Spot Coverage Angle',
      fov_angle: 90,
      resolution: '4K',
      retention_days: 15
    });

    this.logAudit('CAMERA_INSTALLATION_PROPOSED', `${proposal.proposal_id} for Blind Spot ${proposal.blind_spot_id}`);
    return {
      status: 'success',
      message: 'New Camera Installation Proposed & Registered in State Infrastructure Pipeline!',
      proposal
    };
  }

  async createCamera(cameraData) {
    const newCam = {
      id: cameraData.id || `CAM-GJ-${Math.floor(1000 + Math.random() * 9000)}`,
      district: cameraData.district || 'Ahmedabad (Urban)',
      department_id: cameraData.department_id || this.activeUser.department_id,
      name: cameraData.name,
      lat: parseFloat(cameraData.lat),
      lng: parseFloat(cameraData.lng),
      type: cameraData.type || 'ip',
      vendor: cameraData.vendor || 'Generic ONVIF IP',
      status: 'online',
      storage_type: cameraData.storage_type || 'edge_nvr',
      retention_days: parseInt(cameraData.retention_days || 15, 10),
      onboarded_at: new Date().toISOString(),
      stream_url: cameraData.stream_url || `webrtc://edge-${Math.floor(100 + Math.random() * 900)}.nirikshan.gov.in/live/stream1`,
      fov_angle: parseInt(cameraData.fov_angle || 90, 10),
      direction: cameraData.direction || 'Road View',
      resolution: cameraData.resolution || '1080p',
      health_history: [
        { time: '06:00', ping_ms: 20, status: 'online' },
        { time: '12:00', ping_ms: 22, status: 'online' },
        { time: '17:30', ping_ms: 21, status: 'online' }
      ]
    };

    this.cameras.push(newCam);
    try { localStorage.setItem('nirikshan_camera_inventory', JSON.stringify(this.cameras)); } catch(e){}

    // Persist to Node Server CCTV Ingest API
    try {
      await fetch('/api/cameras', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCam)
      });
    } catch (e) {}

    // Dynamically update district camera totals and reduce gap
    const dist = this.districts.find(d => d.name === newCam.district || d.id === newCam.district || newCam.district.includes(d.name.split(' (')[0]));
    if (dist) {
      dist.total_cams = Math.min(dist.target_cams, dist.total_cams + 1);
      dist.gap_cams_needed = Math.max(0, dist.target_cams - dist.total_cams);
      dist.coverage_score = Math.min(100, parseFloat(((dist.total_cams / dist.target_cams) * 100).toFixed(1)));
      dist.gap_status = dist.coverage_score >= 90 ? 'Optimal' : (dist.coverage_score >= 70 ? 'Moderate Gap' : (dist.coverage_score >= 50 ? 'High Gap' : 'Critical Gap'));
    }

    this.logAudit('CAMERA_ONBOARD_CREATED', newCam.id);
    return newCam;
  }

  async uploadCctvData(payload) {
    try {
      const resp = await fetch('/api/upload-cctv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        const data = await resp.json();
        await this.syncCamerasFromBackend();
        return data;
      }
    } catch (e) {
      console.error('Failed to upload CCTV data to node API:', e);
    }
    return { status: 'error', message: 'Failed to upload to API node' };
  }

  async deleteCamera(id) {
    const idx = this.cameras.findIndex(c => c.id === id);
    if (idx !== -1) {
      const removed = this.cameras.splice(idx, 1)[0];
      try { localStorage.setItem('nirikshan_camera_inventory', JSON.stringify(this.cameras)); } catch(e){}
      const dist = this.districts.find(d => d.name === removed.district || d.id === removed.district);
      if (dist) {
        dist.total_cams = Math.max(0, dist.total_cams - 1);
        dist.gap_cams_needed = Math.max(0, dist.target_cams - dist.total_cams);
        dist.coverage_score = Math.min(100, parseFloat(((dist.total_cams / dist.target_cams) * 100).toFixed(1)));
        dist.gap_status = dist.coverage_score >= 90 ? 'Optimal' : (dist.coverage_score >= 70 ? 'Moderate Gap' : (dist.coverage_score >= 50 ? 'High Gap' : 'Critical Gap'));
      }
      this.logAudit('CAMERA_DECOMMISSIONED_DELETED', `${removed.id} (${removed.name})`);
      return { status: 'success', deleted: removed };
    }
    return { status: 'error', message: 'Camera not found' };
  }

  async clearAllCameras() {
    this.cameras = [];
    try { localStorage.setItem('nirikshan_camera_inventory', JSON.stringify([])); } catch(e){}
    try { await fetch('/api/cameras', { method: 'DELETE' }); } catch(e){}
    this.districts.forEach(dist => {
      dist.total_cams = 0;
      dist.gap_cams_needed = dist.target_cams;
      dist.coverage_score = 0;
      dist.gap_status = 'Critical Gap';
    });
    this.logAudit('CAMERA_INVENTORY_CLEARED', 'All camera nodes decommissioned');
    return { status: 'cleared', count: 0 };
  }

  async clearAllDummyData() {
    this.cameras = [];
    this.alerts = [];
    this.events = [];
    this.facialWatchlist = [];
    this.auditLogs = [];
    try {
      localStorage.removeItem('nirikshan_camera_inventory');
      localStorage.removeItem('nirikshan_facial_watchlist');
    } catch(e) {}
    this.districts.forEach(dist => {
      dist.total_cams = 0;
      dist.gap_cams_needed = dist.target_cams;
      dist.coverage_score = 0;
      dist.gap_status = 'Critical Gap';
    });
    return { status: 'cleared', message: 'All dummy data successfully removed. System ready for real feeds.' };
  }

  async syncRemoteCameras() {
    return { status: 'success', count: 0, cameras: [] };
  }

  async bulkImportCameras(csvRows) {
    const imported = [];
    csvRows.forEach(row => {
      if (!row.name || !row.lat || !row.lng) return;
      const cam = {
        id: row.id || `CAM-GJ-${Math.floor(1000 + Math.random() * 9000)}`,
        district: row.district || 'Ahmedabad (Urban)',
        department_id: row.department_id || 'dept-police',
        name: row.name,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        type: row.type || 'ip',
        vendor: row.vendor || 'Generic ONVIF IP',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: parseInt(row.retention_days || 15, 10),
        onboarded_at: new Date().toISOString(),
        stream_url: `webrtc://edge-${Math.floor(100 + Math.random() * 900)}.nirikshan.gov.in/live/stream1`,
        fov_angle: 90,
        direction: 'Road View',
        resolution: '1080p',
        health_history: [
          { time: '06:00', ping_ms: 20, status: 'online' },
          { time: '12:00', ping_ms: 22, status: 'online' },
          { time: '17:30', ping_ms: 21, status: 'online' }
        ]
      };
      this.cameras.push(cam);
      imported.push(cam);

      const dist = this.districts.find(d => d.name === cam.district || d.id === cam.district || (cam.district && cam.district.includes(d.name.split(' (')[0])));
      if (dist) {
        dist.total_cams = Math.min(dist.target_cams, dist.total_cams + 1);
        dist.gap_cams_needed = Math.max(0, dist.target_cams - dist.total_cams);
        dist.coverage_score = Math.min(100, parseFloat(((dist.total_cams / dist.target_cams) * 100).toFixed(1)));
        dist.gap_status = dist.coverage_score >= 90 ? 'Optimal' : (dist.coverage_score >= 70 ? 'Moderate Gap' : (dist.coverage_score >= 50 ? 'High Gap' : 'Critical Gap'));
      }
    });

    try { localStorage.setItem('nirikshan_camera_inventory', JSON.stringify(this.cameras)); } catch(e){}

    this.logAudit('CAMERA_BULK_IMPORT', `${imported.length} Cameras Ingested`);
    return {
      status: 'success',
      count: imported.length,
      imported: imported
    };
  }

  // =========================================================================
  // DYNAMIC FEED INGEST & CATALOGUE API (SENTINEL GRID CONTRACT)
  // Replaces hardcoded endpoints with live dynamic capability query
  // =========================================================================
  async getLiveStreamCatalogue() {
    this.logAudit('STREAM_INGEST_CATALOGUE_QUERIED', 'Sentinel Grid API /api/ingest');
    return {
      platform: 'NIRIKSHAN Sentinel Camera Grid',
      version: '2.4.0',
      total_nodes: this.cameras.length,
      transport_protocol: 'TCP',
      timing_mode: 'monotonic_pts_pos_msec',
      cameras: this.cameras.map((c, i) => ({
        id: c.id,
        stream_id: i + 1,
        name: c.name,
        district: c.district,
        department: this.getDepartmentName(c.department_id),
        codec: (c.resolution && c.resolution.includes('4K')) ? 'H.265/HEVC' : 'H.264/AVC',
        resolution: c.resolution || '1080p',
        fps: 25,
        live_status: c.status,
        rtsp: `rtsp://stream-gateway.nirikshan.gov.in:8554/stream/${i + 1}`,
        rtsp_transport: 'tcp',
        webrtc_whep: `http://stream-gateway.nirikshan.gov.in:8889/stream/${i + 1}/whep`,
        hls: `http://stream-gateway.nirikshan.gov.in/live/stream/${i + 1}`
      }))
    };
  }

  // =========================================================================
  // PHASE 3 — UNIFIED VIEWING PLATFORM (MODEL 2 - SESSION-BASED STREAMING)
  // Bandwidth Discipline: Sessions auto-expire on inactivity
  // =========================================================================
  async startStreamingSession(cameraId) {
    const cam = await this.getCameraById(cameraId);
    if (!cam) throw new Error(`Camera ${cameraId} not found`);

    // Check if session already active
    if (!this.activeStreamingSessions) this.activeStreamingSessions = new Map();

    const existing = this.activeStreamingSessions.get(cameraId);
    if (existing && existing.status === 'active') {
      existing.last_ping = Date.now();
      existing.expires_in_seconds = 300; // Reset 5-min inactivity countdown
      return existing;
    }

    const sessionId = `SES-${Math.floor(10000 + Math.random() * 90000)}`;
    const session = {
      session_id: sessionId,
      camera_id: cam.id,
      camera_name: cam.name,
      district: cam.district || 'Ahmedabad (Urban)',
      department_id: cam.department_id,
      vendor: cam.vendor,
      protocol: cam.type === 'ip' ? 'WebRTC (Low-Latency)' : 'HLS Adaptive Relay',
      stream_url: `webrtc://stream-relay.nirikshan.gov.in/live/${cam.id}`,
      hls_url: `https://relay.nirikshan.gov.in/hls/${cam.id}`,
      resolution: cam.resolution || '1080p',
      fps: 25,
      bitrate_mbps: cam.resolution === '4K' ? 1.1 : 0.55,
      status: 'active',
      started_at: new Date().toISOString(),
      expires_in_seconds: 300, // 5 min auto-stop for bandwidth discipline
      last_ping: Date.now()
    };

    this.activeStreamingSessions.set(cameraId, session);
    this.logAudit('STREAMING_SESSION_START', `${sessionId} (${cam.id} &bull; ${cam.vendor})`);
    return session;
  }

  async stopStreamingSession(sessionId) {
    if (!this.activeStreamingSessions) return { status: 'stopped' };

    for (let [camId, sess] of this.activeStreamingSessions.entries()) {
      if (sess.session_id === sessionId || sess.camera_id === sessionId) {
        sess.status = 'terminated';
        this.activeStreamingSessions.delete(camId);
        this.logAudit('STREAMING_SESSION_STOP', `${sess.session_id} (${camId}) - Bandwidth Released`);
        return { status: 'stopped', session_id: sessionId, camera_id: camId };
      }
    }
    return { status: 'not_found' };
  }

  async getActiveStreamingSessions() {
    if (!this.activeStreamingSessions) this.activeStreamingSessions = new Map();
    const list = Array.from(this.activeStreamingSessions.values()).filter(s => s.status === 'active');
    const totalBandwidthMbps = list.reduce((acc, s) => acc + s.bitrate_mbps, 0);

    return {
      active_sessions_count: list.length,
      total_wan_bandwidth_mbps: totalBandwidthMbps.toFixed(2),
      sessions: list
    };
  }

  async tagFeedForReview(cameraId, reviewNote, tagType = 'manual_review') {
    const cam = await this.getCameraById(cameraId);
    const newEvent = {
      id: `EVT-${Math.floor(90000 + Math.random() * 9000)}`,
      camera_id: cameraId,
      camera_name: cam ? cam.name : 'Target Feed',
      type: 'manual',
      payload_json: {
        tag_type: tagType,
        reviewer: this.activeUser.name,
        badge: this.activeUser.badge,
        note: reviewNote,
        snapshot_hash: '0x' + Math.random().toString(16).substring(2, 18),
        timestamp: new Date().toISOString()
      },
      ts: new Date().toISOString()
    };

    this.events.unshift(newEvent);
    this.logAudit('FEED_TAGGED_FOR_REVIEW', `${cameraId}: ${reviewNote.slice(0, 30)}...`);
    return newEvent;
  }

  // --- STREAMING (Legacy fallback) ---
  async requestOnDemandStream(cameraId) {
    return this.startStreamingSession(cameraId);
  }

  // =========================================================================
  // PHASE 4 — SURVEILLANCE TELEMETRY & EVENT PIPELINE
  // Multi-Modal Vision Indexing and Camera-Wise Filtering
  // =========================================================================
  async runAnprInference(inputData = {}, cameraId = '') {
    const cam = await this.getCameraById(cameraId);
    const eventId = `EVT-${Math.floor(10000 + Math.random() * 90000)}`;
    const plate = (typeof inputData === 'string' ? inputData : (inputData.plate || '')).trim().toUpperCase() || 'SCAN-ACTIVE';

    const eventRecord = {
      id: eventId,
      camera_id: cam ? cam.id : (cameraId || 'ACTIVE_NODE'),
      camera_name: cam ? cam.name : 'Connected Camera Feed',
      district: cam ? cam.district : 'Gujarat',
      type: 'anpr',
      payload_json: {
        plate: plate,
        vehicle: 'Motor Vehicle',
        speed_kmph: 55,
        vahan_status: 'CLEAR',
        clip_timestamp: new Date().toISOString()
      },
      ts: new Date().toISOString()
    };

    this.events.unshift(eventRecord);
    return {
      status: 'success',
      event: eventRecord,
      anpr_result: {
        plate_number: plate,
        confidence: 98.5,
        vahan_alert: 'CLEAR'
      }
    };
  }

  async getEvents(filters = {}) {
    let result = this.events || [];

    // Camera ID filter
    if (filters.camera_id && filters.camera_id !== 'ALL') {
      result = result.filter(e => e.camera_id === filters.camera_id);
    }

    // Event Type filter (flexible matching for anpr, face, crowd/loitering, manual)
    if (filters.type && filters.type !== 'ALL') {
      const ft = filters.type.toLowerCase().trim();
      result = result.filter(e => {
        const et = (e.type || '').toLowerCase();
        if (et === ft) return true;
        if (ft === 'face' && (et.includes('face') || et.includes('match'))) return true;
        if (ft === 'crowd' && (et.includes('crowd') || et.includes('loiter'))) return true;
        if (ft === 'anpr' && et.includes('anpr')) return true;
        return et.startsWith(ft);
      });
    }

    // Plate number or search query filter
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(e => {
        const payloadStr = JSON.stringify(e.payload_json || {}).toLowerCase();
        return (
          ((e.id || '').toLowerCase().includes(q)) ||
          ((e.camera_id || '').toLowerCase().includes(q)) ||
          ((e.camera_name || '').toLowerCase().includes(q)) ||
          ((e.type || '').toLowerCase().includes(q)) ||
          payloadStr.includes(q)
        );
      });
    }

    // Plate specific filter
    if (filters.plate_number && filters.plate_number.trim()) {
      const p = filters.plate_number.toLowerCase().trim();
      result = result.filter(e => {
        const pl = e.payload_json?.plate || e.payload_json?.plate_number || '';
        return pl.toLowerCase().includes(p);
      });
    }

    // Date range filtering
    if (filters.date_from) {
      const fromDate = new Date(filters.date_from).getTime();
      result = result.filter(e => new Date(e.ts).getTime() >= fromDate);
    }
    if (filters.date_to) {
      const toDate = new Date(filters.date_to).getTime();
      result = result.filter(e => new Date(e.ts).getTime() <= toDate);
    }

    return result;
  }

  async getAnprEvents(filters = {}) {
    return this.getEvents({ ...filters, type: 'anpr' });
  }

  async getEventById(id) {
    const evt = this.events.find(e => e.id === id);
    if (evt) {
      this.logAudit('EVENT_RECORD_ACCESSED', id);
    }
    return evt;
  }

  // --- INTEGRATION GATEWAY SIMULATION ---
  async queryNationalGateway(dbSource, queryParam) {
    this.logAudit('INTEGRATION_GATEWAY_QUERY', `${dbSource.toUpperCase()}:${queryParam}`);

    // Simulated zero-latency response from NIC Gateway
    await new Promise(r => setTimeout(r, 400));

    if (dbSource === 'vahan') {
      const cleanPlate = (queryParam || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

      // Parse RTO district dynamically from plate prefix
      const rtoCode = cleanPlate.substring(0, 4);
      const rtoMap = {
        'GJ01': 'Ahmedabad Urban RTO', 'GJ27': 'Ahmedabad East RTO',
        'GJ02': 'Mehsana RTO', 'GJ03': 'Rajkot RTO',
        'GJ04': 'Bhavnagar RTO', 'GJ05': 'Surat RTO',
        'GJ06': 'Vadodara RTO', 'GJ18': 'Gandhinagar RTO',
        'GJ07': 'Kheda (Nadiad) RTO', 'GJ08': 'Banaskantha RTO',
        'GJ09': 'Sabarkantha RTO', 'GJ10': 'Jamnagar RTO',
        'GJ11': 'Junagadh RTO', 'GJ12': 'Kutch (Bhuj) RTO'
      };
      const issuingRto = rtoMap[rtoCode] || 'Gujarat Motor Vehicles Dept (National Registry)';

      // Dynamically hash plate to generate deterministic chassis/engine numbers
      let hash = 0;
      for (let i = 0; i < cleanPlate.length; i++) hash = ((hash << 5) - hash) + cleanPlate.charCodeAt(i);
      const absHash = Math.abs(hash);
      const chassisNo = `MA3TC${absHash.toString().padStart(8, '0').slice(-8)}98`;
      const engineNo = `K12M${(absHash * 7).toString().padStart(6, '0').slice(-6)}`;

      return {
        source: 'VAHAN 4.0 National Vehicle Registry',
        reg_number: queryParam.toUpperCase(),
        issuing_rto: issuingRto,
        owner_name: 'Verified Registered Owner',
        chassis: chassisNo,
        engine: engineNo,
        fitness_valid_upto: '2028-10-31',
        insurance_status: 'Active (National Insurance Co.)',
        is_stolen: false,
        stolen_fir_no: null,
        crime_record: 'No Adverse Police Flag'
      };
    } else if (dbSource === 'egujcop') {
      return {
        source: 'eGujCop / CCTNS Criminal Gallery',
        matched_id: queryParam,
        subject_name: 'Vikram K. (Alias Vicky)',
        active_warrants: 2,
        fir_history: ['FIR 104/2025 Sec 302 IPC', 'FIR 55/2024 Arms Act'],
        status: 'FLAGGED - RED NOTICE',
        last_known_station: 'Ahmedabad Crime Branch'
      };
    } else if (dbSource === 'nafis') {
      return {
        source: 'NAFIS National Automated Fingerprint & Face Index',
        biometric_score: '96.4%',
        record_id: 'NAFIS-IN-2026-98124',
        person_name: 'Aryan M. (Missing Child)',
        missing_since: '2026-08-14',
        registered_station: 'Vadodara Central Police Station'
      };
    }

    return { error: 'Unknown database connector' };
  }



  // =========================================================================
  // MULTI-DEPARTMENT TRAJECTORY RECONSTRUCTION
  // =========================================================================
  async reconstructVehicleTrajectory(plateNumber, originCameraId = null) {
    return null;
  }

  async dispatchForwardInterception(plateNumber, targetLocation) {
    const cleanPlate = (plateNumber || '').replace(/\s+/g, '').toUpperCase() || 'GJ-01-AB-1234';
    const loc = targetLocation || 'Forest Dept Sanctuary North Inter-State Corridor';
    const orderId = `ORD-INT-${Math.floor(1000 + Math.random() * 9000)}`;

    this.logAudit('FORWARD_INTERCEPT_ORDER_ISSUED', `Plate: ${cleanPlate} -> Target: ${loc}`);

    // Create and push real-time alert to Kafka Bus
    const newAlert = {
      id: `ALT-INT-${Math.floor(2000 + Math.random() * 8000)}`,
      timestamp: new Date().toISOString(),
      time_display: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST',
      title: `URGENT ROADBLOCK ARMED: ${cleanPlate}`,
      severity: 'CRITICAL',
      department_id: 'dept-police',
      department_name: 'Gujarat State Police & Highway Patrol',
      target_location: loc,
      target_plate: cleanPlate,
      kafka_topic: 'gujarat.police.intercept.roadblock',
      message: `🚨 IMMEDIATE INTERCEPT ORDER: Vehicle ${cleanPlate} approaching ${loc} at 92 km/h. Hydraulic barrier active. Intercept vehicle.`,
      status: 'ESCALATED_DISPATCHED',
      pcr_assigned: 'Highway Flying Squad #11 & Border Toll Police Unit'
    };

    this.publishAlertToBus(newAlert);

    return {
      status: 'ORDER_TRANSMITTED',
      intercept_order_id: orderId,
      target_vehicle: cleanPlate,
      intercept_checkpoint: loc,
      assigned_station: 'Mehsana District Highway Police Station & Toll Checkpost #03',
      alerted_authority: 'Gujarat State Police Highway Intercept Command & Local Flying Squads',
      broadcast_channel: 'TETRA Radio Tactical Channel #08 (Sub-GHz Emergency Grid)',
      units_deployed: [
        { unit: 'PCR Interceptor #11', eta: '2.1 Mins', distance: '1.4 km', officer: 'Inspector K. L. Barot' },
        { unit: 'Toll Barrier Squad #02', eta: '0.5 Mins', distance: 'At Checkpost', officer: 'Sub-Inspector R. Solanki' },
        { unit: 'RTO Mobile Flying Squad', eta: '3.4 Mins', distance: '2.8 km', officer: 'Motor Vehicle Inspector V. Joshi' }
      ],
      automated_barrier_command: 'HYDRAULIC_BARRIER_RAISED_AND_SPIKE_STRIPS_ARMED',
      dispatch_timestamp: new Date().toISOString(),
      time_display: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) + ' IST',
      authorized_officer: this.activeUser.name,
      message: `PRIORITY ALERT BROADCAST: Nearest authorities alerted at ${loc}. Roadblock armed and 3 patrol units deployed to catch vehicle ${cleanPlate}.`
    };
  }

  // 1. VAHAN 4.0 Vehicle Lookup (POST /api/integration/vahan/lookup)
  async lookupVahan(plateNumber) {
    this.logAudit('INTEGRATION_GATEWAY_VAHAN_QUERY', plateNumber);
    const cleanPlate = (plateNumber || '').replace(/\s+/g, '').toUpperCase();
    if (!cleanPlate) return { status: 'not_found', message: 'No registration number provided' };



    return {
      status: 'found',
      source: 'VAHAN 4.0 National Vehicle Registry',
      data: {
        plate: cleanPlate,
        registered_owner: 'Registered Citizen / Fleet Operator',
        vehicle_make_model: 'Commercial / Private Vehicle',
        fuel_type: 'PETROL / BS-VI',
        registration_date: '2023-05-18',
        rto_office: `${cleanPlate.substring(0, 5)} Regional Transport Office`,
        chassis_no: 'MAT' + cleanPlate.replace(/[^A-Z0-9]/g, '') + '88920',
        status: 'VERIFIED_ACTIVE',
        fir_no: null
      }
    };
  }

  // 2. eGujCop & CCTNS Crime Registry (POST /api/integration/egujcop/lookup)
  async lookupEGujCop(query) {
    this.logAudit('INTEGRATION_GATEWAY_EGUJCOP_QUERY', query);
    const q = (query || '').toLowerCase();

    const egujcopDatabase = [
      {
        cctns_id: 'CCTNS-GJ-2025-00918',
        name: 'Vikram K. Rathod',
        alias: 'Vicky',
        status: 'FLAGGED_RECORD',
        warrant_type: 'Non-Bailable Warrant (NBW)',
        issuing_court: 'Sessions Court, Ahmedabad City',
        fir_reference: 'FIR-2025-CR-1102 (Satellite PS)',
        charges: 'IPC 307, IPC 392',
        reward_inr: 50000,
        interpol_red_notice: false,
        facial_embedding_id: 'EMB-FACE-GJ-88412'
      },
      {
        cctns_id: 'CCTNS-GJ-2024-04182',
        name: 'Haresh B. Solanki',
        alias: 'Harry',
        status: 'PROCLAIMED_RECORD',
        warrant_type: 'Warrant (Inter-State)',
        issuing_court: 'Chief Judicial Magistrate, Dahod',
        fir_reference: 'FIR-2024-CR-0891 (Dahod Town PS)',
        charges: 'Essential Commodities Act Section 7',
        reward_inr: 25000
      }
    ];

    const match = egujcopDatabase.find(p => 
      p.name.toLowerCase().includes(q) || 
      p.cctns_id.toLowerCase().includes(q) ||
      p.alias.toLowerCase().includes(q)
    );

    if (match) {
      return { status: 'hit', source: 'eGujCop / CCTNS State Criminal Registry', data: match };
    }

    return {
      status: 'no_match',
      source: 'eGujCop / CCTNS State Criminal Registry',
      query: query,
      message: 'No active warrants or wanted person record found in State CCTNS database.'
    };
  }

  // 3. SARTHI Driving License Registry
  async lookupSarthi(dlNumber) {
    this.logAudit('INTEGRATION_GATEWAY_SARTHI_QUERY', dlNumber);
    return {
      status: 'found',
      source: 'SARTHI 4.0 National DL Registry',
      data: {
        dl_number: dlNumber || 'GJ01 20180019281',
        holder_name: 'Vikram K. Rathod',
        validity: '2038-08-14',
        blood_group: 'B+ve',
        license_category: 'MCWG / LMV-NT',
        issuing_authority: 'RTO Ahmedabad'
      }
    };
  }

  // 4. AFIS / NAFIS Biometric Database
  async lookupNafis(biometricId) {
    this.logAudit('INTEGRATION_GATEWAY_NAFIS_QUERY', biometricId);
    return {
      status: 'found',
      source: 'NAFIS National Automated Fingerprint & Face Index',
      data: {
        nafis_id: biometricId || 'NAFIS-IN-2026-99018',
        subject_name: 'Vikram K. Rathod',
        fingerprint_match_score: 98.6,
        facial_match_score: 94.6,
        first_conviction_year: 2019,
        last_recorded_district: 'Ahmedabad (Urban)'
      }
    };
  }

  // 5. Alert Bus & Kafka Routing (POST /api/alerts/:id/acknowledge, GET /api/alerts)
  async getAlerts(severityFilter = 'ALL', deptFilter = 'ALL') {
    try {
      const res = await fetch('/api/alerts');
      if (res.ok) {
        const backendAlerts = await res.json();
        if (Array.isArray(backendAlerts) && backendAlerts.length > 0) {
          backendAlerts.forEach(ba => {
            if (!this.alerts.some(a => a.id === ba.id)) {
              this.alerts.unshift(ba);
              if (this.alertSubscriber) {
                try { this.alertSubscriber(ba); } catch(e){}
              }
            }
          });
        }
      }
    } catch(e) {}

    let list = this.alerts;
    if (severityFilter !== 'ALL') {
      list = list.filter(a => a.severity === severityFilter);
    }
    if (deptFilter !== 'ALL') {
      list = list.filter(a => a.target_department === deptFilter || a.target_department === 'ALL');
    }
    return list;
  }

  async triggerAutoCctvScan(cameraId = 'cam01') {
    try {
      const res = await fetch(`/api/cctv/auto-scan?camera_id=${cameraId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.alert && !this.alerts.some(a => a.id === data.alert.id)) {
          this.alerts.unshift(data.alert);
          if (this.alertSubscriber) {
            try { this.alertSubscriber(data.alert); } catch(e){}
          }
        }
        return data;
      }
    } catch(e) {}
    return { status: 'error' };
  }


  async acknowledgeAlert(alertId) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'acknowledged';
      alert.acknowledged_by = this.activeUser.name;
      alert.acknowledged_at = new Date().toISOString();
      this.logAudit('ALERT_ACKNOWLEDGED', `${alertId} by ${this.activeUser.name}`);
    }
    return alert;
  }

  async dispatchPcr(alertId) {
    let alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      alert = this.alerts.find(a => a.status === 'active') || this.alerts[0];
    }
    if (alert) {
      alert.status = 'dispatched';
      alert.pcr_unit = alert.pcr_unit || ('PCR Interceptor Falcon #' + Math.floor(10 + Math.random() * 89));
      alert.dispatched_at = new Date().toISOString();
      this.logAudit('ALERT_PCR_DISPATCHED', `${alert.id} -> ${alert.pcr_unit}`);
      return alert;
    }
    return {
      id: alertId || 'ALT-DISP',
      pcr_unit: 'PCR Interceptor Cheetah #04 & Falcon #09',
      location: 'Target Geolocation Sector (GIFT City Gandhinagar)',
      status: 'dispatched'
    };
  }

  // Real-Time Alert Bus Subscriber (Simulates WebSocket / Kafka Consumer)
  subscribeToAlerts(callback) {
    this.alertSubscriber = callback;
  }

  publishAlertToBus(alertData) {
    const alert = {
      id: `ALT-${Math.floor(1000 + Math.random() * 9000)}`,
      title: alertData.title,
      severity: alertData.severity || 'warning',
      camera_id: alertData.camera_id || 'CAM-GJ-0101',
      location: alertData.location || 'Surveillance Sector',
      target_department: alertData.target_department || 'dept-police',
      kafka_topic: `gujarat.${alertData.target_department || 'police'}.intercept`,
      details: alertData.details,
      status: 'active',
      created_at: new Date().toISOString()
    };

    this.alerts.unshift(alert);
    this.logAudit('ALERT_PUBLISHED_TO_KAFKA', `${alert.id} &bull; ${alert.kafka_topic}`);

    if (this.alertSubscriber) {
      this.alertSubscriber(alert);
    }
    return alert;
  }

  // =========================================================================
  // PHASE 6 — SECURITY, RBAC & DEPARTMENT GOVERNANCE (L6)
  // Auth Scoping, Role Permissions, Consent Ledger & Immutable Audit Bus
  // =========================================================================

  // Pre-configured multi-tenant user accounts
  getUserAccounts() {
    return [
      {
        id: 'usr-superadmin',
        username: 'superadmin',
        name: 'Inspector General V. R. Jadeja',
        department_id: 'ALL',
        department_name: 'Gujarat State Home Department (Statewide DG Police)',
        role: 'superadmin',
        badge: 'GJ-POL-001',
        permissions: ['read:all', 'write:all', 'dispatch:pcr', 'admin:system', 'consent:manage']
      },
      {
        id: 'usr-rto-admin',
        username: 'rto_admin',
        name: 'R. K. Vaghela (Joint Director)',
        department_id: 'dept-rto',
        department_name: 'Road Transport Office (RTO & Highway Patrol)',
        role: 'department_admin',
        badge: 'GJ-RTO-441',
        permissions: ['read:dept', 'write:dept', 'stream:dept', 'consent:view']
      },
      {
        id: 'usr-amc-operator',
        username: 'amc_operator',
        name: 'Priya Shah (Smart City Operator)',
        department_id: 'dept-amc',
        department_name: 'Ahmedabad Municipal Corp (AMC Smart City)',
        role: 'operator',
        badge: 'AMC-OP-109',
        permissions: ['read:dept', 'stream:dept', 'tag:feed']
      },
      {
        id: 'usr-forest-viewer',
        username: 'forest_viewer',
        name: 'D. S. Parmar (Wildlife Officer)',
        department_id: 'dept-forest',
        department_name: 'State Forest & Wildlife Department',
        role: 'viewer',
        badge: 'GJ-FOR-082',
        permissions: ['read:dept']
      }
    ];
  }

  async login(usernameOrRole = 'superadmin', password = '') {
    const accounts = this.getUserAccounts();
    const user = accounts.find(a => 
      a.username === usernameOrRole || 
      a.role === usernameOrRole ||
      a.id === usernameOrRole
    ) || accounts[0];

    this.activeUser = user;
    this.logAudit('USER_AUTH_LOGIN', `Authenticated as ${user.name} (${user.role.toUpperCase()} &bull; ${user.department_name})`);

    return {
      status: 'authenticated',
      token: 'jwt_gov_gj_' + Math.random().toString(36).substring(2, 18),
      user: this.activeUser,
      scoped_department: this.activeUser.department_id,
      allowed_views: this.getAllowedViewsForRole(this.activeUser.role)
    };
  }

  async logout() {
    this.logAudit('USER_AUTH_LOGOUT', `User ${this.activeUser.name} signed out.`);
    this.activeUser = this.getUserAccounts()[0]; // Fallback
    return { status: 'logged_out' };
  }

  getAllowedViewsForRole(role) {
    if (role === 'superadmin') {
      return ['view-dashboard', 'view-registry', 'view-livewall', 'view-analytics', 'view-alerts', 'view-integration', 'view-admin', 'view-architecture', 'view-api-docs'];
    }
    if (role === 'department_admin') {
      return ['view-dashboard', 'view-registry', 'view-livewall', 'view-analytics', 'view-alerts', 'view-admin'];
    }
    if (role === 'operator') {
      return ['view-dashboard', 'view-registry', 'view-livewall', 'view-analytics', 'view-alerts'];
    }
    // Viewer
    return ['view-dashboard', 'view-registry', 'view-livewall'];
  }

  // --- PRIVATE CAMERA CITIZEN CONSENT LEDGER (POST /api/consent/grant, POST /api/consent/revoke) ---
  async getConsentRecords(statusFilter = 'ALL') {
    let list = this.consentRecords;
    if (statusFilter !== 'ALL') {
      list = list.filter(c => c.status === statusFilter);
    }
    return list;
  }

  async createConsentRecord(recordData) {
    const newRecord = {
      id: `CSR-${Math.floor(1000 + Math.random() * 9000)}`,
      camera_id: recordData.camera_id || `CAM-GJ-PVT-${Math.floor(100 + Math.random() * 900)}`,
      establishment_name: recordData.establishment_name || 'Shreeji Commercial Plaza',
      owner_name: recordData.owner_name || 'Kiritbhai V. Patel',
      contact_phone: recordData.contact_phone || '+91 98250 11234',
      district: recordData.district || 'Ahmedabad (Urban)',
      owner_type: recordData.owner_type || 'Commercial Association',
      granted_scope: recordData.granted_scope || 'Metadata Only',
      status: 'active',
      signed_at: new Date().toISOString(),
      expiry_date: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
      certificate_hash: '0x' + Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 10),
      authorized_by: this.activeUser.name
    };

    this.consentRecords.unshift(newRecord);
    this.logAudit('CITIZEN_CONSENT_GRANTED', `${newRecord.id} (${newRecord.establishment_name} &bull; Scope: ${newRecord.granted_scope})`);
    return newRecord;
  }

  async revokeConsent(recordId, reason = 'Owner Request / Facility Relocation') {
    const record = this.consentRecords.find(r => r.id === recordId);
    if (record) {
      record.status = 'revoked';
      record.revoked_at = new Date().toISOString();
      record.revoked_by = this.activeUser.name;
      record.revocation_reason = reason;
      this.logAudit('CITIZEN_CONSENT_REVOKED', `${recordId} by ${this.activeUser.name} (Reason: ${reason})`);
    }
    return record;
  }

  // --- IMMUTABLE AUDIT LOG VIEWER (GET /api/audit-log?filters...) ---
  async getAuditLogs(filters = {}) {
    let list = this.auditLogs;

    if (filters.action && filters.action !== 'ALL') {
      list = list.filter(l => l.action.toLowerCase().includes(filters.action.toLowerCase()));
    }
    if (filters.role && filters.role !== 'ALL') {
      list = list.filter(l => l.role.toLowerCase() === filters.role.toLowerCase());
    }
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      list = list.filter(l => 
        l.id.toLowerCase().includes(q) ||
        l.user.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.target.toLowerCase().includes(q)
      );
    }
    return list;
  }

  // =========================================================================
  // CLEAR ALL DATA — Wipes all in-memory and persisted CCTV intelligence data
  // Technology, camera list, workflow, and UI remain completely intact.
  // =========================================================================
  async clearAllData() {
    // 1. Clear all in-memory arrays
    this.events.length = 0;
    this.alerts.length = 0;
    this.auditLogs.length = 0;
    this.consentRecords.length = 0;
    if (this.streamingSessions) this.streamingSessions.length = 0;

    // 2. Clear all persisted localStorage keys
    const keysToRemove = [
      'nirikshan_camera_inventory',
      'nirikshan_events',
      'nirikshan_alerts',
      'nirikshan_audit_logs',
      'nirikshan_consent_records',
      'nirikshan_sessions'
    ];
    keysToRemove.forEach(k => { try { localStorage.removeItem(k); } catch(e){} });

    // 3. Tell the server to wipe temporary caches
    try {
      await fetch('/api/clear-all-data', { method: 'POST' });
    } catch(e) {}

    this.logAudit('SYSTEM_DATA_PURGE', 'All CCTV intelligence databases cleared by administrator');
    return {
      status: 'cleared',
      cleared: ['events', 'alerts', 'audit_logs', 'sessions', 'localStorage'],
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance to window for clean global access
window.apiClient = new NirikshanApiClient();
