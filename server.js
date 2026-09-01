/**
 * Nirikshan State CCTV Intelligence Platform - Production Web Server
 * Optimized for Render.com Blueprint Web Services
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname);

// In-Memory GIS Map Tile Cache
const tileCache = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
  '.md': 'text/markdown; charset=utf-8'
};


const CATALOG_FILE = path.join(__dirname, 'src', 'data', 'camera_catalog.json');
let CAMERA_CATALOG = [];
try {
  if (fs.existsSync(CATALOG_FILE)) {
    const raw = fs.readFileSync(CATALOG_FILE, 'utf8');
    CAMERA_CATALOG = JSON.parse(raw);
    if (!Array.isArray(CAMERA_CATALOG)) CAMERA_CATALOG = [];
  }
} catch (e) {
  CAMERA_CATALOG = [];
}

function saveCatalog() {
  try {
    fs.writeFileSync(CATALOG_FILE, JSON.stringify(CAMERA_CATALOG, null, 2), 'utf8');
  } catch (e) {}
}

// Sentinel Corp8 CCTV Cloud Integration Manager
let sentinelCookie = 'sentinel=eyJ1aWQiOiI4ZGZlMjZmMzMwZDQ0Njg0In0.0T3xanAwU0GsV7HgrzKQzaA1j9Weo8P0h21Tg2vGe1c';
const SENTINEL_PASSWORD = 'CLKY-CD9X-RWHQ';
let isAuthenticating = false;

function loginToSentinel(callback) {
  if (isAuthenticating) {
    if (callback) setTimeout(() => callback(null, sentinelCookie), 1500);
    return;
  }
  isAuthenticating = true;
  const postData = 'password=' + encodeURIComponent(SENTINEL_PASSWORD);
  const req = https.request('https://cctv.corp8.cloud/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  }, (res) => {
    isAuthenticating = false;
    const cookies = res.headers['set-cookie'];
    if (cookies && cookies.length > 0) {
      const match = cookies.find(c => c.startsWith('sentinel='));
      if (match) {
        sentinelCookie = match.split(';')[0];
        console.log('[SENTINEL] Authenticated successfully with cctv.corp8.cloud');
        if (callback) callback(null, sentinelCookie);
        return;
      }
    }
    if (callback) callback(null, sentinelCookie);
  });
  req.on('error', (err) => {
    isAuthenticating = false;
    if (callback) callback(err);
  });
  req.write(postData);
  req.end();
}

const CORP8_DISTRICT_MAP = {
  'cam01': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0568, lng: 72.5802, name: 'Chimanbhai Bridge' },
  'cam02': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0640, lng: 72.5815, name: 'Janpath Overbridge' },
  'cam03': { district: 'Gandhinagar (Capital)', dept: 'dept-police', lat: 23.2384, lng: 72.6391, name: 'O.N.G.C. Office Complex' },
  'cam04': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0135, lng: 72.5630, name: 'Paldi Circle Arterial' },
  'cam05': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.1090, lng: 72.5930, name: 'Visat Teen Rasta Junction' },
  'cam06': { district: 'Junagadh (Girnar)', dept: 'dept-police', lat: 21.5222, lng: 70.4579, name: 'Timbavadi Gate' },
  'cam07': { district: 'Gir Somnath (Temple & Coast)', dept: 'dept-police', lat: 20.9020, lng: 70.3690, name: 'Hero Showroom Highway' },
  'cam08': { district: 'Junagadh (Girnar)', dept: 'dept-police', lat: 21.5170, lng: 70.4630, name: 'Majewadi Gate' },
  'cam09': { district: 'Junagadh (Girnar)', dept: 'dept-police', lat: 21.5300, lng: 70.4700, name: 'New Bypass Circle' },
  'cam10': { district: 'Junagadh (Girnar)', dept: 'dept-police', lat: 21.5200, lng: 70.4600, name: 'Char Chowk Road' },
  'cam11': { district: 'Junagadh (Girnar)', dept: 'dept-police', lat: 21.5450, lng: 70.4750, name: 'Dolatpara Junction' },
  'cam12': { district: 'Gandhinagar (Capital)', dept: 'dept-rto', lat: 23.1670, lng: 72.5830, name: 'Tri Mandir Adalaj Tollnaka' },
  'cam13': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0270, lng: 72.5510, name: 'CN Vidhyalaya Crossing' },
  'cam14': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0350, lng: 72.5650, name: 'Delight RLVD Crossroad' },
  'cam15': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0180, lng: 72.5540, name: 'Suvidha Park Corridor' },
  'cam16': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.1110, lng: 72.5950, name: 'Visat P2 Sector' },
  'cam17': { district: 'Rajkot (Hub)', dept: 'dept-rto', lat: 22.3039, lng: 70.8022, name: 'Rajkot Bus Port Terminal' },
  'cam18': { district: 'Rajkot (Hub)', dept: 'dept-police', lat: 22.2980, lng: 70.7950, name: 'Rajkot Smart City CCTV' },
  'cam19': { district: 'Navsari (Dandi)', dept: 'dept-civil', lat: 20.8520, lng: 72.9810, name: 'Khaparia Gram Panchayat Gandevi' },
  'cam20': { district: 'Ahmedabad (Urban)', dept: 'dept-police', lat: 23.0320, lng: 72.5900, name: 'Mohanpura Junction' },
  'cam21': { district: 'Patan (Heritage)', dept: 'dept-police', lat: 23.8500, lng: 72.1250, name: 'Patan Dethali Char Rasta' },
  'cam22': { district: 'Banaskantha (Palanpur & Border)', dept: 'dept-rto', lat: 24.1720, lng: 72.4350, name: 'BK Mervada Tran Rasta' },
  'cam23': { district: 'Mehsana', dept: 'dept-police', lat: 23.5880, lng: 72.3690, name: 'Kheram Checkpoint' },
  'cam24': { district: 'Gandhinagar (Capital)', dept: 'dept-police', lat: 23.1667, lng: 72.8167, name: 'Dehgam Highway Circle' },
  'cam25': { district: 'Navsari (Dandi)', dept: 'dept-police', lat: 20.8900, lng: 73.0100, name: 'Dhanori Corridor' },
  'cam26': { district: 'Navsari (Dandi)', dept: 'dept-police', lat: 20.8100, lng: 73.0500, name: 'Tankal Junction' },
  'cam27': { district: 'Navsari (Dandi)', dept: 'dept-civil', lat: 20.7630, lng: 72.9650, name: 'Bilimora Station Road 1' },
  'cam28': { district: 'Navsari (Dandi)', dept: 'dept-civil', lat: 20.7650, lng: 72.9680, name: 'Bilimora Port Circle 2' },
  'cam29': { district: 'Navsari (Dandi)', dept: 'dept-civil', lat: 20.7670, lng: 72.9710, name: 'Bilimora Market Gate 3' },
  'cam30': { district: 'Kutch (Ports, SEZ & Border)', dept: 'dept-police', lat: 23.0750, lng: 70.1330, name: 'Gandhidham Rambaugh P2' }
};

function syncCorp8Cameras(callback) {
  const req = https.request('https://cctv.corp8.cloud/cameras.json', {
    method: 'GET',
    headers: {
      'Cookie': sentinelCookie,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
  }, (res) => {
    if (res.statusCode === 302) {
      loginToSentinel(() => syncCorp8Cameras(callback));
      return;
    }
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      try {
        const rawCams = JSON.parse(data);
        if (Array.isArray(rawCams)) {
          const synced = rawCams.map((c) => {
            const meta = CORP8_DISTRICT_MAP[c.id] || {
              district: 'Ahmedabad (Urban)',
              dept: 'dept-police',
              lat: 23.0225,
              lng: 72.5714,
              name: c.name
            };
            return {
              id: c.id,
              name: meta.name || c.name,
              district: meta.district,
              department_id: meta.dept,
              lat: meta.lat,
              lng: meta.lng,
              type: 'ip',
              vendor: 'Sentinel Cloud CCTV',
              status: 'online',
              resolution: '1080p',
              stream_url: `/cctv-stream/${c.id}/index.m3u8`,
              hls_url: `/cctv-stream/${c.id}/index.m3u8`,
              retention_days: 15,
              direction: 'Northbound (Transit Corridor)',
              fov_angle: 90,
              onboarded_at: new Date().toISOString()
            };
          });
          CAMERA_CATALOG = synced;
          saveCatalog();
          console.log(`[SENTINEL] Synced ${synced.length} real live cameras from cctv.corp8.cloud`);
          if (callback) callback(null, synced);
          return;
        }
      } catch (err) {
        if (callback) callback(err);
      }
    });
  });
  req.on('error', (err) => {
    if (callback) callback(err);
  });
  req.end();
}

// Initial Sync from cctv.corp8.cloud
syncCorp8Cameras((err) => {
  if (err) console.log('[SENTINEL] Initial camera sync note:', err.message);
});

// =========================================================================
// REAL-TIME CCTV SURVEILLANCE QUEUE
// =========================================================================
let ALERT_QUEUE = [];

const server = http.createServer((req, res) => {
  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With'
    });
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Health check endpoint for Render / Kubernetes
  if (pathname === '/healthz' || pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      status: 'healthy',
      platform: 'NIRIKSHAN Statewide CCTV Intelligence Platform',
      version: '2.4.0',
      total_cctv_nodes: CAMERA_CATALOG.length,
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  // CCTV DATA UPLOAD API NODE (POST /api/upload-cctv, POST /api/cameras, POST /api/ingest)
  if ((pathname === '/api/upload-cctv' || pathname === '/api/cameras' || pathname === '/api/ingest' || pathname === '/api/cctv/upload') && req.method === 'POST') {
    let bodyData = '';
    req.on('data', chunk => { bodyData += chunk; });
    req.on('end', () => {
      try {
        let payload = {};
        if (bodyData.trim()) {
          try {
            payload = JSON.parse(bodyData);
          } catch(err) {
            const params = new URLSearchParams(bodyData);
            payload = Object.fromEntries(params.entries());
          }
        }

        const items = Array.isArray(payload) ? payload : (Array.isArray(payload.cameras) ? payload.cameras : [payload]);
        const addedCameras = [];

        items.forEach((item) => {
          if (!item) return;
          const streamUrl = (item.stream_url || item.url || item.link || item.feed_url || item.cctv_link || '').trim();
          const camId = (item.id || `CAM-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`).trim();
          const camName = item.name || item.camera_name || item.title || `Live CCTV Node ${camId}`;
          const district = item.district || 'Ahmedabad (Urban)';
          const dept = item.department_id || item.department || 'dept-police';
          const lat = parseFloat(item.lat) || 23.0225;
          const lng = parseFloat(item.lng) || 72.5714;
          const resolution = item.resolution || '1080p';
          const vendor = item.vendor || 'Live CCTV Feed';

          const newCam = {
            id: camId,
            name: camName,
            district: district,
            department_id: dept,
            lat: lat,
            lng: lng,
            type: item.type || 'ip',
            vendor: vendor,
            status: 'online',
            resolution: resolution,
            stream_url: streamUrl,
            hls_url: streamUrl,
            retention_days: parseInt(item.retention_days || 15, 10),
            onboarded_at: new Date().toISOString()
          };

          const existingIdx = CAMERA_CATALOG.findIndex(c => c.id === camId || (streamUrl && c.stream_url === streamUrl));
          if (existingIdx >= 0) {
            CAMERA_CATALOG[existingIdx] = Object.assign(CAMERA_CATALOG[existingIdx], newCam);
            addedCameras.push(CAMERA_CATALOG[existingIdx]);
          } else {
            CAMERA_CATALOG.push(newCam);
            addedCameras.push(newCam);
          }
        });

        saveCatalog();

        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          status: 'success',
          message: `Successfully uploaded and registered ${addedCameras.length} CCTV camera node(s)`,
          uploaded_cameras: addedCameras,
          total_nodes: CAMERA_CATALOG.length,
          count: CAMERA_CATALOG.length
        }, null, 2));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      }
    });
    return;
  }

  // CCTV CAMERA CATALOG API NODE (GET /api/cameras, GET /api/ingest)
  if ((pathname === '/api/cameras' || pathname === '/api/cameras/' || pathname === '/api/ingest' || pathname === '/api/v1/ingest') && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      status: 'ready',
      total_nodes: CAMERA_CATALOG.length,
      count: CAMERA_CATALOG.length,
      cameras: CAMERA_CATALOG,
      catalog: { state: "ready", count: CAMERA_CATALOG.length, scanned_at: Date.now() / 1000 }
    }, null, 2));
    return;
  }

  // DELETE /api/cameras — clear or remove nodes
  if ((pathname === '/api/cameras' || pathname === '/api/cameras/') && req.method === 'DELETE') {
    CAMERA_CATALOG = [];
    saveCatalog();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'success', message: 'All CCTV camera nodes cleared', total_nodes: 0 }));
    return;
  }

  // SYNC CCTV FEEDS ENDPOINT (POST /api/cameras/sync-cctv or GET /api/cameras/sync-cctv)
  if (pathname === '/api/cameras/sync-cctv' || pathname === '/api/sync-cctv') {
    syncCorp8Cameras((err, synced) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'success', count: synced.length, cameras: synced }, null, 2));
      }
    });
    return;
  }



  // GET /api/alerts — Fetch real-time live CCTV surveillance alerts
  if ((pathname === '/api/alerts' || pathname === '/api/alerts/') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(ALERT_QUEUE, null, 2));
    return;
  }

  // POST /api/alerts — Publish or insert a new alert
  if ((pathname === '/api/alerts' || pathname === '/api/alerts/') && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        ALERT_QUEUE.unshift(payload);
        if (ALERT_QUEUE.length > 50) ALERT_QUEUE.pop();
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'published', alert: payload }));
      } catch(e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // POST /api/alerts/clear — Flush alert queue so feeds remain clean
  if (pathname === '/api/alerts/clear') {
    ALERT_QUEUE = [];
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ status: 'cleared', message: 'Alert queue flushed' }));
    return;
  }

  // POST /api/cctv/auto-scan — Trigger live CCTV real frame capture with red frame overlay
  if (pathname === '/api/cctv/auto-scan' || pathname === '/api/cctv/scan') {
    let targetCam = 'cam01';
    if (parsedUrl.query && parsedUrl.query.camera_id) {
      targetCam = parsedUrl.query.camera_id;
    }
    runAutoCctvScan(targetCam, (err, alert) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'error', message: err.message }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ status: 'success', alert }, null, 2));
      }
    });
    return;
  }

  // PROXY ROUTE FOR CCTV STREAMS (/cctv-stream/* and /stream/*)
  if (pathname.startsWith('/cctv-stream/') || pathname.startsWith('/stream/')) {
    const subPath = pathname.replace('/cctv-stream/', '').replace('/stream/', '');
    const targetUrl = `https://cctv.corp8.cloud/${subPath}`;

    const proxyReq = https.request(targetUrl, {
      method: 'GET',
      headers: {
        'Cookie': sentinelCookie,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Accept': '*/*'
      }
    }, (proxyRes) => {
      if (proxyRes.statusCode === 302) {
        loginToSentinel(() => {
          res.writeHead(503, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Session re-authenticating, please retry' }));
        });
        return;
      }

      const contentType = subPath.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' :
                          subPath.endsWith('.key') ? 'application/octet-stream' :
                          subPath.endsWith('.ts') ? 'video/mp2t' :
                          proxyRes.headers['content-type'] || 'application/octet-stream';

      const headers = {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Cache-Control': 'no-cache, no-store'
      };

      if (subPath.endsWith('.m3u8')) {
        let chunks = [];
        proxyRes.on('data', c => chunks.push(c));
        proxyRes.on('end', () => {
          let body = Buffer.concat(chunks).toString('utf8');
          // Rewrite URI="/enc.key" to URI="/cctv-stream/enc.key"
          body = body.replace(/URI="\/enc\.key"/g, 'URI="/cctv-stream/enc.key"');
          res.writeHead(200, headers);
          res.end(body);
        });
      } else {
        res.writeHead(proxyRes.statusCode || 200, headers);
        proxyRes.pipe(res);
      }
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Failed to connect to CCTV node', message: err.message }));
      }
    });
    proxyReq.end();
    return;
  }



  // Fast Clean GIS Map Tile Proxy (Multi-Tier Resilient Fallback - Zero 404s)
  if (pathname.startsWith('/clean-tiles/') || pathname.startsWith('/tiles/') || pathname.startsWith('/map-tiles/')) {
    const tileKey = pathname.replace('/clean-tiles/', '').replace('/tiles/', '').replace('/map-tiles/', '').split('?')[0]; // e.g. "8/182/56.png"
    const FALLBACK_TILE = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEAAQMAAABmvDolAAAAA1BMVEUGBggjFv/2AAAAGklEQVR4AWNYgYHhgAYMhgoYKhgqGKphCAAA5o4BHX79Fv0AAAAASUVORK5CYII=', 'base64');

    const sendTile = (buffer) => {
      if (res.headersSent) return;
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=604800, immutable',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(buffer);
    };

    if (tileCache.has(tileKey)) {
      sendTile(tileCache.get(tileKey));
      return;
    }

    const subdomains = ['a', 'b', 'c'];
    const sub = subdomains[Math.floor(Math.random() * subdomains.length)];
    const primaryUrl = `https://${sub}.tile.openstreetmap.org/${tileKey}`;
    const secondaryUrl = `https://basemaps.cartocdn.com/rastertiles/voyager/${tileKey}`;
    const tileHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*'
    };

    const fetchTile = (url, isFallback = false) => {
      const client = https.get(url, { headers: tileHeaders }, (remoteRes) => {
        if (remoteRes.statusCode === 200) {
          let chunks = [];
          remoteRes.on('data', c => chunks.push(c));
          remoteRes.on('end', () => {
            const buf = Buffer.concat(chunks);
            if (tileCache.size > 5000) tileCache.clear();
            tileCache.set(tileKey, buf);
            sendTile(buf);
          });
        } else if (!isFallback) {
          fetchTile(secondaryUrl, true);
        } else {
          sendTile(FALLBACK_TILE);
        }
      });

      client.on('error', () => {
        if (!isFallback) {
          fetchTile(secondaryUrl, true);
        } else {
          sendTile(FALLBACK_TILE);
        }
      });
    };

    fetchTile(primaryUrl);
    return;
  }

  // Clear All Data endpoint — wipes temporary caches & catalog
  if (pathname === '/api/clear-all-data' && req.method === 'POST') {
    tileCache.clear();
    CAMERA_CATALOG = [];
    saveCatalog();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({
      status: 'cleared',
      message: 'All platform caches & CCTV nodes cleared. System clean and ready.',
      total_nodes: 0,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  // Sanitize path to prevent directory traversal
  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  let filePath = path.join(ROOT_DIR, safePath);

  // If path is a directory, look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Return custom 404 or fallback to index.html for SPA behavior
      const indexPath = path.join(ROOT_DIR, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        fs.createReadStream(indexPath).pipe(res);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Caching headers
    if (['.svg', '.png', '.jpg', '.ico', '.woff2'].includes(ext)) {
      res.setHeader('Cache-Control', 'public, max-age=86400');
    } else {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }

    // Range request support for HTML5 video playback (.mp4 / .webm)
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm')) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunksize = (end - start) + 1;
      const file = fs.createReadStream(filePath, { start, end });
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': contentType,
      });
      file.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[NIRIKSHAN-PROD] Server active & listening on http://${HOST}:${PORT}`);
  console.log(`[NIRIKSHAN-PROD] Health check available at http://${HOST}:${PORT}/healthz`);
});

// Process-level exception guards so unexpected client aborts/stream resets never take down the server
process.on('uncaughtException', (err) => {
  if (err.code === 'ERR_HTTP_HEADERS_SENT' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    return; // Benign streaming socket disconnects
  }
  console.warn('[SERVER-UNCAUGHT-EXCEPTION]', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[SERVER-UNHANDLED-REJECTION]', reason);
});
