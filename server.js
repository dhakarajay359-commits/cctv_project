/**
 * Nirikshan State CCTV Intelligence Platform - Production Web Server
 * Optimized for Render.com Blueprint Web Services
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
const ROOT_DIR = path.resolve(__dirname);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
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

const server = http.createServer((req, res) => {
  // Security Headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Health check endpoint for Render / Kubernetes
  if (pathname === '/healthz' || pathname === '/health' || pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      platform: 'NIRIKSHAN Statewide CCTV Intelligence Platform',
      version: '2.4.0',
      uptime_seconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  // Dynamic Camera Stream Ingest Catalogue Endpoint (Sentinel Grid Specification)
  if (pathname === '/api/ingest' || pathname === '/api/v1/ingest') {
    const host = req.headers.host || 'localhost:3000';
    const rawHost = host.split(':')[0];
    
    const catalogue = {
      platform: 'NIRIKSHAN Sentinel Camera Grid',
      version: '2.4.0',
      total_nodes: 14,
      transport_protocol_default: 'TCP',
      timing_mode: 'monotonic_pts_pos_msec',
      cameras: [
        {
          id: 'CAM-GJ-0101',
          stream_id: 1,
          name: 'SG Highway Iskcon Crossroad Overbridge',
          district: 'Ahmedabad (Urban)',
          department: 'Gujarat State Police',
          codec: 'H.264',
          resolution: '1920x1080',
          fps: 25,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/1`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/1/whep`,
          hls: `http://${rawHost}/live/stream/1/index.m3u8`
        },
        {
          id: 'CAM-GJ-0102',
          stream_id: 2,
          name: 'Ashram Road Riverfront West Promenade',
          district: 'Ahmedabad (Urban)',
          department: 'AMC Municipal Smart City',
          codec: 'H.264',
          resolution: '1920x1080',
          fps: 25,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/2`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/2/whep`,
          hls: `http://${rawHost}/live/stream/2/index.m3u8`
        },
        {
          id: 'CAM-GJ-0103',
          stream_id: 3,
          name: 'Sanand GIDC Toll Plaza Outer Gate',
          district: 'Ahmedabad (Urban)',
          department: 'RTO Checkposts & Tolls',
          codec: 'H.265',
          resolution: '3840x2160',
          fps: 30,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/3`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/3/whep`,
          hls: `http://${rawHost}/live/stream/3/index.m3u8`
        },
        {
          id: 'CAM-GJ-0201',
          stream_id: 4,
          name: 'Jamnagar Bedi Port Primary Ingress Gate',
          district: 'Jamnagar (Refinery & Port)',
          department: 'Gujarat Maritime & Police',
          codec: 'H.264',
          resolution: '1920x1080',
          fps: 25,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/4`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/4/whep`,
          hls: `http://${rawHost}/live/stream/4/index.m3u8`
        },
        {
          id: 'CAM-GJ-0301',
          stream_id: 5,
          name: 'Dwarka Temple Coastal Perimeter Gate',
          district: 'Devbhumi Dwarka',
          department: 'Gujarat State Police',
          codec: 'H.264',
          resolution: '1920x1080',
          fps: 25,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/5`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/5/whep`,
          hls: `http://${rawHost}/live/stream/5/index.m3u8`
        },
        {
          id: 'CAM-GJ-0401',
          stream_id: 6,
          name: 'Gir National Park Sasan Border Checkpost',
          district: 'Gir Somnath & Junagadh',
          department: 'Forest & Wildlife Dept',
          codec: 'H.265',
          resolution: '3840x2160',
          fps: 30,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/6`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/6/whep`,
          hls: `http://${rawHost}/live/stream/6/index.m3u8`
        },
        {
          id: 'CAM-GJ-0501',
          stream_id: 7,
          name: 'Dahod Tribal Inter-State Checkpost Gate #2',
          district: 'Dahod (Interstate Border)',
          department: 'RTO & Police Joint Post',
          codec: 'H.264',
          resolution: '1920x1080',
          fps: 25,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/7`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/7/whep`,
          hls: `http://${rawHost}/live/stream/7/index.m3u8`
        },
        {
          id: 'CAM-GJ-0601',
          stream_id: 8,
          name: 'Valsad Bhilad NH-48 Corridor Weighbridge',
          district: 'Valsad (Border Corridor)',
          department: 'Food & Civil Supplies / RTO',
          codec: 'H.264',
          resolution: '1920x1080',
          fps: 25,
          live_status: 'online',
          rtsp: `rtsp://${rawHost}:8554/stream/8`,
          rtsp_transport: 'tcp',
          webrtc_whep: `http://${rawHost}:8889/stream/8/whep`,
          hls: `http://${rawHost}/live/stream/8/index.m3u8`
        }
      ]
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(catalogue, null, 2));
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
