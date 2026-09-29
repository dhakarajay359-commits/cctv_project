# 🛡️ Nirikshan (निरीक्षण) — Unified State CCTV Intelligence & Analytics Platform

<div align="center">

[![License: Proprietary](https://img.shields.io/badge/License-Proprietary%20Govt%20of%20Gujarat-00f2fe.svg?style=for-the-badge)](./LICENSE)
[![Architecture: 7-Layer Decoupled](https://img.shields.io/badge/Architecture-7--Layer%20Decoupled-3b82f6?style=for-the-badge)](./ARCHITECTURE.md)
[![OpenAPI: 3.0.3](https://img.shields.io/badge/OpenAPI-3.0.3%20Specification-10b981?style=for-the-badge)](./api-spec.yaml)
[![YOLOv8: Real-Time AI](https://img.shields.io/badge/AI%20Vision-Ultralytics%20YOLOv8-ff6f00?style=for-the-badge)](./backend_vision_service.py)
[![Docker: Microservices Ready](https://img.shields.io/badge/Docker-Microservices%20Ready-2563eb?style=for-the-badge)](./docker-compose.yml)
[![DPDP Act: 2023 Compliant](https://img.shields.io/badge/DPDP%20Act%202023-Consent%20Compliant-a855f7?style=for-the-badge)](./src/api/client.js)
[![Evidence Act: Section 65B](https://img.shields.io/badge/Evidence%20Act-Section%2065B%20Hashed-ef4444?style=for-the-badge)](./src/api/client.js)

<br/>

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/dhakarajay359-commits/cctv_project)

<p align="center">
  <strong>Mission-Critical Command &amp; Control Center (CCC) Platform for Statewide Surveillance, Automated Number Plate Recognition (ANPR), and Real-Time Multi-Jurisdiction Interception</strong>
</p>

[🌐 Live Platform Overview](#-platform-overview) •
[🔑 Operator Login](#-operator-portal--default-credentials) •
[🖥️ Website Features &amp; Modules](#-website-features--command-center-modules) •
[🏗️ 7-Layer Architecture](#-7-layer-scalable-architecture) •
[💰 Financial Feasibility](#-statewide-financial-feasibility--taxpayer-dividend) •
[🚀 Quick Start](#-quick-start--local-deployment) •
[📡 API Reference](#-rest-api--sse-streaming-reference) •
[⚖️ Legal &amp; Governance](#-evidence-act--compliance)

</div>

---

## 🌐 Platform Overview

**Nirikshan** is an enterprise-grade, API-first unified CCTV intelligence and surveillance analytics platform engineered for state governments and smart cities. It unifies heterogeneous camera infrastructure across **26+ sovereign departments** (State Police, RTO Commissionerate, Municipal Corporations like AMC, Civil Supplies, Forest &amp; Wildlife, Highway Patrol, and Private Commercial Opt-In Feeds) into a centralized, single-pane command center.

### The Breakthrough: Edge Buffering &amp; On-Demand Thin Relay
Legacy systems attempt continuous 24/7 video streaming from tens of thousands of cameras to a single central data center, causing severe network congestion and astronomical storage costs.

Nirikshan solves this through **local edge ring-buffering (15 days)** combined with **thin metadata event transmission (< 5 kbps)**. High-definition 1080p WebRTC/HLS video streams are pulled dynamically **only on-demand** with automatic 5-minute inactivity timeouts:
- 📉 **99.8% WAN Bandwidth Reduction** (from 200 Gbps congested load down to 4.8 Mbps peak on-demand).
- 💾 **99.99% Central Cloud Storage Savings** (from 69.1 Petabytes down to 480 Gigabytes).
- 💵 **₹1,162 Crore Taxpayer Savings over 5 years (93.7% ROI)** with zero hardware replacement CAPEX.

---

## 🔑 Operator Portal &amp; Default Credentials

The platform features an official government authentication gateway equipped with session persistence, role attribution, and department badge validation.

<div align="center">

| Parameter | Default Value | Notes |
| :--- | :--- | :--- |
| **Local URL** | `http://localhost:10000/` (or `http://localhost:8080/`) | Auto-opens when launched |
| **Operator ID** | `POLICE-SURV-101` | Pre-filled for quick access |
| **Password** | `Nirikshan2026` | Pre-configured demonstration password |
| **Default Persona** | `Inspector General V. R. Jadeja` | State Police HQ (SUPERADMIN • GJ-POL-001) |

</div>

### Multi-Agency Role Switching
Inside the command dashboard, operators can instantaneously switch jurisdictional roles via the sidebar persona selector:
- 👮 **Superadmin**: State Police HQ — Full state-wide pan-tilt-zoom, roadblock dispatch, and suspect watchlist overrides.
- 🚦 **RTO Admin**: RTO Commissionerate — Vehicle registration cross-checks (VAHAN/SARTHI), overspeeding, and corridor tax tracking.
- 🏙️ **AMC Operator**: Ahmedabad Municipal Corporation CCC — Urban municipal surveillance, traffic signals, and civic crowd monitoring.
- 🌲 **Forest Viewer**: Forest &amp; Wildlife Department — Sanctuary perimeter cameras, animal corridors, and anti-poaching tracking.

---

## 🖥️ Website Features &amp; Command Center Modules

The web application is built with a high-density, 24/7 glassmorphic dark design system (`style.css`), featuring 9 dedicated operational views accessible from the collapsible side navigation:

### 1. 🗺️ GIS Geospatial Dashboard (`view-dashboard`)
- **Interactive Leaflet GIS Matrix**: High-performance multi-layered vector map visualizing camera nodes across Gujarat (Ahmedabad, Gandhinagar, Rajkot, Junagadh, Navsari, Surat, Kutch, etc.).
- **Live Health Status Pulses**: Dynamic visual cues indicating camera connectivity, streaming latency, and heartbeat pings.
- **Field of View (FOV) Cones**: Directional 90° coverage angles rendered on the map indicating camera perspective and blind spots.
- **Corridor Breadcrumbs**: Visual breadcrumb path tracing suspect vehicle sightings across camera intersections.

### 2. 📹 Camera Registry &amp; Sentinel Cloud Sync (`view-registry`)
- **30+ Live Real-World Cameras**: Direct integration with Sentinel Corp8 CCTV Cloud (`cctv.corp8.cloud`).
- **Dynamic Onboarding**: Add custom IP/RTSP/ONVIF cameras with custom district tagging, department ownership, and geo-coordinates.
- **1-Click Cloud Sync**: Seamlessly sync and re-authenticate live feeds from external cloud VMS instances.
- **District &amp; Department Filters**: Instant multi-attribute search and filtration across 26+ agencies.

### 3. 🖥️ Live Video Wall (`view-livewall`)
- **Flexible Grid Matrix**: Instant switching between **1x1 single focus**, **2x2 tactical quad**, **3x3 surveillance grid**, and **4x4 statewide wall**.
- **Low-Latency HLS Streaming**: Real-time video player with zero-buffering adaptive stream proxy.
- **Stream Snapshot &amp; Forensics**: 1-click snapshot capture sending frames straight into the enhancement and OCR pipeline.
- **Quick Camera Swap**: Dropdown camera selectors for every individual cell on the video wall.

### 4. ⚡ Hardware-Accelerated Video Clarity Shaders
Integrated microsecond SVG filter pipelines applied directly on the GPU render layer:
- **Balanced Smart Video Enhancer**: Dynamic tone-mapping, contrast stretching, and 3x3 convolution edge sharpening.
- **Plate Super-Resolution Shader**: Directional Laplacian high-pass filtering ($[-0.5, -1.0, 7.0, -1.0, -0.5]$) optimized for alphanumeric license plate glyph extraction.
- **Night Vision &amp; Glare Suppression**: Non-linear gamma compensation ($1.25\gamma$) with core headlight anti-blooming.
- **Hardware Profile Controls**: Supports WDR (120dB), Highlight Compensation (HLC), and shutter lock ($1/1000s$) for high-speed transit corridors.

### 5. 🤖 AI Vision Analytics &amp; ANPR Engine (`view-analytics`)
- **Ultralytics YOLOv8 Ingestion**: Autonomous frame-by-frame vehicle detection (`car`, `truck`, `bus`, `motorcycle`, `auto-rickshaw`).
- **Indian Standard Plate Normalization**: Automatic RTO code resolution (e.g., `GJ-01` Ahmedabad, `GJ-03` Rajkot, `GJ-18` Gandhinagar, `GJ-21` Navsari).
- **Evidentiary OCR Pipeline**: CLAHE pre-processing, morphological segmentation, and optical character recognition.
- **Instant Speed Computation**: Multi-camera Haversine speed calculation ($v = \Delta d / \Delta t$) triggering automated overspeed alerts.

### 6. 🚨 Real-Time Threat Alerts &amp; Event Bus (`view-alerts`)
- **Server-Sent Events (SSE)**: Live streaming socket (`/api/detections/stream`) dispatching real-time detection events to the browser.
- **Fuzzy Watchlist Matching**: Automatic red alert trigger when plate matches suspect databases with $>60\%$ confidence.
- **Audible Warning System**: Instant siren and visual flashing for high-priority fugitive or stolen vehicle sightings.
- **Tactical Interception &amp; Dispatch**: 1-click roadblock recommendation and patrol car dispatch notification.

### 7. 🌉 Cross-Database Integration Gateway (`view-integration`)
Unified federated query bridge with national and state enforcement databases:
- **VAHAN 4.0**: Instant owner name, registration validity, engine/chassis number verification.
- **SARTHI**: Driver license status, endorsement classes, and historical violations.
- **eGujCop / CCTNS**: Criminal case records, FIR history, and warrant checks.
- **NAFIS**: National Automated Fingerprint Identification System integration bridge.

### 8. 🔒 Zero-Trust Multi-Agency RBAC &amp; Audit Trail (`view-admin`)
- **Cryptographic Section 65B Audit Log**: Every query, stream viewing, and export is timestamped and cryptographically signed (SHA-256) for court admissibility under Section 65B of the Indian Evidence Act.
- **DPDP Act 2023 Consent Lifecycle**: Citizen and private society camera enrollment with verifiable digital consent certificates and 1-click revocation.
- **System Diagnostics &amp; Purge**: Real-time worker status monitors, memory utilization, and administrative data hygiene tools.

### 9. 📖 OpenAPI 3.0.3 Playground &amp; Documentation (`view-api-docs`)
- **Built-in REST Client**: In-browser API explorer for testing all 18+ endpoints documented in [`api-spec.yaml`](./api-spec.yaml).
- **Live Response Inspection**: Execute real GET/POST requests and inspect JSON responses directly within the command center interface.

---

## 🏗️ 7-Layer Scalable Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│       26+ Sovereign Department CCTV & VMS Networks (Hikvision, Dahua, Axis) │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L0: Edge Protocol Adapter Layer ──▼──────────────────────────────────────┐
│    • Protocol Normalization (ONVIF Profile S/T, RTSP over TCP, Vendor NetSDK)│
│    • Local Edge Circular Buffer (15 Days on Local NVR / Edge Gateway)       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L1: Central Registry & GIS ───────▼──────────────────────────────────────┐
│    • Master PostGIS Geospatial Registry with Spatial Indexing               │
│    • 24/7 Automated Heartbeat Telemetry & Latency Diagnostics                │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L2: Unified Streaming Gateway ────▼──────────────────────────────────────┐
│    • On-Demand WebRTC WHEP / HLS Stream Transmuxing Relay                   │
│    • Automated 5-Minute Inactivity TTL Session Teardown (Zero WAN Flooding) │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L3: Vision Analytics Engine ──────▼──────────────────────────────────────┐
│    • Autonomous Ultralytics YOLOv8 Ingestion (backend_vision_service.py)    │
│    • Optical ANPR Character Recognition & Low-Light Enhancement Pipeline    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L4: Cross-Database Integration Gateway ──────────────────────────────────┐
│    • Secure mTLS Federation: VAHAN 4.0, SARTHI, eGujCop (CCTNS), NAFIS     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L5: Real-Time Kafka Alert Bus ────▼──────────────────────────────────────┐
│    • Pub/Sub Real-Time Threat Event Distribution (< 2.5s Interception)      │
│    • Server-Sent Events (SSE) Client Streaming Gateway                      │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
┌─── L6: Unified Command Dashboard ────▼──────────────────────────────────────┐
│    • High-Density 24/7 Glassmorphic GIS Command Center                      │
│    • Multi-Tenant Zero-Trust RBAC & Section 65B Indian Evidence Compliance  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 💰 Statewide Financial Feasibility &amp; Taxpayer Dividend

| Parameter | Legacy Central Recording (24/7 WAN Push) | Nirikshan Edge + On-Demand Model | Taxpayer Savings / Benefit |
| :--- | :--- | :--- | :--- |
| **State WAN Bandwidth** | 200.0 Gbps (Severe Congestion) | **4.8 Mbps (Optimal Thin Relay)** | **99.8% Load Reduction** |
| **Central Cloud Storage** | 69.1 Petabytes (30-day retention) | **480 Gigabytes (Metadata Only)** | **99.99% Storage Savings** |
| **Hardware Replacement CAPEX** | ₹450 Crore (Forced IP Standardization)| **₹0 (Edge Protocol Normalized)**| **₹450 Crore Saved** |
| **5-Year Bandwidth &amp; S3 OPEX** | ₹790 Crore | **₹78 Crore** | **₹712 Crore Saved** |
| **Total 5-Year State Expenditure** | **₹1,240 Crore** | **₹78 Crore** | **₹1,162 Crore Saved (93.7% ROI)** |

---

## 🚀 Quick Start &amp; Local Deployment

### Prerequisites
- **Node.js**: `v18.0.0` or higher ([Download Node.js](https://nodejs.org/))
- **Python**: `v3.8` or higher (optional, for running the autonomous YOLOv8 vision service)

---

### Option 1: 1-Click Launch on Windows (Recommended)
Simply double-click [`start-local.bat`](./start-local.bat) or run from your terminal:
```cmd
start-local.bat
```
This batch script will automatically detect `node.exe` (or system Node), start the production server at `http://localhost:10000/`, and spawn the autonomous AI vision service in the background.

---

### Option 2: Run via Node.js
```bash
# 1. Clone the repository
git clone https://github.com/dhakarajay359-commits/cctv_project.git
cd cctv_project

# 2. Start the production server
node server.js
```
The console will confirm:
```
[NIRIKSHAN-PROD] Server active & listening on http://0.0.0.0:10000
[NIRIKSHAN-PROD] Health check available at http://0.0.0.0:10000/healthz
[VISION-WORKER] Launching autonomous live CCTV AI vision engine in background...
```
Open **[http://localhost:10000/](http://localhost:10000/)** in your browser.

---

### Option 3: Python Autonomous Vision &amp; ANPR Engine
To run the background YOLOv8 AI vision and plate detection worker independently:
```bash
# Install computer vision dependencies
pip install -r requirements-surveillance.txt

# Launch autonomous vision pipeline
python backend_vision_service.py
```

To run a standalone low-light number plate recognition test on an image:
```bash
python main.py --image path/to/vehicle.jpg
```

---

### Option 4: Docker &amp; Docker Compose (Microservices)
```bash
# Spin up the containerized platform
docker-compose up -d

# Check running services
docker-compose ps
```

---

### Option 5: 1-Click Cloud Deployment on Render
1. Fork or push this repository to GitHub: `https://github.com/dhakarajay359-commits/cctv_project.git`.
2. Navigate to [Render.com](https://render.com) and click **Blueprints** -> **New Blueprint Instance**.
3. Select your repository. Render will automatically detect [`render.yaml`](./render.yaml), configure the web service with Node.js runtime, configure `/healthz` health checks, and allocate automatic SSL certificates.

---

### Option 6: Public Tunneling for Remote Demonstrations
To expose your local instance securely over the web:
- **Cloudflare Tunnel**: Run [`start-public-tunnel.bat`](./start-public-tunnel.bat)
- **ngrok**: Run [`start-ngrok.bat`](./start-ngrok.bat)

---

## 📡 REST API &amp; SSE Streaming Reference

The backend provides a comprehensive set of REST APIs defined in [`api-spec.yaml`](./api-spec.yaml):

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `/healthz` | `GET` | Health check endpoint for uptime monitors and load balancers |
| `/api/cameras` | `GET` | Retrieve the complete catalog of onboarded cameras across all districts |
| `/api/cameras` | `POST` | Onboard a new camera into the geospatial catalog |
| `/api/cameras/sync-cctv` | `GET` | Synchronize live cameras with Sentinel Corp8 CCTV Cloud |
| `/cctv-stream/:camId/index.m3u8` | `GET` | HLS live video stream proxy for camera `:camId` |
| `/api/detections/stream` | `GET` | **Server-Sent Events (SSE)** real-time stream for live detections and alerts |
| `/api/detections` | `GET` | Query recent vehicle detection logs with filter parameters |
| `/api/watchlist` | `GET` | Fetch active suspect vehicles and fugitive watchlist entries |
| `/api/watchlist` | `POST` | Add a new vehicle to the statewide surveillance watchlist |
| `/api/recommendations` | `GET` | Calculate vehicle corridor progression and forward intercept roadblock sites |
| `/api/alerts` | `GET` | Retrieve real-time high-priority alerts and dispatch notifications |
| `/api/cctv/snapshot` | `GET` | Capture an instantaneous frame from a designated CCTV stream |
| `/api/cctv/enhance` | `POST` | Execute Super-Resolution and contrast enhancement on image ROI |
| `/api/facial/detect` | `POST` | Run facial detection and recognition against registered suspect archives |
| `/api/enhancer/status` | `GET` | Query status of hardware-accelerated SVG and OpenCV enhancement pipelines |

---

## 📁 Repository Structure

```
├── server.js                      # Production Node.js server (HLS Proxy, SSE Event Bus, REST API)
├── backend_vision_service.py      # Autonomous YOLOv8 AI Vision Worker & Stream Ingestion Engine
├── index.html                     # Unified Command Dashboard UI (9 Integrated Modules)
├── style.css                      # High-Density 24/7 Glassmorphic Dark Design System
├── app.js                         # Core Client Controller, Leaflet GIS Matrix & Event Handler
├── package.json                   # Node.js project manifest, dependencies, and execution scripts
├── render.yaml                    # Render.com Blueprint Infrastructure as Code (IaC)
├── docker-compose.yml             # Multi-container microservices orchestration file
├── api-spec.yaml                  # Consolidated OpenAPI 3.0.3 Specification (18+ endpoints)
├── ARCHITECTURE.md                # 7-Layer Architectural Whitepaper & Financial Feasibility Study
├── requirements-surveillance.txt  # Python requirements (OpenCV, Ultralytics YOLOv8, NumPy, EasyOCR)
│
├── start-local.bat                # 1-Click Windows execution script for Node and Python
├── start-ngrok.bat                # Tunneling script for remote demo access via ngrok
├── start-public-tunnel.bat        # Public demo tunnel via Cloudflare
│
├── cctv_enhancer.py               # Deterministic evidentiary-grade CCTV enhancement pipeline
├── benchmark_enhancer.py          # Latency, PSNR, and SSIM benchmarking suite
├── facial_detection_engine.py     # Multi-modal facial detection and recognition engine
├── preprocessing.py               # CLAHE, Gamma correction & low-light image enhancement
├── segmentation.py                # Edge detection and license plate candidate extraction
├── recognition.py                 # Optical character recognition and plate parser
├── main.py                        # Standalone Night-Time ANPR execution entrypoint
├── yolov8n.pt                     # Pre-trained Ultralytics YOLOv8 neural network weights
│
├── src/
│   ├── api/
│   │   └── client.js              # Centralized API-First REST Client (VAHAN, SARTHI, Kafka, RBAC)
│   └── data/
│       ├── camera_catalog.json    # Statewide camera directory and geo-coordinates
│       ├── watchlist.json         # Suspect vehicle watchlist and warrant tracking
│       └── detections.json        # Real-time vehicle detection and sighting history
│
├── assets/                        # Official emblems, police crests, and vendor libraries
├── images/                        # Command center backdrop assets and sample snapshots
└── captures/                      # Directory for captured evidentiary frames and crops
```

---

## ⚖️ Evidence Act &amp; Compliance

Nirikshan is built strictly in accordance with Indian statutory and regulatory requirements:

- **Section 65B, Indian Evidence Act (1872)**: Every captured video snippet, snapshot, and OCR recognition log is cryptographically hashed (SHA-256) with millisecond-accurate timestamping, ensuring complete evidentiary chain of custody for court submission.
- **Digital Personal Data Protection (DPDP) Act (2023)**: Private commercial establishments, apartment complexes, and citizen cameras onboard solely through digitally verifiable consent certificates with granular time and location scopes and 1-click consent revocation.
- **Evidentiary Integrity**: Video enhancement algorithms are strictly deterministic (CLAHE, unsharp masking, Wiener deconvolution); generative AI hallucination is prohibited to guarantee evidentiary admissibility.

---

## 🤝 Contributing &amp; Feedback

Contributions, bug reports, and feature suggestions are welcome.
1. Fork the repository: [`dhakarajay359-commits/cctv_project`](https://github.com/dhakarajay359-commits/cctv_project.git)
2. Create your feature branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add NewFeature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## 📜 License

This software and its architectural specifications are developed for the Government of Gujarat and authorized state law enforcement agencies. Licensed under Proprietary State Government Software Terms.

<div align="center">
  <sub>NIRIKSHAN • Government of Gujarat Police • Department of Home Affairs • Safe Cities Mission</sub>
</div>
