const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 10000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING DYNAMIC SURVEILLANCE & ROUTING VERIFICATION ---');

  // 1. Clear detections and watchlist to test pure empty states
  console.log('\n[TEST 1] Testing Empty States (Zero Dummy Data Guarantee)...');
  await request('POST', '/api/detections/clear');

  const detRes = await request('GET', '/api/detections');
  console.log('GET /api/detections status:', detRes.status, 'message:', detRes.data.message);
  if (detRes.data.detections.length !== 0 || detRes.data.message !== 'No vehicle detections available.') {
    throw new Error('Expected clean empty detections with explicit message');
  }

  const recRes = await request('GET', '/api/recommendations');
  console.log('GET /api/recommendations status:', recRes.status, 'message:', recRes.data.message);
  if (recRes.data.recommendations.length !== 0 || recRes.data.message !== 'No recommendations available.') {
    throw new Error('Expected clean empty recommendations with explicit message');
  }

  const suspRes = await request('GET', '/api/suspects');
  console.log('GET /api/suspects status:', suspRes.status, 'message:', suspRes.data.message);
  if (suspRes.data.suspects.length !== 0 || suspRes.data.message !== 'No suspect match found.') {
    throw new Error('Expected clean empty suspects with explicit message');
  }

  const routeEmptyRes = await request('GET', '/api/routes?vehicle_id=GJ01XX9999');
  console.log('GET /api/routes (unknown) status:', routeEmptyRes.status, 'message:', routeEmptyRes.data.message);
  if (routeEmptyRes.data.status !== 'empty' || routeEmptyRes.data.message !== 'No vehicle detections available.') {
    throw new Error('Expected empty route state for unspotted vehicle');
  }
  console.log('✓ TEST 1 PASSED: Pure clean empty states verified.');

  // 2. Testing backend validation
  console.log('\n[TEST 2] Testing Backend Ingestion Validation...');
  const invCamRes = await request('POST', '/api/detections', {
    camera_id: 'non_existent_cam_99',
    vehicle_id: 'GJ-01-ZZ-0001'
  });
  console.log('POST invalid camera status:', invCamRes.status, 'message:', invCamRes.data.message);
  if (invCamRes.status !== 400 || !invCamRes.data.message.includes('does not exist')) {
    throw new Error('Validation failed to reject invalid camera ID');
  }

  const invTsRes = await request('POST', '/api/detections', {
    camera_id: 'cam01',
    vehicle_id: 'GJ-01-ZZ-0001',
    timestamp: 'not-a-valid-date'
  });
  console.log('POST invalid timestamp status:', invTsRes.status, 'message:', invTsRes.data.message);
  if (invTsRes.status !== 400) {
    throw new Error('Validation failed to reject invalid timestamp');
  }
  console.log('✓ TEST 2 PASSED: Backend validation rules enforced.');

  // 3. Testing Single Detection Point (No fake route polyline)
  console.log('\n[TEST 3] Testing Single Detection & Route Constraint...');
  const ing1 = await request('POST', '/api/detections', {
    camera_id: 'cam01',
    vehicle_id: 'GJ-01-AA-5555',
    vehicle_type: 'sedan',
    confidence: 0.94
  });
  console.log('Ingest 1 status:', ing1.status, 'id:', ing1.data.detection.detectionId, 'region:', ing1.data.detection.region);
  if (ing1.status !== 201 || ing1.data.detection.suspect_match.status !== 'NO_MATCH') {
    throw new Error('Ingestion 1 failed or suspect match incorrect');
  }

  const singleRoute = await request('GET', '/api/routes?vehicle_id=GJ-01-AA-5555');
  console.log('Single sighting route status:', singleRoute.data.status, 'message:', singleRoute.data.message);
  if (singleRoute.data.status !== 'single_point' || singleRoute.data.sightings.length !== 1 || singleRoute.data.route_available !== false) {
    throw new Error('Single sighting must NOT generate a fake route!');
  }
  console.log('✓ TEST 3 PASSED: Single detection correctly treated as single point without fake route.');

  // 4. Testing Watchlist Registration, Matching, and Multi-Hop Road Routing
  console.log('\n[TEST 4] Testing Watchlist Match & Dynamic Road-Network Route...');
  const regWatch = await request('POST', '/api/watchlist', {
    plate: 'GJ-01-AB-1234',
    suspect_name: 'Test Target Driver',
    crime: 'Active BOLO Warrant',
    priority: 'CRITICAL'
  });
  console.log('Watchlist register status:', regWatch.status, 'registered:', regWatch.data.suspect.plate);

  // Ingest first sighting for suspect on cam01
  const s1 = await request('POST', '/api/detections', {
    camera_id: 'cam01',
    vehicle_id: 'GJ-01-AB-1234',
    vehicle_type: 'suv',
    confidence: 0.98
  });
  console.log('Suspect Sighting 1 status:', s1.status, 'match:', s1.data.detection.suspect_match.status);
  if (s1.data.detection.suspect_match.status !== 'MATCH') {
    throw new Error('Expected exact watchlist MATCH');
  }

  // Ingest second sighting for suspect on cam02 (Janpath Overbridge)
  const s2 = await request('POST', '/api/detections', {
    camera_id: 'cam02',
    vehicle_id: 'GJ-01-AB-1234',
    vehicle_type: 'suv',
    confidence: 0.97
  });
  console.log('Suspect Sighting 2 status:', s2.status, 'cam:', s2.data.detection.cameraName);

  // Query route for suspect
  const multiRoute = await request('GET', '/api/routes?vehicle_id=GJ-01-AB-1234');
  console.log('Multi-hop route status:', multiRoute.data.status, 'distance:', multiRoute.data.route?.distance_km, 'km, duration:', multiRoute.data.route?.duration_minutes, 'mins, source:', multiRoute.data.route?.source);
  if (multiRoute.data.status !== 'success' || !multiRoute.data.route || !multiRoute.data.route.route_geometry.length) {
    throw new Error('Multi-hop road route reconstruction failed');
  }

  // 5. Testing Dynamic Recommendations Generation
  console.log('\n[TEST 5] Testing Dynamic Two-Card Recommendation Engine...');
  const recsPopulated = await request('GET', '/api/recommendations');
  console.log('Recommendations count:', recsPopulated.data.recommendations.length);
  recsPopulated.data.recommendations.forEach((r, i) => {
    console.log(` Card ${i + 1} [${r.category}]: ${r.title} -> ${r.action}`);
  });
  if (recsPopulated.data.recommendations.length !== 2) {
    throw new Error(`Expected exactly 2 dynamic recommendation cards, got ${recsPopulated.data.recommendations.length}`);
  }
  console.log('✓ TEST 5 PASSED: Exactly two dynamic recommendation cards generated.');

  console.log('\n======================================================');
  console.log('🎉 ALL SYSTEM & REQUIREMENT VERIFICATION TESTS PASSED!');
  console.log('======================================================');
}

runTests().catch(err => {
  console.error('\n❌ VERIFICATION TEST FAILED:', err.message);
  process.exit(1);
});
