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
      { id: 'dist-kutch', name: 'Kutch (Ports, SEZ & Border)', zone: 'Kutch & Border Zone', total_cams: 4600, target_cams: 8500, density_per_sqkm: 7.8, coverage_score: 54.1, gap_status: 'High Gap', gap_cams_needed: 3900, lat: 23.2420, lng: 69.6669 }
    ];

    // 3. Statewide Strategic Camera Fleet (Representing all 5 zones and 26+ departments)
    this.cameras = [
      // Central: Ahmedabad
      {
        id: 'CAM-GJ-0101',
        district: 'Ahmedabad (Urban)',
        zone: 'Central Gujarat',
        department_id: 'dept-police',
        name: 'SG Highway Iskcon Crossroad Overbridge',
        lat: 23.0298,
        lng: 72.5074,
        type: 'ip',
        vendor: 'Hikvision DS-2CD4A26FWD',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-sg01.nirikshan.gov.in/live/stream1',
        fov_angle: 90,
        direction: 'Northbound',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 18, status: 'online' }, { time: '12:00', ping_ms: 22, status: 'online' }, { time: '18:00', ping_ms: 19, status: 'online' }]
      },
      {
        id: 'CAM-GJ-0102',
        district: 'Ahmedabad (Urban)',
        zone: 'Central Gujarat',
        department_id: 'dept-amc',
        name: 'Ashram Road Nehru Bridge Riverfront',
        lat: 23.0276,
        lng: 72.5735,
        type: 'ip',
        vendor: 'Dahua IPC-HFW8241E',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-ashram02.nirikshan.gov.in/live/stream1',
        fov_angle: 120,
        direction: 'Riverfront South',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 15, status: 'online' }, { time: '12:00', ping_ms: 18, status: 'online' }, { time: '18:00', ping_ms: 16, status: 'online' }]
      },
      // Central: Gandhinagar (Capital)
      {
        id: 'CAM-GJ-0103',
        district: 'Gandhinagar (Capital)',
        zone: 'Central Gujarat',
        department_id: 'dept-police',
        name: 'Sachivalaya Swarnim Sankul Gate #1',
        lat: 23.2156,
        lng: 72.6369,
        type: 'ip',
        vendor: 'Bosch Dinion IP 7000',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-sachivalaya.nirikshan.gov.in/live/stream1',
        fov_angle: 110,
        direction: 'Capital High Security Perimeter',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 12, status: 'online' }, { time: '12:00', ping_ms: 14, status: 'online' }, { time: '18:00', ping_ms: 13, status: 'online' }]
      },
      {
        id: 'CAM-GJ-0302',
        district: 'Gandhinagar (Capital)',
        zone: 'Central Gujarat',
        department_id: 'dept-private',
        name: 'GIFT City Fin-Tech Tower 1 Concourse',
        lat: 23.1610,
        lng: 72.6840,
        type: 'ip',
        vendor: 'Axis Q3517-LVE',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-giftcity.nirikshan.gov.in/live/stream1',
        fov_angle: 90,
        direction: 'International Financial District',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 10, status: 'online' }, { time: '12:00', ping_ms: 12, status: 'online' }, { time: '18:00', ping_ms: 11, status: 'online' }]
      },
      // Central: Vadodara
      {
        id: 'CAM-GJ-0104',
        district: 'Vadodara',
        zone: 'Central Gujarat',
        department_id: 'dept-police',
        name: 'Alkapuri Railway Station Flyover Junction',
        lat: 22.3110,
        lng: 73.1780,
        type: 'ip',
        vendor: 'CP Plus SpeedDome 4K',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-vadodara01.nirikshan.gov.in/live/stream1',
        fov_angle: 360,
        direction: 'Junction Central',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 22, status: 'online' }, { time: '12:00', ping_ms: 25, status: 'online' }, { time: '18:00', ping_ms: 21, status: 'online' }]
      },
      // Central: Anand
      {
        id: 'CAM-GJ-0201',
        district: 'Anand (Milk City)',
        zone: 'Central Gujarat',
        department_id: 'dept-rto',
        name: 'Amul Dairy Road Express Toll Connector',
        lat: 22.5645,
        lng: 72.9289,
        type: 'ip',
        vendor: 'Hikvision ANPR Bullet',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-anand.nirikshan.gov.in/live/stream1',
        fov_angle: 70,
        direction: 'Express Highway Connector',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 24, status: 'online' }, { time: '12:00', ping_ms: 26, status: 'online' }, { time: '18:00', ping_ms: 23, status: 'online' }]
      },
      // Central: Dahod Border
      {
        id: 'CAM-GJ-0205',
        district: 'Dahod (Tribal Border)',
        zone: 'Central Gujarat',
        department_id: 'dept-rto',
        name: 'Gujarat-MP Interstate Border Checkpost NH-47',
        lat: 22.8360,
        lng: 74.2540,
        type: 'ip',
        vendor: 'Hikvision ANPR Heavy Bullet',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-dahod01.nirikshan.gov.in/live/stream1',
        fov_angle: 60,
        direction: 'State Ingress Lane',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 48, status: 'online' }, { time: '12:00', ping_ms: 50, status: 'online' }, { time: '18:00', ping_ms: 47, status: 'online' }]
      },

      // North Gujarat: Mehsana
      {
        id: 'CAM-GJ-0202',
        district: 'Mehsana',
        zone: 'North Gujarat',
        department_id: 'dept-rto',
        name: 'Viramgam-Mandal RTO High-Speed Weighbridge',
        lat: 23.1200,
        lng: 72.3100,
        type: 'ip',
        vendor: 'Dahua ANPR Camera',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-mehsana01.nirikshan.gov.in/live/stream1',
        fov_angle: 65,
        direction: 'Northbound Toll Weighbridge',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 28, status: 'online' }, { time: '12:00', ping_ms: 31, status: 'online' }, { time: '18:00', ping_ms: 27, status: 'online' }]
      },
      // North Gujarat: Banaskantha (Palanpur)
      {
        id: 'CAM-GJ-0203',
        district: 'Banaskantha (Palanpur & Border)',
        zone: 'North Gujarat',
        department_id: 'dept-rto',
        name: 'Gujarat-Rajasthan Abu Road Border Toll Gate',
        lat: 24.2880,
        lng: 72.5800,
        type: 'ip',
        vendor: 'CP Plus Highway ANPR',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 20,
        stream_url: 'webrtc://edge-banaskantha.nirikshan.gov.in/live/stream1',
        fov_angle: 75,
        direction: 'Interstate Crossing #01',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 35, status: 'online' }, { time: '12:00', ping_ms: 38, status: 'online' }, { time: '18:00', ping_ms: 33, status: 'online' }]
      },
      // North Gujarat: Patan
      {
        id: 'CAM-GJ-0106',
        district: 'Patan (Heritage)',
        zone: 'North Gujarat',
        department_id: 'dept-police',
        name: 'Rani ki Vav UNESCO Heritage Concourse',
        lat: 23.8585,
        lng: 72.1015,
        type: 'ip',
        vendor: 'Honeywell Panoramic Dome',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-patan.nirikshan.gov.in/live/stream1',
        fov_angle: 180,
        direction: 'Tourist Plaza Central',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 30, status: 'online' }, { time: '12:00', ping_ms: 34, status: 'online' }, { time: '18:00', ping_ms: 29, status: 'online' }]
      },

      // Saurashtra: Rajkot
      {
        id: 'CAM-GJ-0107',
        district: 'Rajkot (Hub)',
        zone: 'Saurashtra',
        department_id: 'dept-police',
        name: '150 Feet Ring Road Madhapar Chowk',
        lat: 22.3160,
        lng: 70.7720,
        type: 'ip',
        vendor: 'Hikvision DarkFighter 4K',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-rajkot01.nirikshan.gov.in/live/stream1',
        fov_angle: 90,
        direction: 'Ring Road West Junction',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 26, status: 'online' }, { time: '12:00', ping_ms: 28, status: 'online' }, { time: '18:00', ping_ms: 25, status: 'online' }]
      },
      // Saurashtra: Jamnagar
      {
        id: 'CAM-GJ-0204',
        district: 'Jamnagar (Refinery & Port)',
        zone: 'Saurashtra',
        department_id: 'dept-rto',
        name: 'Jamnagar-Rajkot Highway Toll Gate #2',
        lat: 22.4707,
        lng: 70.0577,
        type: 'ip',
        vendor: 'CP Plus SpeedDome 4K',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-jamnagar01.nirikshan.gov.in/live/stream1',
        fov_angle: 70,
        direction: 'Inbound Commercial Lane',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 32, status: 'online' }, { time: '12:00', ping_ms: 35, status: 'online' }, { time: '18:00', ping_ms: 31, status: 'online' }]
      },
      // Saurashtra: Devbhumi Dwarka
      {
        id: 'CAM-GJ-0105',
        district: 'Devbhumi Dwarka',
        zone: 'Saurashtra',
        department_id: 'dept-police',
        name: 'Dwarkadhish Temple North Gate Plaza',
        lat: 22.2376,
        lng: 68.9678,
        type: 'ip',
        vendor: 'Bosch Dinion IP 7000',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-dwarka01.nirikshan.gov.in/live/stream1',
        fov_angle: 110,
        direction: 'Pilgrim Concourse',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 42, status: 'online' }, { time: '12:00', ping_ms: 45, status: 'online' }, { time: '18:00', ping_ms: 40, status: 'online' }]
      },
      // Saurashtra: Gir Somnath & Sasan Gir
      {
        id: 'CAM-GJ-0501',
        district: 'Gir Somnath (Temple & Coast)',
        zone: 'Saurashtra',
        department_id: 'dept-forest',
        name: 'Sasan Gir National Park Sanctuary Gate #4',
        lat: 21.1340,
        lng: 70.5820,
        type: 'ip',
        vendor: 'Axis Thermal Forest Shield',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 20,
        stream_url: 'webrtc://edge-sasan01.nirikshan.gov.in/live/stream1',
        fov_angle: 120,
        direction: 'Forest Eco-Corridor East',
        resolution: '4K Thermal',
        health_history: [{ time: '06:00', ping_ms: 55, status: 'online' }, { time: '12:00', ping_ms: 58, status: 'online' }, { time: '18:00', ping_ms: 52, status: 'online' }]
      },
      {
        id: 'CAM-GJ-0108',
        district: 'Gir Somnath (Temple & Coast)',
        zone: 'Saurashtra',
        department_id: 'dept-police',
        name: 'Somnath Mahadev Mandir Promenade',
        lat: 20.8880,
        lng: 70.4010,
        type: 'ip',
        vendor: 'Hikvision 4K PTZ Coastal Guard',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-somnath.nirikshan.gov.in/live/stream1',
        fov_angle: 180,
        direction: 'Arabian Sea Coastal Concourse',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 46, status: 'online' }, { time: '12:00', ping_ms: 49, status: 'online' }, { time: '18:00', ping_ms: 44, status: 'online' }]
      },
      // Saurashtra: Morbi
      {
        id: 'CAM-GJ-0207',
        district: 'Morbi (Ceramic Hub)',
        zone: 'Saurashtra',
        department_id: 'dept-rto',
        name: 'Morbi-Kandla National Highway Industrial Toll',
        lat: 22.8250,
        lng: 70.8340,
        type: 'ip',
        vendor: 'CP Plus Heavy Freight ANPR',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-morbi.nirikshan.gov.in/live/stream1',
        fov_angle: 65,
        direction: 'Heavy Freight Freight Lane',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 31, status: 'online' }, { time: '12:00', ping_ms: 34, status: 'online' }, { time: '18:00', ping_ms: 30, status: 'online' }]
      },
      // Saurashtra: Bhavnagar
      {
        id: 'CAM-GJ-0109',
        district: 'Bhavnagar (Ports)',
        zone: 'Saurashtra',
        department_id: 'dept-police',
        name: 'Ghogha Ro-Ro Ferry Passenger & Cargo Terminal',
        lat: 21.6850,
        lng: 72.2850,
        type: 'ip',
        vendor: 'Dahua Marine Shield Bullet',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 20,
        stream_url: 'webrtc://edge-ghogha.nirikshan.gov.in/live/stream1',
        fov_angle: 90,
        direction: 'Ferry Ingress Dock',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 33, status: 'online' }, { time: '12:00', ping_ms: 36, status: 'online' }, { time: '18:00', ping_ms: 32, status: 'online' }]
      },

      // South Gujarat: Surat
      {
        id: 'CAM-GJ-0110',
        district: 'Surat (Diamond & Textile Metro)',
        zone: 'South Gujarat',
        department_id: 'dept-police',
        name: 'Surat Diamond Bourse Mega Gate #01',
        lat: 21.1300,
        lng: 72.8450,
        type: 'ip',
        vendor: 'Hikvision AI Facial & ANPR Matrix',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-surat01.nirikshan.gov.in/live/stream1',
        fov_angle: 120,
        direction: 'Diamond Bourse Main Ingress',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 18, status: 'online' }, { time: '12:00', ping_ms: 20, status: 'online' }, { time: '18:00', ping_ms: 17, status: 'online' }]
      },
      {
        id: 'CAM-GJ-0303',
        district: 'Surat (Diamond & Textile Metro)',
        zone: 'South Gujarat',
        department_id: 'dept-amc',
        name: 'Ring Road Textile Market Smart Junction',
        lat: 21.1950,
        lng: 72.8350,
        type: 'ip',
        vendor: 'Honeywell Smart City 360',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 10,
        stream_url: 'webrtc://edge-suratmarket.nirikshan.gov.in/live/stream1',
        fov_angle: 360,
        direction: 'Commercial Traffic Matrix',
        resolution: '1080p',
        health_history: [{ time: '06:00', ping_ms: 19, status: 'online' }, { time: '12:00', ping_ms: 22, status: 'online' }, { time: '18:00', ping_ms: 18, status: 'online' }]
      },
      // South Gujarat: Bharuch
      {
        id: 'CAM-GJ-0208',
        district: 'Bharuch (Chemical & Port)',
        zone: 'South Gujarat',
        department_id: 'dept-rto',
        name: 'Narmada Bridge NH-48 Express Highway Checkpoint',
        lat: 21.7100,
        lng: 72.9900,
        type: 'ip',
        vendor: 'CP Plus 4K Highway Radar',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-bharuch.nirikshan.gov.in/live/stream1',
        fov_angle: 80,
        direction: 'NH-48 Golden Bridge Toll Corridor',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 21, status: 'online' }, { time: '12:00', ping_ms: 23, status: 'online' }, { time: '18:00', ping_ms: 20, status: 'online' }]
      },
      // South Gujarat: Narmada (Statue of Unity)
      {
        id: 'CAM-GJ-0111',
        district: 'Narmada (Statue of Unity)',
        zone: 'South Gujarat',
        department_id: 'dept-police',
        name: 'Statue of Unity National Tourism High Security Grid',
        lat: 21.8380,
        lng: 73.7191,
        type: 'ip',
        vendor: 'Bosch Intelligent Concourse PTZ',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-sou.nirikshan.gov.in/live/stream1',
        fov_angle: 180,
        direction: 'Memorial Island Concourse',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 25, status: 'online' }, { time: '12:00', ping_ms: 28, status: 'online' }, { time: '18:00', ping_ms: 24, status: 'online' }]
      },
      // South Gujarat: Valsad Border
      {
        id: 'CAM-GJ-0206',
        district: 'Valsad (Border Corridor)',
        zone: 'South Gujarat',
        department_id: 'dept-rto',
        name: 'NH-48 Bhilad Toll Plaza & Maharashtra Border Check',
        lat: 20.3015,
        lng: 72.8872,
        type: 'ip',
        vendor: 'CP Plus 4K Highway ANPR',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 15,
        stream_url: 'webrtc://edge-bhilad.nirikshan.gov.in/live/stream1',
        fov_angle: 65,
        direction: 'Maharashtra-Gujarat Interstate Corridor',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 22, status: 'online' }, { time: '12:00', ping_ms: 24, status: 'online' }, { time: '18:00', ping_ms: 21, status: 'online' }]
      },

      // Kutch Zone: Bhuj, Kandla Port & Border
      {
        id: 'CAM-GJ-0112',
        district: 'Kutch (Ports, SEZ & Border)',
        zone: 'Kutch & Border Zone',
        department_id: 'dept-police',
        name: 'Bhuj Jubilee Circle Central Security Hub',
        lat: 23.2420,
        lng: 69.6669,
        type: 'ip',
        vendor: 'Hikvision 4K DarkFighter',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 20,
        stream_url: 'webrtc://edge-bhuj.nirikshan.gov.in/live/stream1',
        fov_angle: 120,
        direction: 'District Headquarters Central',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 38, status: 'online' }, { time: '12:00', ping_ms: 41, status: 'online' }, { time: '18:00', ping_ms: 37, status: 'online' }]
      },
      {
        id: 'CAM-GJ-0209',
        district: 'Kutch (Ports, SEZ & Border)',
        zone: 'Kutch & Border Zone',
        department_id: 'dept-rto',
        name: 'Kandla Major Port Gate #01 Freight Checkpost',
        lat: 23.0050,
        lng: 70.2180,
        type: 'ip',
        vendor: 'CP Plus Port Marine Heavy ANPR',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-kandlaport.nirikshan.gov.in/live/stream1',
        fov_angle: 80,
        direction: 'Port Cargo Ingress Gate #01',
        resolution: '4K',
        health_history: [{ time: '06:00', ping_ms: 36, status: 'online' }, { time: '12:00', ping_ms: 40, status: 'online' }, { time: '18:00', ping_ms: 35, status: 'online' }]
      },
      {
        id: 'CAM-GJ-0502',
        district: 'Kutch (Ports, SEZ & Border)',
        zone: 'Kutch & Border Zone',
        department_id: 'dept-forest',
        name: 'Khavda - White Rann of Kutch Border Eco-Corridor',
        lat: 23.8450,
        lng: 69.7280,
        type: 'ip',
        vendor: 'Axis Thermal Border Guard',
        status: 'online',
        storage_type: 'edge_nvr',
        retention_days: 30,
        stream_url: 'webrtc://edge-khavda.nirikshan.gov.in/live/stream1',
        fov_angle: 180,
        direction: 'Great Rann Border Ingress',
        resolution: '4K Thermal',
        health_history: [{ time: '06:00', ping_ms: 62, status: 'online' }, { time: '12:00', ping_ms: 68, status: 'online' }, { time: '18:00', ping_ms: 60, status: 'online' }]
      }
    ];

    // 3. Events (ANPR, Face, Loitering)
    this.events = [
      {
        id: 'EVT-90812',
        camera_id: 'CAM-GJ-0202',
        camera_name: 'SP Ring Road Nikol Toll Plaza',
        type: 'anpr',
        payload_json: {
          plate_number: 'GJ-01-AB-1234',
          confidence: 0.982,
          vehicle_type: 'SUV (Hyundai Creta)',
          color: 'White',
          speed_kmh: 72
        },
        ts: new Date(Date.now() - 1000 * 60 * 3).toISOString()
      },
      {
        id: 'EVT-90811',
        camera_id: 'CAM-GJ-0102',
        camera_name: 'Ashram Road Nehru Bridge Junction',
        type: 'face_match',
        payload_json: {
          match_confidence: 0.942,
          gallery_id: 'CCTNS-CRIM-2025-8812',
          suspect_name: 'Vikram K. (Alias: Vicky)',
          gender: 'Male',
          age_est: 34
        },
        ts: new Date(Date.now() - 1000 * 60 * 12).toISOString()
      },
      {
        id: 'EVT-90810',
        camera_id: 'CAM-GJ-0103',
        camera_name: 'Kalupur Railway Station Concourse',
        type: 'face_match',
        payload_json: {
          match_confidence: 0.961,
          gallery_id: 'NAFIS-MIS-2026-441',
          subject_name: 'Aryan M. (Missing Child Alert)',
          gender: 'Male',
          age_est: 9
        },
        ts: new Date(Date.now() - 1000 * 60 * 25).toISOString()
      },
      {
        id: 'EVT-90809',
        camera_id: 'CAM-GJ-0201',
        camera_name: 'NH-48 Bagodara RTO Checkpost',
        type: 'anpr',
        payload_json: {
          plate_number: 'GJ-02-ZZ-9912',
          confidence: 0.991,
          vehicle_type: 'Heavy Multi-Axle Truck',
          color: 'Yellow/Blue',
          speed_kmh: 54
        },
        ts: new Date(Date.now() - 1000 * 60 * 40).toISOString()
      },
      {
        id: 'EVT-90808',
        camera_id: 'CAM-GJ-0301',
        camera_name: 'Sindhu Bhavan Road Crossroad',
        type: 'loitering',
        payload_json: {
          duration_seconds: 480,
          person_count: 5,
          zone: 'Restricted Transformer Yard'
        },
        ts: new Date(Date.now() - 1000 * 60 * 60).toISOString()
      }
    ];

    // 4. Alerts
    this.alerts = [
      {
        id: 'ALT-1001',
        event_id: 'EVT-90812',
        camera_id: 'CAM-GJ-0202',
        matched_source: 'vahan',
        title: 'Stolen Vehicle Detected on Highway',
        severity: 'critical', // 'critical' | 'high' | 'medium' | 'info'
        status: 'active', // 'active' | 'acknowledged' | 'dispatched' | 'closed'
        routed_to: 'Police PCR Patrol #14 & Highway Interceptor',
        details: 'Vehicle flagged stolen in FIR #892/2026 at Navrangpura Police Station.',
        ts: new Date(Date.now() - 1000 * 60 * 3).toISOString()
      },
      {
        id: 'ALT-1002',
        event_id: 'EVT-90811',
        camera_id: 'CAM-GJ-0102',
        matched_source: 'egujcop',
        title: 'Non-Bailable Arrest Warrant Suspect Match',
        severity: 'critical',
        status: 'active',
        routed_to: 'Crime Branch Unit 3 & PCR 09',
        details: 'Sec 302 IPC wanted suspect identified via facial vector comparison.',
        ts: new Date(Date.now() - 1000 * 60 * 12).toISOString()
      },
      {
        id: 'ALT-1003',
        event_id: 'EVT-90810',
        camera_id: 'CAM-GJ-0103',
        matched_source: 'nafis',
        title: 'Missing Child Hotlist Match (Op. Muskaan)',
        severity: 'high',
        status: 'dispatched',
        routed_to: 'Railway Protection Force (RPF) Platform 1',
        details: 'Child report filed at Vadodara Central on 14-Aug matched with 96.1% confidence.',
        ts: new Date(Date.now() - 1000 * 60 * 25).toISOString()
      },
      {
        id: 'ALT-1004',
        event_id: 'EVT-90809',
        camera_id: 'CAM-GJ-0201',
        matched_source: 'sarthi',
        title: 'Commercial Vehicle Blacklisted (Permit Expired)',
        severity: 'medium',
        status: 'closed',
        routed_to: 'RTO Checkpost Booth 1',
        details: 'Auto e-Challan ₹10,000 generated for expired roadworthiness.',
        ts: new Date(Date.now() - 1000 * 60 * 40).toISOString()
      }
    ];

    // 5. Consent Records (Private Cameras)
    this.consentRecords = [
      {
        id: 'CSR-001',
        camera_id: 'CAM-GJ-0601',
        establishment_name: 'Palladium Mall RWA',
        owner_type: 'mall',
        granted_scope: 'Outward Road-Facing Metadata & Emergency Triggered Live View',
        status: 'active',
        signed_at: '2026-02-01T15:00:00Z',
        certificate_hash: '0x8f21bc9942a188f01b9'
      },
      {
        id: 'CSR-002',
        camera_id: 'CAM-GJ-0602',
        establishment_name: 'Titanium City Center Society',
        owner_type: 'society',
        granted_scope: 'ANPR Incident Metadata Only (Zero Raw Video Upload)',
        status: 'active',
        signed_at: '2026-02-10T12:00:00Z',
        certificate_hash: '0x3c78a011ef5901ba34'
      }
    ];

    // 6. Audit Trail
    this.auditLogs = [
      { id: 'AUD-991', user: 'Insp. V. R. Jadeja', role: 'Superadmin', action: 'LIVE_STREAM_PULL', target: 'CAM-GJ-0101', timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), ip: '10.24.110.45' },
      { id: 'AUD-990', user: 'System (Kafka Bus)', role: 'Gateway Service', action: 'CROSS_DB_QUERY', target: 'VAHAN_API:GJ-01-AB-1234', timestamp: new Date(Date.now() - 1000 * 60 * 3).toISOString(), ip: '10.24.100.12' },
      { id: 'AUD-989', user: 'Sub-Insp. S. Patel', role: 'Operator', action: 'ALERT_DISPATCH', target: 'ALT-1002 (eGujCop)', timestamp: new Date(Date.now() - 1000 * 60 * 11).toISOString(), ip: '10.24.110.50' },
      { id: 'AUD-988', user: 'RTO Officer Mehta', role: 'Admin', action: 'CAMERA_ONBOARD', target: 'CAM-GJ-0202', timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(), ip: '10.28.14.88' }
    ];

    // 7. ACTIVE STATE SUSPECT & INTERCEPTION WATCHLIST (AUTHORITY REGISTERED)
    this.suspectWatchlist = [
      {
        id: 'WCH-001',
        plate: 'GJ-01-AB-1234',
        vehicle_type: 'Hyundai Creta 1.5 (White)',
        crime: 'Armed Bank Robbery & Kidnapping (Sec 392/364 IPC)',
        fir: 'FIR-892/2026 (Satellite PS)',
        suspect_name: 'Vikram Ramsinh Solanki',
        priority: 'CRITICAL',
        registered_by: 'Inspector V. R. Jadeja',
        department_id: 'dept-police',
        assigned_units: 'PCR Cheetah #04 & Falcon #09',
        active: true,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString()
      },
      {
        id: 'WCH-002',
        plate: 'MP-09-HH-5541',
        vehicle_type: 'Tata Prima Multi-Axle Carrier',
        crime: 'Inter-State PDS Grain Siphoning & Toll Evasion',
        fir: 'FIR-104/2026 (Civil Supplies Vigilance)',
        suspect_name: 'Pravin Khimji Patel',
        priority: 'HIGH',
        registered_by: 'Enforcement Officer R. Mehta',
        department_id: 'dept-civil',
        assigned_units: 'Dahod Border Patrol Squad #02',
        active: true,
        created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString()
      }
    ];

    // 8. CCTNS/NAFIS BIOMETRIC FACIAL WATCHLIST
    this.facialWatchlist = [
      {
        id: 'FCW-001',
        suspect_id: 'CCTNS-CRIM-2025-8812',
        name: 'Vikram K. (Alias: Vicky)',
        alias: 'Vicky Sanand',
        crime: 'Sec 302 IPC / Extortion & Armed Robbery',
        fir: 'FIR 104/2025 (Sanand PS)',
        priority: 'CRITICAL',
        biometric_score_default: 96.8,
        active: true
      },
      {
        id: 'FCW-002',
        suspect_id: 'NAFIS-MIS-2026-441',
        name: 'Aryan M.',
        alias: 'Missing Child Alert',
        crime: 'Operation Muskaan (Missing Child Hotlist)',
        fir: 'MIS-22/2026 (Vadodara Central)',
        priority: 'HIGH',
        biometric_score_default: 95.4,
        active: true
      }
    ];
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
        resolution_detected: stream.resolution,
        fps_detected: stream.fps,
        codec_detected: stream.codec,
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

  async getZones() {
    return [...this.zones];
  }

  async getDistricts(zoneFilter = 'ALL') {
    if (zoneFilter === 'ALL') return [...this.districts];
    return this.districts.filter(d => d.zone === zoneFilter || d.id === zoneFilter);
  }

  async getGapAnalysis() {
    this.logAudit('GAP_ANALYSIS_REPORT_ACCESSED', 'Statewide 33 Districts Coverage Matrix');
    const totalCams = this.districts.reduce((acc, d) => acc + d.total_cams, 0);
    const targetCams = this.districts.reduce((acc, d) => acc + d.target_cams, 0);
    return {
      total_state_cameras: totalCams,
      monitored_districts: this.districts.length,
      average_coverage: ((totalCams / targetCams) * 100).toFixed(1) + '%',
      critical_gap_districts: this.districts.filter(d => d.gap_status.includes('Critical') || d.gap_status.includes('High')),
      district_breakdown: this.districts,
      zones: this.zones
    };
  }

  async getCameras(filterDept = 'ALL', filterStatus = 'ALL', searchQuery = '', filterDistrict = 'ALL') {
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
    const cam = await this.getCameraById(cameraId) || this.cameras[0];
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

    const blindSpotInfo = {
      blind_spot_id: `BLIND-GAP-${cam.id.replace('CAM-', '')}-01`,
      location_description: `Unmonitored Blind Zone: ${cam.direction.includes('North') ? 'South Approach Service Ingress' : 'Secondary Ingress & Underpass Corridor'}`,
      uncovered_azimuth: `${Math.round(bStartAngle)}° - ${Math.round(bEndAngle)}° (${blindAzimuth > 180 ? 'South-West' : 'South-East'})`,
      uncovered_area_sqm: Math.round((Math.PI * Math.pow(blindDistanceMeters, 2) * (90 / 360))),
      risk_level: 'HIGH_RISK_DEFICIT',
      recommended_install_lat: parseFloat(blindLat.toFixed(6)),
      recommended_install_lng: parseFloat(blindLng.toFixed(6)),
      recommended_hardware: cam.type === 'ip' ? '4K Ultra-Starlight ANPR + PTZ' : 'Hikvision DeepinView Bullet (IP)',
      estimated_capex_inr: 45000,
      blind_polygon: blindPoints
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
        direction_name: cam.direction,
        dori_standards: {
          detection_range_meters: maxRangeMeters,
          recognition_range_meters: recognitionRangeMeters,
          identification_range_meters: identificationRangeMeters
        }
      },
      coverage_cone_polygon: fovPoints,
      blind_spot_analysis: blindSpotInfo
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
    this.logAudit('CAMERA_ONBOARD_CREATED', newCam.id);
    return newCam;
  }

  async deleteCamera(id) {
    const idx = this.cameras.findIndex(c => c.id === id);
    if (idx !== -1) {
      const removed = this.cameras.splice(idx, 1)[0];
      this.logAudit('CAMERA_DECOMMISSIONED_DELETED', `${removed.id} (${removed.name})`);
      return { status: 'success', deleted: removed };
    }
    return { status: 'error', message: 'Camera not found' };
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
        vendor: row.vendor || 'ONVIF Auto-Discovered',
        status: row.status || 'online',
        storage_type: row.storage_type || 'edge_nvr',
        retention_days: parseInt(row.retention_days || 15, 10),
        onboarded_at: new Date().toISOString(),
        stream_url: `webrtc://edge-auto.nirikshan.gov.in/live/${row.id || 'stream'}`,
        fov_angle: parseInt(row.fov_angle || 90, 10),
        direction: row.direction || 'Surveillance View',
        resolution: row.resolution || '1080p',
        health_history: [
          { time: '12:00', ping_ms: 22, status: 'online' }
        ]
      };
      this.cameras.push(cam);
      imported.push(cam);
    });

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
        hls: `http://stream-gateway.nirikshan.gov.in/live/stream/${i + 1}/index.m3u8`
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
      hls_url: `https://relay.nirikshan.gov.in/hls/${cam.id}/index.m3u8`,
      resolution: cam.resolution || '1080p',
      fps: 25,
      bitrate_mbps: cam.resolution === '4K' ? 4.2 : 2.4,
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
  // PHASE 4 — ANALYTICS ENGINE & EVENT DETECTION PIPELINE
  // ANPR Inference, Multi-Modal Vision Indexing, and Camera-Wise Filtering
  // =========================================================================
  async runAnprInference(frameSampleId = 'sample-ahmedabad', cameraId = 'CAM-GJ-0101') {
    const cam = await this.getCameraById(cameraId);
    
    const samplePresets = {
      'sample-ahmedabad': {
        plate: 'GJ-01-AB-1234',
        confidence: 99.2,
        vehicle_type: 'White Hyundai Creta SUV',
        speed_estimate_kmph: 68,
        bbox: [120, 240, 310, 110],
        vahan_flag: 'STOLEN_VEHICLE_ALERT',
        owner: 'Suresh M. Patel',
        chassis: 'MA3FNE81S00987123'
      },
      'sample-dahod': {
        plate: 'MP-09-HH-5541',
        confidence: 97.8,
        vehicle_type: 'Tata Prima Multi-Axle Truck',
        speed_estimate_kmph: 42,
        bbox: [90, 180, 420, 150],
        vahan_flag: 'OVERWEIGHT_PDS_CARRIER',
        owner: 'Central Logistic Freight Ltd',
        chassis: 'MAT628045F1N88231'
      },
      'sample-valsad': {
        plate: 'MH-04-AZ-8890',
        confidence: 98.4,
        vehicle_type: 'Toyota Innova Crysta',
        speed_estimate_kmph: 74,
        bbox: [140, 210, 290, 100],
        vahan_flag: 'EXPIRED_FITNESS_TRANSIT',
        owner: 'Kishore G. Deshmukh',
        chassis: 'MBJ11CB0209485710'
      },
      'sample-dwarka': {
        plate: 'GJ-37-T-9011',
        confidence: 96.5,
        vehicle_type: 'Maruti Suzuki Dzire Taxi',
        speed_estimate_kmph: 55,
        bbox: [110, 200, 300, 105],
        vahan_flag: 'CLEAR',
        owner: 'Dwarka Coastal Tours',
        chassis: 'MA3EW81S006129841'
      }
    };

    const preset = samplePresets[frameSampleId] || samplePresets['sample-ahmedabad'];
    const eventId = `EVT-${Math.floor(10000 + Math.random() * 90000)}`;

    const eventRecord = {
      id: eventId,
      camera_id: cam ? cam.id : cameraId,
      camera_name: cam ? cam.name : 'Surveillance Junction',
      district: cam ? cam.district : 'Ahmedabad (Urban)',
      type: 'anpr',
      payload_json: {
        plate: preset.plate,
        confidence_score: preset.confidence,
        vehicle: preset.vehicle_type,
        speed_kmph: preset.speed_estimate_kmph,
        bounding_box: preset.bbox,
        vahan_status: preset.vahan_flag,
        owner_name: preset.owner,
        clip_timestamp: new Date().toISOString(),
        clip_stream_offset: '00:14:22',
        clip_url: `https://relay.nirikshan.gov.in/clips/${eventId}.mp4`,
        sha256_hash: '0x' + Math.random().toString(16).substring(2, 18) + Math.random().toString(16).substring(2, 10)
      },
      ts: new Date().toISOString()
    };

    this.events.unshift(eventRecord);
    this.logAudit('ANPR_INFERENCE_DETECTED', `${preset.plate} (${preset.confidence}%) at ${eventRecord.camera_id}`);

    // If hit, trigger real-time alert
    if (preset.vahan_flag !== 'CLEAR') {
      const alert = {
        id: `ALT-${Math.floor(1000 + Math.random() * 9000)}`,
        title: `ANPR Intercept: ${preset.plate} (${preset.vahan_flag})`,
        severity: preset.vahan_flag.includes('STOLEN') ? 'critical' : 'warning',
        camera_id: eventRecord.camera_id,
        location: eventRecord.camera_name,
        target_department: 'dept-police',
        details: `Vision Engine ANPR match (${preset.confidence}%). Crossed ${eventRecord.camera_name}. Flagged in VAHAN National Registry as ${preset.vahan_flag}.`,
        status: 'active',
        created_at: new Date().toISOString()
      };
      this.alerts.unshift(alert);
    }

    return {
      status: 'success',
      event: eventRecord,
      anpr_result: {
        plate_number: preset.plate,
        confidence: preset.confidence,
        bounding_box: preset.bbox,
        vahan_alert: preset.vahan_flag
      }
    };
  }

  async getEvents(filters = {}) {
    let result = this.events;

    // Camera ID filter
    if (filters.camera_id && filters.camera_id !== 'ALL') {
      result = result.filter(e => e.camera_id === filters.camera_id);
    }

    // Event Type filter (anpr, face, crowd, manual)
    if (filters.type && filters.type !== 'ALL') {
      result = result.filter(e => e.type.toLowerCase() === filters.type.toLowerCase());
    }

    // Plate number or search query filter
    if (filters.search && filters.search.trim()) {
      const q = filters.search.toLowerCase();
      result = result.filter(e => {
        const payloadStr = JSON.stringify(e.payload_json).toLowerCase();
        return (
          e.id.toLowerCase().includes(q) ||
          e.camera_id.toLowerCase().includes(q) ||
          (e.camera_name && e.camera_name.toLowerCase().includes(q)) ||
          payloadStr.includes(q)
        );
      });
    }

    // Plate specific filter
    if (filters.plate_number && filters.plate_number.trim()) {
      const p = filters.plate_number.toLowerCase();
      result = result.filter(e => 
        e.payload_json && e.payload_json.plate && e.payload_json.plate.toLowerCase().includes(p)
      );
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
      return {
        source: 'VAHAN 4.0 National Vehicle Registry',
        reg_number: queryParam.toUpperCase(),
        owner_name: 'Suresh Patel (Flagged Suspicious)',
        chassis: 'MA1TC287019842',
        engine: 'K12M984120',
        fitness_valid_upto: '2027-04-15',
        insurance_status: 'Active (ICICI Lombard)',
        is_stolen: queryParam.toUpperCase().includes('1234'),
        stolen_fir_no: queryParam.toUpperCase().includes('1234') ? 'FIR-892/2026 (Navrangpura PS)' : null
      };
    } else if (dbSource === 'egujcop') {
      return {
        source: 'eGujCop / CCTNS Criminal Gallery',
        matched_id: queryParam,
        suspect_name: 'Vikram K. (Alias Vicky)',
        active_warrants: 2,
        fir_history: ['FIR 104/2025 Sec 302 IPC', 'FIR 55/2024 Arms Act'],
        status: 'WANTED - RED NOTICE',
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
  // STATE SUSPECT & INTERCEPTION WATCHLIST MANAGEMENT (AUTHORITY ENGINE)
  // =========================================================================
  async getSuspectWatchlist() {
    return this.suspectWatchlist.filter(w => w.active);
  }

  async isPlateSuspect(plateNumber) {
    if (!plateNumber) return null;
    const clean = plateNumber.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    return this.suspectWatchlist.find(w => w.active && w.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === clean) || null;
  }

  async addSuspectVehicle(payload) {
    const cleanPlate = (payload.plate || '').trim().toUpperCase();
    if (!cleanPlate) throw new Error('Vehicle Registration Plate Number is required.');

    // Check if already in watchlist
    const existing = await this.isPlateSuspect(cleanPlate);
    if (existing) {
      existing.crime = payload.crime || existing.crime;
      existing.fir = payload.fir || existing.fir;
      existing.suspect_name = payload.suspect_name || existing.suspect_name;
      existing.priority = payload.priority || existing.priority;
      existing.active = true;
      this.logAudit('SUSPECT_WATCHLIST_UPDATED', `Target: ${cleanPlate} (${existing.crime})`);
      return { status: 'updated', record: existing };
    }

    const newRecord = {
      id: `WCH-${Math.floor(100 + Math.random() * 900)}`,
      plate: cleanPlate,
      vehicle_type: payload.vehicle_type || 'Suspect Motor Vehicle',
      crime: payload.crime || 'Unlawful Interstate Transit & Police Bolo Warrant',
      fir: payload.fir || `FIR-${Math.floor(100 + Math.random() * 900)}/2026-HQ`,
      suspect_name: payload.suspect_name || 'Unidentified Suspect Driver',
      priority: payload.priority || 'CRITICAL',
      registered_by: this.activeUser.name || 'State Command Authority',
      department_id: this.activeUser.department_id || 'dept-police',
      assigned_units: payload.assigned_units || 'Nearest Tactical PCR Interceptor',
      active: true,
      created_at: new Date().toISOString()
    };

    this.suspectWatchlist.unshift(newRecord);
    this.logAudit('SUSPECT_VEHICLE_REGISTERED', `Target: ${cleanPlate} | Offense: ${newRecord.crime}`);

    // Automatically generate Critical Hot-Pursuit Alert on Kafka Event Bus
    const alertId = `ALT-${Math.floor(1000 + Math.random() * 9000)}`;
    const newAlert = {
      id: alertId,
      event_id: `EVT-WCH-${Math.floor(1000 + Math.random() * 9000)}`,
      camera_id: 'BROADCAST_ALL_GRID',
      matched_source: 'vahan_crime_hotlist',
      title: `🚨 RED NOTICE REGISTERED: ${cleanPlate}`,
      severity: newRecord.priority === 'CRITICAL' ? 'critical' : 'high',
      status: 'active',
      routed_to: newRecord.assigned_units,
      details: `${newRecord.crime} (Ref: ${newRecord.fir}). Registered by ${newRecord.registered_by}. All AI vision nodes armed for instant intercept.`,
      ts: new Date().toISOString()
    };
    this.alerts.unshift(newAlert);

    return { status: 'created', record: newRecord, alert: newAlert };
  }

  async removeSuspectVehicle(plateNumber) {
    const clean = (plateNumber || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    const idx = this.suspectWatchlist.findIndex(w => w.plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === clean);
    if (idx !== -1) {
      const removed = this.suspectWatchlist[idx];
      this.suspectWatchlist.splice(idx, 1);
      this.logAudit('SUSPECT_WATCHLIST_REMOVED', `Target Plate: ${plateNumber}`);
      return { status: 'removed', record: removed };
    }
    return { status: 'not_found' };
  }

  async getFacialWatchlist() {
    return this.facialWatchlist.filter(f => f.active);
  }

  async addSuspectFace(payload) {
    const newFace = {
      id: `FCW-${Math.floor(100 + Math.random() * 900)}`,
      suspect_id: payload.suspect_id || `CCTNS-CRIM-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      name: payload.name || 'Unidentified Wanted Individual',
      alias: payload.alias || 'Wanted',
      crime: payload.crime || 'Criminal Investigation Wanted Warrant',
      fir: payload.fir || `FIR-${Math.floor(100 + Math.random() * 900)}/2026`,
      priority: payload.priority || 'CRITICAL',
      biometric_score_default: 96.2,
      active: true
    };
    this.facialWatchlist.unshift(newFace);
    this.logAudit('FACIAL_WATCHLIST_REGISTERED', `Suspect: ${newFace.name} | FIR: ${newFace.fir}`);
    return newFace;
  }

  async removeSuspectFace(id) {
    const idx = this.facialWatchlist.findIndex(f => f.id === id || f.suspect_id === id);
    if (idx !== -1) {
      const rem = this.facialWatchlist.splice(idx, 1)[0];
      this.logAudit('FACIAL_WATCHLIST_REMOVED', rem.name);
      return rem;
    }
    return null;
  }

  // =========================================================================
  // MULTI-DEPARTMENT CROSS-JURISDICTION TRAJECTORY RECONSTRUCTION &
  // PREDICTIVE INTERCEPTION ENGINE (CROSS-DEPT VEHICLE PURSUIT)
  // =========================================================================
  async reconstructVehicleTrajectory(plateNumber = 'GJ-01-AB-1234') {
    this.logAudit('CROSS_DEPT_TRAJECTORY_RECONSTRUCTION', `Plate: ${plateNumber}`);
    const cleanPlate = (plateNumber || '').replace(/\s+/g, '').toUpperCase();

    // Multi-department sighting timeline dataset simulating cross-jurisdiction transit
    const sightingTrails = {
      'GJ-01-AB-1234': {
        plate: 'GJ-01-AB-1234',
        vehicle_model: 'Hyundai Creta 1.5 SX (White)',
        stolen_fir: 'FIR-2026-GJ-01-8841 (Satellite PS)',
        status: 'ACTIVE_HOT_PURSUIT',
        total_distance_km: 74.2,
        average_speed_kmph: 81.5,
        current_heading: 'North-West (325° Towards Mehsana / Rajasthan Border)',
        sightings: [
          {
            step: 1,
            camera_id: 'CAM-GJ-0101',
            camera_name: 'Pakwan Crossroad Overbridge',
            district: 'Ahmedabad (Urban)',
            department_id: 'dept-police',
            department_name: 'Gujarat State Police (Home Dept)',
            department_badge: 'Police Urban Grid',
            department_color: '#f43f5e',
            lat: 23.0305,
            lng: 72.5076,
            timestamp: new Date(Date.now() - 48 * 60 * 1000).toISOString(),
            time_display: '17:48 IST',
            speed_kmph: 62.0,
            direction: 'Entering SG Highway Northbound',
            ocr_confidence: 99.2,
            snapshot_type: 'Incident Point of Origin (Theft Reported)'
          },
          {
            step: 2,
            camera_id: 'CAM-GJ-0103',
            camera_name: 'Sanand Circle Outer Ring Road Junction',
            district: 'Ahmedabad (Urban)',
            department_id: 'dept-amc',
            department_name: 'Ahmedabad Municipal Corp (AMC Smart City)',
            department_badge: 'AMC Municipal Traffic Grid',
            department_color: '#00f2fe',
            lat: 23.0089,
            lng: 72.4812,
            timestamp: new Date(Date.now() - 34 * 60 * 1000).toISOString(),
            time_display: '18:02 IST',
            speed_kmph: 78.4,
            direction: 'Exiting City Limits via SP Ring Road',
            ocr_confidence: 98.6,
            snapshot_type: 'Cross-Jurisdiction Handoff (Police -> AMC)'
          },
          {
            step: 3,
            camera_id: 'CAM-GJ-0601',
            camera_name: 'Iscon Mega Plaza Commercial Bypass Access',
            district: 'Ahmedabad Rural Corridor',
            department_id: 'dept-private',
            department_name: 'Private Commercial Partner (DPDP Consent CSR-001)',
            department_badge: 'Citizen Partner Opt-In',
            department_color: '#c084fc',
            lat: 23.0450,
            lng: 72.4350,
            timestamp: new Date(Date.now() - 21 * 60 * 1000).toISOString(),
            time_display: '18:15 IST',
            speed_kmph: 86.2,
            direction: 'Speeding on National Highway 147',
            ocr_confidence: 97.4,
            snapshot_type: 'Private Camera Handoff (Citizen Feeds Opt-In)'
          },
          {
            step: 4,
            camera_id: 'CAM-GJ-0202',
            camera_name: 'Viramgam-Mandal RTO High-Speed Weighbridge',
            district: 'Ahmedabad Border Zone',
            department_id: 'dept-rto',
            department_name: 'Road Transport Office (RTO & Highway Patrol)',
            department_badge: 'RTO Highway Transit Grid',
            department_color: '#f59e0b',
            lat: 23.1200,
            lng: 72.3100,
            timestamp: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
            time_display: '18:30 IST',
            speed_kmph: 94.8,
            direction: 'High-Speed Transit Toll Bypass',
            ocr_confidence: 99.4,
            snapshot_type: 'RTO Weighbridge Automated ANPR Hit'
          }
        ],
        predictive_trajectory: {
          confidence_score: 96.2,
          projected_speed_kmph: 92.0,
          current_eta_minutes: 14,
          estimated_arrival_time: new Date(Date.now() + 14 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
          next_predicted_camera_id: 'CAM-GJ-0402',
          next_predicted_location: 'Forest Dept Sanctuary North Inter-State Corridor',
          next_predicted_district: 'Mehsana / Forest Sanctuary Perimeter',
          next_predicted_dept: 'State Forest & Wildlife Department',
          next_predicted_lat: 23.2800,
          next_predicted_lng: 72.1900,
          suggested_interception_strategy: 'Forward Geo-Fenced Highway Roadblock at Toll Gate #03 & Forest Barrier',
          assigned_pcr_interceptor: 'Inter-State Border Flying Squad #11'
        }
      },
      'MP-09-HH-5541': {
        plate: 'MP-09-HH-5541',
        vehicle_model: 'Tata Prima Multi-Axle Carrier (40 Ton)',
        stolen_fir: 'Overweight Carrier & E-Challan Evader',
        status: 'ACTIVE_HOT_PURSUIT',
        total_distance_km: 42.8,
        average_speed_kmph: 54.0,
        current_heading: 'Eastbound (88° Towards MP Border)',
        sightings: [
          {
            step: 1,
            camera_id: 'CAM-GJ-0502',
            camera_name: 'Dahod APMC Grain Market Toll',
            district: 'Dahod (Tribal Border)',
            department_id: 'dept-civil',
            department_name: 'Civil Supplies & Food Dept',
            department_badge: 'Civil Supplies Grid',
            department_color: '#10b981',
            lat: 22.8350,
            lng: 74.2500,
            timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
            time_display: '18:00 IST',
            speed_kmph: 48.0,
            direction: 'Departing PDS Godown Area',
            ocr_confidence: 98.1,
            snapshot_type: 'PDS Godown Departure'
          },
          {
            step: 2,
            camera_id: 'CAM-GJ-0501',
            camera_name: 'Dahod Inter-State Border Weighbridge',
            district: 'Dahod (Tribal Border)',
            department_id: 'dept-rto',
            department_name: 'Road Transport Office (RTO)',
            department_badge: 'RTO Border Checkpost',
            department_color: '#f59e0b',
            lat: 22.8410,
            lng: 74.2620,
            timestamp: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
            time_display: '18:25 IST',
            speed_kmph: 58.5,
            direction: 'Approaching Gujarat-MP Border Crossing',
            ocr_confidence: 99.1,
            snapshot_type: 'Overweight Transit Trigger'
          }
        ],
        predictive_trajectory: {
          confidence_score: 98.4,
          projected_speed_kmph: 56.0,
          current_eta_minutes: 8,
          estimated_arrival_time: new Date(Date.now() + 8 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
          next_predicted_camera_id: 'CAM-GJ-0503',
          next_predicted_location: 'Interstate Border Barrier Gate #01',
          next_predicted_district: 'Dahod MP Border',
          next_predicted_dept: 'Police & RTO Joint Checkpost',
          next_predicted_lat: 22.8520,
          next_predicted_lng: 74.2850,
          suggested_interception_strategy: 'Automated Hydraulic Barrier Closure at State Border Checkpost',
          assigned_pcr_interceptor: 'Dahod Border Patrol #04'
        }
      }
    };

    // 1. Static presets for key scenario demos
    if (sightingTrails[cleanPlate]) {
      return sightingTrails[cleanPlate];
    }

    // 2. Dynamic multi-department trajectory generator for ANY custom vehicle plate entered
    const plateFormatted = cleanPlate.length > 4 ? cleanPlate : (cleanPlate || 'GJ-01-TR-9901');
    const now = Date.now();
    
    // Determine vehicle type and suspicion tag dynamically
    const isOutState = !plateFormatted.startsWith('GJ');
    const vehicleType = isOutState ? 'Commercial Transit Transport' : 'Passenger Vehicle / SUV';
    const firNo = `FIR-2026-${plateFormatted.substring(0, 5)}-${Math.floor(1000 + Math.random() * 9000)}`;

    return {
      plate: plateFormatted,
      vehicle_model: `${vehicleType} (${plateFormatted})`,
      stolen_fir: `${firNo} (Cross-Dept Alert Issued)`,
      status: 'ACTIVE_HOT_PURSUIT',
      total_distance_km: 68.4,
      average_speed_kmph: 79.2,
      current_heading: 'North-West (330° National Highway Transit Corridor)',
      sightings: [
        {
          step: 1,
          camera_id: 'CAM-GJ-0101',
          camera_name: 'Pakwan Crossroad Overbridge',
          district: 'Ahmedabad (Urban)',
          department_id: 'dept-police',
          department_name: 'Gujarat State Police (Home Dept)',
          department_badge: 'Police Urban Grid',
          department_color: '#f43f5e',
          lat: 23.0305,
          lng: 72.5076,
          timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
          time_display: new Date(now - 45 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
          speed_kmph: 61.5,
          direction: 'Entering Urban Arterial Road',
          ocr_confidence: 99.1,
          snapshot_type: 'Police Surveillance ANPR Initial Trigger'
        },
        {
          step: 2,
          camera_id: 'CAM-GJ-0103',
          camera_name: 'Sanand Circle Outer Ring Road Junction',
          district: 'Ahmedabad (Urban)',
          department_id: 'dept-amc',
          department_name: 'Ahmedabad Municipal Corp (AMC Smart City)',
          department_badge: 'AMC Municipal Traffic Grid',
          department_color: '#00f2fe',
          lat: 23.0089,
          lng: 72.4812,
          timestamp: new Date(now - 31 * 60 * 1000).toISOString(),
          time_display: new Date(now - 31 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
          speed_kmph: 76.8,
          direction: 'Exiting City Limits via SP Ring Road',
          ocr_confidence: 98.4,
          snapshot_type: 'Cross-Jurisdiction Handoff (Police -> AMC)'
        },
        {
          step: 3,
          camera_id: 'CAM-GJ-0601',
          camera_name: 'Commercial Bypass Access Toll Gateway',
          district: 'Ahmedabad Rural Corridor',
          department_id: 'dept-private',
          department_name: 'Private Commercial Partner (DPDP Consent CSR-001)',
          department_badge: 'Citizen Partner Opt-In',
          department_color: '#c084fc',
          lat: 23.0450,
          lng: 72.4350,
          timestamp: new Date(now - 18 * 60 * 1000).toISOString(),
          time_display: new Date(now - 18 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
          speed_kmph: 84.6,
          direction: 'High-Speed Transit on National Highway 147',
          ocr_confidence: 97.9,
          snapshot_type: 'Private Camera Handoff (Citizen Feeds Opt-In)'
        },
        {
          step: 4,
          camera_id: 'CAM-GJ-0202',
          camera_name: 'Viramgam-Mandal RTO High-Speed Weighbridge',
          district: 'Ahmedabad Border Zone',
          department_id: 'dept-rto',
          department_name: 'Road Transport Office (RTO & Highway Patrol)',
          department_badge: 'RTO Highway Transit Grid',
          department_color: '#f59e0b',
          lat: 23.1200,
          lng: 72.3100,
          timestamp: new Date(now - 5 * 60 * 1000).toISOString(),
          time_display: new Date(now - 5 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
          speed_kmph: 93.4,
          direction: 'High-Speed Transit Toll Bypass',
          ocr_confidence: 99.3,
          snapshot_type: 'RTO Weighbridge Automated ANPR Hit'
        }
      ],
      predictive_trajectory: {
        confidence_score: 95.8,
        projected_speed_kmph: 91.0,
        current_eta_minutes: 13,
        estimated_arrival_time: new Date(now + 13 * 60 * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' IST',
        next_predicted_camera_id: 'CAM-GJ-0402',
        next_predicted_location: 'Forest Dept Sanctuary North Inter-State Corridor',
        next_predicted_district: 'Mehsana / Forest Sanctuary Perimeter',
        next_predicted_dept: 'State Forest & Wildlife Department',
        next_predicted_lat: 23.2800,
        next_predicted_lng: 72.1900,
        suggested_interception_strategy: `Forward Roadblock & Hydraulic Barrier Closure for Target ${plateFormatted}`,
        assigned_pcr_interceptor: 'Inter-State Border Flying Squad #11'
      }
    };
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
      message: `🚨 IMMEDIATE INTERCEPT ORDER: Vehicle ${cleanPlate} approaching ${loc} at 92 km/h. Hydraulic barrier active. Intercept and detain suspect.`,
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

    const vahanDatabase = {
      'GJ-01-AB-1234': {
        plate: 'GJ-01-AB-1234',
        registered_owner: 'Suresh M. Patel',
        vehicle_make_model: 'Hyundai Creta 1.5 SX (O) Diesel',
        fuel_type: 'DIESEL / BS-VI',
        registration_date: '2022-04-14',
        rto_office: 'GJ-01 (Ahmedabad West)',
        chassis_no: 'MA3FNE81S00987123',
        engine_no: 'D4FA981244',
        insurance_valid_upto: '2026-04-13',
        puc_valid_upto: '2026-01-10',
        fitness_valid_upto: '2037-04-13',
        status: 'FLAGGED_STOLEN',
        fir_no: 'FIR-2026-GJ-01-8841',
        fir_police_station: 'Satellite Police Station, Ahmedabad',
        crime_section: 'IPC Section 379 (Motor Vehicle Theft)'
      },
      'MP-09-HH-5541': {
        plate: 'MP-09-HH-5541',
        registered_owner: 'Central Logistic Freight Lines Ltd',
        vehicle_make_model: 'Tata Prima 4028.S Multi-Axle Carrier',
        fuel_type: 'DIESEL / BS-VI',
        registration_date: '2020-09-18',
        rto_office: 'MP-09 (Indore Regional)',
        chassis_no: 'MAT628045F1N88231',
        engine_no: '6ISB285910',
        status: 'OVERWEIGHT_CARRIER',
        gross_weight_limit_kg: 40000,
        detected_weight_kg: 52400,
        rto_e_challan_pending: '₹24,500'
      },
      'MH-04-AZ-8890': {
        plate: 'MH-04-AZ-8890',
        registered_owner: 'Kishore G. Deshmukh',
        vehicle_make_model: 'Toyota Innova Crysta 2.4 GX',
        fuel_type: 'DIESEL / BS-IV',
        registration_date: '2017-02-11',
        rto_office: 'MH-04 (Thane)',
        chassis_no: 'MBJ11CB0209485710',
        engine_no: '2GD982109',
        status: 'EXPIRED_FITNESS_TRANSIT',
        fitness_valid_upto: '2024-02-10 (Expired)'
      },
      'GJ-37-T-9011': {
        plate: 'GJ-37-T-9011',
        registered_owner: 'Dwarka Coastal Tourist Cab Services',
        vehicle_make_model: 'Maruti Suzuki Tour S (Dzire)',
        fuel_type: 'CNG / PETROL',
        registration_date: '2023-11-05',
        rto_office: 'GJ-37 (Devbhumi Dwarka)',
        status: 'CLEAN_RECORD'
      }
    };

    const match = vahanDatabase[cleanPlate];
    if (match) {
      return { status: 'found', source: 'VAHAN 4.0 National Vehicle Registry', data: match };
    }

    return {
      status: 'found',
      source: 'VAHAN 4.0 National Vehicle Registry',
      data: {
        plate: cleanPlate,
        registered_owner: 'Gujarat Commercial Fleet Holder',
        vehicle_make_model: 'Commercial Light Transport Vehicle',
        fuel_type: 'DIESEL',
        rto_office: 'Gujarat State RTO Grid',
        status: 'CLEAN_RECORD'
      }
    };
  }

  // 2. eGujCop & CCTNS Crime Registry (POST /api/integration/egujcop/lookup)
  async lookupEGujCop(suspectQuery) {
    this.logAudit('INTEGRATION_GATEWAY_EGUJCOP_QUERY', suspectQuery);
    const q = (suspectQuery || '').toLowerCase();

    const egujcopDatabase = [
      {
        cctns_id: 'CCTNS-GJ-2025-00918',
        name: 'Vikram K. Rathod',
        alias: 'Vicky',
        status: 'WANTED_FUGITIVE',
        warrant_type: 'Non-Bailable Warrant (NBW)',
        issuing_court: 'Sessions Court, Ahmedabad City',
        fir_reference: 'FIR-2025-CR-1102 (Satellite PS)',
        charges: 'IPC 307 (Attempt to Murder), IPC 392 (Robbery)',
        reward_inr: 50000,
        interpol_red_notice: false,
        facial_embedding_id: 'EMB-FACE-GJ-88412'
      },
      {
        cctns_id: 'CCTNS-GJ-2024-04182',
        name: 'Haresh B. Solanki',
        alias: 'Harry',
        status: 'PROCLAIMED_OFFENDER',
        warrant_type: 'Arrest Warrant (Inter-State)',
        issuing_court: 'Chief Judicial Magistrate, Dahod',
        fir_reference: 'FIR-2024-CR-0891 (Dahod Town PS)',
        charges: 'Essential Commodities Act Section 7 (Grain Diversion)',
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
      query: suspectQuery,
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
    let list = this.alerts;
    if (severityFilter !== 'ALL') {
      list = list.filter(a => a.severity === severityFilter);
    }
    if (deptFilter !== 'ALL') {
      list = list.filter(a => a.target_department === deptFilter || a.target_department === 'ALL');
    }
    return list;
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
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.status = 'dispatched';
      alert.pcr_unit = 'PCR Interceptor Unit #' + Math.floor(10 + Math.random() * 89);
      alert.dispatched_at = new Date().toISOString();
      this.logAudit('ALERT_PCR_DISPATCHED', `${alertId} -> ${alert.pcr_unit}`);
    }
    return alert;
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
}

// Export singleton instance to window for clean global access
window.apiClient = new NirikshanApiClient();
